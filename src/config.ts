import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env['NODE_ENV'] ?? 'development';
const jwtSecret = required('JWT_SECRET');

// Refuse to boot in production with an obviously unsafe secret.
if (nodeEnv === 'production' && (jwtSecret.length < 32 || jwtSecret.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be a long random value in production.');
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env['PORT'] ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '8h',
  corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0),
} as const;
