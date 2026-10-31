import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needDate, needInt, needText, recordId } from '../validate.js';

// Customers (guest records): list, get, add, edit, deactivate.
// "Delete" is a soft delete: IsActive = 0. The row stays, because tickets and memberships point at it.
// Editing the record can turn a customer back on.

const CAN_READ = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_DELETE = ['Admin', 'Manager', 'RetailManager'];

const SELECT_CUSTOMER = `
  SELECT CustomerID, FirstName, LastName, CONCAT(FirstName, ' ', LastName) AS FullName,
         DOB, HeightCm, IsActive
    FROM Customer`;

async function loadCustomer(id) {
  const [rows] = await pool.query(`${SELECT_CUSTOMER} WHERE CustomerID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Customer not found');
  return rows[0];
}

// Checks the body and returns only the columns we allow.
export function parseCustomer(body) {
  const b = body ?? {};
  const dob = needDate(b.dob, 'Date of birth');
  if (dob < '1900-01-01' || dob > new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, 'Date of birth must be in the past');
  }
  return {
    firstName: needText(b.firstName, 'First name', 50),
    lastName: needText(b.lastName, 'Last name', 50),
    dob,
    heightCm: needInt(b.heightCm, 'Height (cm)', 30, 260),
    isActive: b.isActive === false ? 0 : 1,
  };
}

// GET /api/customers?status=active|inactive (optional). Newest first, first 500.
route(
  'GET',
  '/api/customers',
  requireRole(...CAN_READ)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      throw new HttpError(400, 'Status must be active or inactive');
    }
    const where = status === 'active' ? ' WHERE IsActive = 1' : status === 'inactive' ? ' WHERE IsActive = 0' : '';
    const [rows] = await pool.query(`${SELECT_CUSTOMER}${where} ORDER BY CustomerID DESC LIMIT 500`);
    return rows;
  }),
);

// The form needs no dropdowns. Registered BEFORE /:id so "lookups" is not read as an id.
route('GET', '/api/customers/lookups', requireRole(...CAN_READ)(async () => ({})));

route(
  'GET',
  '/api/customers/:id',
  requireRole(...CAN_READ)(async (ctx) => loadCustomer(recordId(ctx, 'Customer'))),
);

route(
  'POST',
  '/api/customers',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const c = parseCustomer(ctx.body);
    try {
      const [result] = await pool.query(
        'INSERT INTO Customer (FirstName, LastName, DOB, HeightCm, IsActive) VALUES (?, ?, ?, ?, 1)',
        [c.firstName, c.lastName, c.dob, c.heightCm],
      );
      ctx.status = 201;
      return await loadCustomer(result.insertId);
    } catch (err) {
      throw friendlyDbError(err, { 3819: 'Height must be between 30 and 260 cm' });
    }
  }),
);

route(
  'PUT',
  '/api/customers/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = recordId(ctx, 'Customer');
    const c = parseCustomer(ctx.body);
    await loadCustomer(id); // 404 if missing
    try {
      await pool.query(
        'UPDATE Customer SET FirstName = ?, LastName = ?, DOB = ?, HeightCm = ?, IsActive = ? WHERE CustomerID = ?',
        [c.firstName, c.lastName, c.dob, c.heightCm, c.isActive, id],
      );
    } catch (err) {
      throw friendlyDbError(err, { 3819: 'Height must be between 30 and 260 cm' });
    }
    return loadCustomer(id);
  }),
);

// DELETE deactivates (soft delete). Nothing is removed from Customer.
route(
  'DELETE',
  '/api/customers/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = recordId(ctx, 'Customer');
    await loadCustomer(id);
    await pool.query('UPDATE Customer SET IsActive = 0 WHERE CustomerID = ?', [id]);
    return loadCustomer(id);
  }),
);
