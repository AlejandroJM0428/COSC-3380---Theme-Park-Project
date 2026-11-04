import bcrypt from 'bcrypt';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { createSession, getSession, destroySession } from '../session.js';
import { lockedForSeconds, recordFailure, recordSuccess } from '../loginLimiter.js';

// Compared against when the username does not exist, so both failures take similar time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const BAD_LOGIN = 'Invalid username or password';

// The staff and member sign-in pages are separate. Each says which one it is ('staff' or 'member'), and the
// server refuses an account of the other kind with the same message as a wrong password, so neither page
// reveals what the other one is for. No audience (older callers, check.sh) keeps the old behaviour.
const AUDIENCES = ['staff', 'member'];

// The name shown in the top bar of every portal: the employee's name for staff, the member's own name for customers.
// Never the username. Null only if the account has no employee or customer row (the pages then show a plain label).
async function nameFor(employeeId, customerId) {
  if (employeeId) {
    const [rows] = await pool.query("SELECT CONCAT(FirstName, ' ', LastName) AS name FROM Employee WHERE EmployeeID = ?", [employeeId]);
    if (rows[0]) return rows[0].name;
  }
  if (customerId) {
    const [rows] = await pool.query("SELECT CONCAT(FirstName, ' ', LastName) AS name FROM Customer WHERE CustomerID = ?", [customerId]);
    if (rows[0]) return rows[0].name;
  }
  return null;
}

route('POST', '/api/auth/login', async (ctx) => {
  const { username, password, audience } = ctx.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new HttpError(400, 'Username and password are required');
  }
  if (audience !== undefined && !AUDIENCES.includes(audience)) throw new HttpError(400, 'Unknown sign in page');

  // Too many recent failures for this username / address: refuse before touching the database or bcrypt.
  const ip = ctx.req.socket?.remoteAddress ?? 'unknown';
  const wait = lockedForSeconds(username, ip);
  if (wait > 0) {
    ctx.res.setHeader('Retry-After', String(wait));
    throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`);
  }

  const [rows] = await pool.query(
    'SELECT UserID, Username, PasswordHash, Role, CustomerID, EmployeeID FROM AppUser WHERE Username = ? AND IsActive = 1',
    [username],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.PasswordHash : DUMMY_HASH);
  const isCustomer = user?.Role === 'Customer';
  const wrongPage = (audience === 'staff' && isCustomer) || (audience === 'member' && user && !isCustomer);
  if (!user || !ok || wrongPage) {
    recordFailure(username, ip);
    throw new HttpError(401, BAD_LOGIN);
  }
  recordSuccess(username, ip);

  createSession(ctx.res, { userId: user.UserID, username: user.Username, role: user.Role, CustomerID: user.CustomerID, EmployeeID: user.EmployeeID });
  return { username: user.Username, role: user.Role, name: await nameFor(user.EmployeeID, user.CustomerID) };
});

// Member self sign-up. Always creates a Customer row + a 'Customer' AppUser, never a staff role.
// Role and CustomerID come from the server, not the request body.
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;

function parseRegistration(body) {
  const b = body ?? {};
  const username = typeof b.username === 'string' ? b.username.trim() : '';
  const firstName = typeof b.firstName === 'string' ? b.firstName.trim() : '';
  const lastName = typeof b.lastName === 'string' ? b.lastName.trim() : '';
  const heightCm = Number(b.heightCm);

  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore');
  }
  if (typeof b.password !== 'string' || b.password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }
  if (Buffer.byteLength(b.password) > 72) throw new HttpError(400, 'Password is too long (72 bytes max)');
  if (!firstName || firstName.length > 50) throw new HttpError(400, 'First name is required (50 characters max)');
  if (!lastName || lastName.length > 50) throw new HttpError(400, 'Last name is required (50 characters max)');

  const dob = typeof b.dob === 'string' ? b.dob : '';
  const parsed = new Date(`${dob}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob) {
    throw new HttpError(400, 'Date of birth must be a real date (YYYY-MM-DD)');
  }
  if (parsed > new Date() || parsed.getUTCFullYear() < 1900) {
    throw new HttpError(400, 'Date of birth is out of range');
  }
  if (!Number.isInteger(heightCm) || heightCm < 30 || heightCm > 260) {
    throw new HttpError(400, 'Height must be a whole number of cm between 30 and 260');
  }
  return { username, password: b.password, firstName, lastName, dob, heightCm };
}

route('POST', '/api/auth/register', async (ctx) => {
  const r = parseRegistration(ctx.body);
  const hash = await bcrypt.hash(r.password, 10);

  const conn = await pool.getConnection();
  let userId;
  let customerId;
  try {
    await conn.beginTransaction();
    const [cust] = await conn.query(
      'INSERT INTO Customer (FirstName, LastName, DOB, HeightCm, IsActive) VALUES (?, ?, ?, ?, 1)',
      [r.firstName, r.lastName, r.dob, r.heightCm],
    );
    customerId = cust.insertId;
    const [user] = await conn.query(
      `INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, CustomerID, IsActive)
       VALUES (?, ?, 'Customer', NULL, ?, 1)`,
      [r.username, hash, customerId],
    );
    userId = user.insertId;
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err?.errno === 1062) throw new HttpError(409, 'That username is already taken');
    throw err;
  } finally {
    conn.release();
  }

  createSession(ctx.res, { userId, username: r.username, role: 'Customer', CustomerID: customerId });
  ctx.status = 201;
  return { username: r.username, role: 'Customer', name: `${r.firstName} ${r.lastName}` };
});

route('POST', '/api/auth/logout', async (ctx) => {
  destroySession(ctx.req, ctx.res);
  return { ok: true };
});

route('GET', '/api/auth/me', async (ctx) => {
  const session = getSession(ctx.req);
  if (!session) throw new HttpError(401, 'Not logged in');
  return { username: session.username, role: session.role, name: await nameFor(session.EmployeeID, session.CustomerID) };
});
