import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, needInt, optDateTime, recordId } from '../validate.js';

// Food and shop purchases (revenue): list, get, add, edit, delete.
// The browser never sends the price: trg_Purchase_BI copies it from the item. An edit goes through trg_Purchase_BU, which
// re-checks what changed (ticket, time, item) and keeps the price the guest paid unless the item itself changes.
// Both triggers refuse retired items and venues under maintenance (errno 1644 -> handleError).

// Role matrix (TA fixes plan): the retail desk and the ticket booth own these records. The operations manager has no access.
const CAN_READ = ['Admin', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'RetailManager', 'Cashier'];
const CAN_EDIT = ['Admin', 'RetailManager']; // the booth adds sales; changing a finished sale is the retail desk's call, like deleting one
const CAN_DELETE = ['Admin', 'RetailManager'];

const SELECT_PURCHASE = `
  SELECT p.PurchaseID, p.TicketID, p.ItemID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
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
      `SELECT i.ItemID AS id, i.IsAlcoholic AS alcoholic,
              CONCAT(v.VenueName, ' - ', i.ItemName, ' ($', FORMAT(i.Price, 2), ')', IF(i.IsAlcoholic = 1, ' [alcohol, 21+]', '')) AS name
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

// PUT changes a purchase. An empty time keeps the time it already had. The database sets the price (trg_Purchase_BU).
route(
  'PUT',
  '/api/purchases/:id',
  requireRole(...CAN_EDIT)(async (ctx) => {
    const id = recordId(ctx, 'Purchase');
    await loadPurchase(id); // 404 if missing
    const p = parsePurchase(ctx.body);
    try {
      await pool.query(
        'UPDATE Purchase SET TicketID = ?, ItemID = ?, Quantity = ?, PurchasedAt = COALESCE(?, PurchasedAt) WHERE PurchaseID = ?',
        [p.ticketId, p.itemId, p.quantity, p.purchasedAt, id],
      );
    } catch (err) {
      throw friendlyDbError(err, { 1452: 'Ticket ID or item does not exist' });
    }
    return loadPurchase(id);
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
