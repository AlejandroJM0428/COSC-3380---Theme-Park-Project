import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { getSession } from '../session.js';
import { requireRole } from '../middleware/requireRole.js';
import { describeTrigger } from '../demos/triggerCatalog.js';

// Visitor portal. Everything about a member is looked up with the CustomerID stored in the
// logged-in session, never with an id from the request, so one member can never see or
// change another member's data.
//
// Prices and ticket rules are NOT decided here: trg_Ticket_BI / sp_AssertTicketRules set the
// price and enforce membership, weekday and capacity rules. trg_Ticket_BI_Guard (SQL/14) refuses
// accidental double-bookings. Their messages (errno 1644) reach the browser through handleError(),
// together with the trigger's name, so the portal can show a "trigger fired" card.

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

const TIERS = ['Basic', 'Plus', 'Premier'];

// The tiers a customer can buy right now (same benefits as the public site).
async function loadTiers() {
  const [rows] = await pool.query('SELECT Tier, AnnualPrice FROM MembershipTier WHERE IsForSale = 1 ORDER BY AnnualPrice');
  return rows.map((r) => ({
    tier: r.Tier,
    annualPrice: Number(r.AnnualPrice),
    benefits: benefits({ AnyDayAccess: r.Tier !== 'Basic', IncludesExpress: r.Tier === 'Premier' }),
  }));
}

async function loadActiveMembership(customerId) {
  const [[m]] = await pool.query(
    `SELECT MembershipID, Tier, StartDate, EndDate, Price, AutoRenew, IncludesExpress, AnyDayAccess
       FROM v_CustomerMemberships
      WHERE CustomerID = ? AND IsActiveNow = 1
      ORDER BY EndDate DESC LIMIT 1`,
    [customerId],
  );
  return m ?? null;
}

function membershipJson(m) {
  return {
    membershipId: m.MembershipID,
    tier: m.Tier,
    startDate: m.StartDate,
    endDate: m.EndDate,
    annualPrice: Number(m.Price),
    autoRenew: Boolean(m.AutoRenew),
    benefits: benefits(m),
  };
}

// Perks unlocked by trg_Membership_AI_Welcome. [] when SQL/14 has not been applied yet.
async function loadPerks(membershipId) {
  try {
    const [rows] = await pool.query(
      'SELECT PerkName, GrantedAt FROM MemberPerk WHERE MembershipID = ? ORDER BY PerkID',
      [membershipId],
    );
    return rows.map((r) => ({ name: r.PerkName, grantedAt: r.GrantedAt }));
  } catch (err) {
    if (err?.errno === 1146) return [];
    throw err;
  }
}

// Which of these triggers are installed? Remembered once seen, so we look at most once per trigger.
const seenTriggers = new Set();
async function installedTriggers(names) {
  const missing = names.filter((n) => !seenTriggers.has(n));
  if (missing.length > 0) {
    const [rows] = await pool.query(
      'SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN (?)',
      [missing],
    );
    for (const r of rows) seenTriggers.add(r.name);
  }
  return names.filter((n) => seenTriggers.has(n));
}

// A trigger that ran, with a one-line result for the "trigger fired" card.
const fired = (name, result) => ({ ...describeTrigger(name), result });

