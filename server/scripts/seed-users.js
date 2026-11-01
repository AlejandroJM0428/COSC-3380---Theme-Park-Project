import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';

// Staff logins. Every login belongs to a real employee and is named after them: first name + last four digits
// of the employee id (Mason Roberts, employee 1000028 -> mason0028). There are no role-named logins (admin, manager...).
//
// Guard: once the park has any staff login this script does nothing. Staff logins are managed on the Users page.
// FORCE_SEED=1 skips the guard (an empty database, or a deliberate RESEED).
//
// What a run does:
//   1. Makes sure every role has at least one active named login, adding one for an unlinked active employee when a role has none.
//   2. RESEED=1: every named login gets a NEW random password of its own (printed once, never stored), and every other
//      staff login (old role-named ones, anything not named after its employee) is switched off. Customers are not touched.
//      Without RESEED, new logins share SEED_STAFF_PASSWORD (or one random password) and existing logins keep their password.
//   3. Prints a username / role / password table and one suggested test login per role.
//
//   docker compose exec -e FORCE_SEED=1 -e RESEED=1 app npm run seed
const ROLES = [
  { role: 'Admin', titles: ['Manager'] },
  { role: 'Manager', titles: ['Manager'] },
  { role: 'RetailManager', titles: ['Manager'] },
  { role: 'HRManager', titles: ['Manager'] },
  { role: 'MaintenanceManager', titles: ['Manager'] },
  { role: 'Cashier', titles: ['Shop Associate'] },
  { role: 'MaintenanceWorker', titles: ['Technician'] },
  { role: 'RestaurantWorker', titles: ['Cook', 'Server'] },
];

const plain = (t) => t.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const canonical = (first, id) => `${plain(first) || 'user'}${String(id).padStart(4, '0').slice(-4)}`;
const newPassword = () => randomBytes(9).toString('base64url');

const [[{ staffLogins }]] = await pool.query("SELECT COUNT(*) AS staffLogins FROM AppUser WHERE CustomerID IS NULL AND Role <> 'Customer'");
if (staffLogins > 0 && process.env.FORCE_SEED !== '1') {
  console.log(`Nothing to do: ${staffLogins} staff login(s) already exist. Manage them on the Users page. (FORCE_SEED=1 runs the seed anyway.)`);
  await pool.end();
  process.exit(0);
}

const RESEED = process.env.RESEED === '1';
const shared = process.env.SEED_STAFF_PASSWORD || newPassword();
const rows = []; // { username, role, who, password }

// Staff logins that are named after their employee.
const loadNamed = async () => {
  const [staff] = await pool.query(
    `SELECT u.UserID, u.Username, u.Role, u.IsActive, e.EmployeeID, e.FirstName, e.LastName, e.JobTitle
       FROM AppUser u JOIN Employee e ON e.EmployeeID = u.EmployeeID
      WHERE u.CustomerID IS NULL AND u.Role <> 'Customer' ORDER BY u.UserID`,
  );
  return staff.filter((s) => s.Username === canonical(s.FirstName, s.EmployeeID) || s.Username.startsWith(`${canonical(s.FirstName, s.EmployeeID)}.`));
};

// 1. Every role gets at least one active named login.
let named = await loadNamed();
const [taken] = await pool.query('SELECT Username FROM AppUser');
const usernames = new Set(taken.map((r) => r.Username));
for (const { role, titles } of ROLES) {
  if (named.some((s) => s.Role === role && s.IsActive)) continue;
  const [people] = await pool.query(
    `SELECT e.EmployeeID, e.FirstName, e.LastName FROM Employee e
      WHERE e.JobTitle IN (?) AND e.IsActive = 1 AND e.HireDate <= CURDATE()
        AND NOT EXISTS (SELECT 1 FROM AppUser u WHERE u.EmployeeID = e.EmployeeID)
      ORDER BY e.EmployeeID LIMIT 1`,
    [titles],
  );
  const p = people[0];
  if (!p) { console.log(`${role}: no free active ${titles.join('/')} employee found, no login made`); continue; }
  let username = canonical(p.FirstName, p.EmployeeID);
  if (usernames.has(username)) username += `.${p.EmployeeID}`;
  usernames.add(username);
  const password = RESEED ? newPassword() : shared;
  await pool.query(
    'INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, IsActive) VALUES (?, ?, ?, ?, 1)',
    [username, await bcrypt.hash(password, 10), role, p.EmployeeID],
  );
  rows.push({ username, role, who: `${p.FirstName} ${p.LastName} (employee #${p.EmployeeID})`, password });
}

// 2. RESEED: new password for every named login, switch off everything else.
named = await loadNamed();
if (RESEED) {
  const done = new Set(rows.map((r) => r.username));
  for (const s of named) {
    if (!s.IsActive || done.has(s.Username)) continue;
    const password = newPassword();
    await pool.query('UPDATE AppUser SET PasswordHash = ? WHERE UserID = ?', [await bcrypt.hash(password, 10), s.UserID]);
    rows.push({ username: s.Username, role: s.Role, who: `${s.FirstName} ${s.LastName} (employee #${s.EmployeeID})`, password });
  }
  const keep = [...named.map((s) => s.Username), ...rows.map((r) => r.username)];
  const [off] = await pool.query(
    'UPDATE AppUser SET IsActive = 0 WHERE CustomerID IS NULL AND Role <> \'Customer\' AND IsActive = 1 AND Username NOT IN (?)',
    [keep],
  );
  console.log(`Switched off ${off.affectedRows} other staff login(s) (role-named or not named after their employee).`);
}

// 3. Output.
rows.sort((a, b) => ROLES.findIndex((r) => r.role === a.role) - ROLES.findIndex((r) => r.role === b.role) || a.username.localeCompare(b.username));
console.log('\nusername | role | employee | password');
for (const r of rows) console.log(`${r.username} | ${r.role} | ${r.who} | ${r.password}`);
if (rows.length === 0) console.log('(no new or changed logins; existing logins keep their passwords)');
console.log('\nOne login per role to test the portals:');
for (const { role } of ROLES) {
  const r = rows.find((x) => x.role === role);
  console.log(`  ${role.padEnd(20)} ${r ? `${r.username}  ${r.password}` : '(see the table above, or no password printed this run)'}`);
}
if (RESEED) console.log('\nSave the passwords above now. They are not stored anywhere else.');

await pool.end();
