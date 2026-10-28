import { route } from '../router.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireRole } from '../middleware/requireRole.js';
import { friendlyDbError, needId, needInt, needText, oneOf } from '../validate.js';

// Rides, Games & Venues (Admin only): list, get, add, edit, deactivate.
// One page covers three tables, so each row has a key like "Ride-5" (kind + id).
// "Delete" is a soft delete (IsActive = 0), because tickets, ride logs and maintenance point at these rows.
// Ride.Status is stored as Open when a ride is added. Live availability is v_RideAvailability, not this column.

const CAN_USE = ['Admin'];
const KINDS = ['Ride', 'Game', 'Venue'];
const RIDE_TYPES = ['Coaster', 'Dark Ride', 'Water Ride', 'Carousel', 'Train', 'Simulator', 'Walkthrough'];
const VENUE_TYPES = ['Restaurant', 'Gift Shop'];
const SERVICE_TYPES = ['Table Service', 'Quick Service', 'Snack Cart'];

const FRIENDLY = {
  1062: 'Another ride, game or venue in that zone already has this name',
  1452: 'That zone does not exist',
  3819: 'A value breaks a database rule. Check the seats, height, price and venue type',
};

// Splits "Ride-5" into { kind: 'Ride', id: 5 }, or a 400.
function parseKey(key) {
  const m = /^(Ride|Game|Venue)-(\d{1,10})$/.exec(String(key ?? ''));
  if (!m || Number(m[2]) < 1) throw new HttpError(400, 'Facility key must look like Ride-5');
  return { kind: m[1], id: Number(m[2]) };
}

// Every row has the same shape. Fields that do not apply to a kind are null.
function shape(kind, r) {
  const base = {
    FacilityKey: `${kind}-${r.ID}`,
    Kind: kind,
    ItemID: r.ID,
    ZoneID: r.ZoneID,
    ZoneName: r.ZoneName,
    Name: r.Name,
    IsActive: r.IsActive,
    RideType: null,
    SeatCapacity: null,
    MinHeightCm: null,
    IsIndoor: null,
    IsExpressEligible: null,
    PlayPrice: null,
    VenueType: null,
    ServiceType: null,
    Details: '',
  };
  if (kind === 'Ride') {
    return {
      ...base,
      RideType: r.RideType,
      SeatCapacity: r.SeatCapacity,
      MinHeightCm: r.MinHeightCm,
      IsIndoor: r.IsIndoor,
      IsExpressEligible: r.IsExpressEligible,
      Details: `${r.RideType}, ${r.SeatCapacity} seats, ${r.MinHeightCm ? `min ${r.MinHeightCm} cm` : 'no height limit'}`,
    };
  }
  if (kind === 'Game') {
    return { ...base, PlayPrice: r.PlayPrice, Details: `$${Number(r.PlayPrice).toFixed(2)} per play` };
  }
  return {
    ...base,
    VenueType: r.VenueType,
    ServiceType: r.ServiceType,
    Details: r.ServiceType ? `${r.VenueType}, ${r.ServiceType}` : r.VenueType,
  };
}

const SELECT = {
  Ride: `SELECT r.RideID AS ID, r.ZoneID, z.ZoneName, r.RideName AS Name, r.RideType, r.SeatCapacity,
                r.MinHeightCm, r.IsIndoor, r.IsExpressEligible, r.IsActive
           FROM Ride r JOIN Zone z ON z.ZoneID = r.ZoneID`,
  Game: `SELECT g.GameID AS ID, g.ZoneID, z.ZoneName, g.GameName AS Name, g.PlayPrice, g.IsActive
           FROM Game g JOIN Zone z ON z.ZoneID = g.ZoneID`,
  Venue: `SELECT v.VenueID AS ID, v.ZoneID, z.ZoneName, v.VenueName AS Name, v.VenueType, v.ServiceType, v.IsActive
            FROM Venue v JOIN Zone z ON z.ZoneID = v.ZoneID`,
};
const ID_COLUMN = { Ride: 'r.RideID', Game: 'g.GameID', Venue: 'v.VenueID' };
const ACTIVE_COLUMN = { Ride: 'r.IsActive', Game: 'g.IsActive', Venue: 'v.IsActive' };

async function loadFacility(kind, id) {
  const [rows] = await pool.query(`${SELECT[kind]} WHERE ${ID_COLUMN[kind]} = ?`, [id]);
  if (rows.length === 0) throw new HttpError(404, `${kind} not found`);
  return shape(kind, rows[0]);
}

// Checks the body and returns only the columns we allow for that kind.
export function parseFacility(kind, body) {
  const b = body ?? {};
  const common = {
    zoneId: needId(b.zoneId, 'Zone'),
    name: needText(b.name, 'Name', 100),
    isActive: b.isActive === false ? 0 : 1,
  };
  if (kind === 'Ride') {
    return {
      ...common,
      rideType: oneOf(b.rideType, 'Ride type', RIDE_TYPES),
      seatCapacity: needInt(b.seatCapacity, 'Seat capacity', 1, 2000),
      minHeightCm: needInt(b.minHeightCm, 'Minimum height (cm, 0 = none)', 0, 250),
      isIndoor: b.isIndoor ? 1 : 0,
      isExpressEligible: b.isExpressEligible ? 1 : 0,
    };
  }
  if (kind === 'Game') {
    const price = typeof b.playPrice === 'string' && b.playPrice.trim() !== '' ? Number(b.playPrice) : b.playPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 9999.99) {
      throw new HttpError(400, 'Play price must be a number from 0 to 9999.99');
    }
    return { ...common, playPrice: Math.round(price * 100) / 100 };
  }
  const venueType = oneOf(b.venueType, 'Venue type', VENUE_TYPES);
  // The database requires a service type for restaurants and none for gift shops.
  const serviceType = venueType === 'Restaurant' ? oneOf(b.serviceType, 'Service type (required for restaurants)', SERVICE_TYPES) : null;
  return { ...common, venueType, serviceType };
}

