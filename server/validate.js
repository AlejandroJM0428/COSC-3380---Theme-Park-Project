import { HttpError } from './errors.js';

// Small checks shared by the data-entry routes. Each one returns a clean value or throws a 400
// with a message a person can act on. The browser never decides ids, prices or roles.

export const isId = (n) => Number.isInteger(n) && n > 0;

// ctx.params.id -> a positive whole number, or a 400.
export function recordId(ctx, label) {
  const id = Number(ctx.params.id);
  if (!isId(id)) throw new HttpError(400, `${label} ID must be a whole number`);
  return id;
}

// A required id from the body (accepts 12 or "12").
export function needId(value, label) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!isId(n)) throw new HttpError(400, `${label} is required`);
  return n;
}

export function needText(value, label, max) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new HttpError(400, `${label} is required`);
  if (s.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer`);
  return s;
}

export function needInt(value, label, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`);
  return n;
}

// One decimal place, for example lightning distance 99.9.
export function needDecimal(value, label, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be a number from ${min} to ${max}`);
  return Math.round(n * 10) / 10;
}

export function oneOf(value, label, list) {
  if (!list.includes(value)) throw new HttpError(400, `${label} must be one of: ${list.join(', ')}`);
  return value;
}

// "2026-07-31" -> the same string, or a 400.
export function needDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, `${label} must look like 2026-07-31`);
  }
  return value;
}

// Accepts "2026-10-27 14:30", "2026-10-27T14:30" or with seconds. Returns "YYYY-MM-DD HH:MM:SS".
export function needDateTime(value, label) {
  const m = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!m) throw new HttpError(400, `${label} must look like 2026-10-27 14:30`);
  const out = `${m[1]} ${m[2]}:${m[3] ?? '00'}`;
  if (Number.isNaN(Date.parse(`${out.replace(' ', 'T')}Z`))) throw new HttpError(400, `${label} is not a real date`);
  return out;
}

// Empty or missing -> null (the SQL then uses NOW() or leaves the column empty).
export function optDateTime(value, label) {
  return value == null || value === '' ? null : needDateTime(value, label);
}

// Turns common MySQL errors into plain sentences. Trigger messages (errno 1644) are handled
// by handleError() and pass through untouched. `extra` adds or overrides messages for one route.
export function friendlyDbError(err, extra = {}) {
  const messages = {
    1452: 'A linked record (customer, ticket, ride or item) does not exist',
    1451: 'This record is used by other records, so it cannot be removed',
    1062: 'That record already exists',
    3819: 'A value breaks a database rule. Check the dates and numbers',
    1292: 'A date or number is not valid',
    1048: 'A required value is missing',
    ...extra,
  };
  const text = messages[err?.errno];
  return text ? new HttpError(400, text) : err;
}
