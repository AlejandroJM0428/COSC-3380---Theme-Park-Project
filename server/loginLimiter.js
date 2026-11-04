// Login throttling. Failed sign-ins are counted in memory (a restart clears the counts, like sessions).
//
// Three counters, all over the same sliding window. Any one of them over its limit locks that key out:
//   user+ip : 5 failures   stops guessing one account from one machine
//   user    : 20 failures  stops the same guessing spread over many machines
//   ip      : 40 failures  stops one machine trying many usernames
// Unknown usernames count too, so the lockout does not reveal whether an account exists.
// A good sign-in clears the user+ip counter only. The IP is the socket address, never X-Forwarded-For
// (a client can fake that header). Behind a reverse proxy every visitor shares the proxy's address, so
// the ip limit is deliberately the loosest one.
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { userIp: 5, user: 20, ip: 40 };
const MAX_KEYS = 20000; // memory cap: a flood of made-up usernames cannot grow the map without limit

const failures = new Map(); // key -> array of failure timestamps (ms)

const keys = (username, ip) => {
  const u = String(username ?? '').toLowerCase().slice(0, 100);
  return { userIp: `ui:${u}|${ip}`, user: `u:${u}`, ip: `i:${ip}` };
};

function recent(key, now) {
  const list = failures.get(key);
  if (!list) return [];
  const fresh = list.filter((t) => now - t < WINDOW_MS);
  if (fresh.length === 0) failures.delete(key);
  else if (fresh.length !== list.length) failures.set(key, fresh);
  return fresh;
}

// Seconds until sign-in is allowed again for this username + address, or 0 when it is allowed now.
export function lockedForSeconds(username, ip, now = Date.now()) {
  const k = keys(username, ip);
  let wait = 0;
  for (const name of Object.keys(LIMITS)) {
    const list = recent(k[name], now);
    if (list.length >= LIMITS[name]) {
      // Allowed again when the oldest failure that counts has aged out of the window.
      const frees = list[list.length - LIMITS[name]] + WINDOW_MS - now;
      wait = Math.max(wait, Math.ceil(frees / 1000));
    }
  }
  return wait;
}

export function recordFailure(username, ip, now = Date.now()) {
  if (failures.size >= MAX_KEYS) sweep(now);
  if (failures.size >= MAX_KEYS) return; // still full of live keys: stop counting rather than grow
  const k = keys(username, ip);
  for (const name of Object.keys(LIMITS)) {
    const list = recent(k[name], now);
    list.push(now);
    failures.set(k[name], list);
  }
}

export function recordSuccess(username, ip) {
  failures.delete(keys(username, ip).userIp);
}

function sweep(now = Date.now()) {
  for (const key of [...failures.keys()]) recent(key, now);
}

setInterval(sweep, 5 * 60 * 1000).unref();

// Test helper.
export function _reset() {
  failures.clear();
}
