import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Maintenance data entry: list, get, add, edit, delete.
// No framework: only route(), requireRole(), HttpError and the mysql2 pool.
// The browser never sends the id or IsPlanned. MaintenanceID is auto-numbered and IsPlanned is generated.
// trg_Maint_BU_Cost refuses to close a job without a repair cost (errno 1644), and handleError() shows that message.

const CAN_READ = ['Admin', 'Manager', 'MaintenanceManager'];
const CAN_WRITE = ['Admin', 'Manager', 'MaintenanceManager'];
const CAN_DELETE = ['Admin', 'MaintenanceManager']; // hard delete: Maintenance has no IsActive column

const TYPES = ['Routine Inspection', 'Preventive Service', 'Refurbishment', 'Emergency Repair', 'Safety Recall'];
const OUTCOMES = ['Fixed', 'Partially Fixed', 'Not Fixed'];
const CREW_ROLES = ['Lead', 'Assistant'];

const SELECT_JOB = `
  SELECT m.MaintenanceID, m.MaintType, m.IsPlanned, m.RideID, m.GameID, m.VenueID,
         COALESCE(r.RideName, g.GameName, v.VenueName) AS FacilityName,
         m.StartDate, m.EndDate, m.Outcome, m.Reason, m.RepairCost,
         TIMESTAMPDIFF(HOUR, m.StartDate, COALESCE(m.EndDate, NOW())) AS HoursWorked
    FROM Maintenance m
    LEFT JOIN Ride r  ON r.RideID  = m.RideID
    LEFT JOIN Game g  ON g.GameID  = m.GameID
    LEFT JOIN Venue v ON v.VenueID = m.VenueID`;

const isId = (n) => Number.isInteger(n) && n > 0;

// Accepts "2026-10-27 14:30", "2026-10-27T14:30" or with seconds. Returns "YYYY-MM-DD HH:MM:SS".
function parseDateTime(value, label) {
  const m = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!m) throw new HttpError(400, `${label} must look like 2026-10-27 14:30`);
  const out = `${m[1]} ${m[2]}:${m[3] ?? '00'}`;
  if (Number.isNaN(Date.parse(out.replace(' ', 'T') + 'Z'))) throw new HttpError(400, `${label} is not a real date`);
  return out;
}

// Checks the body and returns only the columns we allow. Exported so it can be tested without a database.
export function parseJob(body) {
  const b = body ?? {};
  if (!TYPES.includes(b.maintType)) throw new HttpError(400, `Type must be one of: ${TYPES.join(', ')}`);

  const targets = [b.rideId, b.gameId, b.venueId].filter((x) => x != null && x !== '');
  if (targets.length !== 1) throw new HttpError(400, 'Pick exactly one ride, game or venue');
  for (const [key, label] of [['rideId', 'Ride'], ['gameId', 'Game'], ['venueId', 'Venue']]) {
    if (b[key] != null && b[key] !== '' && !isId(b[key])) throw new HttpError(400, `${label} ID must be a whole number`);
  }

  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!reason || reason.length > 100) throw new HttpError(400, 'Reason is required and must be 100 characters or fewer');

  const startDate = parseDateTime(b.startDate, 'Start date');
  const closing = b.endDate != null && b.endDate !== '';
  const endDate = closing ? parseDateTime(b.endDate, 'End date') : null;
  if (endDate && endDate < startDate) throw new HttpError(400, 'End date cannot be before start date');

  const outcome = b.outcome == null || b.outcome === '' ? null : b.outcome;
  if (outcome !== null && !OUTCOMES.includes(outcome)) throw new HttpError(400, `Outcome must be one of: ${OUTCOMES.join(', ')}`);
  if (closing !== (outcome !== null)) throw new HttpError(400, 'Set the end date and the outcome together, or leave both empty');

  let repairCost = null;
  if (b.repairCost != null && b.repairCost !== '') {
    repairCost = Number(b.repairCost);
    if (!Number.isFinite(repairCost) || repairCost < 0 || repairCost > 99999999.99) {
      throw new HttpError(400, 'Repair cost must be a number from 0 to 99,999,999.99');
    }
    repairCost = Math.round(repairCost * 100) / 100;
  }
  // The cost rule is also enforced by the database trigger. Checking here gives the same message before the query runs.
  if (closing && repairCost === null) throw new HttpError(400, 'Repair cost is required to close a maintenance job');

  let crew = null; // null = leave the crew alone on edit
  if (b.crew !== undefined) {
    if (!Array.isArray(b.crew) || b.crew.length > 20) throw new HttpError(400, 'Crew must be a list of up to 20 people');
    const seen = new Set();
    crew = b.crew.map((c) => {
      if (!isId(c?.employeeId) || !CREW_ROLES.includes(c?.crewRole)) {
        throw new HttpError(400, `Each crew member needs an employee ID and a role (${CREW_ROLES.join(' or ')})`);
      }
      if (seen.has(c.employeeId)) throw new HttpError(400, 'The same employee is listed twice in the crew');
      seen.add(c.employeeId);
      return [c.employeeId, c.crewRole];
    });
  }

  return {
    maintType: b.maintType,
    rideId: b.rideId || null,
    gameId: b.gameId || null,
    venueId: b.venueId || null,
    startDate, endDate, outcome, reason, repairCost, crew,
  };
}

