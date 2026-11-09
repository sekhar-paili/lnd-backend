import { Router } from 'express';

import { query } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';

interface ParticipantRow {
  id: string;
  name: string;
  role: string;
  videos_completed: string;
  quizzes_passed: string;
}

interface StepRow {
  path_id: string;
  video_id: string | null;
  quiz_id: string | null;
}

interface UserDoneRow {
  user_id: string;
  video_id: string | null;
  quiz_id: string | null;
}

export const reportsRouter = Router();

/**
 * Per-participant completion summary. A path counts as complete for a user
 * when every one of its steps is satisfied (video completed or quiz passed).
 */
reportsRouter.get('/participants', requireAuth, requireRole('LND_ADMIN'), async (_req, res) => {
  const [participants, steps, doneVideos, passedQuizzes] = await Promise.all([
    query<ParticipantRow>(
      `SELECT u.id, u.name, u.role,
              (SELECT COUNT(*) FROM video_progress vp WHERE vp.user_id = u.id AND vp.completed) AS videos_completed,
              (SELECT COUNT(DISTINCT qa.quiz_id) FROM quiz_attempts qa WHERE qa.user_id = u.id AND qa.passed) AS quizzes_passed
       FROM users u ORDER BY u.name`,
    ),
    query<StepRow>('SELECT path_id, video_id, quiz_id FROM learning_path_steps'),
    query<UserDoneRow>(
      'SELECT user_id, video_id, NULL::text AS quiz_id FROM video_progress WHERE completed',
    ),
    query<UserDoneRow>(
      'SELECT DISTINCT user_id, NULL::text AS video_id, quiz_id FROM quiz_attempts WHERE passed',
    ),
  ]);

  const stepsByPath = new Map<string, StepRow[]>();
  for (const s of steps) {
    const list = stepsByPath.get(s.path_id) ?? [];
    list.push(s);
    stepsByPath.set(s.path_id, list);
  }

  const doneVideoKeys = new Set(doneVideos.map((d) => `${d.user_id}:${d.video_id}`));
  const passedQuizKeys = new Set(passedQuizzes.map((d) => `${d.user_id}:${d.quiz_id}`));

  const report = participants.map((p) => {
    let pathsCompleted = 0;
    for (const pathSteps of stepsByPath.values()) {
      const allDone = pathSteps.every((s) =>
        s.quiz_id
          ? passedQuizKeys.has(`${p.id}:${s.quiz_id}`)
          : s.video_id
            ? doneVideoKeys.has(`${p.id}:${s.video_id}`)
            : false,
      );
      if (allDone && pathSteps.length > 0) {
        pathsCompleted += 1;
      }
    }
    return {
      user: { id: p.id, name: p.name, role: p.role },
      videosCompleted: Number(p.videos_completed),
      quizzesPassed: Number(p.quizzes_passed),
      pathsCompleted,
    };
  });

  res.json(report);
});
