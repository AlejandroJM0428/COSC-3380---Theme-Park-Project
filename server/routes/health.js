import { route } from '../router.js';
import { pool } from '../db.js';

route('GET', '/api/health', async (ctx) => {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    console.error('Health check: database unreachable:', err.message);
    ctx.status = 503;
    return { ok: false, message: 'Database unreachable' };
  }
});
