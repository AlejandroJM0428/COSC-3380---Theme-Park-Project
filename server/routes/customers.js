import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needDate, needInt, needText, recordId } from '../validate.js';

// Customers (guest records): list, get, add, edit, deactivate.
// "Delete" is a soft delete: IsActive = 0. The row stays, because tickets and memberships point at it.
// Editing the record can turn a customer back on.

// Role matrix (TA fixes plan): the retail desk and the ticket booth own these records. The operations manager has no access.
const CAN_READ = ['Admin', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'RetailManager', 'Cashier'];
const CAN_DELETE = ['Admin', 'RetailManager'];

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

// Search rows return the membership that covers today (MembershipID, Tier, MembershipEnd, all NULL if none)
// and when there is none the end date of their most recent expired membership (LastMembershipEnd).
// Memberships can't overlap (trg_Membership_BI on insert, the membership route on edit),
// so the join matches at most one membership and the same customer is never returned twice.
const SELECT_CUSTOMER_SEARCH = `
  SELECT c.CustomerID, c.FirstName, c.LastName, CONCAT(c.FirstName, ' ', c.LastName) AS FullName, c.DOB,
         m.MembershipID, m.Tier, m.EndDate AS MembershipEnd,
         (SELECT MAX(x.EndDate) FROM Membership x WHERE x.CustomerID = c.CustomerID AND x.EndDate < CURDATE()) AS LastMembershipEnd
    FROM Customer c
    LEFT JOIN Membership m ON m.CustomerID = c.CustomerID AND CURDATE() BETWEEN m.StartDate AND m.EndDate`;

// GET /api/customers/search?name=...&dob=YYYY-MM-DD (either or both). First 20 active customers that match.
// Used by the "Find customer" box on the ticket forms. Workers are not in CAN_READ, so they get a 403.
// Registered BEFORE /:id so "search" is not read as an id.
route(
  'GET',
  '/api/customers/search',
  requireRole(...CAN_READ)(async (ctx) => {
    const name = typeof ctx.query.name === 'string' ? ctx.query.name.trim() : '';
    const dob = ctx.query.dob ? needDate(ctx.query.dob, 'Date of birth') : null;
    if (!name && !dob) throw new HttpError(400, 'Enter a name, a date of birth, or both');
    if (name.length > 60) throw new HttpError(400, 'Name must be 60 characters or fewer');

    const where = ['c.IsActive = 1'];
    const args = [];
    if (name) {
      where.push("CONCAT(c.FirstName, ' ', c.LastName) LIKE ?");
      args.push(`%${name.replace(/[\\%_]/g, '\\$&')}%`); // % and _ typed by the user are matched literally
    }
    if (dob) {
      where.push('c.DOB = ?');
      args.push(dob);
    }
    const [rows] = await pool.query(
      `${SELECT_CUSTOMER_SEARCH} WHERE ${where.join(' AND ')} ORDER BY c.LastName, c.FirstName LIMIT 20`,
      args,
    );
    return rows;
  }),
);

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
