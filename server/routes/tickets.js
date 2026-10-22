import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';

// The browser never sends a price. trg_Ticket_BI sets TicketPrice and HasExpress.
route(
  'POST',
  '/api/tickets',
  requireRole('Admin', 'Manager', 'Cashier')(async (ctx) => {
    const { customerId, membershipId, visitDate, hasExpress } = ctx.body;

    if (!Number.isInteger(customerId) || customerId < 1) throw new HttpError(400, 'Customer ID must be a whole number');
    if (membershipId != null && (!Number.isInteger(membershipId) || membershipId < 1)) {
      throw new HttpError(400, 'Membership ID must be a whole number, or empty');
    }
    if (typeof visitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
      throw new HttpError(400, 'Visit date must look like 2026-07-31');
    }

    try {
      const [result] = await pool.query(
        'INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate) VALUES (?, ?, ?, ?, 0, NOW())',
        [customerId, membershipId ?? null, visitDate, hasExpress ? 1 : 0],
      );
      const [rows] = await pool.query(
        'SELECT TicketID, CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate FROM Ticket WHERE TicketID = ?',
        [result.insertId],
      );
      ctx.status = 201;
      return rows[0];
    } catch (err) {
      if (err.errno === 3819) throw new HttpError(400, 'Visit date cannot be before today'); // CHK_Ticket_Purchase
      if (err.errno === 1452) throw new HttpError(400, 'Customer or membership ID does not exist'); // foreign key
      throw err;
    }
  }),
);
