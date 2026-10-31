import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { getSession } from '../session.js';
import { requireRole } from '../middleware/requireRole.js';

// Visitor portal. Everything about a member is looked up with the CustomerID stored in the
// logged-in session, never with an id from the request, so one member can never see or
// change another member's data.
//
// Prices and ticket rules are NOT decided here: trg_Ticket_BI / sp_AssertTicketRules set the
// price and enforce membership, weekday and capacity rules. Their messages (errno 1644)
// reach the browser through handleError().

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Rides: current state from v_RideAvailability. Wait readings are NOT in this query: they are
// loaded separately (RIDE_WAITS_SQL) and only for a signed-in customer with an active membership.
const RIDES_SQL = `
  SELECT a.RideID, a.RideName, a.ZoneName, a.CurrentState
    FROM v_RideAvailability a
   ORDER BY (a.CurrentState = 'Open') DESC, a.ZoneName, a.RideName`;

// Newest posted wait reading per ride. Members only.
const RIDE_WAITS_SQL = `
  SELECT a.RideID,
         (SELECT l.WaitMinutes FROM RideLog l
           WHERE l.RideID = a.RideID AND l.EventType = 'Wait Reading'
           ORDER BY l.LoggedAt DESC LIMIT 1) AS WaitMinutes,
         (SELECT MAX(l.LoggedAt) FROM RideLog l
           WHERE l.RideID = a.RideID AND l.EventType = 'Wait Reading') AS WaitAt
    FROM v_RideAvailability a`;

// One customer's tickets (v_CustomerTickets already carries the refund flag).
const TICKETS_SQL = `
  SELECT t.TicketID, t.VisitDate, t.HasExpress, t.TicketPrice, t.PurchaseDate, t.IsRefunded,
         (t.VisitDate < CURDATE()) AS IsPast,
         EXISTS (SELECT 1 FROM RideLog l WHERE l.TicketID = t.TicketID AND l.EventType = 'Boarding') AS HasBoarded
    FROM v_CustomerTickets t
   WHERE t.CustomerID = ?`;

function ticketStatus(r) {
  if (r.IsRefunded) return 'Refunded';
  if (r.HasBoarded) return 'Used';
  if (r.IsPast) return 'Expired';
  return 'Confirmed';
}

function ticketJson(r) {
  return {
    ticketId: r.TicketID,
    visitDate: r.VisitDate,
    hasExpress: Boolean(r.HasExpress),
    ticketPrice: Number(r.TicketPrice),
    purchaseDate: String(r.PurchaseDate).slice(0, 10),
    status: ticketStatus(r),
  };
}

async function loadTicket(customerId, ticketId) {
  const [rows] = await pool.query(`${TICKETS_SQL} AND t.TicketID = ?`, [customerId, ticketId]);
  return rows[0] ?? null;
}

function benefits(m) {
  return [
    m.AnyDayAccess ? 'Any-day admission' : 'Weekday admission',
    m.IncludesExpress ? 'Express queues included' : 'Standard queues included',
  ];
}

