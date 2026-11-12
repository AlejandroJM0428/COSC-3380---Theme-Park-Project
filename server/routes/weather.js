import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needDateTime, oneOf, optDateTime, recordId } from '../validate.js';
import { clearPublicSiteCache } from './publicSite.js';

// Weather log (data entry, not a report): list, get, add, edit, delete.
// The form sends the weather type, a severity and the times. The database decides what closes
// (SQL/migrations/27) and, since SQL/migrations/31, ClosesOutdoorRides and ClosesPark are ordinary columns the form
// sets directly (Severity is only a label). Old readings (temperature, wind, lightning) are kept but not edited here.
// Delete is a real delete (WeatherLog has no IsActive). The database refuses it when a refund uses the event.

const CAN_READ = ['Admin', 'Manager', 'RetailManager'];
const CAN_WRITE = ['Admin', 'Manager', 'RetailManager'];
const CAN_DELETE = ['Admin', 'Manager', 'RetailManager'];
const TYPES = ['Clear', 'Cloudy', 'Rain', 'Storm', 'Heat', 'Cold'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Severe'];

// Closing the whole park is Admin-only: only an Admin may add, edit or delete an entry that closes the park, or turn one into it.
// Everyone else who can open the Weather Log sees those controls greyed out. Checked here, not just in the page.
const PARK_CLOSER = 'Admin';
const NOT_ALLOWED = 'Insufficient privileges: only an Admin can close or reopen the park';
function needAdminForParkClosure(ctx, ...closesPark) {
  if (ctx.session?.role !== PARK_CLOSER && closesPark.some(Boolean)) throw new HttpError(403, NOT_ALLOWED);
}

const SELECT_WEATHER = `
  SELECT WeatherID, WeatherType, Severity, StartedAt, EndedAt, TemperatureF, WindMph, LightningMiles,
         ClosesOutdoorRides, ClosesPark
    FROM WeatherLog`;

async function loadWeather(id) {
  const [rows] = await pool.query(`${SELECT_WEATHER} WHERE WeatherID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Weather entry not found');
  return rows[0];
}

export function parseWeather(body) {
  const b = body ?? {};
  const startedAt = needDateTime(b.startedAt, 'Started');
  const endedAt = optDateTime(b.endedAt, 'Ended');
  if (endedAt && endedAt < startedAt) throw new HttpError(400, 'The end time cannot be before the start time');
  return {
    weatherType: oneOf(b.weatherType, 'Weather type', TYPES),
    severity: oneOf(b.severity, 'Severity', SEVERITIES),
    startedAt,
    endedAt,
    closesOutdoorRides: flag(b.closesOutdoorRides, 'Outdoor rides'),
    closesPark: flag(b.closesPark, 'Park'),
  };
}

// Open / Closed as sent by the form: true, false, 1, 0, '1' or '0'.
function flag(v, label) {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  throw new HttpError(400, `${label} must be Open or Closed`);
}

// The one INSERT for a weather event, used by the weather form and by the one-click "close park" button.
// startedAt null means "now". Pass `db` (a connection inside a transaction) to commit or roll back with other writes.
export async function insertWeather(w, db = pool) {
  const [result] = await db.query(
    `INSERT INTO WeatherLog (ParkID, WeatherType, Severity, StartedAt, EndedAt, ClosesOutdoorRides, ClosesPark)
     VALUES ((SELECT ParkID FROM Park ORDER BY ParkID LIMIT 1), ?, ?, COALESCE(?, NOW()), ?, ?, ?)`,
    [w.weatherType, w.severity, w.startedAt ?? null, w.endedAt ?? null, w.closesOutdoorRides ?? 0, w.closesPark ?? 0],
  );
  return result.insertId;
}

const FRIENDLY = {
  1062: 'There is already a weather entry that starts at that time',
  1451: 'A refund uses this weather event, so it cannot be deleted',
  3819: 'The end time cannot be before the start time',
};

// GET /api/weather?status=ongoing|closing (optional). Newest first, first 200.
route(
  'GET',
  '/api/weather',
  requireRole(...CAN_READ)(async (ctx) => {
    const { status } = ctx.query;
    if (status !== undefined && status !== 'ongoing' && status !== 'closing') {
      throw new HttpError(400, 'Status must be ongoing or closing');
    }
    const where = status === 'ongoing' ? ' WHERE EndedAt IS NULL' : status === 'closing' ? ' WHERE ClosesOutdoorRides = 1' : '';
    const [rows] = await pool.query(`${SELECT_WEATHER}${where} ORDER BY StartedAt DESC LIMIT 200`);
    return rows;
  }),
);

// The form needs no dropdowns. Registered BEFORE /:id so "lookups" is not read as an id.
route('GET', '/api/weather/lookups', requireRole(...CAN_READ)(async () => ({})));

route(
  'GET',
  '/api/weather/:id',
  requireRole(...CAN_READ)(async (ctx) => loadWeather(recordId(ctx, 'Weather'))),
);

route(
  'POST',
  '/api/weather',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const w = parseWeather(ctx.body);
    needAdminForParkClosure(ctx, w.closesPark);
    try {
      const insertId = await insertWeather(w);
      clearPublicSiteCache(); // the homepage ticker follows the log
      ctx.status = 201;
      return await loadWeather(insertId);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
  }),
);

route(
  'PUT',
  '/api/weather/:id',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const id = recordId(ctx, 'Weather');
    const w = parseWeather(ctx.body);
    const before = await loadWeather(id); // 404 if missing
    needAdminForParkClosure(ctx, before.ClosesPark, w.closesPark); // changing a Severe entry (ending it too) or making one
    try {
      await pool.query(
        `UPDATE WeatherLog
            SET WeatherType = ?, Severity = ?, StartedAt = ?, EndedAt = ?, ClosesOutdoorRides = ?, ClosesPark = ?
          WHERE WeatherID = ?`,
        [w.weatherType, w.severity, w.startedAt, w.endedAt, w.closesOutdoorRides, w.closesPark, id],
      );
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    clearPublicSiteCache();
    return loadWeather(id);
  }),
);

route(
  'DELETE',
  '/api/weather/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = recordId(ctx, 'Weather');
    const gone = await loadWeather(id); // 404 if missing
    needAdminForParkClosure(ctx, gone.ClosesPark);
    try {
      await pool.query('DELETE FROM WeatherLog WHERE WeatherID = ?', [id]);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    clearPublicSiteCache();
    return gone;
  }),
);
