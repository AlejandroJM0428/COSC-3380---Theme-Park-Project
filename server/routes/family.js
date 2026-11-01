import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needDate, needInt, needText, recordId } from '../validate.js';
import { isDate, loadTicket, ticketJson, ticketTriggersThatRan, TICKETS_SQL } from './visitor.js';

// My Family: the logged-in customer (the parent) adds, edits and removes dependents under 18,
// and buys and refunds their tickets. A dependent is an ordinary Customer row with ParentCustomerID set
// and no login. Everything is looked up with the CustomerID stored in the session, never an id from the
// request, and every dependent id is checked against that parent, so one parent can never see or change
// another parent's children (a wrong id gets the same 404 as a missing one).
//
// The rules live in the database: sp_AssertDependent (under 18, at most 6, parent is active and not a
// dependent), trg_Ticket_BI / sp_AssertTicketRules (capacity, price). The price is set by trg_Ticket_BI using
// fn_DependentDiscount, so the browser never sends or works out a price. The quote route below only asks the
// same functions what the price will be. Trigger messages (errno 1644) reach the browser through handleError().

// Shown as "2 of 6". The real limit is enforced by sp_AssertDependent in SQL/16, so keep the two in step.
const MAX_DEPENDENTS = 6;

const SELECT_DEPENDENT = `
  SELECT c.CustomerID, c.FirstName, c.LastName, c.DOB, c.HeightCm,
         TIMESTAMPDIFF(YEAR, c.DOB, CURDATE()) AS Age, d.ConsentedAt
    FROM Customer c
    LEFT JOIN DependentConsent d ON d.CustomerID = c.CustomerID`;

function dependentJson(r, tickets = []) {
  return {
    customerId: r.CustomerID,
    firstName: r.FirstName,
    dob: r.DOB,
    age: Number(r.Age),
    heightCm: r.HeightCm,
    consentedAt: r.ConsentedAt,
    tickets,
  };
}

// One active dependent of this parent, or a 404.
async function loadDependent(parentId, dependentId) {
  const [rows] = await pool.query(
    `${SELECT_DEPENDENT} WHERE c.CustomerID = ? AND c.ParentCustomerID = ? AND c.IsActive = 1`,
    [dependentId, parentId],
  );
  if (rows.length === 0) throw new HttpError(404, 'Dependent not found');
  return rows[0];
}

function parseDependent(body) {
  const b = body ?? {};
  const dob = needDate(b.dob, 'Date of birth');
  if (dob < '1900-01-01') throw new HttpError(400, 'Date of birth is not valid');
  return {
    firstName: needText(b.firstName, 'First name', 50),
    dob,
    heightCm: needInt(b.heightCm, 'Height (cm)', 30, 260),
  };
}

const DB_MESSAGES = { 3819: 'Height must be between 30 and 260 cm' };

// GET /api/family: this parent's active dependents, each with their tickets (newest first, up to 50 each).
route(
  'GET',
  '/api/family',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const [deps] = await pool.query(
      `${SELECT_DEPENDENT} WHERE c.ParentCustomerID = ? AND c.IsActive = 1 ORDER BY c.DOB, c.CustomerID`,
      [parentId],
    );
    const dependents = [];
    for (const d of deps) {
      const [rows] = await pool.query(`${TICKETS_SQL} ORDER BY t.VisitDate DESC, t.TicketID DESC LIMIT 50`, [d.CustomerID]);
      dependents.push(dependentJson(d, rows.map(ticketJson)));
    }
    return { limit: MAX_DEPENDENTS, dependents };
  }),
);

