import { Pool, QueryResultRow } from 'pg';

import { config } from '../config';

export const pool = new Pool({ connectionString: config.databaseUrl });

pool.on('error', (err) => {
  // Idle client errors must not crash the process silently.
  console.error('Unexpected PostgreSQL pool error', err);
});

/** Parameterized query helper. Always pass values via `params`, never by string concatenation. */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
