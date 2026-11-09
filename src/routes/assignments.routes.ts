import { randomUUID } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { pool, query } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';

interface AssignmentRow {
  id: string;
  audience_type: 'ROLE' | 'GROUP' | 'INDIVIDUAL';
  audience_value: string;
  item_type: 'VIDEO' | 'LEARNING_PATH';
  item_id: string;
  assigned_at: string;
}

function toApi(row: AssignmentRow) {
  return {
    id: row.id,
    audienceType: row.audience_type,
    audienceValue: row.audience_value,
    itemType: row.item_type,
    itemId: row.item_id,
    assignedAt: row.assigned_at,
  };
}

const createSchema = z.object({
  audienceType: z.enum(['ROLE', 'GROUP', 'INDIVIDUAL']),
  audienceValue: z.string().min(1),
  itemType: z.enum(['VIDEO', 'LEARNING_PATH']),
  itemId: z.string().min(1),
});

export const assignmentsRouter = Router();

/** Assignments that apply to the current user (by role, group, or individually). */
assignmentsRouter.get('/me', requireAuth, async (req, res) => {
  const me = await pool.query<{ id: string; role: string; grp: string | null }>(
    'SELECT id, role, grp FROM users WHERE id = $1',
    [req.user!.id],
  );
  const user = me.rows[0];
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const rows = await query<AssignmentRow>(
    `SELECT * FROM assignments
     WHERE (audience_type = 'ROLE' AND audience_value = $1)
        OR (audience_type = 'GROUP' AND audience_value = $2)
        OR (audience_type = 'INDIVIDUAL' AND audience_value = $3)
     ORDER BY assigned_at DESC`,
    [user.role, user.grp, user.id],
  );
  res.json(rows.map(toApi));
});

assignmentsRouter.get('/', requireAuth, requireRole('LND_ADMIN'), async (_req, res) => {
  const rows = await query<AssignmentRow>('SELECT * FROM assignments ORDER BY assigned_at DESC');
  res.json(rows.map(toApi));
});

assignmentsRouter.post('/', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const a = parsed.data;
  const id = `asg-${randomUUID()}`;
  const inserted = await pool.query<AssignmentRow>(
    `INSERT INTO assignments (id, audience_type, audience_value, item_type, item_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, a.audienceType, a.audienceValue, a.itemType, a.itemId],
  );
  res.status(201).json(toApi(inserted.rows[0]));
});

assignmentsRouter.delete('/:id', requireAuth, requireRole('LND_ADMIN'), async (req, res) => {
  const result = await pool.query('DELETE FROM assignments WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Assignment not found.' });
    return;
  }
  res.status(204).send();
});
