import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

// Sessions live in memory: restarting the backend logs everyone out.
const COOKIE = 'tp_session';
const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const sign = (id) => createHmac('sha256', config.sessionSecret).update(id).digest('base64url');

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function idFromCookie(req) {
  const raw = readCookie(req, COOKIE);
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot < 0) return null;
  const id = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}

export function createSession(res, user) {
  const id = randomBytes(32).toString('hex');
  sessions.set(id, {
    userId: user.userId,
    username: user.username,
    role: user.role,
    CustomerID: user.CustomerID ?? null,
    expires: Date.now() + MAX_AGE_MS,
  });
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${MAX_AGE_MS / 1000}`];
  
  if (config.production) flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE}=${id}.${sign(id)}; ${flags.join('; ')}`);
}

export function getSession(req) {
  const id = idFromCookie(req);
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return session;
}

export function destroySession(req, res) {
  const id = idFromCookie(req);
  if (id) sessions.delete(id);
  const flags = ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (config.production) flags.push('Secure');
  res.setHeader('Set-Cookie', `${COOKIE}=; ${flags.join('; ')}`);
}
