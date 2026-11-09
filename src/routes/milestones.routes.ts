import { Router } from 'express';

import { query } from '../db/pool';
import { requireAuth } from '../middleware/auth';

interface MilestoneRow {
  id: string;
  title: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE';
  date: string;
}

export const milestonesRouter = Router();

milestonesRouter.get('/', requireAuth, async (_req, res) => {
  // Format the DATE in SQL: the pg driver would otherwise return a JS Date,
  // which serializes as a timestamp and can land on the wrong day by timezone.
  const rows = await query<MilestoneRow>(
    `SELECT id, title, status, to_char(date, 'YYYY-MM-DD') AS date
     FROM milestones ORDER BY milestones.date`,
  );
  res.json(rows);
});
