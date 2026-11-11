#!/usr/bin/env python3
"""Stage 2: Admin and the Operations desk (Manager) can close and reopen the park for weather in one click.

Run it from uma-3380-TP/ (the repo root):
    python3 apply-stage2.py            dry run: lists what would change, writes nothing
    python3 apply-stage2.py --apply    writes the files

Safe to run twice: a change that is already in place is skipped. If any anchor text is missing the whole run
stops and nothing is written, so you never end up with half a patch.

Who may use it: Admin and Manager only. Manager is the "Operations desk" (client/src/config/nav.js), the same
pair as OPS_ROLES. RetailManager is NOT included.
"""
import os
import sys

APPLY = '--apply' in sys.argv
ROOT = os.getcwd()
if not os.path.exists(os.path.join(ROOT, 'docker-compose.yml')) or not os.path.isdir(os.path.join(ROOT, 'SQL')):
    sys.exit('Run this from uma-3380-TP/ (the folder with docker-compose.yml and SQL/).')

changes = {}   # path -> new full text
skipped = []   # (path, why)
failures = []  # messages


def disk(path):
    full = os.path.join(ROOT, path)
    if not os.path.exists(full):
        return None
    with open(full, encoding='utf-8', newline='') as f:
        return f.read()


def current(path):
    return changes[path] if path in changes else disk(path)


def create(path, text):
    cur = current(path)
    if cur == text:
        skipped.append((path, 'already there'))
    elif cur is not None:
        failures.append(f'{path} already exists with different content, not overwriting it')
    else:
        changes[path] = text


def replace(path, old, new):
    cur = current(path)
    if cur is None:
        failures.append(f'{path} is missing')
        return
    if new in cur:
        skipped.append((path, 'already applied'))
        return
    if cur.count(old) != 1:
        failures.append(f'{path}: anchor text found {cur.count(old)} times (expected 1):\n      {old.strip().splitlines()[0][:90]}')
        return
    changes[path] = cur.replace(old, new, 1)


# ---------------------------------------------------------------------------------------------------------------
# 1. SQL: the function and three small guard triggers (the trg_Ticket_BI_Guard pattern in SQL/rules/14)
# ---------------------------------------------------------------------------------------------------------------
create('SQL/rules/29_sales_blocked_when_park_closed.sql', r'''-- 29_sales_blocked_when_park_closed.sql
-- While a Severe weather event is in effect (WeatherLog.ClosesPark = 1) the park is closed, so selling must stop too.
-- Migration 27 already blocks ride boardings. This file adds the rest:
--   fn_ParkClosedByWeather(p_at)     true when a park-closing weather event covers p_at
--   trg_Ticket_BI_WeatherClosed      BEFORE INSERT on Ticket: no ticket for TODAY while closed (future dates stay on sale)
--   trg_Purchase_BI_WeatherClosed    BEFORE INSERT on Purchase: no food, drink or merchandise sale while closed
--   trg_GamePlay_BI_WeatherClosed    BEFORE INSERT on GamePlay: no game play while closed
-- Small new triggers on purpose: the existing trigger bodies are not rewritten.
-- Safe to run more than once. Does not delete or change any rows.
-- REQUIRES migration 27 (WeatherLog.ClosesPark) and the schema triggers trg_Ticket_BI, trg_Purchase_BI, trg_GamePlay_BI.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/rules/29_sales_blocked_when_park_closed.sql
-- Test on a copy of the database first.
USE theme_park;

DROP TRIGGER IF EXISTS trg_Ticket_BI_WeatherClosed;
DROP TRIGGER IF EXISTS trg_Purchase_BI_WeatherClosed;
DROP TRIGGER IF EXISTS trg_GamePlay_BI_WeatherClosed;
DROP FUNCTION IF EXISTS fn_ParkClosedByWeather;

DELIMITER $$

-- [RULE] fn_ParkClosedByWeather: true when a weather event that closes the park is in effect at p_at.
-- Same "in effect" test as v_RideAvailability: started, and not ended yet.
CREATE FUNCTION fn_ParkClosedByWeather(p_at DATETIME)
RETURNS BOOL
READS SQL DATA
BEGIN
    RETURN EXISTS (SELECT 1 FROM WeatherLog w
                    WHERE w.ClosesPark = 1
                      AND w.StartedAt <= p_at
                      AND (w.EndedAt IS NULL OR p_at < w.EndedAt));
END$$

-- [RULE] A ticket for today cannot be sold while weather has closed the park. Tickets for a later date are fine.
CREATE TRIGGER trg_Ticket_BI_WeatherClosed BEFORE INSERT ON Ticket
FOR EACH ROW PRECEDES trg_Ticket_BI
BEGIN
    IF NEW.VisitDate = CURDATE() AND fn_ParkClosedByWeather(NOW()) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets for today are not on sale: weather has closed the park';
    END IF;
END$$

-- [RULE] No purchase is recorded while weather has closed the park.
CREATE TRIGGER trg_Purchase_BI_WeatherClosed BEFORE INSERT ON Purchase
FOR EACH ROW PRECEDES trg_Purchase_BI
BEGIN
    IF fn_ParkClosedByWeather(NEW.PurchasedAt) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchases are paused: weather has closed the park';
    END IF;
END$$

-- [RULE] No game play is recorded while weather has closed the park.
CREATE TRIGGER trg_GamePlay_BI_WeatherClosed BEFORE INSERT ON GamePlay
FOR EACH ROW PRECEDES trg_GamePlay_BI
BEGIN
    IF fn_ParkClosedByWeather(NEW.PlayedAt) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Games are closed: weather has closed the park';
    END IF;
END$$

DELIMITER ;
''')

