import bcrypt from 'bcrypt';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { createSession, getSession, destroySession } from '../session.js';

// Compared against when the username does not exist, so both failures take similar time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const BAD_LOGIN = 'Invalid username or password';

route('POST', '/api/auth/login', async (ctx) => {
  const { username, password } = ctx.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new HttpError(400, 'Username and password are required');
  }

  const [rows] = await pool.query(
    'SELECT UserID, Username, PasswordHash, Role FROM AppUser WHERE Username = ? AND IsActive = 1',
    [username],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.PasswordHash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, BAD_LOGIN);

  createSession(ctx.res, { userId: user.UserID, username: user.Username, role: user.Role });
  return { username: user.Username, role: user.Role };
});

route('POST', '/api/auth/logout', async (ctx) => {
  destroySession(ctx.req, ctx.res);
  return { ok: true };
});

route('GET', '/api/auth/me', async (ctx) => {
  const session = getSession(ctx.req);
  if (!session) throw new HttpError(401, 'Not logged in');
  return { username: session.username, role: session.role };
});