// POST /api/family/dependents  { firstName, dob, heightCm, consent: true }
// Collected: first name, date of birth, height. The last name is copied from the parent. The parent must
// tick the consent box; the consent row (which parent, when) is saved in the same transaction as the child,
// so one cannot exist without the other.
route(
  'POST',
  '/api/family/dependents',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const d = parseDependent(ctx.body);
    if (ctx.body?.consent !== true) throw new HttpError(400, 'The parent must tick the consent box to add a dependent.');

    const [[parent]] = await pool.query('SELECT LastName FROM Customer WHERE CustomerID = ? AND IsActive = 1', [parentId]);
    if (!parent) throw new HttpError(404, 'Your customer profile could not be found');

    const conn = await pool.getConnection();
    let id;
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'INSERT INTO Customer (FirstName, LastName, DOB, HeightCm, IsActive, ParentCustomerID) VALUES (?, ?, ?, ?, 1, ?)',
        [d.firstName, parent.LastName, d.dob, d.heightCm, parentId],
      );
      id = result.insertId;
      await conn.query('INSERT INTO DependentConsent (CustomerID, ParentCustomerID) VALUES (?, ?)', [id, parentId]);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw friendlyDbError(err, DB_MESSAGES);
    } finally {
      conn.release();
    }
    ctx.status = 201;
    return dependentJson(await loadDependent(parentId, id));
  }),
);

// PUT /api/family/dependents/:id  { firstName, dob, heightCm }
// Changing the birth date runs the under-18 rule again (trg_Customer_BU_Dependent).
route(
  'PUT',
  '/api/family/dependents/:id',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const id = recordId(ctx, 'Dependent');
    const d = parseDependent(ctx.body);
    await loadDependent(parentId, id); // 404 if not this parent's
    try {
      await pool.query('UPDATE Customer SET FirstName = ?, DOB = ?, HeightCm = ? WHERE CustomerID = ? AND ParentCustomerID = ?', [
        d.firstName,
        d.dob,
        d.heightCm,
        id,
        parentId,
      ]);
    } catch (err) {
      throw friendlyDbError(err, DB_MESSAGES);
    }
    return dependentJson(await loadDependent(parentId, id));
  }),
);

// DELETE /api/family/dependents/:id
// The row is anonymised, not deleted: Ticket points at Customer with no cascade, and past tickets must stay for
// revenue reporting. The name is replaced and IsActive = 0, which also frees one of the parent's 6 places.
// Refused while the child still has an upcoming ticket that has not been refunded.
route(
  'DELETE',
  '/api/family/dependents/:id',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const id = recordId(ctx, 'Dependent');
    await loadDependent(parentId, id);
    const [[{ upcoming }]] = await pool.query(
      `SELECT COUNT(*) AS upcoming FROM v_CustomerTickets
        WHERE CustomerID = ? AND VisitDate >= CURDATE() AND IsRefunded = 0`,
      [id],
    );
    if (upcoming > 0) throw new HttpError(409, 'Refund their upcoming tickets before removing them.');
    await pool.query(
      "UPDATE Customer SET FirstName = 'Removed', LastName = 'Dependent', IsActive = 0 WHERE CustomerID = ? AND ParentCustomerID = ?",
      [id, parentId],
    );
    return { removed: id };
  }),
);

// Dependents turn into adults: the discount rules only look at the birth date on the visit day, so the
// route refuses a ticket for a visit on or after the 18th birthday.
async function assertStillUnder18(dependentId, visitDate) {
  const [[r]] = await pool.query('SELECT TIMESTAMPDIFF(YEAR, DOB, ?) AS age FROM Customer WHERE CustomerID = ?', [visitDate, dependentId]);
  if (r.age >= 18) throw new HttpError(400, 'They will be 18 or older on that date and need their own account.');
}

