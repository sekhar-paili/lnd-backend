import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { pool, query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

interface FeedbackRow {
  id: string;
  user_id: string;
  target_type: 'VIDEO' | 'LEARNING_PATH';
  target_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function toApi(row: FeedbackRow) {
  return {
    id: row.id,
    userId: row.user_id,
    targetType: row.target_type,
    targetId: row.target_id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
  };
}

const createSchema = z.object({
  targetType: z.enum(['VIDEO', 'LEARNING_PATH']),
  targetId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const listSchema = z.object({
  targetType: z.enum(['VIDEO', 'LEARNING_PATH']),
  targetId: z.string().min(1),
});

export const feedbackRouter = Router();

feedbackRouter.get('/', requireAuth, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'targetType and targetId query parameters are required.' });
    return;
  }
  const { targetType, targetId } = parsed.data;
  const rows = await query<FeedbackRow>(
    'SELECT * FROM feedback WHERE target_type = $1 AND target_id = $2 ORDER BY created_at DESC',
    [targetType, targetId],
  );
  const items = rows.map(toApi);
  const average = items.length
    ? Math.round((items.reduce((sum, f) => sum + f.rating, 0) / items.length) * 10) / 10
    : 0;
  res.json({ items, averageRating: average, count: items.length });
});

/** The author is always the authenticated user; a client cannot post as someone else. */
feedbackRouter.post('/', requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const f = parsed.data;
  const inserted = await pool.query<FeedbackRow>(
    `INSERT INTO feedback (id, user_id, target_type, target_id, rating, comment)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [`fb-${randomUUID()}`, req.user!.id, f.targetType, f.targetId, f.rating, f.comment ?? null],
  );
  res.status(201).json(toApi(inserted.rows[0]));
});
