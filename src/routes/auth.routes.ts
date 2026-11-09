import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

import { config } from '../config';
import { queryOne } from '../db/pool';
import { requireAuth } from '../middleware/auth';

interface UserRow {
  id: string;
  name: string;
  role: 'LND_ADMIN' | 'EMPLOYEE' | 'PARTNER';
  grp: string | null;
  username: string;
  password_hash: string;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }
  const { username, password } = parsed.data;

  const user = await queryOne<UserRow>(
    'SELECT id, name, role, grp, username, password_hash FROM users WHERE lower(username) = lower($1)',
    [username],
  );
  // Same error for "no such user" and "wrong password": do not reveal which.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  const payload = { id: user.id, role: user.role, username: user.username };
  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as SignOptions);

  res.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, group: user.grp ?? undefined },
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await queryOne<Omit<UserRow, 'password_hash'>>(
    'SELECT id, name, role, grp, username FROM users WHERE id = $1',
    [req.user!.id],
  );
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ id: user.id, name: user.name, role: user.role, group: user.grp ?? undefined });
});
