import { createApp } from './app';
import { config } from './config';
import { pool } from './db/pool';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`LND API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
