import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needDate, needId, oneOf, recordId } from '../validate.js';

// Memberships (revenue): list, get, add, edit, delete.
// The browser never sends the end date or the price.
//   EndDate is worked out here: one year from the start date, minus a day (the database CHECK requires this).
//   Price is set by trg_Membership_BI / trg_Membership_BU from the MembershipTier price list.
// Delete is a real delete, because Membership has no IsActive column. The database refuses it when
// tickets already use the membership (foreign key), and we turn that into a plain sentence.

const CAN_READ = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_DELETE = ['Admin', 'Manager', 'RetailManager'];
const TIERS = ['Basic', 'Plus', 'Premier'];

const SELECT_MEMBERSHIP = `
  SELECT m.MembershipID, m.CustomerID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
         m.Tier, m.StartDate, m.EndDate, m.Price, m.AutoRenew,
         m.IncludesExpress, m.AnyDayAccess,
         (CURDATE() BETWEEN m.StartDate AND m.EndDate) AS IsCurrent
    FROM Membership m
    JOIN Customer c ON c.CustomerID = m.CustomerID`;

async function loadMembership(id) {
  const [rows] = await pool.query(`${SELECT_MEMBERSHIP} WHERE m.MembershipID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Membership not found');
  return rows[0];
}

export function parseMembership(body) {
  const b = body ?? {};
  return {
    customerId: needId(b.customerId, 'Customer ID'),
    tier: oneOf(b.tier, 'Tier', TIERS),
    startDate: needDate(b.startDate, 'Start date'),
    autoRenew: b.autoRenew ? 1 : 0,
  };
}

const FRIENDLY = {
  1062: 'This customer already has a membership starting on that date',
  1451: 'This membership has tickets on it, so it cannot be deleted',
  1452: 'Customer ID does not exist',
};

// GET /api/memberships?status=current|expired (optional). Newest first, first 500.
route(
  'GET',
  '/api/memberships',
  requireRole(...CAN_READ)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined && status !== 'current' && status !== 'expired') {
      throw new HttpError(400, 'Status must be current or expired');
    }
    const where =
      status === 'current'
        ? ' WHERE CURDATE() BETWEEN m.StartDate AND m.EndDate'
        : status === 'expired'
          ? ' WHERE m.EndDate < CURDATE()'
          : '';
    const [rows] = await pool.query(`${SELECT_MEMBERSHIP}${where} ORDER BY m.MembershipID DESC LIMIT 500`);
    return rows;
  }),
);

// Dropdown choices. Registered BEFORE /:id so "lookups" is not read as an id.
route(
  'GET',
  '/api/memberships/lookups',
  requireRole(...CAN_READ)(async () => {
    const [tiers] = await pool.query(
      `SELECT Tier AS id,
              CONCAT(Tier, ' ($', FORMAT(AnnualPrice, 2), ' a year)', IF(IsForSale, '', ' (no longer sold)')) AS name
         FROM MembershipTier
        ORDER BY AnnualPrice`,
    );
    return { tiers };
  }),
);

route(
  'GET',
  '/api/memberships/:id',
  requireRole(...CAN_READ)(async (ctx) => loadMembership(recordId(ctx, 'Membership'))),
);

route(
  'POST',
  '/api/memberships',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const m = parseMembership(ctx.body);
    try {
      const [result] = await pool.query(
        `INSERT INTO Membership (CustomerID, Tier, StartDate, EndDate, Price, AutoRenew)
         VALUES (?, ?, ?, DATE_SUB(DATE_ADD(?, INTERVAL 1 YEAR), INTERVAL 1 DAY), 0, ?)`,
        [m.customerId, m.tier, m.startDate, m.startDate, m.autoRenew],
      );
      ctx.status = 201;
      return await loadMembership(result.insertId);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
  }),
);

// PUT changes the tier, start date and auto-renew. The customer cannot be changed: add a new membership instead.
route(
  'PUT',
  '/api/memberships/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = recordId(ctx, 'Membership');
    const m = parseMembership(ctx.body);
    const current = await loadMembership(id);
    if (m.customerId !== current.CustomerID) {
      throw new HttpError(400, 'A membership cannot be moved to another customer. Add a new one instead');
    }
    try {
      await pool.query(
        `UPDATE Membership
            SET Tier = ?, StartDate = ?, EndDate = DATE_SUB(DATE_ADD(?, INTERVAL 1 YEAR), INTERVAL 1 DAY), AutoRenew = ?
          WHERE MembershipID = ?`,
        [m.tier, m.startDate, m.startDate, m.autoRenew, id],
      );
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    return loadMembership(id);
  }),
);

route(
  'DELETE',
  '/api/memberships/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = recordId(ctx, 'Membership');
    const gone = await loadMembership(id); // 404 if missing
    try {
      await pool.query('DELETE FROM Membership WHERE MembershipID = ?', [id]);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    return gone;
  }),
);
