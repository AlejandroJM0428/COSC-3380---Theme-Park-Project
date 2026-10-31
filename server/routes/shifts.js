import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Employee performance data entry: shifts with a rating (1 to 5) and notes. List, get, add, edit, delete.
// Shift has nothing pointing at it, so delete removes the row. Overlap and hire date are
// sp_AssertShift, called here. An inactive employee is rejected here. MySQL no longer has a shift trigger.

const CAN_READ = ['Admin', 'Manager', 'HRManager'];
const CAN_WRITE = ['Admin', 'Manager', 'HRManager'];
const CAN_DELETE = ['Admin', 'HRManager'];

const isId = (n) => Number.isInteger(n) && n > 0;

const SELECT_SHIFT = `
  SELECT s.ShiftID, s.EmployeeID, CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName, e.JobTitle,
         s.ClockIn, s.ClockOut, s.ShiftRating, s.ShiftNotes,
         ROUND(TIMESTAMPDIFF(MINUTE, s.ClockIn, s.ClockOut) / 60, 1) AS HoursWorked
    FROM Shift s
    JOIN Employee e ON e.EmployeeID = s.EmployeeID`;

// Accepts "2026-10-27 14:30", "2026-10-27T14:30" or with seconds. Returns "YYYY-MM-DD HH:MM:SS".
function parseDateTime(value, label) {
  const m = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!m) throw new HttpError(400, `${label} must look like 2026-10-27 14:30`);
  const out = `${m[1]} ${m[2]}:${m[3] ?? '00'}`;
  if (Number.isNaN(Date.parse(out.replace(' ', 'T') + 'Z'))) throw new HttpError(400, `${label} is not a real date`);
  return out;
}

// Checks the body and returns only the columns we allow. Exported so it can be tested without a database.
export function parseShift(body) {
  const b = body ?? {};
  if (!isId(b.employeeId)) throw new HttpError(400, 'Employee ID must be a whole number');

  const clockIn = parseDateTime(b.clockIn, 'Clock in');
  const closing = b.clockOut != null && b.clockOut !== '';
  const clockOut = closing ? parseDateTime(b.clockOut, 'Clock out') : null;
  if (clockOut && clockOut <= clockIn) throw new HttpError(400, 'Clock out must be after clock in');

  let rating = null;
  if (b.rating != null && b.rating !== '') {
    rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be a whole number from 1 to 5');
  }
  if (rating !== null && !closing) throw new HttpError(400, 'Rate a shift only after it has ended (add the clock-out time)');

  const notes = typeof b.notes === 'string' ? b.notes.trim() : '';
  if (notes.length > 255) throw new HttpError(400, 'Notes must be 255 characters or fewer');

  return { employeeId: b.employeeId, clockIn, clockOut, rating, notes: notes === '' ? null : notes };
}

function friendly(err) {
  if (err.errno === 3819) {
    const text = err.sqlMessage ?? '';
    if (text.includes('CHK_Shift_Time')) return new HttpError(400, 'Clock out must be after clock in');
    if (text.includes('CHK_Shift_Rating')) return new HttpError(400, 'Rating must be a whole number from 1 to 5');
  }
  if (err.errno === 1062) return new HttpError(409, 'This employee already has a shift starting at that time');
  if (err.errno === 1452) return new HttpError(400, 'That employee does not exist');
  return err;
}

function shiftId(ctx) {
  const id = Number(ctx.params.id);
  if (!isId(id)) throw new HttpError(400, 'Shift ID must be a whole number');
  return id;
}

async function loadShift(id) {
  const [rows] = await pool.query(`${SELECT_SHIFT} WHERE s.ShiftID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Shift not found');
  return rows[0];
}

async function assertShift(self, s) {
  const [rows] = await pool.query('SELECT IsActive FROM Employee WHERE EmployeeID = ?', [s.employeeId]);
  if (rows.length === 0 || Number(rows[0].IsActive) !== 1) {
    throw new HttpError(400, 'Employee is inactive or does not exist');
  }
  await pool.query('CALL sp_AssertShift(?, ?, ?, ?)', [self, s.employeeId, s.clockIn, s.clockOut]);
}

// GET /api/shifts?status=open|rated|unrated (optional). Newest first.
route(
  'GET',
  '/api/shifts',
  requireRole(...CAN_READ)(async (ctx) => {
    const { status } = ctx.query;
    const filters = {
      open: ' WHERE s.ClockOut IS NULL',
      rated: ' WHERE s.ShiftRating IS NOT NULL',
      unrated: ' WHERE s.ClockOut IS NOT NULL AND s.ShiftRating IS NULL',
    };
    if (status !== undefined && !(status in filters)) throw new HttpError(400, 'Status must be open, rated or unrated');
    const [rows] = await pool.query(`${SELECT_SHIFT}${status ? filters[status] : ''} ORDER BY s.ClockIn DESC, s.ShiftID DESC LIMIT 500`);
    return rows;
  }),
);

// Dropdown for the form. Registered BEFORE /api/shifts/:id so "lookups" is not read as an id.
route(
  'GET',
  '/api/shifts/lookups',
  requireRole(...CAN_READ)(async () => {
    const [employees] = await pool.query(
      "SELECT EmployeeID AS id, CONCAT(FirstName, ' ', LastName, ' (', JobTitle, ')') AS name FROM Employee WHERE IsActive = 1 ORDER BY LastName, FirstName",
    );
    return { employees };
  }),
);

route(
  'GET',
  '/api/shifts/:id',
  requireRole(...CAN_READ)(async (ctx) => loadShift(shiftId(ctx))),
);

route(
  'POST',
  '/api/shifts',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const s = parseShift(ctx.body);
    try {
      await assertShift(0, s);
      const [result] = await pool.query(
        'INSERT INTO Shift (EmployeeID, ClockIn, ClockOut, ShiftRating, ShiftNotes) VALUES (?, ?, ?, ?, ?)',
        [s.employeeId, s.clockIn, s.clockOut, s.rating, s.notes],
      );
      ctx.status = 201;
      return await loadShift(result.insertId);
    } catch (err) {
      throw friendly(err);
    }
  }),
);

// PUT replaces every editable field. Send the whole shift.
route(
  'PUT',
  '/api/shifts/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = shiftId(ctx);
    const s = parseShift(ctx.body);
    await loadShift(id); // 404 if missing
    try {
      await assertShift(id, s);
      await pool.query(
        'UPDATE Shift SET EmployeeID = ?, ClockIn = ?, ClockOut = ?, ShiftRating = ?, ShiftNotes = ? WHERE ShiftID = ?',
        [s.employeeId, s.clockIn, s.clockOut, s.rating, s.notes, id],
      );
    } catch (err) {
      throw friendly(err);
    }
    return loadShift(id);
  }),
);

route(
  'DELETE',
  '/api/shifts/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const [result] = await pool.query('DELETE FROM Shift WHERE ShiftID = ?', [shiftId(ctx)]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Shift not found');
    return { ok: true };
  }),
);
