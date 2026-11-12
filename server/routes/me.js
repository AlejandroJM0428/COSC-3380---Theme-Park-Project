import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Employee portal (Maintenance Worker and Restaurant Worker).
// Everything is looked up with the EmployeeID stored in the logged-in session,
// never with an id from the request, so a worker can only see their own records.
// Rule: an employee sees only their own hours, pay, schedule, shift ratings and jobs. Never revenue or repair cost.

route(
  'GET',
  '/api/me/work',
  requireRole('MaintenanceWorker', 'RestaurantWorker')(async (ctx) => {
    const employeeId = ctx.session.EmployeeID;
    if (!employeeId) return { linked: false };

    const [[employee]] = await pool.query(
      "SELECT EmployeeID, CONCAT(FirstName, ' ', LastName) AS Name, JobTitle, HireDate, HourlyPay FROM Employee WHERE EmployeeID = ?",
      [employeeId],
    );
    if (!employee) return { linked: false };

    const [shifts] = await pool.query(
      `SELECT ShiftID, ClockIn, ClockOut, ShiftRating, ShiftNotes,
              ROUND(TIMESTAMPDIFF(MINUTE, ClockIn, ClockOut) / 60, 1) AS HoursWorked,
              ROUND(TIMESTAMPDIFF(MINUTE, ClockIn, ClockOut) / 60 * ?, 2) AS Pay
         FROM Shift WHERE EmployeeID = ? ORDER BY ClockIn DESC LIMIT 15`,
      [employee.HourlyPay, employeeId],
    );

    const result = { linked: true, role: ctx.session.role, employee, shifts };

    if (ctx.session.role === 'MaintenanceWorker') {
      // Open jobs first. Never repair cost. ReportOutcome is set once a crew member has reported the work finished.
      const [jobs] = await pool.query(
        `SELECT j.MaintenanceID, j.CrewRole, j.FacilityKind, j.FacilityName, j.MaintType,
                j.StartDate, j.EndDate, j.Outcome, m.Reason,
                w.ProposedOutcome AS ReportOutcome, w.Note AS ReportNote, w.ReportedAt,
                CONCAT(re.FirstName, ' ', re.LastName) AS ReportedBy
           FROM v_EmployeeMaintenanceJobs j
           JOIN Maintenance m ON m.MaintenanceID = j.MaintenanceID
           LEFT JOIN MaintenanceWorkReport w ON w.MaintenanceID = j.MaintenanceID
           LEFT JOIN Employee re ON re.EmployeeID = w.EmployeeID
          WHERE j.EmployeeID = ?
          ORDER BY (j.EndDate IS NULL) DESC, j.StartDate DESC LIMIT 25`,
        [employeeId],
      );
      result.jobs = jobs;
    }
    return result;
  }),
);

// A crew member reports an open job finished (or changes or undoes that report). Only the maintenance manager can close the job.
// The EmployeeID comes from the session. trg_MaintWorkReport_BI refuses a job that is closed or one the worker is not crew on.
const OUTCOMES = ['Fixed', 'Partially Fixed', 'Not Fixed'];

function jobId(ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Job ID must be a whole number');
  return id;
}

route(
  'POST',
  '/api/me/jobs/:id/finished',
  requireRole('MaintenanceWorker')(async (ctx) => {
    const employeeId = ctx.session.EmployeeID;
    if (!employeeId) throw new HttpError(403, 'This login is not linked to an employee record');
    const id = jobId(ctx);
    const { outcome } = ctx.body ?? {};
    const note = typeof ctx.body?.note === 'string' ? ctx.body.note.trim() : '';
    if (!OUTCOMES.includes(outcome)) throw new HttpError(400, `Outcome must be one of: ${OUTCOMES.join(', ')}`);
    if (note.length > 200) throw new HttpError(400, 'Note must be 200 characters or fewer');
    try {
      await pool.query(
        `INSERT INTO MaintenanceWorkReport (MaintenanceID, EmployeeID, ProposedOutcome, Note)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE EmployeeID = VALUES(EmployeeID), ProposedOutcome = VALUES(ProposedOutcome),
                                 Note = VALUES(Note), ReportedAt = NOW()`,
        [id, employeeId, outcome, note || null],
      );
    } catch (err) {
      if (err.errno === 1452) throw new HttpError(404, 'Maintenance job not found');
      throw err;
    }
    ctx.status = 201;
    return { ok: true };
  }),
);

route(
  'DELETE',
  '/api/me/jobs/:id/finished',
  requireRole('MaintenanceWorker')(async (ctx) => {
    const employeeId = ctx.session.EmployeeID;
    if (!employeeId) throw new HttpError(403, 'This login is not linked to an employee record');
    const [result] = await pool.query(
      `DELETE w FROM MaintenanceWorkReport w
         JOIN Maintenance m ON m.MaintenanceID = w.MaintenanceID
        WHERE w.MaintenanceID = ? AND w.EmployeeID = ? AND m.EndDate IS NULL`,
      [jobId(ctx), employeeId],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'No open report of yours to undo on this job');
    return { ok: true };
  }),
);
