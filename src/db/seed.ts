import { readFileSync } from 'fs';
import { resolve } from 'path';

import bcrypt from 'bcryptjs';

import { pool } from './pool';

/**
 * Seeds the database from the JSON fixtures stored in this project
 * (src/db/fixtures), so the backend has no dependency on the frontend
 * repo. WARNING: this wipes existing rows in the seeded tables.
 *
 * Override the location with FIXTURE_DIR if needed.
 */
const FIXTURE_DIR = process.env['FIXTURE_DIR'] ?? resolve(__dirname, 'fixtures');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), 'utf8')) as T;
}

interface UserFx { id: string; name: string; role: string; group?: string; username: string; password: string }
interface CategoryFx { id: string; name: string }
interface VideoFx { id: string; title: string; description: string; categoryId: string; durationSeconds: number; sourceUrl: string; thumbnailUrl?: string }
interface QuizFx { id: string; title: string; passMarkPercent: number; questions: unknown[] }
interface PathFx { id: string; title: string; description: string; steps: { id: string; title: string; videoId?: string; quizId?: string; order: number }[] }
interface AssignmentFx { id: string; audienceType: string; audienceValue: string; itemType: string; itemId: string; assignedAt: string }
interface FeedbackFx { id: string; userId: string; targetType: string; targetId: string; rating: number; comment?: string; createdAt: string }
interface MilestoneFx { id: string; title: string; status: string; date: string }

async function seed(): Promise<void> {
  const users = load<UserFx[]>('users.json');
  const categories = load<CategoryFx[]>('categories.json');
  const videos = load<VideoFx[]>('videos.json');
  const quizzes = load<QuizFx[]>('quizzes.json');
  const paths = load<PathFx[]>('learning-paths.json');
  const assignments = load<AssignmentFx[]>('assignments.json');
  const feedback = load<FeedbackFx[]>('feedback.json');
  const milestones = load<MilestoneFx[]>('milestones.json');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `TRUNCATE feedback, quiz_attempts, video_progress, assignments, learning_path_steps,
               learning_paths, quizzes, videos, categories, milestones, users CASCADE`,
    );

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        'INSERT INTO users (id, name, role, grp, username, password_hash) VALUES ($1,$2,$3,$4,$5,$6)',
        [u.id, u.name, u.role, u.group ?? null, u.username, hash],
      );
    }
    for (const c of categories) {
      await client.query('INSERT INTO categories (id, name) VALUES ($1,$2)', [c.id, c.name]);
    }
    for (const v of videos) {
      await client.query(
        `INSERT INTO videos (id, title, description, category_id, duration_seconds, source_url, thumbnail_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [v.id, v.title, v.description, v.categoryId, v.durationSeconds, v.sourceUrl, v.thumbnailUrl || null],
      );
    }
    for (const q of quizzes) {
      await client.query(
        'INSERT INTO quizzes (id, title, pass_mark_percent, questions) VALUES ($1,$2,$3,$4)',
        [q.id, q.title, q.passMarkPercent, JSON.stringify(q.questions)],
      );
    }
    for (const p of paths) {
      await client.query('INSERT INTO learning_paths (id, title, description) VALUES ($1,$2,$3)', [
        p.id, p.title, p.description,
      ]);
      for (const s of p.steps) {
        await client.query(
          `INSERT INTO learning_path_steps (path_id, step_id, title, video_id, quiz_id, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [p.id, s.id, s.title, s.videoId ?? null, s.quizId ?? null, s.order],
        );
      }
    }
    for (const a of assignments) {
      await client.query(
        `INSERT INTO assignments (id, audience_type, audience_value, item_type, item_id, assigned_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [a.id, a.audienceType, a.audienceValue, a.itemType, a.itemId, a.assignedAt],
      );
    }
    for (const f of feedback) {
      await client.query(
        `INSERT INTO feedback (id, user_id, target_type, target_id, rating, comment, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [f.id, f.userId, f.targetType, f.targetId, f.rating, f.comment ?? null, f.createdAt],
      );
    }
    for (const m of milestones) {
      await client.query('INSERT INTO milestones (id, title, status, date) VALUES ($1,$2,$3,$4)', [
        m.id, m.title, m.status, m.date,
      ]);
    }

    await client.query('COMMIT');
    console.log(
      `Seeded: ${users.length} users, ${videos.length} videos, ${quizzes.length} quizzes, ${paths.length} paths.`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
