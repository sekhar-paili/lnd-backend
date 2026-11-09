// Must be imported before any route is registered: makes Express 4 forward
// rejected promises from async handlers to the error middleware.
import 'express-async-errors';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { config } from './config';
import { pool } from './db/pool';
import { assignmentsRouter } from './routes/assignments.routes';
import { authRouter } from './routes/auth.routes';
import { categoriesRouter } from './routes/categories.routes';
import { feedbackRouter } from './routes/feedback.routes';
import { milestonesRouter } from './routes/milestones.routes';
import { pathsRouter } from './routes/paths.routes';
import { progressRouter } from './routes/progress.routes';
import { quizzesRouter } from './routes/quizzes.routes';
import { reportsRouter } from './routes/reports.routes';
import { videosRouter } from './routes/videos.routes';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (no Origin header) and the configured origins.
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin not allowed by CORS: ${origin}`));
        }
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Slow down credential-guessing on the login endpoint.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/milestones', milestonesRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/quizzes', quizzesRouter);
  app.use('/api/learning-paths', pathsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/reports', reportsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // Central error handler (receives async errors via express-async-errors).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const message = config.isProduction ? 'Internal server error.' : err.message;
    res.status(500).json({ error: message });
  });

  return app;
}