// GET /api/facilities?kind=Ride|Game|Venue&status=active|inactive (both optional). Sorted by kind, then name.
route(
  'GET',
  '/api/facilities',
  requireRole(...CAN_USE)(async (ctx) => {
    const { kind, status } = ctx.query;
    if (kind !== undefined && !KINDS.includes(kind)) throw new HttpError(400, 'Kind must be Ride, Game or Venue');
    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      throw new HttpError(400, 'Status must be active or inactive');
    }
    const out = [];
    for (const k of KINDS) {
      if (kind && kind !== k) continue;
      const where = status === 'active' ? ` WHERE ${ACTIVE_COLUMN[k]} = 1` : status === 'inactive' ? ` WHERE ${ACTIVE_COLUMN[k]} = 0` : '';
      const [rows] = await pool.query(`${SELECT[k]}${where} ORDER BY Name LIMIT 500`);
      out.push(...rows.map((r) => shape(k, r)));
    }
    return out;
  }),
);

// Dropdown choices. Registered BEFORE /:id so "lookups" is not read as a key.
route(
  'GET',
  '/api/facilities/lookups',
  requireRole(...CAN_USE)(async () => {
    const [zones] = await pool.query('SELECT ZoneID AS id, ZoneName AS name FROM Zone ORDER BY ZoneName');
    return { zones };
  }),
);

route(
  'GET',
  '/api/facilities/:id',
  requireRole(...CAN_USE)(async (ctx) => {
    const { kind, id } = parseKey(ctx.params.id);
    return loadFacility(kind, id);
  }),
);

route(
  'POST',
  '/api/facilities',
  requireRole(...CAN_USE)(async (ctx) => {
    const kind = oneOf(ctx.body?.kind, 'Kind', KINDS);
    const f = parseFacility(kind, ctx.body);
    try {
      let result;
      if (kind === 'Ride') {
        [result] = await pool.query(
          `INSERT INTO Ride (ZoneID, RideName, RideType, SeatCapacity, MinHeightCm, IsIndoor, IsExpressEligible, Status, IsActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', ?)`,
          [f.zoneId, f.name, f.rideType, f.seatCapacity, f.minHeightCm, f.isIndoor, f.isExpressEligible, f.isActive],
        );
      } else if (kind === 'Game') {
        [result] = await pool.query('INSERT INTO Game (ZoneID, GameName, PlayPrice, IsActive) VALUES (?, ?, ?, ?)', [
          f.zoneId,
          f.name,
          f.playPrice,
          f.isActive,
        ]);
      } else {
        [result] = await pool.query(
          'INSERT INTO Venue (ZoneID, VenueName, VenueType, ServiceType, IsActive) VALUES (?, ?, ?, ?, ?)',
          [f.zoneId, f.name, f.venueType, f.serviceType, f.isActive],
        );
      }
      ctx.status = 201;
      return await loadFacility(kind, result.insertId);
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
  }),
);

// The kind of an existing row cannot change: the key says which table it lives in.
route(
  'PUT',
  '/api/facilities/:id',
  requireRole(...CAN_USE)(async (ctx) => {
    const { kind, id } = parseKey(ctx.params.id);
    const f = parseFacility(kind, ctx.body);
    await loadFacility(kind, id); // 404 if missing
    try {
      if (kind === 'Ride') {
        await pool.query(
          `UPDATE Ride SET ZoneID = ?, RideName = ?, RideType = ?, SeatCapacity = ?, MinHeightCm = ?,
                           IsIndoor = ?, IsExpressEligible = ?, IsActive = ? WHERE RideID = ?`,
          [f.zoneId, f.name, f.rideType, f.seatCapacity, f.minHeightCm, f.isIndoor, f.isExpressEligible, f.isActive, id],
        );
      } else if (kind === 'Game') {
        await pool.query('UPDATE Game SET ZoneID = ?, GameName = ?, PlayPrice = ?, IsActive = ? WHERE GameID = ?', [
          f.zoneId,
          f.name,
          f.playPrice,
          f.isActive,
          id,
        ]);
      } else {
        await pool.query(
          'UPDATE Venue SET ZoneID = ?, VenueName = ?, VenueType = ?, ServiceType = ?, IsActive = ? WHERE VenueID = ?',
          [f.zoneId, f.name, f.venueType, f.serviceType, f.isActive, id],
        );
      }
    } catch (err) {
      throw friendlyDbError(err, FRIENDLY);
    }
    return loadFacility(kind, id);
  }),
);

// DELETE deactivates (soft delete). Nothing is removed from Ride, Game or Venue.
route(
  'DELETE',
  '/api/facilities/:id',
  requireRole(...CAN_USE)(async (ctx) => {
    const { kind, id } = parseKey(ctx.params.id);
    await loadFacility(kind, id);
    const table = { Ride: ['Ride', 'RideID'], Game: ['Game', 'GameID'], Venue: ['Venue', 'VenueID'] }[kind];
    await pool.query(`UPDATE ${table[0]} SET IsActive = 0 WHERE ${table[1]} = ?`, [id]);
    return loadFacility(kind, id);
  }),
);
