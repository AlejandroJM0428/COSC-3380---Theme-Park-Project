import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Ticket sales (Revenue data entry): list, get, add, edit, void.
// "Void" adds a TicketRefund row. There is no edit route for a refund.
// trg_Ticket_BI sets the price and Express on insert. An edit calls the same procedures
// (sp_AssertTicketRules, fn_TicketPrice) because the update trigger was removed.
// A refund uses the current time and no weather id, so the old refund trigger is not required here.

const CAN_READ = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_VOID = ['Admin', 'Manager', 'RetailManager'];

const isId = (n) => Number.isInteger(n) && n > 0;

const SELECT_TICKET = `
  SELECT t.TicketID, t.CustomerID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
         t.MembershipID, t.VisitDate, t.HasExpress, t.TicketPrice, t.PurchaseDate,
         (r.TicketID IS NOT NULL) AS IsVoided, r.RefundedAt, r.RefundReason
    FROM Ticket t
    JOIN Customer c ON c.CustomerID = t.CustomerID
    LEFT JOIN TicketRefund r ON r.TicketID = t.TicketID`;

function ticketId(ctx) {
  const id = Number(ctx.params.id);
  if (!isId(id)) throw new HttpError(400, 'Ticket ID must be a whole number');
  return id;
}

async function loadTicket(id) {
  const [rows] = await pool.query(`${SELECT_TICKET} WHERE t.TicketID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Ticket not found');
  return rows[0];
}

// Checks the body and returns only the columns we allow. Exported so it can be tested without a database.
export function parseTicket(body) {
  const b = body ?? {};
  if (!isId(b.customerId)) throw new HttpError(400, 'Customer ID must be a whole number');
  if (b.membershipId != null && !isId(b.membershipId)) throw new HttpError(400, 'Membership ID must be a whole number, or empty');
  if (typeof b.visitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.visitDate) || Number.isNaN(Date.parse(`${b.visitDate}T00:00:00Z`))) {
    throw new HttpError(400, 'Visit date must look like 2026-07-31');
  }
  return { customerId: b.customerId, membershipId: b.membershipId ?? null, visitDate: b.visitDate, hasExpress: b.hasExpress ? 1 : 0 };
}

function friendly(err) {
  if (err.errno === 3819) return new HttpError(400, 'Visit date cannot be before the purchase date'); // CHK_Ticket_Purchase
  if (err.errno === 1452) return new HttpError(400, 'Customer or membership ID does not exist'); // foreign key
  return err;
}

// GET /api/tickets?status=active|voided (optional). Newest first.
route(
  'GET',
  '/api/tickets',
  requireRole(...CAN_READ)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined && status !== 'active' && status !== 'voided') throw new HttpError(400, 'Status must be active or voided');
    const where = status === 'active' ? ' WHERE r.TicketID IS NULL' : status === 'voided' ? ' WHERE r.TicketID IS NOT NULL' : '';
    const [rows] = await pool.query(`${SELECT_TICKET}${where} ORDER BY t.PurchaseDate DESC, t.TicketID DESC LIMIT 500`);
    return rows;
  }),
);

// The generic form loads /lookups on open. Tickets need no dropdowns, so it is empty.
// Registered BEFORE /api/tickets/:id so "lookups" is not read as an id.
route('GET', '/api/tickets/lookups', requireRole(...CAN_READ)(async () => ({})));

route(
  'GET',
  '/api/tickets/:id',
  requireRole(...CAN_READ)(async (ctx) => loadTicket(ticketId(ctx))),
);

// POST adds a ticket. The browser never sends a price: the trigger sets TicketPrice and HasExpress.
route(
  'POST',
  '/api/tickets',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const t = parseTicket(ctx.body);
    try {
      const [result] = await pool.query(
        'INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate) VALUES (?, ?, ?, ?, 0, NOW())',
        [t.customerId, t.membershipId, t.visitDate, t.hasExpress],
      );
      ctx.status = 201;
      return await loadTicket(result.insertId);
    } catch (err) {
      throw friendly(err);
    }
  }),
);

function sameDay(value, iso) {
  if (value instanceof Date) return value.toISOString().slice(0, 10) === iso;
  return String(value).slice(0, 10) === iso;
}

// PUT edits the guest, membership, visit date and Express. A voided ticket cannot be edited.
// Guest, membership and date stay locked once the ticket has ride, game or purchase activity.
route(
  'PUT',
  '/api/tickets/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = ticketId(ctx);
    const t = parseTicket(ctx.body);
    const current = await loadTicket(id);
    if (current.IsVoided) throw new HttpError(409, 'This ticket has been voided and cannot be edited');
    const identityChanged =
      t.customerId !== current.CustomerID ||
      (t.membershipId ?? null) !== (current.MembershipID ?? null) ||
      !sameDay(current.VisitDate, t.visitDate);
    let hasExpress = t.hasExpress;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (identityChanged) {
        const [used] = await conn.query(
          `SELECT (EXISTS (SELECT 1 FROM RideLog WHERE TicketID = ?)
                OR EXISTS (SELECT 1 FROM GamePlay WHERE TicketID = ?)
                OR EXISTS (SELECT 1 FROM Purchase WHERE TicketID = ?)) AS used`,
          [id, id, id],
        );
        if (Number(used[0].used)) {
          throw new HttpError(409, 'Ticket has activity; guest, membership and date cannot change');
        }
        await conn.query('CALL sp_AssertTicketRules(?, ?, ?, ?, @ticketExpress)', [
          t.customerId,
          t.membershipId,
          t.visitDate,
          id,
        ]);
        const [flag] = await conn.query('SELECT @ticketExpress AS express');
        if (Number(flag[0].express) === 1) hasExpress = 1;
      }
      await conn.query(
        `UPDATE Ticket
            SET CustomerID = ?, MembershipID = ?, VisitDate = ?, HasExpress = ?,
                TicketPrice = fn_TicketPrice(?, ?)
          WHERE TicketID = ?`,
        [t.customerId, t.membershipId, t.visitDate, hasExpress, t.membershipId, hasExpress, id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw friendly(err);
    } finally {
      conn.release();
    }
    return loadTicket(id);
  }),
);

// DELETE voids the ticket: it adds a refund row (query ?reason=...). Nothing is removed from Ticket.
route(
  'DELETE',
  '/api/tickets/:id',
  requireRole(...CAN_VOID)(async (ctx) => {
    const id = ticketId(ctx);
    const reason = typeof ctx.query.reason === 'string' && ctx.query.reason.trim() ? ctx.query.reason.trim() : 'Voided by staff';
    if (reason.length > 200) throw new HttpError(400, 'Reason must be 200 characters or fewer');
    await loadTicket(id); // 404 if missing
    try {
      await pool.query('INSERT INTO TicketRefund (TicketID, WeatherID, RefundedAt, RefundReason) VALUES (?, NULL, NOW(), ?)', [id, reason]);
    } catch (err) {
      if (err.errno === 1062) throw new HttpError(409, 'This ticket is already voided');
      throw err;
    }
    return loadTicket(id);
  }),
);
