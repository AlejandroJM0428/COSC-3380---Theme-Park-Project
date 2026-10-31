import { HttpError, sendJson, handleError } from './errors.js';

const MAX_BODY = 100 * 1024;
const routes = [];

// route('GET', '/api/reports/:name', async (ctx) => data)
// ctx = { req, res, params, query, body, status }. Return data to send as JSON.
export function route(method, pattern, handler) {
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
}

function match(patternParts, pathParts) {
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  try {
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }
  } catch {
    return null; // malformed %-encoding
  }
  return params;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

// Always sends a response (used for every /api/* request).
export async function dispatch(req, res, url) {
  const pathParts = url.pathname.split('/').filter(Boolean);
  let pathMatched = false;

  for (const r of routes) {
    const params = match(r.parts, pathParts);
    if (!params) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;

    const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), body: {}, status: 200 };
    try {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        ctx.body = await readJson(req);
      }
      const data = await r.handler(ctx);
      sendJson(res, ctx.status, data ?? { ok: true });
    } catch (err) {
      handleError(res, err);
    }
    return;
  }

  if (pathMatched) return sendJson(res, 405, { message: 'Method not allowed' });
  sendJson(res, 404, { message: 'Not found' });
}
