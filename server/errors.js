import { triggerForMessage } from './catalog/triggerCatalog.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

// MySQL errno 1644 = SIGNAL from a trigger. Its text is meant for people, so we pass it on.
// When the text belongs to a trigger in the catalog, the trigger's name, table and rule go along as
// `trigger`, so the portal can show a "trigger fired" card instead of a plain error.
// Anything else is logged here and never shown to the browser.
// Which statement made the trigger fire? The failed SQL (err.sql) says: INSERT INTO t, UPDATE t or DELETE FROM t.
// Without it, the HTTP method is the next best guess (POST = insert, PUT = update, DELETE = delete).
const EVENT_OF_METHOD = { POST: 'INSERT', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };
function statementOf(err, req) {
  const m = String(err?.sql ?? '').match(/^\s*(INSERT\s+(?:IGNORE\s+)?INTO|UPDATE|DELETE\s+FROM)\s+`?(\w+)`?/i);
  if (m) return { event: m[1].toUpperCase().split(/\s/)[0], table: m[2] };
  return { event: EVENT_OF_METHOD[req?.method] };
}

export function handleError(res, err, req) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof HttpError) return sendJson(res, err.status, { message: err.message });
  if (err?.errno === 1644) {
    const trigger = triggerForMessage(err.sqlMessage, statementOf(err, req));
    return sendJson(res, 400, trigger ? { message: err.sqlMessage, trigger } : { message: err.sqlMessage });
  }
  console.error(err);
  sendJson(res, 500, { message: 'Something went wrong on the server' });
}
