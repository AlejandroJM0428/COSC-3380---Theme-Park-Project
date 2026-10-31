import bcrypt from 'bcrypt';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, oneOf, recordId } from '../validate.js';

// App Users (Admin only): staff logins. List, get, add, edit, deactivate.
// Safety rules:
//   - The password hash is never sent to the browser. Only the server hashes (bcrypt, same as login).
//   - Customer accounts are not shown here. They are created by member sign-up.
//   - You cannot deactivate yourself or change your own role, so the last Admin cannot be locked out.
//   - "Delete" is a soft delete (IsActive = 0). Deactivated accounts cannot log in.

const CAN_USE = ['Admin'];
const STAFF_ROLES = ['Admin', 'Manager', 'Cashier', 'RetailManager', 'HRManager', 'MaintenanceManager', 'MaintenanceWorker', 'RestaurantWorker'];
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;

const FRIENDLY = {
  1062: 'That username is already taken',
  1452: 'That employee ID does not exist',
  3819: 'A value breaks a database rule. Staff accounts cannot be tied to a customer',
};

const SELECT_USER = `
  SELECT u.UserID, u.Username, u.Role, u.EmployeeID,
         CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName, u.IsActive
    FROM AppUser u
    LEFT JOIN Employee e ON e.EmployeeID = u.EmployeeID
   WHERE u.Role <> 'Customer'`;

async function loadUser(id) {
  const [rows] = await pool.query(`${SELECT_USER} AND u.UserID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found');
  return rows[0];
}

// Password rules match member sign-up. Returns the clean password, or null when it is empty and optional.
function parsePassword(value, required) {
  if (value == null || value === '') {
    if (required) throw new HttpError(400, 'Password is required for a new account');
    return null;
  }
  if (typeof value !== 'string' || value.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (Buffer.byteLength(value) > 72) throw new HttpError(400, 'Password is too long (72 bytes max)');
  return value;
}

export function parseUser(body, { isNew }) {
  const b = body ?? {};
  const username = typeof b.username === 'string' ? b.username.trim() : '';
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore');
  }
  const employeeId = b.employeeId == null || b.employeeId === '' ? null : needId(b.employeeId, 'Employee ID');
  return {
    username,
    role: oneOf(b.role, 'Role', STAFF_ROLES),
    employeeId,
    isActive: b.isActive === false ? 0 : 1,
    password: parsePassword(b.password, isNew),
  };
}

// GET /api/users?status=active|inactive (optional). Staff accounts only.
route(
  'GET',
  '/api/users',
  requireRole(...CAN_USE)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      throw new HttpError(400, 'Status must be active or inactive');
    }
    const where = status === 'active' ? ' AND u.IsActive = 1' : status === 'inactive' ? ' AND u.IsActive = 0' : '';
    const [rows] = await pool.query(`${SELECT_USER}${where} ORDER BY u.UserID LIMIT 500`);
    return rows;
  }),
);

// The form needs no dropdowns. Registered BEFORE /:id so "lookups" is not read as an id.
route('GET', '/api/users/lookups', requireRole(...CAN_USE)(async () => ({})));

route(
  'GET',
  '/api/users/:id',
  requireRole(...CAN_USE)(async (ctx) => loadUser(recordId(ctx, 'User'))),
);

route(
  'POST',
  '/api/users',
  requireRole(...CAN_USE)(async (ctx) => {
    const u = parseUser(ctx.body, { isNew: true });
    const hash = await bcrypt.hash(u.password, 10);
    try {
      const [result] = await pool.query(
        'INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, CustomerID, IsActive) VALUES (?, ?, ?, ?, NULL, ?)',
        [u.username, hash, u.role, u.employeeId, u.isActive],
      );
      ctx.status = 201;
      return await loadUser(result.insertId);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
  }),
);

route(
  'PUT',
  '/api/users/:id',
  requireRole(...CAN_USE)(async (ctx) => {
    const id = recordId(ctx, 'User');
    const u = parseUser(ctx.body, { isNew: false });
    const current = await loadUser(id); // 404 if missing or a customer account
    if (id === ctx.session.userId && (u.role !== current.Role || !u.isActive)) {
      throw new HttpError(400, 'You cannot change your own role or deactivate yourself');
    }
    try {
      if (u.password) {
        const hash = await bcrypt.hash(u.password, 10);
        await pool.query(
          'UPDATE AppUser SET Username = ?, PasswordHash = ?, Role = ?, EmployeeID = ?, IsActive = ? WHERE UserID = ?',
          [u.username, hash, u.role, u.employeeId, u.isActive, id],
        );
      } else {
        await pool.query('UPDATE AppUser SET Username = ?, Role = ?, EmployeeID = ?, IsActive = ? WHERE UserID = ?', [
          u.username,
          u.role,
          u.employeeId,
          u.isActive,
          id,
        ]);
      }
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    return loadUser(id);
  }),
);

// DELETE deactivates (soft delete). The account stays and can be turned back on by editing it.
route(
  'DELETE',
  '/api/users/:id',
  requireRole(...CAN_USE)(async (ctx) => {
    const id = recordId(ctx, 'User');
    if (id === ctx.session.userId) throw new HttpError(400, 'You cannot deactivate your own account');
    await loadUser(id);
    await pool.query('UPDATE AppUser SET IsActive = 0 WHERE UserID = ?', [id]);
    return loadUser(id);
  }),
);