// GET /api/family/dependents/:id/quote?visitDate=2026-11-14&hasExpress=0|1
// The price the database will charge, from the same functions the ticket trigger uses. Nothing is saved.
route(
  'GET',
  '/api/family/dependents/:id/quote',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const id = recordId(ctx, 'Dependent');
    const visitDate = needDate(ctx.query.visitDate, 'Visit date');
    const express = ctx.query.hasExpress === '1' || ctx.query.hasExpress === 'true' ? 1 : 0;
    await loadDependent(parentId, id);
    const [[q]] = await pool.query(
      `SELECT fn_TicketPrice(NULL, 0) AS dayPass,
              fn_TicketPrice(NULL, ?) AS beforeDiscount,
              fn_DependentDiscountPct(?, ?) AS discountPct,
              fn_DependentDiscount(?, NULL, ?) AS discount`,
      [express, id, visitDate, id, visitDate],
    );
    const beforeDiscount = Number(q.beforeDiscount);
    const discount = Number(q.discount);
    return {
      visitDate,
      hasExpress: Boolean(express),
      dayPass: Number(q.dayPass),
      expressAddOn: Math.round((beforeDiscount - Number(q.dayPass)) * 100) / 100,
      discountPct: Number(q.discountPct),
      discount,
      total: Math.max(0, Math.round((beforeDiscount - discount) * 100) / 100),
    };
  }),
);

// POST /api/family/dependents/:id/tickets  { visitDate, hasExpress }
// The ticket has no membership of its own; trg_Ticket_BI takes the discount off the price. The browser never
// sends a price.
route(
  'POST',
  '/api/family/dependents/:id/tickets',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const id = recordId(ctx, 'Dependent');
    const { visitDate, hasExpress } = ctx.body ?? {};
    if (!isDate(visitDate)) throw new HttpError(400, 'Choose a valid visit date.');
    const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');
    if (visitDate < today) throw new HttpError(400, 'Visit date cannot be in the past.');
    await loadDependent(parentId, id);
    await assertStillUnder18(id, visitDate);

    let insertId;
    try {
      const [result] = await pool.query(
        'INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate) VALUES (?, NULL, ?, ?, 0, NOW())',
        [id, visitDate, hasExpress ? 1 : 0],
      );
      insertId = result.insertId;
    } catch (err) {
      if (err.errno === 3819) throw new HttpError(400, 'Visit date cannot be before the purchase date'); // CHK_Ticket_Purchase
      throw err;
    }

    ctx.status = 201;
    const ticket = ticketJson(await loadTicket(id, insertId));
    const [[{ discount }]] = await pool.query('SELECT fn_DependentDiscount(?, NULL, ?) AS discount', [id, visitDate]);
    const firedTriggers = (await ticketTriggersThatRan(ticket, visitDate)).map((t) =>
      t.name === 'trg_Ticket_BI' && Number(discount) > 0
        ? { ...t, result: `Capacity checked. Dependent discount of $${Number(discount).toFixed(2)} taken off. Price set to $${ticket.ticketPrice.toFixed(2)}.` }
        : t,
    );
    return { ...ticket, customerId: id, discount: Number(discount), firedTriggers };
  }),
);

// POST /api/family/tickets/:id/refund
// Same rules as a member refunding their own ticket (future visit only, once), but the ticket must belong to one
// of this parent's dependents.
route(
  'POST',
  '/api/family/tickets/:id/refund',
  requireRole('Customer')(async (ctx) => {
    const parentId = ctx.session.CustomerID;
    const id = recordId(ctx, 'Ticket');
    const [[own]] = await pool.query(
      `SELECT t.CustomerID FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID
        WHERE t.TicketID = ? AND c.ParentCustomerID = ?`,
      [id, parentId],
    );
    if (!own) throw new HttpError(404, 'Ticket not found'); // also hides other families' tickets
    const ticket = await loadTicket(own.CustomerID, id);
    if (ticket.IsRefunded) throw new HttpError(409, 'This ticket has already been refunded.');
    const [[{ today }]] = await pool.query('SELECT CURDATE() AS today');
    if (ticket.VisitDate <= today) throw new HttpError(400, 'Only tickets for a future visit can be refunded.');
    try {
      await pool.query(
        "INSERT INTO TicketRefund (TicketID, WeatherID, RefundedAt, RefundReason) VALUES (?, NULL, NOW(), 'Refunded by customer')",
        [id],
      );
    } catch (err) {
      if (err.errno === 1062) throw new HttpError(409, 'This ticket has already been refunded.');
      throw err;
    }
    return { ...ticketJson(await loadTicket(own.CustomerID, id)), customerId: own.CustomerID };
  }),
);
