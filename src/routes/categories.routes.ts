import { Router } from 'express';

import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

export const categoriesRouter = Router();

categoriesRouter.get('/', requireAuth, async (_req, res) => {
  const rows = await query<{ id: string; name: string }>('SELECT id, name FROM categories ORDER BY name');
  res.json(rows);
});
