import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, optDateTime, recordId } from '../validate.js';

// Game plays (revenue): list, get, add, edit, delete.
// The browser never sends the amount: trg_GamePlay_BI copies it from Game.PlayPrice and refuses games that are retired or
// under maintenance. An edit goes through trg_GamePlay_BU, which re-checks what changed (ticket, time, game) and keeps
// the amount the guest paid unless the game itself changes.

// Role matrix (TA fixes plan): the retail desk and the ticket booth own these records. The operations manager has no access.
const CAN_READ = ['Admin', 'RetailManager', 'Cashier'];
const CAN_WRITE = ['Admin', 'RetailManager', 'Cashier'];
const CAN_EDIT = ['Admin', 'RetailManager']; // the booth adds plays; changing a finished one is the retail desk's call, like deleting one
const CAN_DELETE = ['Admin', 'RetailManager'];

const SELECT_PLAY = `
  SELECT gp.GamePlayID, gp.TicketID, gp.GameID, CONCAT(c.FirstName, ' ', c.LastName) AS CustomerName,
         g.GameName, gp.AmountPaid, gp.PlayedAt
    FROM GamePlay gp
    JOIN Game g     ON g.GameID = gp.GameID
    JOIN Ticket t   ON t.TicketID = gp.TicketID
    JOIN Customer c ON c.CustomerID = t.CustomerID`;

async function loadPlay(id) {
  const [rows] = await pool.query(`${SELECT_PLAY} WHERE gp.GamePlayID = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, 'Game play not found');
  return rows[0];
}

export function parsePlay(body) {
  const b = body ?? {};
  return {
    ticketId: needId(b.ticketId, 'Ticket ID'),
    gameId: needId(b.gameId, 'Game'),
    playedAt: optDateTime(b.playedAt, 'Play time'), // empty = now
  };
}

route(
  'GET',
  '/api/game-plays',
  requireRole(...CAN_READ)(async () => {
    const [rows] = await pool.query(`${SELECT_PLAY} ORDER BY gp.PlayedAt DESC, gp.GamePlayID DESC LIMIT 500`);
    return rows;
  }),
);

// Registered BEFORE /:id so "lookups" is not read as an id.
route(
  'GET',
  '/api/game-plays/lookups',
  requireRole(...CAN_READ)(async () => {
    const [games] = await pool.query(
      `SELECT GameID AS id, CONCAT(GameName, ' ($', FORMAT(PlayPrice, 2), ')') AS name
         FROM Game
        WHERE IsActive = 1
        ORDER BY GameName`,
    );
    return { games };
  }),
);

route(
  'GET',
  '/api/game-plays/:id',
  requireRole(...CAN_READ)(async (ctx) => loadPlay(recordId(ctx, 'Game play'))),
);

route(
  'POST',
  '/api/game-plays',
  requireRole(...CAN_WRITE)(async (ctx) => {
    const p = parsePlay(ctx.body);
    try {
      const [result] = await pool.query(
        'INSERT INTO GamePlay (GameID, TicketID, PlayedAt, AmountPaid) VALUES (?, ?, COALESCE(?, NOW()), 0)',
        [p.gameId, p.ticketId, p.playedAt],
      );
      ctx.status = 201;
      return await loadPlay(result.insertId);
    } catch (err) {
      throw friendlyDbError(err, { 1452: 'Ticket ID or game does not exist' });
    }
  }),
);

// PUT changes a game play. An empty time keeps the time it already had. The database sets the amount (trg_GamePlay_BU).
route(
  'PUT',
  '/api/game-plays/:id',
  requireRole(...CAN_EDIT)(async (ctx) => {
    const id = recordId(ctx, 'Game play');
    await loadPlay(id); // 404 if missing
    const p = parsePlay(ctx.body);
    try {
      await pool.query(
        'UPDATE GamePlay SET GameID = ?, TicketID = ?, PlayedAt = COALESCE(?, PlayedAt) WHERE GamePlayID = ?',
        [p.gameId, p.ticketId, p.playedAt, id],
      );
    } catch (err) {
      throw friendlyDbError(err, { 1452: 'Ticket ID or game does not exist' });
    }
    return loadPlay(id);
  }),
);

// DELETE removes the row for good. Nothing else points at a game play.
route(
  'DELETE',
  '/api/game-plays/:id',
  requireRole(...CAN_DELETE)(async (ctx) => {
    const id = recordId(ctx, 'Game play');
    await loadPlay(id); // 404 if missing
    try {
      await pool.query('DELETE FROM GamePlay WHERE GamePlayID = ?', [id]);
    } catch (err) {
      throw friendlyDbError(err);
    }
    return { deleted: id };
  }),
);
