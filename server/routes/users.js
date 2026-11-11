import bcrypt from 'bcrypt';
import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, oneOf, recordId } from '../validate.js';

// App Users (Admin only): staff logins. List, get, add, edit, deactivate.
// Safety rules:
//   - The password hash is never sent to the browser. Only the server hashes (bcrypt, same as login).
//   - Member accounts and guests are listed (read only) so Admin can see everyone. Members create their own accounts by sign-up.
//   - You cannot deactivate yourself or change your own role, so the last Admin cannot be locked out.
//   - "Delete" is a soft delete (IsActive = 0). Deactivated accounts cannot log in.
//   - Every staff login belongs to an employee, and its username is never a role name.

const CAN_USE = ['Admin'];
const STAFF_ROLES = ['Admin', 'Manager', 'Cashier', 'RetailManager', 'HRManager', 'MaintenanceManager', 'MaintenanceWorker', 'RestaurantWorker'];
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;

// A staff username is never a role name, and never one of the old shared logins (any case).
const RESERVED_USERNAMES = new Set([
  ...STAFF_ROLES.map((r) => r.toLowerCase()),
  'customer',
  'retail',
  'hr',
  'maintmgr',
  'tech',
  'cook',
]);

// first name (lower case, letters only) + last four digits of the EmployeeID: Mason, 1000028 -> mason0028.
export function suggestUsername(firstName, employeeId) {
  const letters = String(firstName ?? '').normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
  return `${letters || 'user'}${String(employeeId).padStart(4, '0').slice(-4)}`;
}

const FRIENDLY = {
  1062: 'That username is already taken',
  1452: 'That employee does not exist. Choose one from the list',
  1048: 'A required value is missing. Every staff login needs an employee',
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

// `currentUsername` is the account's present name when editing. An old name that is already in use is left
// alone, so a password reset still works; a name you type now must pass the rules.
export function parseUser(body, { isNew, currentUsername = null }) {
  const b = body ?? {};
  const username = typeof b.username === 'string' ? b.username.trim() : '';
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore');
  }
  const unchanged = currentUsername != null && username.toLowerCase() === currentUsername.toLowerCase();
  if (!unchanged && RESERVED_USERNAMES.has(username.toLowerCase())) {
    throw new HttpError(400, 'A username cannot be a role name. Use the employee\'s first name and the last four digits of their ID');
  }
  if (b.employeeId == null || b.employeeId === '') {
    throw new HttpError(400, 'Choose the employee this login belongs to. Every staff login needs one');
  }
  const employeeId = needId(b.employeeId, 'Employee ID');
  return {
    username,
    role: oneOf(b.role, 'Role', STAFF_ROLES),
    employeeId,
    isActive: b.isActive === false ? 0 : 1,
    password: parsePassword(b.password, isNew),
  };
}

// GET /api/users?status=active|inactive&role=...&q=... (all optional). Admin's one list of everyone:
//   staff logins, member accounts (role Customer) and guests (customer records with no login, role Guest).
// Guests and members are read only here. Member and guest lists show the newest 300 each; use q to find others.
const LIST_ROLES = [...STAFF_ROLES, 'Customer', 'Guest', 'NoLogin'];
const PEOPLE_LIMIT = 300;

