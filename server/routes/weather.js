import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needDecimal, needInt, needDateTime, oneOf, optDateTime, recordId } from '../validate.js';

// Weather log (data entry, not a report): list, get, add, edit, delete.
// The browser never sends ClosesOutdoorRides: trg_WeatherLog_BI / trg_WeatherLog_BU work it out from the
// readings and the park's limits. When a new reading closes outdoor rides, trg_WeatherLog_AI_Notify posts
// a weather notice, so adding a Storm entry is a live demo of the notification trigger.
// Delete is a real delete (WeatherLog has no IsActive). The database refuses it when a refund uses the event.

const CAN_READ = ['Admin', 'Manager'];
const CAN_WRITE = ['Admin', 'Manager'];
const CAN_DELETE = ['Admin', 'Manager'];
const TYPES = ['Clear', 'Cloudy', 'Rain', 'Storm', 'Heat', 'Cold'];

const SELECT_WEATHER = `
  SELECT WeatherID, WeatherType, StartedAt, EndedAt, TemperatureF, WindMph, LightningMiles, ClosesOutdoorRides
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
    startedAt,
    endedAt,
    temperatureF: needInt(b.temperatureF, 'Temperature (F)', -60, 150),
    windMph: needInt(b.windMph, 'Wind (mph)', 0, 300),
    lightningMiles: needDecimal(b.lightningMiles, 'Lightning distance (miles)', 0, 99.9), // 99.9 = none detected
  };
}

const FRIENDLY = {
  1062: 'There is already a weather entry that starts at that time',
  1451: 'A refund uses this weather event, so it cannot be deleted',
  3819: 'The end time cannot be before the start time, and lightning distance cannot be negative',
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
    try {
      const [result] = await pool.query(
        `INSERT INTO WeatherLog (ParkID, WeatherType, StartedAt, EndedAt, TemperatureF, WindMph, LightningMiles, ClosesOutdoorRides)
         VALUES ((SELECT ParkID FROM Park ORDER BY ParkID LIMIT 1), ?, ?, ?, ?, ?, ?, 0)`,
        [w.weatherType, w.startedAt, w.endedAt, w.temperatureF, w.windMph, w.lightningMiles],
      );
      ctx.status = 201;
      return await loadWeather(result.insertId);
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
    await loadWeather(id); // 404 if missing
    try {
      await pool.query(
        `UPDATE WeatherLog
            SET WeatherType = ?, StartedAt = ?, EndedAt = ?, TemperatureF = ?, WindMph = ?, LightningMiles = ?
          WHERE WeatherID = ?`,
        [w.weatherType, w.startedAt, w.endedAt, w.temperatureF, w.windMph, w.lightningMiles, id],
      );
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    return loadWeather(id);
  }),
);

route(
  'DELETE',
  '/api/weather/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = recordId(ctx, 'Weather');
    const gone = await loadWeather(id); // 404 if missing
    try {
      await pool.query('DELETE FROM WeatherLog WHERE WeatherID = ?', [id]);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    return gone;
  }),
);