// Turns database rule failures into plain messages. Trigger messages (errno 1644) go to handleError() unchanged.
function friendly(err) {
  if (err.errno === 3819) {
    const text = err.sqlMessage ?? '';
    if (text.includes('CHK_Maint_Dates')) return new HttpError(400, 'End date cannot be before start date');
    if (text.includes('CHK_Maint_Outcome')) return new HttpError(400, 'Set the end date and the outcome together, or leave both empty');
    if (text.includes('CHK_Maint_Target')) return new HttpError(400, 'Pick exactly one ride, game or venue');
    if (text.includes('CHK_Maint_Cost')) return new HttpError(400, 'Repair cost cannot be negative');
  }
  if (err.errno === 1452) return new HttpError(400, 'That ride, game, venue or employee does not exist');
  return err;
}

async function loadJob(db, id) {
  const [rows] = await db.query(`${SELECT_JOB} WHERE m.MaintenanceID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Maintenance job not found');
  const [crew] = await db.query(
    `SELECT c.EmployeeID, c.CrewRole, e.FirstName, e.LastName
       FROM MaintenanceCrew c JOIN Employee e ON e.EmployeeID = c.EmployeeID
      WHERE c.MaintenanceID = ? ORDER BY c.CrewRole, e.LastName`,
    [id],
  );
  return { ...rows[0], crew };
}

function jobId(ctx) {
  const id = Number(ctx.params.id);
  if (!isId(id)) throw new HttpError(400, 'Job ID must be a whole number');
  return id;
}

// Runs the write and the crew replacement as one unit, so a failed crew insert undoes the job change.
async function saveJob(job, id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let jobIdValue = id;
    const values = [job.maintType, job.rideId, job.gameId, job.venueId, job.startDate, job.endDate, job.outcome, job.reason, job.repairCost];
    if (id == null) {
      const [result] = await conn.query(
        `INSERT INTO Maintenance (MaintType, RideID, GameID, VenueID, StartDate, EndDate, Outcome, Reason, RepairCost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );
      jobIdValue = result.insertId;
    } else {
      const [result] = await conn.query(
        `UPDATE Maintenance SET MaintType = ?, RideID = ?, GameID = ?, VenueID = ?, StartDate = ?, EndDate = ?,
                Outcome = ?, Reason = ?, RepairCost = ? WHERE MaintenanceID = ?`,
        [...values, id],
      );
      if (result.affectedRows === 0) {
        const [exists] = await conn.query('SELECT 1 FROM Maintenance WHERE MaintenanceID = ?', [id]);
        if (exists.length === 0) throw new HttpError(404, 'Maintenance job not found');
      }
    }
    if (job.crew !== null) {
      await conn.query('DELETE FROM MaintenanceCrew WHERE MaintenanceID = ?', [jobIdValue]);
      for (const [employeeId, crewRole] of job.crew) {
        await conn.query('INSERT INTO MaintenanceCrew (MaintenanceID, EmployeeID, CrewRole) VALUES (?, ?, ?)', [jobIdValue, employeeId, crewRole]);
      }
    }
    await conn.commit();
    return jobIdValue;
  } catch (err) {
    await conn.rollback();
    throw friendly(err);
  } finally {
    conn.release();
  }
}

// GET /api/maintenance?status=open|closed (optional). Newest first.
route(
  'GET',
  '/api/maintenance',
  requireRole(...CAN_READ)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined && status !== 'open' && status !== 'closed') throw new HttpError(400, 'Status must be open or closed');
    const where = status === 'open' ? ' WHERE m.EndDate IS NULL' : status === 'closed' ? ' WHERE m.EndDate IS NOT NULL' : '';
    const [rows] = await pool.query(`${SELECT_JOB}${where} ORDER BY m.StartDate DESC, m.MaintenanceID DESC LIMIT 500`);
    return rows;
  }),
);

route(
  'GET',
  '/api/maintenance/:id',
  requireRole(...CAN_READ)(async (ctx) => loadJob(pool, jobId(ctx))),
);

route(
  'POST',
  '/api/maintenance',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = await saveJob(parseJob(ctx.body), null);
    ctx.status = 201;
    return loadJob(pool, id);
  }),
);

// PUT replaces every editable field. Send the whole job. Leave "crew" out to keep the current crew.
route(
  'PUT',
  '/api/maintenance/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = jobId(ctx);
    await saveJob(parseJob(ctx.body), id);
    return loadJob(pool, id);
  }),
);

route(
  'DELETE',
  '/api/maintenance/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = jobId(ctx);
    try {
      const [result] = await pool.query('DELETE FROM Maintenance WHERE MaintenanceID = ?', [id]); // crew rows cascade
      if (result.affectedRows === 0) throw new HttpError(404, 'Maintenance job not found');
    } catch (err) {
      if (err.errno === 1451) throw new HttpError(409, 'This job is referenced by other records and cannot be deleted');
      throw err;
    }
    return { ok: true };
  }),
);
