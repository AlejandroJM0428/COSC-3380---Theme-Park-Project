import path from 'node:path';

// Load server/.env if it exists. Real environment variables (Docker, geto) win over the file.
try {
  process.loadEnvFile(path.join(import.meta.dirname, '.env'));
} catch {
  // no .env file: rely on the real environment
}

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3100),
  production: process.env.NODE_ENV === 'production',
  sessionSecret: need('SESSION_SECRET'),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: need('DB_USER'),
    password: need('DB_PASSWORD'),
    database: process.env.DB_NAME || 'theme_park',
  },
  clientDist: process.env.CLIENT_DIST
    ? path.resolve(process.env.CLIENT_DIST)
    : path.resolve(import.meta.dirname, '..', 'client', 'dist'),
};
