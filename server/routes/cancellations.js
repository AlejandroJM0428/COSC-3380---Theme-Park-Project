import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, oneOf, recordId } from '../validate.js';

// Membership cancellation requests (table MembershipCancellationRequest, SQL/16).
//
// A cancellation is a REQUEST. A member asks, a manager approves or rejects. Approving turns off AutoRenew and marks
// the request Approved. The membership still runs to its normal end date, nothing is refunded, and EndDate is never
// changed (CHK_Membership_Term forces it to start + 1 year - 1 day). A request is a record and is never deleted.
//
// Member side (role Customer): everything is looked up with the CustomerID in the session, never an id from the request.
//   GET  /api/cancellations/mine   the current membership, whether a request can be made, and the member's requests
//   POST /api/cancellations        { reason }  asks to cancel the membership that is active today
// Staff side (reviewers: Admin and RetailManager, the retail desk that owns memberships; the operations manager has no access):
//   GET  /api/cancellations?status=Pending|Approved|Rejected   Pending first, then newest
//   GET  /api/cancellations/:id
//   POST /api/cancellations/:id/approve   { note }  optional note, 200 characters or fewer
//   POST /api/cancellations/:id/reject    { note }
// The database keeps the rules that matter: a reason is required, only one Pending request per membership, and a decided
// request has a time and a deciding user (CHK_CancelRequest_*, UQ_CancelRequest_Pending).

const REVIEWERS = ['Admin', 'RetailManager'];
const STATUSES = ['Pending', 'Approved', 'Rejected'];

// Text with a limit. Empty or missing -> null when optional.
function text(value, label, max, { required }) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) {
    if (required) throw new HttpError(400, `${label} is required`);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer`);
  return s;
}

const SELECT_REQUEST = `
  SELECT r.RequestID, r.MembershipID, m.CustomerID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
         m.Tier, m.StartDate, m.EndDate, m.AutoRenew,
         r.RequestedAt, r.Reason, r.Status, r.DecidedAt, u.Username AS DecidedBy, r.DecisionNote
    FROM MembershipCancellationRequest r
    JOIN Membership m ON m.MembershipID = r.MembershipID
    JOIN Customer c   ON c.CustomerID = m.CustomerID
    LEFT JOIN AppUser u ON u.UserID = r.DecidedByUserID`;

function requestJson(r) {
  return {
    requestId: r.RequestID,
    membershipId: r.MembershipID,
    customerId: r.CustomerID,
    customerName: r.CustomerName,
    tier: r.Tier,
    startDate: r.StartDate,
    endDate: r.EndDate,
    autoRenew: Boolean(r.AutoRenew),
    requestedAt: r.RequestedAt,
    reason: r.Reason,
    status: r.Status,
    decidedAt: r.DecidedAt,
    decidedBy: r.DecidedBy,
    decisionNote: r.DecisionNote,
  };
}

async function loadRequest(id) {
  const [rows] = await pool.query(`${SELECT_REQUEST} WHERE r.RequestID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Cancellation request not found');
  return rows[0];
}

// The membership that covers today for this customer, or null.
async function activeMembership(customerId) {
  const [[m]] = await pool.query(
    `SELECT MembershipID, Tier, StartDate, EndDate, AutoRenew
       FROM Membership
      WHERE CustomerID = ? AND CURDATE() BETWEEN StartDate AND EndDate
      ORDER BY EndDate DESC LIMIT 1`,
    [customerId],
  );
  return m ?? null;
}

async function hasPending(membershipId) {
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM MembershipCancellationRequest WHERE MembershipID = ? AND Status = 'Pending'",
    [membershipId],
  );
  return n > 0;
}

// Why a request cannot be made right now, or null when it can.
async function blockedReason(m) {
  if (!m) return 'You have no active membership to cancel.';
  if (!m.AutoRenew) return `Auto-renew is already off. Your membership ends on ${m.EndDate} and will not renew.`;
  if (await hasPending(m.MembershipID)) return 'You already have a cancellation request waiting for review.';
  return null;
}

