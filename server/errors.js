import { triggerForMessage } from './demos/triggerCatalog.js';

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
export function handleError(res, err) {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (err instanceof HttpError) return sendJson(res, err.status, { message: err.message });
  if (err?.errno === 1644) {
    const trigger = triggerForMessage(err.sqlMessage);
    return sendJson(res, 400, trigger ? { message: err.sqlMessage, trigger } : { message: err.sqlMessage });
  }
  console.error(err);
  sendJson(res, 500, { message: 'Something went wrong on the server' });
}
