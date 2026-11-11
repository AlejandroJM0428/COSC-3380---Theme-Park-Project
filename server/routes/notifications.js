import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// Public read for the homepage (Syed). No login needed: it only exposes v_ActiveNotifications.
route('GET', '/api/notifications', async () => {
  const [rows] = await pool.query(
    'SELECT NotificationID, Kind, Severity, Title, Message, CreatedAt, ExpiresAt FROM v_ActiveNotifications LIMIT 20',
  );
  return rows;
});

// Promos are entered by hand. trg_Ride_AU_Notify inserts a Maintenance row when a ride status changes to Maintenance.
const SEVERITIES = ['Info', 'Warning', 'Alert'];

route(
  'POST',
  '/api/notifications',
  requireRole('Admin', 'RetailManager')(async (ctx) => {
    const { severity = 'Info', title, message, expiresAt } = ctx.body;
    if (!SEVERITIES.includes(severity)) throw new HttpError(400, `Severity must be one of: ${SEVERITIES.join(', ')}`);
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100) throw new HttpError(400, 'Title is required (100 characters or fewer)');
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 255) throw new HttpError(400, 'Message is required (255 characters or fewer)');
    let expires = null;
    if (expiresAt != null && expiresAt !== '') {
      const m = typeof expiresAt === 'string' && expiresAt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
      if (!m) throw new HttpError(400, 'Expiry must look like 2026-11-30 18:00');
      expires = `${m[1]} ${m[2]}:00`;
    }
    const [result] = await pool.query(
      "INSERT INTO Notification (Kind, Severity, Title, Message, ExpiresAt) VALUES ('Promo', ?, ?, ?, ?)",
      [severity, title.trim(), message.trim(), expires],
    );
    ctx.status = 201;
    return { NotificationID: result.insertId };
  }),
);

// Edit a promo: text, importance and end date. Only hand-entered Promo rows can be edited;
// the rows the triggers create (maintenance, sold out, weather) are rewritten by the database itself.
route(
  'PUT',
  '/api/notifications/:id',
  requireRole('Admin', 'RetailManager')(async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Notification ID must be a whole number');
    const { severity = 'Info', title, message, expiresAt } = ctx.body;
    if (!SEVERITIES.includes(severity)) throw new HttpError(400, `Severity must be one of: ${SEVERITIES.join(', ')}`);
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100) throw new HttpError(400, 'Title is required (100 characters or fewer)');
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 255) throw new HttpError(400, 'Message is required (255 characters or fewer)');
    let expires = null;
    if (expiresAt != null && expiresAt !== '') {
      const m = typeof expiresAt === 'string' && expiresAt.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
      if (!m) throw new HttpError(400, 'Expiry must look like 2026-11-30 18:00');
      expires = `${m[1]} ${m[2]}:00`;
    }
    const [[row]] = await pool.query('SELECT Kind, IsActive FROM Notification WHERE NotificationID = ?', [id]);
    if (!row || !row.IsActive) throw new HttpError(404, 'Notification not found');
    if (row.Kind !== 'Promo') throw new HttpError(400, 'Only promos can be edited. This notice is created by the database.');
    await pool.query('UPDATE Notification SET Severity = ?, Title = ?, Message = ?, ExpiresAt = ? WHERE NotificationID = ?', [
      severity,
      title.trim(),
      message.trim(),
      expires,
      id,
    ]);
    return { ok: true };
  }),
);

// Dismiss a notification (soft delete: IsActive = 0).
route(
  'DELETE',
  '/api/notifications/:id',
  requireRole('Admin', 'RetailManager')(async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Notification ID must be a whole number');
    const [result] = await pool.query('UPDATE Notification SET IsActive = 0 WHERE NotificationID = ?', [id]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Notification not found');
    return { ok: true };
  }),
);