replace(
    'docker-compose.yml',
    '      - ./SQL/rules/28_ride_notice_dedupe.sql:/docker-entrypoint-initdb.d/28_ride_notice_dedupe.sql:ro\n',
    '      - ./SQL/rules/28_ride_notice_dedupe.sql:/docker-entrypoint-initdb.d/28_ride_notice_dedupe.sql:ro\n'
    '      - ./SQL/rules/29_sales_blocked_when_park_closed.sql:/docker-entrypoint-initdb.d/29_sales_blocked_when_park_closed.sql:ro\n',
)

# ---------------------------------------------------------------------------------------------------------------
# 2. Server: shared insert, cache clear, the two endpoints
# ---------------------------------------------------------------------------------------------------------------
replace(
    'server/routes/publicSite.js',
    'let cache = { at: 0, data: null };\n',
    '''let cache = { at: 0, data: null };

// Forget the cached answer. Called when something changes what the homepage shows (closing or reopening the park for
// weather, and later rides being added or retired), so the change shows on the next request, not after the 15 s wait.
export function clearPublicSiteCache() {
  cache = { at: 0, data: null };
}
''',
)

replace(
    'server/routes/weather.js',
    'const FRIENDLY = {\n',
    '''// The one INSERT for a weather event, used by the weather form and by the one-click "close park" button.
// startedAt null means "now". Pass `db` (a connection inside a transaction) to commit or roll back with other writes.
export async function insertWeather(w, db = pool) {
  const [result] = await db.query(
    `INSERT INTO WeatherLog (ParkID, WeatherType, Severity, StartedAt, EndedAt)
     VALUES ((SELECT ParkID FROM Park ORDER BY ParkID LIMIT 1), ?, ?, COALESCE(?, NOW()), ?)`,
    [w.weatherType, w.severity, w.startedAt ?? null, w.endedAt ?? null],
  );
  return result.insertId;
}

const FRIENDLY = {
''',
)

replace(
    'server/routes/weather.js',
    '''      const [result] = await pool.query(
        `INSERT INTO WeatherLog (ParkID, WeatherType, Severity, StartedAt, EndedAt)
         VALUES ((SELECT ParkID FROM Park ORDER BY ParkID LIMIT 1), ?, ?, ?, ?)`,
        [w.weatherType, w.severity, w.startedAt, w.endedAt],
      );
      ctx.status = 201;
      return await loadWeather(result.insertId);
''',
    '''      const insertId = await insertWeather(w);
      ctx.status = 201;
      return await loadWeather(insertId);
''',
)

