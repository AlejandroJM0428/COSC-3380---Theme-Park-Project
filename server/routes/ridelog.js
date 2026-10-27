import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, needInt, oneOf, optDateTime, recordId } from '../validate.js';

// Ride log: list, get, add, delete. A row is either a Boarding (has a ticket) or a Wait Reading (has wait minutes).
// trg_RideLog_BU refuses edits, so there is no PUT. A mistake is fixed by deleting the entry and adding it again.
// trg_RideLog_BI refuses retired rides,
// rides under maintenance, closed outdoor rides, guests under the height limit and bad Express use.
// Those messages (errno 1644) reach the browser through handleError().

const CAN_READ = ['Admin', 'Manager'];
const CAN_WRITE = ['Admin', 'Manager'];
const EVENT_TYPES = ['Boarding', 'Wait Reading'];

const SELECT_LOG = `
  SELECT rl.RideLogID, rl.RideID, r.RideName, rl.EventType, rl.TicketID, rl.WaitMinutes, rl.UsedExpress, rl.LoggedAt
    FROM RideLog rl
    JOIN Ride r ON r.RideID = rl.RideID`;

async function loadLog(id) {
  const [rows] = await pool.query(`${SELECT_LOG} WHERE rl.RideLogID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Ride log entry not found');
  return rows[0];
}

// The database also checks this shape (CHK_RideLog_Kind). Checking here gives a clearer message first.
export function parseLog(body) {
  const b = body ?? {};
  const eventType = oneOf(b.eventType, 'Event type', EVENT_TYPES);
  const rideId = needId(b.rideId, 'Ride');
  const loggedAt = optDateTime(b.loggedAt, 'Time'); // empty = now
  if (eventType === 'Boarding') {
    return { eventType, rideId, ticketId: needId(b.ticketId, 'Ticket ID'), waitMinutes: null, usedExpress: b.usedExpress ? 1 : 0, loggedAt };
  }
  return { eventType, rideId, ticketId: null, waitMinutes: needInt(b.waitMinutes, 'Wait minutes', 0, 600), usedExpress: 0, loggedAt };
}

// GET /api/ride-log?type=boarding|wait (optional). Newest first, first 500.
route(
  'GET',
  '/api/ride-log',
  requireRole(...CAN_READ)(async (ctx) => {
    const { type } = ctx.query;
    if (type !== undefined && type !== 'boarding' && type !== 'wait') throw new HttpError(400, 'Type must be boarding or wait');
    const where = type === 'boarding' ? " WHERE rl.EventType = 'Boarding'" : type === 'wait' ? " WHERE rl.EventType = 'Wait Reading'" : '';
    const [rows] = await pool.query(`${SELECT_LOG}${where} ORDER BY rl.LoggedAt DESC, rl.RideLogID DESC LIMIT 500`);
    return rows;
  }),
);

// Registered BEFORE /:id so "lookups" is not read as an id.
route(
  'GET',
  '/api/ride-log/lookups',
  requireRole(...CAN_READ)(async () => {
    const [rides] = await pool.query(
      "SELECT RideID AS id, CONCAT(RideName, IF(Status = 'Maintenance', ' (in maintenance)', '')) AS name FROM Ride WHERE IsActive = 1 ORDER BY RideName",
    );
    return { rides };
  }),
);

route(
  'GET',
  '/api/ride-log/:id',
  requireRole(...CAN_READ)(async (ctx) => loadLog(recordId(ctx, 'Ride log'))),
);

route(
  'POST',
  '/api/ride-log',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const l = parseLog(ctx.body);
    try {
      const [result] = await pool.query(
        'INSERT INTO RideLog (RideID, EventType, TicketID, WaitMinutes, UsedExpress, LoggedAt) VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))',
        [l.rideId, l.eventType, l.ticketId, l.waitMinutes, l.usedExpress, l.loggedAt],
      );
      ctx.status = 201;
      return await loadLog(result.insertId);
    } catch (err) {
      throw friendlyDbError(err, {
        1452: 'Ticket ID or ride does not exist',
        1062: 'A wait reading for this ride at this exact time already exists',
      });
    }
  }),
);

// DELETE removes the row for good. Nothing else points at a ride log entry.
route(
  'DELETE',
  '/api/ride-log/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = recordId(ctx, 'Ride log');
    await loadLog(id); // 404 if missing
    try {
      await pool.query('DELETE FROM RideLog WHERE RideLogID = ?', [id]);
    } catch (err) {
      throw friendlyDbError(err);
    }
    return { deleted: id };
  }),
);
