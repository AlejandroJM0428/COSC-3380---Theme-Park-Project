import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';

// One account per role. Safe to run twice: one row per account, no duplicates. An existing account keeps
// its password unless you set the matching SEED_*_PASSWORD variable.
//
// RESEED=1 is the one-time reseed for the final: every account below gets a NEW random password of its own
// (printed once, never stored in the repo), and every other staff login is switched off. Customer logins are not touched.
//   docker compose exec -e RESEED=1 app npm run seed
//
// Accounts with `titles` are linked to a real Employee row (the nth active employee with one of
// those job titles), so the employee portal can show that person's own shifts and jobs.
// Without RESEED, accounts of the same kind share a password variable, to keep the demo easy to hand out.
const ACCOUNTS = [
  { username: 'admin', role: 'Admin', env: 'SEED_ADMIN_PASSWORD' },
  { username: 'manager', role: 'Manager', env: 'SEED_MANAGER_PASSWORD' },
  { username: 'cashier', role: 'Cashier', env: 'SEED_CASHIER_PASSWORD' },
  { username: 'retail', role: 'RetailManager', env: 'SEED_RETAIL_PASSWORD' },
  { username: 'hr', role: 'HRManager', env: 'SEED_HR_PASSWORD' },
  { username: 'maintmgr', role: 'MaintenanceManager', env: 'SEED_MAINTMGR_PASSWORD' },
  { username: 'tech', role: 'MaintenanceWorker', env: 'SEED_TECH_PASSWORD', titles: ['Technician'], nth: 0 },
  { username: 'cook', role: 'RestaurantWorker', env: 'SEED_COOK_PASSWORD', titles: ['Cook'], nth: 0 },
];

const RESEED = process.env.RESEED === '1';
const passwords = new Map(); // env name -> password, so accounts sharing a variable share a password (own key per account when reseeding)

for (const account of ACCOUNTS) {
  let employee = null;
  if (account.titles) {
    const [found] = await pool.query(
      `SELECT EmployeeID, FirstName, LastName FROM Employee
        WHERE JobTitle IN (?) AND IsActive = 1 ORDER BY EmployeeID LIMIT 1 OFFSET ?`,
      [account.titles, account.nth],
    );
    employee = found[0] ?? null;
    if (!employee) console.log(`${account.username}: no active ${account.titles.join('/')} employee found, left unlinked`);
  }
  const employeeId = employee?.EmployeeID ?? null;
  const who = employee ? ` -> ${employee.FirstName} ${employee.LastName} (employee #${employeeId})` : '';

  const chosen = process.env[account.env];
  const [existing] = await pool.query('SELECT UserID FROM AppUser WHERE Username = ?', [account.username]);

  if (existing.length > 0 && !chosen && !RESEED) {
    // Keep the password, but still attach the employee link.
    if (employeeId) await pool.query('UPDATE AppUser SET EmployeeID = ? WHERE Username = ?', [employeeId, account.username]);
    console.log(`${account.username}: already exists, password unchanged${who}`);
    continue;
  }

  const key = RESEED ? account.username : account.env;
  if (!passwords.has(key)) passwords.set(key, chosen || randomBytes(9).toString('base64url'));
  const password = passwords.get(key);
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, IsActive)
     VALUES (?, ?, ?, ?, 1) AS new
     ON DUPLICATE KEY UPDATE PasswordHash = new.PasswordHash, Role = new.Role,
                             EmployeeID = new.EmployeeID, IsActive = 1`,
    [account.username, hash, account.role, employeeId],
  );
  console.log(`${account.username} (${account.role}): ${chosen ? 'password set from env' : 'password ' + password}${who}`);
}

if (RESEED) {
  const [off] = await pool.query(
    'UPDATE AppUser SET IsActive = 0 WHERE CustomerID IS NULL AND IsActive = 1 AND Username NOT IN (?)',
    [ACCOUNTS.map((a) => a.username)],
  );
  console.log(`Switched off ${off.affectedRows} other staff login(s).`);
  console.log('Save the passwords above now. They are not stored anywhere else.');
}

await pool.end();
