-- LND platform schema (PostgreSQL). Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('LND_ADMIN', 'EMPLOYEE', 'PARTNER')),
  grp           TEXT,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  category_id      TEXT NOT NULL REFERENCES categories (id),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  source_url       TEXT NOT NULL,
  thumbnail_url    TEXT
);
CREATE INDEX IF NOT EXISTS videos_category_idx ON videos (category_id);

-- Questions (with options and the correct option) are stored as JSONB because
-- they are always read and written together with their quiz.
CREATE TABLE IF NOT EXISTS quizzes (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  pass_mark_percent  INTEGER NOT NULL CHECK (pass_mark_percent BETWEEN 0 AND 100),
  questions          JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS learning_paths (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS learning_path_steps (
  path_id    TEXT NOT NULL REFERENCES learning_paths (id) ON DELETE CASCADE,
  step_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  video_id   TEXT REFERENCES videos (id) ON DELETE SET NULL,
  quiz_id    TEXT REFERENCES quizzes (id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (path_id, step_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id             TEXT PRIMARY KEY,
  audience_type  TEXT NOT NULL CHECK (audience_type IN ('ROLE', 'GROUP', 'INDIVIDUAL')),
  audience_value TEXT NOT NULL,
  item_type      TEXT NOT NULL CHECK (item_type IN ('VIDEO', 'LEARNING_PATH')),
  item_id        TEXT NOT NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_progress (
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  video_id         TEXT NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
  position_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_complete DOUBLE PRECISION NOT NULL DEFAULT 0,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            TEXT PRIMARY KEY,
  quiz_id       TEXT NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score_percent NUMERIC(5, 2) NOT NULL,
  passed        BOOLEAN NOT NULL,
  answered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts (user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_quiz_idx ON quiz_attempts (quiz_id);

CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('VIDEO', 'LEARNING_PATH')),
  target_id   TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_target_idx ON feedback (target_type, target_id);

CREATE TABLE IF NOT EXISTS milestones (
  id     TEXT PRIMARY KEY,
  title  TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'DONE')),
  date   DATE NOT NULL
);
