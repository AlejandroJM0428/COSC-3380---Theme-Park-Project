import { route } from '../router.js';
import { pool } from '../db.js';

// Public site data for the homepage and the public pages. No login needed, so it only ever
// contains things any visitor may see: prices, hours, membership tiers for sale, rides (name,
// zone, type, height rule, Open/Closed), venues and games (name, zone, price per play).
//
// It NEVER contains wait times: no RideLog query, no wait columns. Wait times are members only
// and live in /api/visitor/dashboard. Notices come from the existing public /api/notifications.

const CACHE_MS = 15 * 1000; // anonymous and read-only, so a short cache protects the database
let cache = { at: 0, data: null };

const hhmm = (t) => String(t ?? '').slice(0, 5);

// Mirrors the generated columns on Membership: IncludesExpress = Premier, AnyDayAccess = not Basic.
function tierJson(r) {
  const anyDayAccess = r.Tier !== 'Basic';
  const includesExpress = r.Tier === 'Premier';
  return {
    tier: r.Tier,
    annualPrice: Number(r.AnnualPrice),
    anyDayAccess,
    includesExpress,
    benefits: [
      anyDayAccess ? 'Any-day admission' : 'Weekday admission',
      includesExpress ? 'Express queues included' : 'Standard queues included',
    ],
  };
}

async function loadSite() {
  const [[parkRows], [tierRows], [rideRows], [venueRows], [gameRows]] = await Promise.all([
    pool.query('SELECT DayPassPrice, ExpressAddOnPrice, OpeningTime, ClosingTime FROM Park WHERE ParkID = 1'),
    pool.query('SELECT Tier, AnnualPrice FROM MembershipTier WHERE IsForSale = 1 ORDER BY AnnualPrice'),
    pool.query(
      `SELECT a.RideID, a.RideName, a.ZoneName, a.CurrentState, r.RideType, r.MinHeightCm, r.IsExpressEligible
         FROM v_RideAvailability a
         JOIN Ride r ON r.RideID = a.RideID
        WHERE a.CurrentState <> 'Closed - Retired'
        ORDER BY (a.CurrentState = 'Open') DESC, a.ZoneName, a.RideName`,
    ),
    pool.query(
      `SELECT v.VenueID, v.VenueName, v.VenueType, v.ServiceType, z.ZoneName
         FROM Venue v
         JOIN Zone z ON z.ZoneID = v.ZoneID
        WHERE v.IsActive = 1
        ORDER BY v.VenueType, v.VenueName`,
    ),
    pool.query(
      `SELECT g.GameID, g.GameName, g.PlayPrice, z.ZoneName
         FROM Game g
         JOIN Zone z ON z.ZoneID = g.ZoneID
        WHERE g.IsActive = 1
        ORDER BY z.ZoneName, g.GameName`,
    ),
  ]);

  const park = parkRows[0];
  return {
    prices: park ? { dayPass: Number(park.DayPassPrice), expressAddOn: Number(park.ExpressAddOnPrice) } : null,
    hours: park ? { open: hhmm(park.OpeningTime), close: hhmm(park.ClosingTime) } : null,
    tiers: tierRows.map(tierJson),
    rides: rideRows.map((r) => ({
      rideId: r.RideID,
      rideName: r.RideName,
      zoneName: r.ZoneName,
      rideType: r.RideType,
      minHeightCm: r.MinHeightCm > 0 ? r.MinHeightCm : null,
      // Express-eligible rides are the park's headline rides (the "Premier rides" on /rides).
      expressEligible: Boolean(r.IsExpressEligible),
      // Any "Closed - ..." reason (maintenance, weather) is shown as plain Closed.
      state: r.CurrentState === 'Open' ? 'Open' : 'Closed',
    })),
    venues: venueRows.map((v) => ({
      venueId: v.VenueID,
      venueName: v.VenueName,
      venueType: v.VenueType,
      serviceType: v.ServiceType ?? null,
      zoneName: v.ZoneName,
    })),
    games: gameRows.map((g) => ({
      gameId: g.GameID,
      gameName: g.GameName,
      playPrice: Number(g.PlayPrice),
      zoneName: g.ZoneName,
    })),
  };
}

// GET /api/public/site
route('GET', '/api/public/site', async () => {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await loadSite();
  cache = { at: Date.now(), data };
  return data;
});
