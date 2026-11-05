import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pool } from '../db.js';

// Gives every employee who has no login a staff login, so all staff are counted as staff accounts.
//   docker compose exec app npm run create-logins
// Safe to run again: only employees with no login are touched. Existing logins and passwords are not changed.
//
// Username: first name + last four digits of the EmployeeID (same rule as the Users page). If taken, ".<EmployeeID>" is added.
// Password: a new random one per login, printed once and saved to server/new-logins.csv. Never stored in plain text in the database.
// Status: the login is active when the employee is active, inactive when the employee has left.
// Role by job title (the app has no Ride Operator / Game Attendant / Performer role, so those get the self-service RestaurantWorker
// role, which only shows the person their own shifts, hours, pay and ratings):
const ROLE_BY_TITLE = {
  Manager: 'Manager',
  'Shop Associate': 'Cashier',
  Technician: 'MaintenanceWorker',
  Cook: 'RestaurantWorker',
  Server: 'RestaurantWorker',
  'Ride Operator': 'RestaurantWorker',
  'Game Attendant': 'RestaurantWorker',
  Performer: 'RestaurantWorker',
};

const plain = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const canonical = (first, id) => `${plain(first) || 'user'}${String(id).padStart(4, '0').slice(-4)}`;
const newPassword = () => randomBytes(9).toString('base64url');

const [people] = await pool.query(
  `SELECT e.EmployeeID, e.FirstName, e.LastName, e.JobTitle, e.IsActive
     FROM Employee e
    WHERE NOT EXISTS (SELECT 1 FROM AppUser u WHERE u.EmployeeID = e.EmployeeID)
    ORDER BY e.EmployeeID`,
);
const [taken] = await pool.query('SELECT Username FROM AppUser');
const usernames = new Set(taken.map((r) => r.Username.toLowerCase()));

const rows = [];
for (const p of people) {
  const role = ROLE_BY_TITLE[p.JobTitle];
  if (!role) { console.log(`Skipped ${p.FirstName} ${p.LastName} (#${p.EmployeeID}): no role for job title ${p.JobTitle}`); continue; }
  let username = canonical(p.FirstName, p.EmployeeID);
  if (usernames.has(username)) username += `.${p.EmployeeID}`;
  usernames.add(username);
  const password = newPassword();
  await pool.query(
    'INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, CustomerID, IsActive) VALUES (?, ?, ?, ?, NULL, ?)',
    [username, await bcrypt.hash(password, 10), role, p.EmployeeID, p.IsActive ? 1 : 0],
  );
  rows.push({ username, role, who: `${p.FirstName} ${p.LastName}`, id: p.EmployeeID, active: p.IsActive ? 'active' : 'inactive', password });
}

console.log('\nusername | role | employee | status | password');
for (const r of rows) console.log(`${r.username} | ${r.role} | ${r.who} (#${r.id}) | ${r.active} | ${r.password}`);
if (rows.length) {
  writeFileSync('new-logins.csv', ['username,role,employee,employee_id,status,password', ...rows.map((r) => `${r.username},${r.role},${r.who},${r.id},${r.active},${r.password}`)].join('\n') + '\n');
  console.log(`\nCreated ${rows.length} login(s). Passwords saved to new-logins.csv (keep it private, delete it when done).`);
} else {
  console.log('Every employee already has a login.');
}
await pool.end();
