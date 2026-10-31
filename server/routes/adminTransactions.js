import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { isId } from '../validate.js';
import { adminOnly } from './admin.js';

// Transactions per ID (admin only, read only).
// GET /api/admin/transactions/:type/:id    type = customer | ticket | membership
// Gives one record together with everything attached to it: tickets, food and shop purchases,
// game plays, ride boardings, refunds and memberships, plus totals.
// An ID that does not exist is not an error: found is false, every group is empty and a message says so.
// The WHERE text below is picked from a fixed list by type. Only the ID is bound from the request.

const LIMIT = 500; // rows per group; each group says if it was cut

const TYPES = {
  customer: {
    label: 'Customer',
    record: `SELECT CustomerID, FirstName, LastName, DOB, HeightCm, IsActive FROM Customer WHERE CustomerID = ?`,
    tickets: 't.CustomerID = ?',
    memberships: 'm.CustomerID = ?',
  },
  ticket: {
    label: 'Ticket',
    record: `SELECT t.TicketID, t.CustomerID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName, t.MembershipID,
                    t.VisitDate, t.HasExpress, t.TicketPrice, t.PurchaseDate
               FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID WHERE t.TicketID = ?`,
    tickets: 't.TicketID = ?',
    memberships: 'm.MembershipID = (SELECT MembershipID FROM Ticket WHERE TicketID = ?)',
  },
  membership: {
    label: 'Membership',
    record: `SELECT m.MembershipID, m.CustomerID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName, m.Tier,
                    m.StartDate, m.EndDate, m.Price, m.AutoRenew
               FROM Membership m JOIN Customer c ON c.CustomerID = m.CustomerID WHERE m.MembershipID = ?`,
    tickets: 't.MembershipID = ?',
    memberships: 'm.MembershipID = ?',
  },
};

const EMPTY_SUMMARY = {
  tickets: 0,
  ticketSpend: 0,
  purchaseSpend: 0,
  gameSpend: 0,
  boardings: 0,
  refunds: 0,
  totalSpend: 0,
};

const money = (v) => Math.round(Number(v ?? 0) * 100) / 100;

// Cuts a group to LIMIT rows and says whether it was cut. The queries ask for LIMIT + 1 rows.
function group(rows) {
  return { rows: rows.slice(0, LIMIT), truncated: rows.length > LIMIT };
}