// GET /api/cancellations/mine. Registered BEFORE /:id so "mine" is not read as an id.
route(
  'GET',
  '/api/cancellations/mine',
  requireRole('Customer')(async (ctx) => {
    const customerId = ctx.session.CustomerID;
    const m = await activeMembership(customerId);
    const blocked = await blockedReason(m);
    const [rows] = await pool.query(`${SELECT_REQUEST} WHERE m.CustomerID = ? ORDER BY r.RequestID DESC LIMIT 20`, [customerId]);
    return {
      membership: m
        ? { membershipId: m.MembershipID, tier: m.Tier, startDate: m.StartDate, endDate: m.EndDate, autoRenew: Boolean(m.AutoRenew) }
        : null,
      canRequest: blocked === null,
      blockedReason: blocked,
      requests: rows.map(requestJson),
    };
  }),
);

// POST /api/cancellations  { reason }
// The browser never sends a membership id: it is the one active today for the logged-in customer.
route(
  'POST',
  '/api/cancellations',
  requireRole('Customer')(async (ctx) => {
    const customerId = ctx.session.CustomerID;
    const reason = text(ctx.body?.reason, 'Reason', 200, { required: true });
    const m = await activeMembership(customerId);
    const blocked = await blockedReason(m);
    if (blocked) throw new HttpError(m ? 409 : 400, blocked);

    let id;
    try {
      const [result] = await pool.query(
        'INSERT INTO MembershipCancellationRequest (MembershipID, Reason) VALUES (?, ?)',
        [m.MembershipID, reason],
      );
      id = result.insertId;
    } catch (err) {
      // Two clicks in the same moment: the second one hits the one-Pending-request-per-membership rule.
      if (err.errno === 1062) throw new HttpError(409, 'You already have a cancellation request waiting for review.');
      throw friendlyDbError(err);
    }
    ctx.status = 201;
    return requestJson(await loadRequest(id));
  }),
);

// GET /api/cancellations?status=...  First 500.
route(
  'GET',
  '/api/cancellations',
  requireRole(...REVIEWERS)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined) oneOf(status, 'Status', STATUSES);
    const where = status ? ' WHERE r.Status = ?' : '';
    const [rows] = await pool.query(
      `${SELECT_REQUEST}${where} ORDER BY (r.Status = 'Pending') DESC, r.RequestID DESC LIMIT 500`,
      status ? [status] : [],
    );
    return rows.map(requestJson);
  }),
);

route(
  'GET',
  '/api/cancellations/:id',
  requireRole(...REVIEWERS)(async (ctx) => requestJson(await loadRequest(recordId(ctx, 'Request')))),
);

// Approve or reject one Pending request. The request row is locked first, so two reviewers acting at the same
// moment are handled one after the other and the second one is told it was already decided.
// Approving turns AutoRenew off (and only that). It is skipped when AutoRenew is already off, so the membership row is not touched.
async function decide(ctx, status) {
  const id = recordId(ctx, 'Request');
  const note = text(ctx.body?.note, 'Note', 200, { required: false });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[req]] = await conn.query(
      'SELECT RequestID, MembershipID, Status FROM MembershipCancellationRequest WHERE RequestID = ? FOR UPDATE',
      [id],
    );
    if (!req) throw new HttpError(404, 'Cancellation request not found');
    if (req.Status !== 'Pending') throw new HttpError(409, `This request was already ${req.Status.toLowerCase()}.`);

    if (status === 'Approved') {
      const [[m]] = await conn.query('SELECT AutoRenew FROM Membership WHERE MembershipID = ? FOR UPDATE', [req.MembershipID]);
      if (m?.AutoRenew) await conn.query('UPDATE Membership SET AutoRenew = 0 WHERE MembershipID = ?', [req.MembershipID]);
    }
    await conn.query(
      'UPDATE MembershipCancellationRequest SET Status = ?, DecidedAt = NOW(), DecidedByUserID = ?, DecisionNote = ? WHERE RequestID = ?',
      [status, ctx.session.userId, note, id],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err instanceof HttpError ? err : friendlyDbError(err);
  } finally {
    conn.release();
  }
  return requestJson(await loadRequest(id));
}

route('POST', '/api/cancellations/:id/approve', requireRole(...REVIEWERS)((ctx) => decide(ctx, 'Approved')));
route('POST', '/api/cancellations/:id/reject', requireRole(...REVIEWERS)((ctx) => decide(ctx, 'Rejected')));
