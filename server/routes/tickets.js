import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Ticket sales (Revenue data entry): list, get, add, edit, void.
// "Void" adds a TicketRefund row (refunds are permanent records, never edited). Un-voiding is not offered.
// trg_Ticket_BI / trg_Ticket_BU set the price. trg_TicketRefund_BI checks the refund date.
// Trigger messages (errno 1644) reach the browser through handleError().

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

// PUT edits the guest, membership, visit date and Express. A voided ticket cannot be edited.
// The database refuses guest/membership/date changes once a ticket has ride, game or purchase activity.
route(
  'PUT',
  '/api/tickets/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = ticketId(ctx);
    const t = parseTicket(ctx.body);
    const current = await loadTicket(id);
    if (current.IsVoided) throw new HttpError(409, 'This ticket has been voided and cannot be edited');
    try {
      await pool.query(
        'UPDATE Ticket SET CustomerID = ?, MembershipID = ?, VisitDate = ?, HasExpress = ? WHERE TicketID = ?',
        [t.customerId, t.membershipId, t.visitDate, t.hasExpress, id],
      );
    } catch (err) {
      throw friendly(err);
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
