export interface QuizQuestion {
  id: string;
  type: 'MCQ' | 'TRUE_FALSE';
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
}

export interface ScoreResult {
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  passed: boolean;
}

/**
 * Scores a quiz attempt server-side. The client never receives
 * `correctOptionId`, so this is the only place an attempt can be graded.
 */
export function scoreQuiz(
  questions: QuizQuestion[],
  answers: Record<string, string>,
  passMarkPercent: number,
): ScoreResult {
  const totalCount = questions.length;
  if (totalCount === 0) {
    return { scorePercent: 0, correctCount: 0, totalCount: 0, passed: false };
  }
  const correctCount = questions.filter((q) => answers[q.id] === q.correctOptionId).length;
  const scorePercent = Math.round((correctCount / totalCount) * 10000) / 100;
  return {
    scorePercent,
    correctCount,
    totalCount,
    passed: scorePercent >= passMarkPercent,
  };
}

/** Strips answer keys before a quiz is sent to a non-admin client. */
export function sanitizeQuizForLearner<T extends { questions: QuizQuestion[] }>(
  quiz: T,
): Omit<T, 'questions'> & { questions: Omit<QuizQuestion, 'correctOptionId'>[] } {
  return {
    ...quiz,
    questions: quiz.questions.map(({ correctOptionId, ...rest }) => rest),
  };
}
