import { Router } from 'express';

import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

interface PathRow {
  id: string;
  title: string;
  description: string;
}

interface StepRow {
  path_id: string;
  step_id: string;
  title: string;
  video_id: string | null;
  quiz_id: string | null;
  sort_order: number;
}

export const pathsRouter = Router();

pathsRouter.get('/', requireAuth, async (_req, res) => {
  const [paths, steps] = await Promise.all([
    query<PathRow>('SELECT id, title, description FROM learning_paths ORDER BY title'),
    query<StepRow>('SELECT * FROM learning_path_steps ORDER BY path_id, sort_order'),
  ]);

  res.json(
    paths.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      steps: steps
        .filter((s) => s.path_id === p.id)
        .map((s) => ({
          id: s.step_id,
          title: s.title,
          videoId: s.video_id ?? undefined,
          quizId: s.quiz_id ?? undefined,
          order: s.sort_order,
        })),
    })),
  );
});