// GET /api/visitor/dashboard
// Public part (anyone): prices and the ride board (state only, NEVER wait times).
// Member part (only when the session is a Customer): name, current membership, perks, tiers for sale and tickets.
// Wait times: only a Customer with an ACTIVE membership today gets them. Everyone else gets
// waitMinutes = null and updatedLabel = null, and the wait readings are not even queried.
route('GET', '/api/visitor/dashboard', async (ctx) => {
  const [[park]] = await pool.query('SELECT DayPassPrice, ExpressAddOnPrice FROM Park WHERE ParkID = 1');
  const [rideRows] = await pool.query(RIDES_SQL);

  const out = {
    customer: null,
    membership: null,
    waitsVisible: false,
    perks: [],
    tiers: [],
    prices: park ? { dayPass: Number(park.DayPassPrice), expressAddOn: Number(park.ExpressAddOnPrice) } : null,
    tickets: [],
    rides: [],
  };

  const session = getSession(ctx.req);
  if (session?.role === 'Customer' && session.CustomerID) {
    out.tiers = await loadTiers();
    const [[cust]] = await pool.query(
      'SELECT CustomerID, FirstName, LastName FROM Customer WHERE CustomerID = ? AND IsActive = 1',
      [session.CustomerID],
    );
    if (!cust) throw new HttpError(404, 'Your customer profile could not be found');
    out.customer = { customerId: cust.CustomerID, firstName: cust.FirstName, lastName: cust.LastName };

    const m = await loadActiveMembership(cust.CustomerID);
    if (m) {
      out.membership = membershipJson(m);
      out.perks = await loadPerks(m.MembershipID);
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
    const ticket = ticketJson(await loadTicket(customerId, insertId));
    return { ...ticket, firedTriggers: await ticketTriggersThatRan(ticket, visitDate) };
  }),
);

// What the database did for this ticket, for the "trigger fired" card. Only triggers that really exist are listed.
// The two notice triggers are listed only when their notice was created within the last few seconds.
async function ticketTriggersThatRan(ticket, visitDate) {
  const names = await installedTriggers(['trg_Ticket_BI_Guard', 'trg_Ticket_BI', 'trg_Ticket_AI_SellingFast', 'trg_Ticket_AI_Notify']);
  const out = [];
  if (names.includes('trg_Ticket_BI_Guard')) out.push(fired('trg_Ticket_BI_Guard', 'Spam check passed: no recent duplicate for this date.'));
  if (names.includes('trg_Ticket_BI')) out.push(fired('trg_Ticket_BI', `Capacity and membership checked. Price set to $${ticket.ticketPrice.toFixed(2)}.`));
  const [notices] = await pool.query(
    `SELECT DedupeKey FROM Notification
      WHERE DedupeKey IN (?, ?) AND CreatedAt >= NOW() - INTERVAL 10 SECOND`,
    [`SellingFast:${visitDate}`, `SoldOut:${visitDate}`],
  );
  for (const n of notices) {
    if (n.DedupeKey.startsWith('SellingFast:') && names.includes('trg_Ticket_AI_SellingFast')) out.push(fired('trg_Ticket_AI_SellingFast', 'Your ticket pushed that date past 90% full, so a "selling fast" notice went up.'));
    if (n.DedupeKey.startsWith('SoldOut:') && names.includes('trg_Ticket_AI_Notify')) out.push(fired('trg_Ticket_AI_Notify', 'Your ticket was the last one: that date is now sold out.'));
  }
  return out;
}

// POST /api/visitor/membership  { tier, autoRenew }
// The member buys a membership that starts today. The browser never sends the dates or the price:
// the end date is worked out here (one year, minus a day, as the database CHECK requires) and
// trg_Membership_BI sets the price. A second membership that overlaps is refused by that same trigger.
route(
  'POST',
  '/api/visitor/membership',
  requireRole('Customer')(async (ctx) => {
    const customerId = ctx.session.CustomerID;
    const { tier, autoRenew } = ctx.body ?? {};
    if (!TIERS.includes(tier)) throw new HttpError(400, 'Choose a membership tier.');

    let insertId;
    try {
      const [result] = await pool.query(
        `INSERT INTO Membership (CustomerID, Tier, StartDate, EndDate, Price, AutoRenew)
         VALUES (?, ?, CURDATE(), DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 1 YEAR), INTERVAL 1 DAY), 0, ?)`,
        [customerId, tier, autoRenew ? 1 : 0],
      );
      insertId = result.insertId;
    } catch (err) {
      // Two clicks in the same moment: the second one hits the one-per-start-date rule.
      if (err.errno === 1062) throw new HttpError(409, 'Your membership is already being set up. Refresh to see it.');
      throw err;
    }

    const m = await loadActiveMembership(customerId);
    if (!m) throw new HttpError(500, 'Your membership was created but could not be loaded. Refresh the page.');
    const perks = await loadPerks(insertId);
    const names = await installedTriggers(['trg_Membership_BI', 'trg_Membership_AI_Welcome']);
    const firedTriggers = [];
    if (names.includes('trg_Membership_BI')) firedTriggers.push(fired('trg_Membership_BI', `No overlapping membership found. Price set to $${Number(m.Price).toFixed(2)} from the ${m.Tier} tier.`));
    if (names.includes('trg_Membership_AI_Welcome') && perks.length > 0) firedTriggers.push(fired('trg_Membership_AI_Welcome', `${perks.length} welcome perk${perks.length === 1 ? '' : 's'} unlocked: ${perks.map((p) => p.name).join(', ')}.`));

    ctx.status = 201;
    return { membership: membershipJson(m), perks, firedTriggers };
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
