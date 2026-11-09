import { Router } from 'express';
import { z } from 'zod';

import { pool, query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const COMPLETION_THRESHOLD_PERCENT = 90;

interface ProgressRow {
  user_id: string;
  video_id: string;
  position_seconds: number;
  percent_complete: number;
  completed: boolean;
  updated_at: string;
}

function toApi(row: ProgressRow) {
  return {
    userId: row.user_id,
    videoId: row.video_id,
    positionSeconds: row.position_seconds,
    percentComplete: row.percent_complete,
    completed: row.completed,
    updatedAt: row.updated_at,
  };
}

const saveSchema = z.object({
  videoId: z.string().min(1),
  positionSeconds: z.number().nonnegative(),
  percentComplete: z.number().min(0).max(100),
});

export const progressRouter = Router();

/** Current user's own progress across all videos. */
progressRouter.get('/me', requireAuth, async (req, res) => {
  const rows = await query<ProgressRow>('SELECT * FROM video_progress WHERE user_id = $1', [
    req.user!.id,
  ]);
  res.json(rows.map(toApi));
});

/** Save/update progress for the current user. Completion is sticky once reached. */
progressRouter.post('/', requireAuth, async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { videoId, positionSeconds, percentComplete } = parsed.data;
  const userId = req.user!.id;

  // $4 is used twice, so it is cast explicitly: without the casts Postgres
  // infers a different type for each use and rejects the statement
  // ("inconsistent types deduced for parameter $4").
  const result = await pool.query<ProgressRow>(
    `INSERT INTO video_progress (user_id, video_id, position_seconds, percent_complete, completed, updated_at)
     VALUES ($1, $2, $3, $4::double precision, $4::double precision >= $5::double precision, now())
     ON CONFLICT (user_id, video_id) DO UPDATE
       SET position_seconds = EXCLUDED.position_seconds,
           percent_complete = EXCLUDED.percent_complete,
           completed = video_progress.completed OR EXCLUDED.completed,
           updated_at = now()
     RETURNING *`,
    [userId, videoId, positionSeconds, percentComplete, COMPLETION_THRESHOLD_PERCENT],
  );
  res.json(toApi(result.rows[0]));
});
