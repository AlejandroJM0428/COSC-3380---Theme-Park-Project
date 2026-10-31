import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { pool } from './db.js';
import { dispatch } from './router.js';
import { sendJson, handleError } from './errors.js';

import './routes/health.js';
import './routes/auth.js';
import './routes/reports.js';
import './routes/queries.js';
import './routes/demos.js';
import './routes/tickets.js';
import './routes/maintenance.js';
import './routes/shifts.js';
import './routes/notifications.js';
import './routes/visitor.js';
import './routes/me.js';
import './routes/admin.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { message: 'Method not allowed' });
  }

  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { message: 'Bad path' });
  }
  if (rel.includes('\0')) return sendJson(res, 400, { message: 'Bad path' });

  const root = config.clientDist;
  let file = path.resolve(root, '.' + rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return sendJson(res, 403, { message: 'Forbidden' }); // path traversal
  }

  let stat = await fs.stat(file).catch(() => null);
  if (!stat || stat.isDirectory()) {
    // A missing file with an extension is a real 404. Anything else is a React route: serve index.html.
    if (path.extname(rel)) return sendJson(res, 404, { message: 'Not found' });
    file = path.join(root, 'index.html');
    stat = await fs.stat(file).catch(() => null);
    if (!stat) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Frontend not built yet. Run "npm run build" in client/.');
    }
  }

  const body = await fs.readFile(file);
  const hashed = file.includes(path.sep + 'assets' + path.sep);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await dispatch(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    handleError(res, err);
  }
});

server.listen(config.port, () => {
  console.log(`Theme Park server listening on http://localhost:${config.port}`);
  pool
    .query('SELECT 1')
    .then(() => console.log(`Database OK (${config.db.host}:${config.db.port}/${config.db.database})`))
    .catch((err) => console.error('Database NOT reachable:', err.message));
});

async function shutdown() {
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
