import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, needInt, optDateTime, recordId } from '../validate.js';

// Food and shop purchases (revenue): list, get, add, delete.
// trg_Purchase_BU refuses edits, so there is no PUT. A mistake is fixed by deleting the entry (managers only)
// and adding it again. The browser never sends the price: trg_Purchase_BI copies it from the item.
// trg_Purchase_BI also refuses retired items and venues under maintenance (errno 1644 -> handleError).

const CAN_READ = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'Manager', 'RetailManager', 'Cashier'];
const CAN_DELETE = ['Admin', 'Manager', 'RetailManager'];

const SELECT_PURCHASE = `
  SELECT p.PurchaseID, p.TicketID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
         v.VenueName, i.ItemName, p.Quantity, p.UnitPrice,
         ROUND(p.Quantity * p.UnitPrice, 2) AS LineTotal, p.PurchasedAt
    FROM Purchase p
    JOIN Item i     ON i.ItemID = p.ItemID
    JOIN Venue v    ON v.VenueID = i.VenueID
    JOIN Ticket t   ON t.TicketID = p.TicketID
    JOIN Customer c ON c.CustomerID = t.CustomerID`;

async function loadPurchase(id) {
  const [rows] = await pool.query(`${SELECT_PURCHASE} WHERE p.PurchaseID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Purchase not found');
  return rows[0];
}

export function parsePurchase(body) {
  const b = body ?? {};
  return {
    ticketId: needId(b.ticketId, 'Ticket ID'),
    itemId: needId(b.itemId, 'Item'),
    quantity: needInt(b.quantity, 'Quantity', 1, 1000),
    purchasedAt: optDateTime(b.purchasedAt, 'Purchase time'), // empty = now
  };
}

// GET /api/purchases. Newest first, first 500.
route(
  'GET',
  '/api/purchases',
  requireRole(...CAN_READ)(async () => {
    const [rows] = await pool.query(`${SELECT_PURCHASE} ORDER BY p.PurchasedAt DESC, p.PurchaseID DESC LIMIT 500`);
    return rows;
  }),
);

// Dropdown choices. Registered BEFORE /:id so "lookups" is not read as an id.
route(
  'GET',
  '/api/purchases/lookups',
  requireRole(...CAN_READ)(async () => {
    const [items] = await pool.query(
      `SELECT i.ItemID AS id, CONCAT(v.VenueName, ' - ', i.ItemName, ' ($', FORMAT(i.Price, 2), ')') AS name
         FROM Item i
         JOIN Venue v ON v.VenueID = i.VenueID
        WHERE i.IsActive = 1 AND v.IsActive = 1
        ORDER BY v.VenueName, i.ItemName`,
    );
    return { items };
  }),
);

route(
  'GET',
  '/api/purchases/:id',
  requireRole(...CAN_READ)(async (ctx) => loadPurchase(recordId(ctx, 'Purchase'))),
);

route(
  'POST',
  '/api/purchases',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const p = parsePurchase(ctx.body);
    try {
      const [result] = await pool.query(
        'INSERT INTO Purchase (TicketID, ItemID, Quantity, UnitPrice, PurchasedAt) VALUES (?, ?, ?, 0, COALESCE(?, NOW()))',
        [p.ticketId, p.itemId, p.quantity, p.purchasedAt],
      );
      ctx.status = 201;
      return await loadPurchase(result.insertId);
    } catch (err) {
      throw friendlyDbError(err, { 1452: 'Ticket ID or item does not exist' });
    }
  }),
);

// DELETE removes the row for good. Nothing else points at a purchase.
route(
  'DELETE',
  '/api/purchases/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = recordId(ctx, 'Purchase');
    await loadPurchase(id); // 404 if missing
    try {
      await pool.query('DELETE FROM Purchase WHERE PurchaseID = ?', [id]);
    } catch (err) {
      throw friendlyDbError(err);
    }
    return { deleted: id };
  }),
);