route(
  'GET',
  '/api/admin/transactions/:type/:id',
  adminOnly(async (ctx) => {
    const spec = Object.hasOwn(TYPES, ctx.params.type) ? TYPES[ctx.params.type] : null;
    if (!spec) throw new HttpError(400, 'Type must be customer, ticket or membership');
    const id = /^\d+$/.test(ctx.params.id) ? Number(ctx.params.id) : NaN;
    if (!isId(id)) throw new HttpError(400, `${spec.label} ID must be a whole number`);

    const [found] = await pool.query(spec.record, [id]);
    if (found.length === 0) {
      return {
        found: false,
        type: ctx.params.type,
        id,
        message: `No ${spec.label.toLowerCase()} with ID ${id}`,
        record: null,
        summary: EMPTY_SUMMARY,
        groups: {
          memberships: group([]),
          tickets: group([]),
          purchases: group([]),
          gamePlays: group([]),
          rides: group([]),
          refunds: group([]),
        },
      };
    }

    const F = spec.tickets; // fixed text from TYPES, never from the request
    const [[memberships], [tickets], [purchases], [gamePlays], [rides], [refunds], [[sums]]] = await Promise.all([
      pool.query(
        `SELECT m.MembershipID, m.CustomerID, m.Tier, m.StartDate, m.EndDate, m.Price, m.AutoRenew
           FROM Membership m WHERE ${spec.memberships} ORDER BY m.StartDate DESC, m.MembershipID DESC LIMIT ${LIMIT + 1}`,
        [id],
      ),
      pool.query(
        `SELECT t.TicketID, t.CustomerID, t.MembershipID, t.VisitDate, t.HasExpress, t.TicketPrice, t.PurchaseDate,
                (r.TicketID IS NOT NULL) AS Refunded
           FROM Ticket t LEFT JOIN TicketRefund r ON r.TicketID = t.TicketID
          WHERE ${F} ORDER BY t.VisitDate DESC, t.TicketID DESC LIMIT ${LIMIT + 1}`,
        [id],
      ),
      pool.query(
        `SELECT p.PurchaseID, p.TicketID, v.VenueName, i.ItemName, p.Quantity, p.UnitPrice,
                ROUND(p.Quantity * p.UnitPrice, 2) AS LineTotal, p.PurchasedAt
           FROM Purchase p
           JOIN Ticket t ON t.TicketID = p.TicketID
           JOIN Item i   ON i.ItemID = p.ItemID
           JOIN Venue v  ON v.VenueID = i.VenueID
          WHERE ${F} ORDER BY p.PurchasedAt DESC, p.PurchaseID DESC LIMIT ${LIMIT + 1}`,
        [id],
      ),
      pool.query(
        `SELECT gp.GamePlayID, gp.TicketID, g.GameName, gp.PlayedAt, gp.AmountPaid
           FROM GamePlay gp
           JOIN Ticket t ON t.TicketID = gp.TicketID
           JOIN Game g   ON g.GameID = gp.GameID
          WHERE ${F} ORDER BY gp.PlayedAt DESC, gp.GamePlayID DESC LIMIT ${LIMIT + 1}`,
        [id],
      ),
      pool.query(
        `SELECT rl.RideLogID, rl.TicketID, rd.RideName, rl.EventType, rl.UsedExpress, rl.LoggedAt
           FROM RideLog rl
           JOIN Ticket t ON t.TicketID = rl.TicketID
           JOIN Ride rd  ON rd.RideID = rl.RideID
          WHERE ${F} ORDER BY rl.LoggedAt DESC, rl.RideLogID DESC LIMIT ${LIMIT + 1}`,
        [id],
      ),
      pool.query(
        `SELECT r.TicketID, r.WeatherID, r.RefundedAt, r.RefundReason
           FROM TicketRefund r JOIN Ticket t ON t.TicketID = r.TicketID
          WHERE ${F} ORDER BY r.RefundedAt DESC, r.TicketID DESC LIMIT ${LIMIT + 1}`,
        [id],
      ),
      // Totals cover every row, not just the rows shown above.
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM Ticket t WHERE ${F}) AS tickets,
           (SELECT COALESCE(SUM(t.TicketPrice), 0) FROM Ticket t WHERE ${F}) AS ticketSpend,
           (SELECT COALESCE(SUM(p.Quantity * p.UnitPrice), 0) FROM Purchase p JOIN Ticket t ON t.TicketID = p.TicketID WHERE ${F}) AS purchaseSpend,
           (SELECT COALESCE(SUM(gp.AmountPaid), 0) FROM GamePlay gp JOIN Ticket t ON t.TicketID = gp.TicketID WHERE ${F}) AS gameSpend,
           (SELECT COUNT(*) FROM RideLog rl JOIN Ticket t ON t.TicketID = rl.TicketID WHERE ${F}) AS boardings,
           (SELECT COUNT(*) FROM TicketRefund r JOIN Ticket t ON t.TicketID = r.TicketID WHERE ${F}) AS refunds`,
        [id, id, id, id, id, id],
      ),
    ]);

    const ticketSpend = money(sums.ticketSpend);
    const purchaseSpend = money(sums.purchaseSpend);
    const gameSpend = money(sums.gameSpend);
    return {
      found: true,
      type: ctx.params.type,
      id,
      message: null,
      record: found[0],
      summary: {
        tickets: Number(sums.tickets),
        ticketSpend,
        purchaseSpend,
        gameSpend,
        boardings: Number(sums.boardings),
        refunds: Number(sums.refunds),
        totalSpend: money(ticketSpend + purchaseSpend + gameSpend),
      },
      groups: {
        memberships: group(memberships),
        tickets: group(tickets),
        purchases: group(purchases),
        gamePlays: group(gamePlays),
        rides: group(rides),
        refunds: group(refunds),
      },
    };
  }),
);
