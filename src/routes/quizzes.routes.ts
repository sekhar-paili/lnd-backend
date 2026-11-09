import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { pool, query, queryOne } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { QuizQuestion, sanitizeQuizForLearner, scoreQuiz } from '../services/scoring';

interface QuizRow {
  id: string;
  title: string;
  pass_mark_percent: number;
  questions: QuizQuestion[];
}

interface AttemptRow {
  id: string;
  quiz_id: string;
  user_id: string;
  score_percent: string; // NUMERIC arrives as string from pg
  passed: boolean;
  answered_at: string;
  answers: Record<string, string>;
}

function toQuiz(row: QuizRow) {
  return {
    id: row.id,
    title: row.title,
    passMarkPercent: row.pass_mark_percent,
    questions: row.questions,
  };
}

function toAttempt(row: AttemptRow) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    userId: row.user_id,
    scorePercent: Number(row.score_percent),
    passed: row.passed,
    answeredAt: row.answered_at,
    answers: row.answers,
  };
}

const questionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['MCQ', 'TRUE_FALSE']),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
    correctOptionId: z.string().min(1),
  })
  .refine((q) => q.options.some((o) => o.id === q.correctOptionId), {
    message: 'correctOptionId must match one of the question options.',
  });

const quizSchema = z.object({
  title: z.string().min(2),
  passMarkPercent: z.number().int().min(0).max(100),
  questions: z.array(questionSchema).min(1),
});

const attemptSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

export const quizzesRouter = Router();

quizzesRouter.get('/', requireAuth, async (req, res) => {
  const rows = await query<QuizRow>('SELECT * FROM quizzes ORDER BY title');
  const quizzes = rows.map(toQuiz);
  // Only admins may see answer keys.
  res.json(req.user!.role === 'LND_ADMIN' ? quizzes : quizzes.map(sanitizeQuizForLearner));
});

quizzesRouter.get('/:id', requireAuth, async (req, res) => {
  const row = await queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = $1', [req.params.id]);
  if (!row) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  const quiz = toQuiz(row);
  res.json(req.user!.role === 'LND_ADMIN' ? quiz : sanitizeQuizForLearner(quiz));
});

quizzesRouter.post('/', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const id = `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    'INSERT INTO quizzes (id, title, pass_mark_percent, questions) VALUES ($1,$2,$3,$4)',
    [id, q.title, q.passMarkPercent, JSON.stringify(q.questions)],
  );
  res.status(201).json({ id, ...q });
});

quizzesRouter.put('/:id', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const result = await pool.query(
    'UPDATE quizzes SET title=$1, pass_mark_percent=$2, questions=$3 WHERE id=$4',
    [q.title, q.passMarkPercent, JSON.stringify(q.questions), req.params.id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  res.json({ id: req.params.id, ...q });
});

quizzesRouter.delete('/:id', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const result = await pool.query('DELETE FROM quizzes WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }
  res.status(204).send();
});

/** Submit answers; the server grades the attempt and records it for the caller. */
quizzesRouter.post('/:id/attempts', requireAuth, async (req, res) => {
  const parsed = attemptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Body must be { answers: { [questionId]: optionId } }.' });
    return;
  }
  const quizRow = await queryOne<QuizRow>('SELECT * FROM quizzes WHERE id = $1', [req.params.id]);
  if (!quizRow) {
    res.status(404).json({ error: 'Quiz not found.' });
    return;
  }

  const { answers } = parsed.data;
  const unanswered = quizRow.questions.filter((q) => !answers[q.id]);
  if (unanswered.length > 0) {
    res.status(400).json({ error: `Answer all questions (${unanswered.length} remaining).` });
    return;
  }

  const result = scoreQuiz(quizRow.questions, answers, quizRow.pass_mark_percent);
  const id = `att-${randomUUID()}`;
  const inserted = await pool.query<AttemptRow>(
    `INSERT INTO quiz_attempts (id, quiz_id, user_id, score_percent, passed, answers)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, quizRow.id, req.user!.id, result.scorePercent, result.passed, JSON.stringify(answers)],
  );
  res.status(201).json({ attempt: toAttempt(inserted.rows[0]), result });
});

/** Current user's attempts. */
quizzesRouter.get('/attempts/me', requireAuth, async (req, res) => {
  const rows = await query<AttemptRow>(
    'SELECT * FROM quiz_attempts WHERE user_id = $1 ORDER BY answered_at DESC',
    [req.user!.id],
  );
  res.json(rows.map(toAttempt));
});

/** All attempts (admin reporting). */
quizzesRouter.get('/attempts/all', requireAuth, requireRole('LND_ADMIN'), async (_req, res) => {
  const rows = await query<AttemptRow>('SELECT * FROM quiz_attempts ORDER BY answered_at DESC');
  res.json(rows.map(toAttempt));
});