// GET /api/visitor/dashboard
// Public part (anyone): prices and the ride board (state only, NEVER wait times).
// Member part (only when the session is a Customer): name, current membership and tickets.
// Wait times: only a Customer with an ACTIVE membership today gets them. Everyone else gets
// waitMinutes = null and updatedLabel = null, and the wait readings are not even queried.
route('GET', '/api/visitor/dashboard', async (ctx) => {
  const [[park]] = await pool.query('SELECT DayPassPrice, ExpressAddOnPrice FROM Park WHERE ParkID = 1');
  const [rideRows] = await pool.query(RIDES_SQL);

  const out = {
    customer: null,
    membership: null,
    waitsVisible: false,
    prices: park ? { dayPass: Number(park.DayPassPrice), expressAddOn: Number(park.ExpressAddOnPrice) } : null,
    tickets: [],
    rides: [],
  };

  const session = getSession(ctx.req);
  if (session?.role === 'Customer' && session.CustomerID) {
    const [[cust]] = await pool.query(
      'SELECT CustomerID, FirstName, LastName FROM Customer WHERE CustomerID = ? AND IsActive = 1',
      [session.CustomerID],
    );
    if (!cust) throw new HttpError(404, 'Your customer profile could not be found');
    out.customer = { customerId: cust.CustomerID, firstName: cust.FirstName, lastName: cust.LastName };

    const [[m]] = await pool.query(
      `SELECT MembershipID, Tier, StartDate, EndDate, Price, AutoRenew, IncludesExpress, AnyDayAccess
         FROM v_CustomerMemberships
        WHERE CustomerID = ? AND IsActiveNow = 1
        ORDER BY EndDate DESC LIMIT 1`,
      [cust.CustomerID],
    );
    if (m) {
      out.membership = {
        membershipId: m.MembershipID,
        tier: m.Tier,
        startDate: m.StartDate,
        endDate: m.EndDate,
        annualPrice: Number(m.Price),
        autoRenew: Boolean(m.AutoRenew),
        benefits: benefits(m),
      };
      out.waitsVisible = true;
    }

    const [ticketRows] = await pool.query(`${TICKETS_SQL} ORDER BY t.VisitDate DESC, t.TicketID DESC LIMIT 200`, [cust.CustomerID]);
    out.tickets = ticketRows.map(ticketJson);
  }

  // Wait readings are read only when allowed.
  const waits = new Map();
  if (out.waitsVisible) {
    const [waitRows] = await pool.query(RIDE_WAITS_SQL);
    for (const w of waitRows) waits.set(w.RideID, w);
  }

  out.rides = rideRows.map((r) => {
    const w = waits.get(r.RideID);
    return {
      rideId: r.RideID,
      rideName: r.RideName,
      zoneName: r.ZoneName,
      currentState: r.CurrentState,
      waitMinutes: out.waitsVisible && r.CurrentState === 'Open' ? (w?.WaitMinutes ?? null) : null,
      updatedLabel: out.waitsVisible ? (w?.WaitAt ? `Reading at ${String(w.WaitAt).slice(11, 16)}` : 'No reading yet') : null,
    };
  });
  return out;
});

// POST /api/visitor/tickets  { visitDate, hasExpress }
// Uses the member's membership that is valid on the visit date (if any). The browser never sends a price.
route(
  'POST',
  '/api/visitor/tickets',
  requireRole('Customer')(async (ctx) => {
    const customerId = ctx.session.CustomerID;
    const { visitDate, hasExpress } = ctx.body;
    if (!isDate(visitDate)) throw new HttpError(400, 'Choose a valid visit date.');
    const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');
    if (visitDate < today) throw new HttpError(400, 'Visit date cannot be in the past.');

    const [[m]] = await pool.query(
      `SELECT MembershipID FROM v_CustomerMemberships
        WHERE CustomerID = ? AND ? BETWEEN StartDate AND EndDate
        ORDER BY EndDate DESC LIMIT 1`,
      [customerId, visitDate],
    );

    let insertId;
    try {
      const [result] = await pool.query(
        'INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate) VALUES (?, ?, ?, ?, 0, NOW())',
        [customerId, m?.MembershipID ?? null, visitDate, hasExpress ? 1 : 0],
      );
      insertId = result.insertId;
    } catch (err) {
      if (err.errno === 3819) throw new HttpError(400, 'Visit date cannot be before the purchase date'); // CHK_Ticket_Purchase
      throw err;
    }
    ctx.status = 201;
    return ticketJson(await loadTicket(customerId, insertId));
  }),
);

// POST /api/visitor/tickets/:id/refund
// Only the owner's own ticket, and only before the visit day. Adds a TicketRefund row (permanent record).
route(
  'POST',
  '/api/visitor/tickets/:id/refund',
  requireRole('Customer')(async (ctx) => {
    const customerId = ctx.session.CustomerID;
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Ticket ID must be a whole number');

    const ticket = await loadTicket(customerId, id);
    if (!ticket) throw new HttpError(404, 'Ticket not found'); // also hides other members' tickets
    if (ticket.IsRefunded) throw new HttpError(409, 'This ticket has already been refunded.');
    const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');
    if (ticket.VisitDate <= today) throw new HttpError(400, 'Only tickets for a future visit can be refunded.');

    try {
      await pool.query(
        "INSERT INTO TicketRefund (TicketID, WeatherID, RefundedAt, RefundReason) VALUES (?, NULL, NOW(), 'Refunded by customer')",
        [id],
      );
    } catch (err) {
      if (err.errno === 1062) throw new HttpError(409, 'This ticket has already been refunded.');
      throw err;
    }
    return ticketJson(await loadTicket(customerId, id));
  }),
);
