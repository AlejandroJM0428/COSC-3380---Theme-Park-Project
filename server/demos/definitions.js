// Trigger demos. Each demo builds its own throwaway rows inside a transaction, tries one insert,
// and the route ALWAYS rolls back, so nothing is saved. The browser sends no SQL.
// `expected` is the exact SIGNAL text from SQL/theme-park-schema.sql.
// `bad` should be blocked by a trigger. `good` should succeed.
// Fixed dates: 2030-01-05 is a Saturday, 2030-01-08 a Tuesday, 2030-02-06 a Wednesday.

const PARK = `INSERT IGNORE INTO Park (ParkID, ParkName, Address, OpeningTime, ClosingTime, MaxOccupancy,
  MaxWindMph, MinLightningMiles, MaxTempF, MinTempF, DayPassPrice, ExpressAddOnPrice)
  VALUES (1, 'Demo Park', '1 Demo Way', '08:00:00', '23:00:00', 50000, 30, 8.0, 105, 20, 99.00, 25.00)`;

const customer = (v, height = 170) => [
  `INSERT INTO Customer (FirstName, LastName, DOB, HeightCm, IsActive) VALUES ('Demo', 'Guest', '1990-01-01', ${height}, 1)`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const membership = (v, cust, tier) => [
  `INSERT INTO Membership (CustomerID, Tier, StartDate, EndDate, Price, AutoRenew)
   VALUES (@${cust}, '${tier}', '2030-01-01', '2030-12-31', 0, 0)`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const ticket = (cust, mem, date) =>
  `INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
   VALUES (@${cust}, ${mem ? '@' + mem : 'NULL'}, '${date}', 0, 0, '2029-12-01 10:00:00')`;

const ticketVar = (v, cust, mem, date) => [ticket(cust, mem, date), `SET @${v} = LAST_INSERT_ID()`];

const zone = [
  `INSERT INTO Zone (ParkID, ZoneName) VALUES (1, 'ZZ Demo Zone')`,
  `SET @z = LAST_INSERT_ID()`,
];

const ride = (v, name, { indoor = 1, minHeight = 0 } = {}) => [
  `INSERT INTO Ride (ZoneID, RideName, RideType, SeatCapacity, MinHeightCm, IsIndoor, IsExpressEligible, Status, IsActive)
   VALUES (@z, '${name}', 'Coaster', 24, ${minHeight}, ${indoor}, 0, 'Open', 1)`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const boarding = (rideVar, ticketVar_, at = '2030-01-08 12:00:00') =>
  `INSERT INTO RideLog (RideID, EventType, TicketID, WaitMinutes, UsedExpress, LoggedAt)
   VALUES (@${rideVar}, 'Boarding', @${ticketVar_}, NULL, 0, '${at}')`;

export const DEMOS = [
  {
    id: 'capacity',
    title: 'Park capacity',
    proves: 'A ticket is refused when the park is full for that date.',
    expected: 'Park is at capacity for that date',
    allowedText: 'Ticket saved (a different date still has room).',
    setup: [
      PARK,
      `UPDATE Park SET MaxOccupancy = 1 WHERE ParkID = 1`,
      ...customer('c'),
      ticket('c', null, '2030-02-06'),
    ],
    bad: [ticket('c', null, '2030-02-06')],
    good: [ticket('c', null, '2030-02-07')],
  },
  {
    id: 'basic-weekend',
    title: 'Basic membership on a weekend',
    proves: 'A Basic membership cannot be used on a Saturday or Sunday.',
    expected: 'This membership tier is valid on weekdays only',
    allowedText: 'Ticket saved (Tuesday is a weekday).',
    setup: [PARK, ...customer('c'), ...membership('m', 'c', 'Basic')],
    bad: [ticket('c', 'm', '2030-01-05')],
    good: [ticket('c', 'm', '2030-01-08')],
  },
  {
    id: 'membership-owner',
    title: 'Membership belongs to someone else',
    proves: 'A ticket cannot use another customer\'s membership.',
    expected: 'Membership does not belong to this customer',
    allowedText: 'Ticket saved (the owner used their own membership).',
    setup: [PARK, ...customer('c1'), ...customer('c2'), ...membership('m', 'c1', 'Plus')],
    bad: [ticket('c2', 'm', '2030-01-08')],
    good: [ticket('c1', 'm', '2030-01-08')],
  },
  {
    id: 'membership-expired',
    title: 'Membership not active on the visit date',
    proves: 'A ticket cannot be sold for a date outside the membership term.',
    expected: 'Membership is not active on the visit date',
    allowedText: 'Ticket saved (the date is inside the term).',
    setup: [PARK, ...customer('c'), ...membership('m', 'c', 'Plus')],
    bad: [ticket('c', 'm', '2031-01-07')],
    good: [ticket('c', 'm', '2030-01-08')],
  },
  {
    id: 'ride-height',
    title: 'Guest below the ride height limit',
    proves: 'A boarding is refused when the guest is shorter than the ride minimum.',
    expected: 'Guest is below the ride height requirement',
    allowedText: 'Boarding saved (guest is tall enough).',
    setup: [
      PARK,
      ...customer('c', 100),
      ...ticketVar('t', 'c', null, '2030-01-08'),
      ...zone,
      ...ride('rA', 'ZZ Demo Ride A', { minHeight: 120 }),
    ],
    bad: [boarding('rA', 't')],
    good: [`UPDATE Customer SET HeightCm = 150 WHERE CustomerID = @c`, boarding('rA', 't')],
  },
  {
    id: 'ride-maintenance',
    title: 'Ride under maintenance',
    proves: 'A boarding is refused while the ride has an open maintenance job.',
    expected: 'Ride was under maintenance',
    allowedText: 'Boarding saved (a different ride is running).',
    setup: [
      PARK,
      ...customer('c'),
      ...ticketVar('t', 'c', null, '2030-01-08'),
      ...zone,
      ...ride('rA', 'ZZ Demo Ride A'),
      ...ride('rB', 'ZZ Demo Ride B'),
      `INSERT INTO Maintenance (MaintType, RideID, StartDate, EndDate, Outcome, Reason)
       VALUES ('Emergency Repair', @rA, '2030-01-08 06:00:00', NULL, NULL, 'Demo brake fault')`,
    ],
    bad: [boarding('rA', 't')],
    good: [boarding('rB', 't')],
  },
  {
    id: 'ride-weather',
    title: 'Weather closes outdoor rides',
    proves: 'An outdoor ride cannot be boarded during a storm that passes the park limits.',
    expected: 'Weather has closed outdoor rides',
    allowedText: 'Boarding saved (the indoor ride is not affected).',
    setup: [
      PARK,
      ...customer('c'),
      ...ticketVar('t', 'c', null, '2030-01-08'),
      ...zone,
      ...ride('rA', 'ZZ Demo Outdoor Ride', { indoor: 0 }),
      ...ride('rB', 'ZZ Demo Indoor Ride', { indoor: 1 }),
      `INSERT INTO WeatherLog (ParkID, WeatherType, StartedAt, EndedAt, TemperatureF, WindMph, LightningMiles, ClosesOutdoorRides)
       VALUES (1, 'Storm', '2030-01-08 09:00:00', NULL, 70, 60, 0.5, 0)`,
    ],
    bad: [boarding('rA', 't')],
    good: [boarding('rB', 't')],
  },
];
