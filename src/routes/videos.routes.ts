import { Router } from 'express';
import { z } from 'zod';

import { pool, query, queryOne } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';

interface VideoRow {
  id: string;
  title: string;
  description: string;
  category_id: string;
  duration_seconds: number;
  source_url: string;
  thumbnail_url: string | null;
}

function toApi(row: VideoRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    durationSeconds: row.duration_seconds,
    sourceUrl: row.source_url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
  };
}

const videoSchema = z.object({
  title: z.string().min(2),
  description: z.string().default(''),
  categoryId: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  sourceUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
});

export const videosRouter = Router();

videosRouter.get('/', requireAuth, async (_req, res) => {
  const rows = await query<VideoRow>('SELECT * FROM videos ORDER BY title');
  res.json(rows.map(toApi));
});

videosRouter.get('/:id', requireAuth, async (req, res) => {
  const row = await queryOne<VideoRow>('SELECT * FROM videos WHERE id = $1', [req.params.id]);
  if (!row) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  res.json(toApi(row));
});

videosRouter.post('/', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const parsed = videoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  const id = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(
    `INSERT INTO videos (id, title, description, category_id, duration_seconds, source_url, thumbnail_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, v.title, v.description, v.categoryId, v.durationSeconds, v.sourceUrl, v.thumbnailUrl ?? null],
  );
  res.status(201).json({ id, ...v });
});

videosRouter.put('/:id', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const parsed = videoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const v = parsed.data;
  const result = await pool.query(
    `UPDATE videos SET title=$1, description=$2, category_id=$3, duration_seconds=$4,
       source_url=$5, thumbnail_url=$6 WHERE id=$7`,
    [v.title, v.description, v.categoryId, v.durationSeconds, v.sourceUrl, v.thumbnailUrl ?? null, req.params.id],
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  res.json({ id: req.params.id, ...v });
});

videosRouter.delete('/:id', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const result = await pool.query('DELETE FROM videos WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }
  res.status(204).send();
});
