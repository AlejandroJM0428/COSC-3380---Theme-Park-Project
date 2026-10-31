// Usage: node scripts/set-password.js <username> <password> [role]
// Existing user: replaces the password (role is optional and left alone unless given).
// New user: role is required (Admin, Manager or Cashier) and the account is created.
// Run from the server/ folder.
import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const ROLES = ['Admin', 'Manager', 'Cashier'];
const [username, password, role] = process.argv.slice(2);

if (!username || !password || (role && !ROLES.includes(role))) {
  console.error('Usage: node scripts/set-password.js <username> <password> [Admin|Manager|Cashier]');
  await pool.end();
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const [rows] = await pool.query('SELECT UserID FROM AppUser WHERE Username = ?', [username]);

if (rows.length) {
  await pool.query(
    role
      ? 'UPDATE AppUser SET PasswordHash = ?, Role = ?, IsActive = 1 WHERE Username = ?'
      : 'UPDATE AppUser SET PasswordHash = ?, IsActive = 1 WHERE Username = ?',
    role ? [hash, role, username] : [hash, username],
  );
  console.log(`Password updated for ${username}`);
} else if (role) {
  await pool.query(
    'INSERT INTO AppUser (Username, PasswordHash, Role, EmployeeID, IsActive) VALUES (?, ?, ?, NULL, 1)',
    [username, hash, role],
  );
  console.log(`Created ${username} (${role})`);
} else {
  console.log(`No user named ${username}. Add a role to create it: Admin, Manager or Cashier`);
}
await pool.end();