create('server/routes/parkClosure.js', r'''import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, oneOf } from '../validate.js';
import { audit } from './admin.js';
import { insertWeather } from './weather.js';
import { clearPublicSiteCache } from './publicSite.js';

// One-click "Close park for weather" and "Reopen park". A shortcut over the weather form, not a second mechanism:
// closing inserts a Severe WeatherLog row (the database then closes the park: SQL/migrations/27 and SQL/rules/29),
// reopening gives that row an end time. Both write an AdminAudit row in the same transaction.
//
// Who: Admin and Manager (the Operations desk). Checked here on the server, not just hidden in the page.
// RetailManager is deliberately not listed.
const CAN_CLOSE = ['Admin', 'Manager'];
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
  requireRole(...CAN_CLOSE)(async () => {
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
  requireRole(...CAN_CLOSE)(async (ctx) => {
    const b = ctx.body ?? {};
    const weatherType = oneOf(b.weatherType, 'Weather type', CLOSE_TYPES);
    const note = cleanNote(b.note);
    let id;
    try {
      id = await inTransaction(async (conn) => {
        const [open] = await conn.query(`SELECT WeatherID FROM WeatherLog WHERE ${IN_EFFECT} LIMIT 1 FOR UPDATE`);
        if (open.length > 0) throw new HttpError(409, 'The park is already closed for weather');
        const newId = await insertWeather({ weatherType, severity: 'Severe', startedAt: null, endedAt: null }, conn);
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
  requireRole(...CAN_CLOSE)(async (ctx) => {
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
''')

replace(
    'server/index.js',
    "import './routes/admin.js';\n",
    "import './routes/admin.js';\nimport './routes/parkClosure.js';\n",
)

# ---------------------------------------------------------------------------------------------------------------
# 3. Client: API calls, the panel, the weather page, the faster refresh, guest wording
# ---------------------------------------------------------------------------------------------------------------
cur = current('client/src/api/index.js')
if cur is None:
    failures.append('client/src/api/index.js is missing')
elif 'export function closePark' in cur:
    skipped.append(('client/src/api/index.js', 'already applied'))
else:
    changes['client/src/api/index.js'] = cur.rstrip('\n') + '''

// Close or reopen the park for weather (Admin and the Operations desk). The database then refuses sales until it reopens
// (SQL/rules/29_sales_blocked_when_park_closed.sql). These always need the real server.
const NEEDS_SERVER = 'Mock mode is on, so this would not touch the database. Set VITE_USE_MOCK=false in client/.env and restart npm run dev.'
export function getParkClosure() {
  return USE_MOCK ? Promise.reject(new Error(NEEDS_SERVER)) : http('/admin/weather/park-status')
}
export function closePark(data) {
  return USE_MOCK ? Promise.reject(new Error(NEEDS_SERVER)) : http('/admin/weather/close-park', { method: 'POST', body: data })
}
export function reopenPark(data) {
  return USE_MOCK ? Promise.reject(new Error(NEEDS_SERVER)) : http('/admin/weather/reopen-park', { method: 'POST', body: data })
}
'''

create('client/src/components/ParkClosurePanel.jsx', r'''import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/context.js'
import { closePark, getParkClosure, reopenPark } from '../api/index.js'
import { OPS_ROLES } from '../config/nav.js'
import './ParkClosurePanel.css'

// One-click "Close park for weather" / "Reopen park" for Admin and the Operations desk (Manager).
// It is a shortcut over the weather form below it: closing logs a Severe weather event, reopening ends it.
// The server checks the role again, so hiding this panel is only for tidiness.
const TYPES = ['Storm', 'Rain', 'Heat', 'Cold']

export default function ParkClosurePanel({ onChanged }) {
  const { user } = useAuth()
  const allowed = OPS_ROLES.includes(user?.role)
  const [status, setStatus] = useState(null) // { closed, weatherType, since } or null while loading
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [weatherType, setWeatherType] = useState('Storm')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      getParkClosure()
        .then((s) => {
          setStatus(s)
          setError('')
        })
        .catch((e) => setError(e.message)),
    [],
  )

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!allowed) return null

  const closed = Boolean(status?.closed)

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      if (closed) {
        await reopenPark({ note })
        setMessage('The park is open again. Sales and rides resume.')
      } else {
        await closePark({ weatherType, note })
        setMessage('The park is closed for weather. Sales and boardings are blocked until you reopen it.')
      }
      setConfirming(false)
      setNote('')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`pcp ${closed ? 'pcp-closed' : ''}`} aria-label="Close or reopen the park for weather">
      <div className="pcp-head">
        <strong>{status == null ? 'Checking the park status...' : closed ? `Park closed for weather (${status.weatherType}, since ${String(status.since ?? '').slice(0, 16)})` : 'Park open'}</strong>
        {status != null && !confirming && (
          <button type="button" className="pt-btn pt-btn-sm" onClick={() => { setMessage(''); setConfirming(true) }}>
            {closed ? 'Reopen park' : 'Close park for weather'}
          </button>
        )}
      </div>

      {confirming && (
        <div className="pcp-confirm">
          <p>
            {closed
              ? 'Reopen the park? Ticket sales for today, purchases, game plays and ride boardings resume.'
              : 'Close the whole park? Ticket sales for today, purchases, game plays and ride boardings stop until you reopen it.'}
          </p>
          {!closed && (
            <label>
              Weather
              <select value={weatherType} onChange={(e) => setWeatherType(e.target.value)} disabled={busy}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Note (saved in the audit log)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} disabled={busy} />
          </label>
          <div className="pcp-actions">
            <button type="button" className="pt-btn pt-btn-sm" onClick={confirm} disabled={busy}>
              {busy ? 'Working...' : closed ? 'Confirm reopen' : 'Confirm close'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {message && <p className="pcp-msg" role="status">{message}</p>}
      {error && <p className="pcp-err" role="alert">{error}</p>}
    </section>
  )
}
''')

