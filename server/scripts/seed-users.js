import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';

// Safe to run twice: three rows, no duplicates. An existing account keeps its password
// unless you set the matching SEED_*_PASSWORD variable.
const ACCOUNTS = [
  { username: 'admin', role: 'Admin', env: 'SEED_ADMIN_PASSWORD' },
  { username: 'manager', role: 'Manager', env: 'SEED_MANAGER_PASSWORD' },
  { username: 'cashier', role: 'Cashier', env: 'SEED_CASHIER_PASSWORD' },
];

for (const account of ACCOUNTS) {
  const chosen = process.env[account.env];
  const [existing] = await pool.query('SELECT UserID FROM AppUser WHERE Username = ?', [account.username]);

  if (existing.length > 0 && !chosen) {
    console.log(`${account.username}: already exists, password unchanged`);
    continue;
  }

  const password = chosen || randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, IsActive)
     VALUES (?, ?, ?, NULL, 1) AS new
     ON DUPLICATE KEY UPDATE PasswordHash = new.PasswordHash, Role = new.Role, IsActive = 1`,
    [account.username, hash, account.role],
  );
  console.log(`${account.username} (${account.role}): ${chosen ? 'password set from env' : 'password ' + password}`);
}

await pool.end();
