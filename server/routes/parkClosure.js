import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole, requireRoleWithMessage } from '../middleware/requireRole.js';
import { friendlyDbError, oneOf } from '../validate.js';
import { audit } from './admin.js';
import { insertWeather } from './weather.js';
import { clearPublicSiteCache } from './publicSite.js';

// One-click "Close park for weather" and "Reopen park". A shortcut over the weather form, not a second mechanism:
// closing inserts a Severe WeatherLog row (the database then closes the park: SQL/migrations/27 and SQL/rules/29),
// reopening gives that row an end time. Both write an AdminAudit row in the same transaction.
//
// Who: Admin only. Checked here on the server, not just greyed out in the page.
// Manager and RetailManager can still SEE the park status (CAN_SEE), so the page can show the button greyed out.
const CAN_CLOSE = ['Admin'];
const CAN_SEE = ['Admin', 'Manager', 'RetailManager'];
const NOT_ALLOWED = 'Insufficient privileges: only an Admin can close or reopen the park';
const CLOSE_TYPES = ['Storm', 'Rain', 'Heat', 'Cold'];

// Same "in effect" test as v_RideAvailability and fn_ParkClosedByWeather.
const IN_EFFECT = 'ClosesPark = 1 AND StartedAt <= NOW() AND (EndedAt IS NULL OR NOW() < EndedAt)';

const cleanNote = (v) => String(v ?? '').trim().slice(0, 300);

// Runs fn(conn) in one transaction: commit when it returns, roll back when it throws.
async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// GET /api/admin/weather/park-status: is the park weather-closed right now? The panel uses it to pick its button.
route(
  'GET',
  '/api/admin/weather/park-status',
  requireRole(...CAN_SEE)(async () => {
    const [rows] = await pool.query(
      `SELECT WeatherID, WeatherType, StartedAt FROM WeatherLog WHERE ${IN_EFFECT} ORDER BY StartedAt DESC LIMIT 1`,
    );
    const w = rows[0];
    return { closed: Boolean(w), weatherId: w?.WeatherID ?? null, weatherType: w?.WeatherType ?? null, since: w?.StartedAt ?? null };
  }),
);

// POST /api/admin/weather/close-park  { weatherType, note? }
route(
  'POST',
  '/api/admin/weather/close-park',
  requireRoleWithMessage(NOT_ALLOWED, ...CAN_CLOSE)(async (ctx) => {
    const b = ctx.body ?? {};
    const weatherType = oneOf(b.weatherType, 'Weather type', CLOSE_TYPES);
    const note = cleanNote(b.note);
    let id;
    try {
      id = await inTransaction(async (conn) => {
        const [open] = await conn.query(`SELECT WeatherID FROM WeatherLog WHERE ${IN_EFFECT} LIMIT 1 FOR UPDATE`);
        if (open.length > 0) throw new HttpError(409, 'The park is already closed for weather');
        const newId = await insertWeather({ weatherType, severity: 'Severe', startedAt: null, endedAt: null, closesOutdoorRides: 1, closesPark: 1 }, conn);
        await audit(ctx, 'PARK_CLOSE', { table: 'WeatherLog', rowKey: String(newId), detail: { weatherType, note } }, conn);
        return newId;
      });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw friendlyDbError(err, { 1062: 'The park was just closed by someone else. Reload and check.' });
    }
    clearPublicSiteCache();
    ctx.status = 201;
    return { closed: true, weatherId: id };
  }),
);

// POST /api/admin/weather/reopen-park  { note? }
// Sets EndedAt = NOW() on the park-closing event in effect. That UPDATE fires the existing trigger that clears the
// "Park closed" notice.
route(
  'POST',
  '/api/admin/weather/reopen-park',
  requireRoleWithMessage(NOT_ALLOWED, ...CAN_CLOSE)(async (ctx) => {
    const note = cleanNote(ctx.body?.note);
    const reopened = await inTransaction(async (conn) => {
      const [res] = await conn.query(`UPDATE WeatherLog SET EndedAt = NOW() WHERE ${IN_EFFECT}`);
      if (res.affectedRows === 0) throw new HttpError(409, 'The park is not closed for weather');
      await audit(ctx, 'PARK_REOPEN', { table: 'WeatherLog', rowKey: null, detail: { events: res.affectedRows, note } }, conn);
      return res.affectedRows;
    });
    clearPublicSiteCache();
    return { closed: false, reopened };
  }),
);