create('client/src/components/ParkClosurePanel.css', r'''.pcp { border: 1px solid rgba(128, 128, 128, 0.4); border-radius: 8px; padding: 12px 14px; margin: 0 0 16px; }
.pcp-closed { border-color: #c0392b; background: rgba(192, 57, 43, 0.08); }
.pcp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.pcp-confirm { margin-top: 12px; display: grid; gap: 10px; max-width: 520px; }
.pcp-confirm p { margin: 0; }
.pcp-confirm label { display: grid; gap: 4px; font-size: 0.9rem; }
.pcp-actions { display: flex; gap: 8px; }
.pcp-msg { margin: 10px 0 0; }
.pcp-err { margin: 10px 0 0; color: #c0392b; }
''')

replace(
    'client/src/pages/DataEntryPages.jsx',
    "import RecordManager from '../components/RecordManager.jsx'\n",
    "import { useState } from 'react'\nimport RecordManager from '../components/RecordManager.jsx'\nimport ParkClosurePanel from '../components/ParkClosurePanel.jsx'\n",
)
replace(
    'client/src/pages/DataEntryPages.jsx',
    'export const WeatherPage = () => <RecordManager entity={WEATHER} />\n',
    '''// The one-click close/reopen panel sits above the weather form. Only Admin and the Operations desk see it.
// Changing the park's status remounts the list (key) so the new weather entry shows at once.
export function WeatherPage() {
  const [version, setVersion] = useState(0)
  return (
    <>
      <ParkClosurePanel onChanged={() => setVersion((v) => v + 1)} />
      <RecordManager key={version} entity={WEATHER} />
    </>
  )
}
''',
)

# Faster homepage banner: reuse the fetch for 10 s and re-check every 10 s (was 60 s and 30 s).
replace(
    'client/src/hooks/useParkClock.js',
    '// a minute and then fetched again.\nconst REFRESH_MS = 60 * 1000\n',
    '// ten seconds and then fetched again, so a weather closure shows within about 10 s.\nconst REFRESH_MS = 10 * 1000\n',
)
replace(
    'client/src/hooks/useParkClock.js',
    '// It re-checks every 30 seconds.\n',
    '// It re-checks every 10 seconds.\n',
)
replace(
    'client/src/hooks/useParkClock.js',
    '    }, 30000)\n',
    '    }, 10000)\n',
)

# Plain words for a guest whose sale is refused.
replace(
    'client/src/components/TriggerNotice.jsx',
    '''  trg_Ticket_BI: {
    title: 'That ticket could not be booked',
    help: 'Try another date, or check what your membership covers.',
  },
}
''',
    '''  trg_Ticket_BI: {
    title: 'That ticket could not be booked',
    help: 'Try another date, or check what your membership covers.',
  },
  trg_Ticket_BI_WeatherClosed: {
    title: 'The park is closed for weather',
    help: 'Tickets for today are paused. You can still book a ticket for another day.',
    action: { label: 'Pick another date', tab: 'tickets' },
  },
  trg_Purchase_BI_WeatherClosed: {
    title: 'The park is closed for weather',
    help: 'Nothing was charged. Purchases resume when the park reopens.',
  },
  trg_GamePlay_BI_WeatherClosed: {
    title: 'The park is closed for weather',
    help: 'Nothing was charged. Games reopen when the park reopens.',
  },
}
''',
)