route(
  'GET',
  '/api/users',
  requireRole(...CAN_USE)(async (ctx) => {
    const { status, role, q } = ctx.query;
    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      throw new HttpError(400, 'Status must be active or inactive');
    }
    if (role !== undefined && role !== '' && !LIST_ROLES.includes(role)) {
      throw new HttpError(400, 'Unknown role filter');
    }
    const flag = status === 'active' ? 1 : status === 'inactive' ? 0 : null;
    const text = typeof q === 'string' ? q.trim().slice(0, 50) : '';
    const like = `%${text}%`;
    const want = (r) => !role || role === r;

    const rows = [];

    if (!role || STAFF_ROLES.includes(role)) {
      const where = ["u.Role <> 'Customer'"];
      const args = [];
      if (role) { where.push('u.Role = ?'); args.push(role); }
      if (flag !== null) { where.push('u.IsActive = ?'); args.push(flag); }
      if (text) { where.push("(u.Username LIKE ? OR CONCAT(e.FirstName, ' ', e.LastName) LIKE ?)"); args.push(like, like); }
      const [staff] = await pool.query(
        `SELECT u.UserID, CONCAT('u', u.UserID) AS RowKey, u.Username, u.Role, u.EmployeeID, NULL AS CustomerID,
                CONCAT(e.FirstName, ' ', e.LastName) AS PersonName, u.IsActive
           FROM AppUser u LEFT JOIN Employee e ON e.EmployeeID = u.EmployeeID
          WHERE ${where.join(' AND ')} ORDER BY u.UserID LIMIT 500`,
        args,
      );
      rows.push(...staff);
    }

    // Employees who have no login yet (most ride operators, attendants, cooks...). Listed so every staff member shows up.
    if (want('NoLogin')) {
      const where = ['NOT EXISTS (SELECT 1 FROM AppUser x WHERE x.EmployeeID = e.EmployeeID)'];
      const args = [];
      if (flag !== null) { where.push('e.IsActive = ?'); args.push(flag); }
      if (text) { where.push("CONCAT(e.FirstName, ' ', e.LastName) LIKE ?"); args.push(like); }
      const [noLogin] = await pool.query(
        `SELECT NULL AS UserID, CONCAT('e', e.EmployeeID) AS RowKey, NULL AS Username, 'NoLogin' AS Role, e.EmployeeID, NULL AS CustomerID,
                CONCAT(e.FirstName, ' ', e.LastName) AS PersonName, e.IsActive, e.JobTitle
           FROM Employee e
          WHERE ${where.join(' AND ')} ORDER BY e.LastName, e.FirstName, e.EmployeeID LIMIT 500`,
        args,
      );
      rows.push(...noLogin);
    }

    if (want('Customer')) {
      const where = ["u.Role = 'Customer'"];
      const args = [];
      if (flag !== null) { where.push('u.IsActive = ?'); args.push(flag); }
      if (text) { where.push("(u.Username LIKE ? OR CONCAT(c.FirstName, ' ', c.LastName) LIKE ?)"); args.push(like, like); }
      const [members] = await pool.query(
        `SELECT u.UserID, CONCAT('u', u.UserID) AS RowKey, u.Username, 'Customer' AS Role, NULL AS EmployeeID, u.CustomerID,
                CONCAT(c.FirstName, ' ', c.LastName) AS PersonName, u.IsActive
           FROM AppUser u JOIN Customer c ON c.CustomerID = u.CustomerID
          WHERE ${where.join(' AND ')} ORDER BY u.UserID DESC LIMIT ${PEOPLE_LIMIT}`,
        args,
      );
      rows.push(...members);
    }

    if (want('Guest')) {
      const where = ['u.UserID IS NULL', 'c.ParentCustomerID IS NULL'];
      const args = [];
      if (flag !== null) { where.push('c.IsActive = ?'); args.push(flag); }
      if (text) { where.push("CONCAT(c.FirstName, ' ', c.LastName) LIKE ?"); args.push(like); }
      const [guests] = await pool.query(
        `SELECT NULL AS UserID, CONCAT('c', c.CustomerID) AS RowKey, NULL AS Username, 'Guest' AS Role, NULL AS EmployeeID, c.CustomerID,
                CONCAT(c.FirstName, ' ', c.LastName) AS PersonName, c.IsActive
           FROM Customer c LEFT JOIN AppUser u ON u.CustomerID = c.CustomerID
          WHERE ${where.join(' AND ')} ORDER BY c.CustomerID DESC LIMIT ${PEOPLE_LIMIT}`,
        args,
      );
      rows.push(...guests);
    }

    return rows;
  }),
);

// Dropdown for the "Employee" field, so nobody has to type an employee number.
// Registered BEFORE /:id so "lookups" is not read as an id.
route(
  'GET',
  '/api/users/lookups',
  requireRole(...CAN_USE)(async () => {
    const [employees] = await pool.query(
      `SELECT EmployeeID AS id, FirstName,
              CONCAT(FirstName, ' ', LastName, ' (', EmployeeID, ') - ', JobTitle, IF(IsActive = 1, '', ' (inactive)')) AS name
         FROM Employee
        ORDER BY LastName, FirstName, EmployeeID
        LIMIT 1000`,
    );
    // `username` is the suggested login name for that employee. The form fills it in; it can still be changed.
    return { employees: employees.map(({ id, FirstName, name }) => ({ id, name, username: suggestUsername(FirstName, id) })) };
  }),
);

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
    const current = await loadUser(id); // 404 if missing or a customer account
    const u = parseUser(ctx.body, { isNew: false, currentUsername: current.Username });
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