# ---------------------------------------------------------------------------------------------------------------
# 4. Trigger catalog, smoke test, README
# ---------------------------------------------------------------------------------------------------------------
cat = current('server/demos/triggerCatalog.js')
if cat is None:
    failures.append('server/demos/triggerCatalog.js is missing')
elif 'trg_Ticket_BI_WeatherClosed' in cat:
    skipped.append(('server/demos/triggerCatalog.js', 'already applied'))
else:
    start = cat.find('export const TRIGGER_CATALOG = [')
    end = cat.find('\n];\n', start)
    if start < 0 or end < 0:
        failures.append('server/demos/triggerCatalog.js: could not find the end of TRIGGER_CATALOG')
    else:
        entries = '''
  {
    name: 'trg_Ticket_BI_WeatherClosed', table: 'Ticket', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'No ticket for today is sold while a Severe weather event has closed the park. Tickets for a later date stay on sale.',
    errors: ['Tickets for today are not on sale: weather has closed the park'],
  },
  {
    name: 'trg_Purchase_BI_WeatherClosed', table: 'Purchase', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'No food, drink or merchandise purchase is recorded while a Severe weather event has closed the park.',
    errors: ['Purchases are paused: weather has closed the park'],
  },
  {
    name: 'trg_GamePlay_BI_WeatherClosed', table: 'GamePlay', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'No game play is recorded while a Severe weather event has closed the park.',
    errors: ['Games are closed: weather has closed the park'],
  },'''
        changes['server/demos/triggerCatalog.js'] = cat[:end] + entries + cat[end:]

replace(
    'scripts/smoke-test.sh',
    '\necho "== client build"\n',
    '''
if [ -n "$body" ]; then
  # The close and reopen buttons must refuse a visitor who is not logged in.
  for ep in close-park reopen-park; do
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/weather/$ep" 2>/dev/null)
    [ "$code" = "401" ] && pass "POST /api/admin/weather/$ep refuses a visitor (401)" || fail "POST /api/admin/weather/$ep -> $code (expected 401, is parkClosure.js loaded?)"
  done
fi

echo "== client build"
''',
)

replace(
    'README.md',
    '\nDemo\n----\n',
    '''
Closing the park for weather
----------------------------
Admin and the Operations desk (Manager) can close and reopen the park in one click from the **Weather Log** page. Closing logs a Severe weather event: the homepage shows the closed ticker, and the database refuses ride boardings, ticket sales for today, purchases and game plays until the park is reopened. Every close and reopen is saved in the admin audit log. On an existing database, apply `SQL/rules/29_sales_blocked_when_park_closed.sql` first (the command is in the file header).

Demo
----
''',
)

# ---------------------------------------------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------------------------------------------
if failures:
    print('STOPPED, nothing written. Fix these first:')
    for f in failures:
        print('  -', f)
    sys.exit(1)

for path, why in skipped:
    print(f'   skipped {path} ({why})')

if not changes:
    print('Nothing to do: Stage 2 is already applied.')
    sys.exit(0)

if not APPLY:
    print(f'\nDRY RUN OK: {len(changes)} file(s) would change:')
    for p in changes:
        print('  ', p)
    print('\nRun again with --apply to write them.')
    sys.exit(0)

for p, text in changes.items():
    full = os.path.join(ROOT, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8', newline='') as f:
        f.write(text)

print(f'\nWROTE {len(changes)} file(s). Next:')
print('   git diff --stat')
print('   node --check server/routes/parkClosure.js && node --check server/routes/weather.js && node --check server/routes/publicSite.js')
print('   (cd client && npx vite build)')
print("   docker compose exec -T mysql sh -c 'mysql -uroot -p\"$MYSQL_ROOT_PASSWORD\" theme_park' < SQL/rules/29_sales_blocked_when_park_closed.sql")
print('   restart the server (cd server && node --watch index.js)')
