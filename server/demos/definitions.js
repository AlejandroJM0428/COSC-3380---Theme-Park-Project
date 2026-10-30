// One scenario per button on the Trigger Demo page.
// Each run is a real INSERT inside a transaction that is always rolled back.
// `sql` is the statement that fires the trigger. `setup` prepares rows and is not shown as the main step.
// `before` is what the INSERT pretends to send for columns the trigger may overwrite.
// `expect` is 'error' (the trigger should refuse it), 'assign' (the trigger should change a value),
// or 'allow' (the trigger should accept it unchanged).

const PARK = `INSERT IGNORE INTO Park (ParkID, ParkName, Address, OpeningTime, ClosingTime, MaxOccupancy,
  MaxWindMph, MinLightningMiles, MaxTempF, MinTempF, DayPassPrice, ExpressAddOnPrice)
  VALUES (1, 'Demo Park', '1 Demo Way', '08:00:00', '23:00:00', 50000, 30, 8.0, 105, 20, 99.00, 25.00)`;

const customer = (v, height = 170, active = 1) => [
  `INSERT INTO Customer (FirstName, LastName, DOB, HeightCm, IsActive) VALUES ('Demo', '${v}', '1990-01-01', ${height}, ${active})`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const membership = (v, cust, tier) => [
  `INSERT INTO Membership (CustomerID, Tier, StartDate, EndDate, Price, AutoRenew)
   VALUES (@${cust}, '${tier}', '2030-01-01', '2030-12-31', 0, 0)`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const ticket = (v, cust, mem, date) => [
  `INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
   VALUES (@${cust}, ${mem ? '@' + mem : 'NULL'}, '${date}', 0, 0, '2029-12-01 10:00:00')`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const zone = [
  `INSERT INTO Zone (ParkID, ZoneName) VALUES (1, 'ZZ Demo Zone')`,
  `SET @z = LAST_INSERT_ID()`,
];

const ride = (v, name, { indoor = 1, minHeight = 0, express = 0 } = {}) => [
  `INSERT INTO Ride (ZoneID, RideName, RideType, SeatCapacity, MinHeightCm, IsIndoor, IsExpressEligible, Status, IsActive)
   VALUES (@z, '${name}', 'Coaster', 24, ${minHeight}, ${indoor}, ${express}, 'Open', 1)`,
  `SET @${v} = LAST_INSERT_ID()`,
];

const boarding = (rideVar, ticketVar, at = '2030-01-08 12:00:00') =>
  `INSERT INTO RideLog (RideID, EventType, TicketID, WaitMinutes, UsedExpress, LoggedAt)
   VALUES (@${rideVar}, 'Boarding', @${ticketVar}, NULL, 0, '${at}')`;

export const DEMOS = [
  {
    id: 'ride-maintenance-notice',
    spotlight: 1,
    timing: 'AFTER UPDATE',
    purpose: 'Notification / Audit',
    action: 'Inserts a notification',
    shows: 'Automation',
    button: 'Set ride to Maintenance',
    sqlKind: 'UPDATE',
    trigger: 'trg_Ride_AU_Notify',
    title: 'Demo 1: A ride becomes unavailable',
    rule: 'Changing Status to Maintenance makes MySQL insert a notification. The page shows that row.',
    inputs: [
      { label: 'Table', value: 'Ride (RideID 1)' },
      { label: 'New status', value: 'Maintenance' },
    ],
    sql: `UPDATE Ride
SET Status = 'Maintenance'
WHERE RideID = 1`,
    setup: [
      `UPDATE Ride SET Status = 'Open' WHERE RideID = 1`,
      `SELECT COALESCE(MAX(NotificationID), 0) INTO @noteBefore FROM Notification`,
    ],
    expect: 'notify',
    inspect: `SELECT Title, Message, Kind FROM Notification WHERE NotificationID > @noteBefore ORDER BY NotificationID DESC LIMIT 1`,
  },
  {
    id: 'weather-closes',
    spotlight: 3,
    timing: 'BEFORE INSERT',
    purpose: 'Automatic status',
    action: 'Sets ClosesOutdoorRides',
    shows: 'Derived data',
    button: 'Log severe weather',
    trigger: 'trg_WeatherLog_BI',
    title: 'Demo 3: Severe weather closes outdoor rides',
    rule: 'Wind, lightning or temperature past the park limits sets ClosesOutdoorRides to 1.',
    inputs: [
      { label: 'Weather', value: 'Storm' },
      { label: 'Temperature', value: '70 F' },
      { label: 'Wind', value: '60 mph' },
      { label: 'Lightning', value: '0.5 miles' },
      { label: 'ClosesOutdoorRides sent', value: '0 (placeholder)' },
    ],
    sql: `INSERT INTO WeatherLog (ParkID, WeatherType, StartedAt, TemperatureF, WindMph, LightningMiles, ClosesOutdoorRides)
VALUES (1, 'Storm', '2030-06-01 09:00:00', 70, 60, 0.5, 0)`,
    setup: [PARK],
    expect: 'assign',
    before: { ClosesOutdoorRides: '0' },
    inspect: `SELECT ClosesOutdoorRides FROM WeatherLog WHERE WeatherID = LAST_INSERT_ID()`,
  },
  {
    id: 'weather-open',
    trigger: 'trg_WeatherLog_BI',
    title: 'A mild day leaves outdoor rides open',
    rule: 'A reading inside every park limit keeps ClosesOutdoorRides at 0.',
    inputs: [
      { label: 'Weather', value: 'Clear' },
      { label: 'Temperature', value: '75 F' },
      { label: 'Wind', value: '5 mph' },
      { label: 'Lightning', value: '99.9 (none)' },
      { label: 'ClosesOutdoorRides sent', value: '0' },
    ],
    sql: `INSERT INTO WeatherLog (ParkID, WeatherType, StartedAt, TemperatureF, WindMph, LightningMiles, ClosesOutdoorRides)
VALUES (1, 'Clear', '2030-06-02 09:00:00', 75, 5, 99.9, 0)`,
    setup: [PARK],
    expect: 'allow',
    before: { ClosesOutdoorRides: '0' },
    inspect: `SELECT ClosesOutdoorRides FROM WeatherLog WHERE WeatherID = LAST_INSERT_ID()`,
  },
  {
    id: 'ticket-price',
    trigger: 'trg_Ticket_BI',
    title: 'A day pass gets the park price',
    rule: 'The trigger ignores the price sent in the INSERT and stores the day-pass price.',
    inputs: [
      { label: 'Guest', value: 'New customer, no membership' },
      { label: 'Visit date', value: '2030-01-08 (Wednesday)' },
      { label: 'HasExpress sent', value: '0' },
      { label: 'TicketPrice sent', value: '0.00' },
    ],
    sql: `INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
VALUES (@c, NULL, '2030-01-08', 0, 0, '2029-12-01 10:00:00')`,
    setup: [PARK, ...customer('c')],
    expect: 'assign',
    before: { HasExpress: '0', TicketPrice: '0.00' },
    inspect: `SELECT HasExpress, TicketPrice FROM Ticket WHERE TicketID = LAST_INSERT_ID()`,
  },
  {
    id: 'ticket-express',
    trigger: 'trg_Ticket_BI',
    title: 'A Premier membership includes Express',
    rule: 'Premier includes Express, so the trigger forces HasExpress to 1 and the member price to 0.',
    inputs: [
      { label: 'Membership', value: 'Premier' },
      { label: 'HasExpress sent', value: '0' },
      { label: 'TicketPrice sent', value: '0.00' },
    ],
    sql: `INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
VALUES (@c, @m, '2030-01-08', 0, 0, '2029-12-01 10:00:00')`,
    setup: [PARK, ...customer('c'), ...membership('m', 'c', 'Premier')],
    expect: 'assign',
    before: { HasExpress: '0', TicketPrice: '0.00' },
    inspect: `SELECT HasExpress, TicketPrice FROM Ticket WHERE TicketID = LAST_INSERT_ID()`,
  },
  {
    id: 'ticket-capacity',
    trigger: 'trg_Ticket_BI',
    title: 'The park is full for that date',
    rule: 'When valid tickets for the visit date already equal MaxOccupancy, the next ticket is refused.',
    inputs: [
      { label: 'MaxOccupancy', value: '1 for this demo' },
      { label: 'Tickets already sold', value: '1 on 2030-02-06' },
      { label: 'This insert', value: 'A second ticket for the same date' },
    ],
    sql: `INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
VALUES (@c, NULL, '2030-02-06', 0, 0, '2029-12-01 10:00:00')`,
    setup: [PARK, `UPDATE Park SET MaxOccupancy = 1 WHERE ParkID = 1`, ...customer('c'), ...ticket('t', 'c', null, '2030-02-06')],
    expect: 'error',
    errorText: 'Park is at capacity for that date',
  },
  {
    id: 'membership-price',
    trigger: 'trg_Membership_BI',
    title: 'The tier price replaces the price sent',
    rule: 'A new membership stores MembershipTier.AnnualPrice, not the price in the INSERT.',
    inputs: [
      { label: 'Tier', value: 'Plus' },
      { label: 'Price sent', value: '0.00' },
      { label: 'Term', value: '2030-01-01 to 2030-12-31' },
    ],
    sql: `INSERT INTO Membership (CustomerID, Tier, StartDate, EndDate, Price, AutoRenew)
VALUES (@c, 'Plus', '2030-01-01', '2030-12-31', 0, 0)`,
    setup: [PARK, ...customer('c')],
    expect: 'assign',
    before: { Price: '0.00' },
    inspect: `SELECT Tier, Price FROM Membership WHERE MembershipID = LAST_INSERT_ID()`,
  },
  {
    id: 'membership-overlap',
    spotlight: 2,
    timing: 'BEFORE INSERT',
    purpose: 'Validation / Restriction',
    action: 'Rejects invalid data',
    shows: 'Data integrity',
    button: 'Try an overlapping membership',
    trigger: 'trg_Membership_BI',
    title: 'Demo 2: Overlapping membership',
    rule: 'A guest cannot hold two memberships that cover the same day. The trigger rejects the INSERT.',
    inputs: [
      { label: 'Existing term', value: '2030-01-01 to 2030-12-31' },
      { label: 'New term', value: '2030-06-01 to 2031-05-31' },
    ],
    sql: `INSERT INTO Membership (CustomerID, Tier, StartDate, EndDate, Price, AutoRenew)
VALUES (@c, 'Basic', '2030-06-01', '2031-05-31', 0, 0)`,
    setup: [PARK, ...customer('c'), ...membership('m', 'c', 'Plus')],
    expect: 'error',
    errorText: 'This guest already has a membership that overlaps with the selected dates.',
  },
  {
    id: 'ride-height',
    trigger: 'trg_RideLog_BI',
    title: 'The guest is too short',
    rule: 'A boarding is refused when the guest is below the ride minimum height.',
    inputs: [
      { label: 'Guest height', value: '100 cm' },
      { label: 'Ride minimum', value: '120 cm' },
      { label: 'Event', value: 'Boarding' },
    ],
    sql: boarding('r', 't'),
    setup: [PARK, ...customer('c', 100), ...ticket('t', 'c', null, '2030-01-08'), ...zone, ...ride('r', 'ZZ Height Ride', { minHeight: 120 })],
    expect: 'error',
    errorText: 'Guest is below the ride height requirement',
  },
  {
    id: 'ride-maintenance',
    trigger: 'trg_RideLog_BI',
    title: 'The ride is under maintenance',
    rule: 'fn_UnderMaintenance refuses a boarding while a repair covers that time. Ride.Status is not used.',
    inputs: [
      { label: 'Repair', value: 'Open emergency repair from 06:00' },
      { label: 'Boarding time', value: '2030-01-08 12:00' },
    ],
    sql: boarding('r', 't'),
    setup: [
      PARK,
      ...customer('c'),
      ...ticket('t', 'c', null, '2030-01-08'),
      ...zone,
      ...ride('r', 'ZZ Closed Ride'),
      `INSERT INTO Maintenance (MaintType, RideID, StartDate, Reason)
       VALUES ('Emergency Repair', @r, '2030-01-08 06:00:00', 'Demo brake fault')`,
    ],
    expect: 'error',
    errorText: 'Ride was under maintenance',
  },
  {
    id: 'ride-weather',
    trigger: 'trg_RideLog_BI',
    title: 'Weather has closed this outdoor ride',
    rule: 'An outdoor boarding during a closing weather reading is refused. An indoor ride is not.',
    inputs: [
      { label: 'Ride', value: 'Outdoor' },
      { label: 'Weather', value: 'Storm, 60 mph wind, still open-ended' },
      { label: 'Boarding time', value: '2030-01-08 12:00' },
    ],
    sql: boarding('r', 't'),
    setup: [
      PARK,
      ...customer('c'),
      ...ticket('t', 'c', null, '2030-01-08'),
      ...zone,
      ...ride('r', 'ZZ Outdoor Ride', { indoor: 0 }),
      `INSERT INTO WeatherLog (ParkID, WeatherType, StartedAt, TemperatureF, WindMph, LightningMiles, ClosesOutdoorRides)
       VALUES (1, 'Storm', '2030-01-08 09:00:00', 70, 60, 0.5, 0)`,
    ],
    expect: 'error',
    errorText: 'Weather has closed outdoor rides',
  },
  {
    id: 'ride-ok',
    trigger: 'trg_RideLog_BI',
    title: 'A valid boarding is stored',
    rule: 'A tall enough guest, a valid ticket, and an open indoor ride produce a boarding row.',
    inputs: [
      { label: 'Guest height', value: '170 cm' },
      { label: 'Ride minimum', value: '0 cm' },
      { label: 'Ride', value: 'Indoor, in service' },
    ],
    sql: boarding('r', 't'),
    setup: [PARK, ...customer('c'), ...ticket('t', 'c', null, '2030-01-08'), ...zone, ...ride('r', 'ZZ Open Ride')],
    expect: 'allow',
    inspect: `SELECT EventType, UsedExpress FROM RideLog WHERE RideLogID = LAST_INSERT_ID()`,
  },
  {
    id: 'game-price',
    trigger: 'trg_GamePlay_BI',
    title: 'The game price is copied onto the play',
    rule: 'AmountPaid is set from Game.PlayPrice. The 0 in the INSERT is only a placeholder.',
    inputs: [
      { label: 'PlayPrice', value: '4.00' },
      { label: 'AmountPaid sent', value: '0.00' },
    ],
    sql: `INSERT INTO GamePlay (GameID, TicketID, PlayedAt, AmountPaid)
VALUES (@g, @t, '2030-01-08 13:00:00', 0)`,
    setup: [
      PARK,
      ...customer('c'),
      ...ticket('t', 'c', null, '2030-01-08'),
      ...zone,
      `INSERT INTO Game (ZoneID, GameName, PlayPrice, IsActive) VALUES (@z, 'ZZ Demo Game', 4.00, 1)`,
      `SET @g = LAST_INSERT_ID()`,
    ],
    expect: 'assign',
    before: { AmountPaid: '0.00' },
    inspect: `SELECT AmountPaid FROM GamePlay WHERE GamePlayID = LAST_INSERT_ID()`,
  },
  {
    id: 'game-maintenance',
    trigger: 'trg_GamePlay_BI',
    title: 'The game is under maintenance',
    rule: 'A play is refused while a maintenance job covers that time.',
    inputs: [
      { label: 'Repair', value: 'Open job from 06:00' },
      { label: 'Play time', value: '2030-01-08 13:00' },
    ],
    sql: `INSERT INTO GamePlay (GameID, TicketID, PlayedAt, AmountPaid)
VALUES (@g, @t, '2030-01-08 13:00:00', 0)`,
    setup: [
      PARK,
      ...customer('c'),
      ...ticket('t', 'c', null, '2030-01-08'),
      ...zone,
      `INSERT INTO Game (ZoneID, GameName, PlayPrice, IsActive) VALUES (@z, 'ZZ Closed Game', 4.00, 1)`,
      `SET @g = LAST_INSERT_ID()`,
      `INSERT INTO Maintenance (MaintType, GameID, StartDate, Reason)
       VALUES ('Emergency Repair', @g, '2030-01-08 06:00:00', 'Demo outage')`,
    ],
    expect: 'error',
    errorText: 'Game was under maintenance',
  },
  {
    id: 'purchase-price',
    trigger: 'trg_Purchase_BI',
    title: 'The item price is saved on the purchase',
    rule: 'UnitPrice becomes the item price at sale time. Later item-price edits do not change this row.',
    inputs: [
      { label: 'Item price', value: '8.50' },
      { label: 'UnitPrice sent', value: '0.00' },
      { label: 'Quantity', value: '2' },
    ],
    sql: `INSERT INTO Purchase (TicketID, ItemID, Quantity, UnitPrice, PurchasedAt)
VALUES (@t, @item, 2, 0, '2030-01-08 13:00:00')`,
    setup: [
      PARK,
      ...customer('c'),
      ...ticket('t', 'c', null, '2030-01-08'),
      ...zone,
      `INSERT INTO Venue (ZoneID, VenueName, VenueType, ServiceType, IsActive) VALUES (@z, 'ZZ Demo Cafe', 'Restaurant', 'Quick Service', 1)`,
      `SET @venue = LAST_INSERT_ID()`,
      `INSERT INTO Item (VenueID, ItemName, Category, Price, IsAlcoholic, IsActive) VALUES (@venue, 'ZZ Demo Snack', 'Snack', 8.50, 0, 1)`,
      `SET @item = LAST_INSERT_ID()`,
    ],
    expect: 'assign',
    before: { UnitPrice: '0.00' },
    inspect: `SELECT Quantity, UnitPrice FROM Purchase WHERE PurchaseID = LAST_INSERT_ID()`,
  },
  {
    id: 'purchase-retired',
    trigger: 'trg_Purchase_BI',
    title: 'The item is no longer sold',
    rule: 'An inactive item, or an inactive venue, is refused.',
    inputs: [
      { label: 'Item', value: 'Inactive snack' },
      { label: 'UnitPrice sent', value: '0.00' },
    ],
    sql: `INSERT INTO Purchase (TicketID, ItemID, Quantity, UnitPrice, PurchasedAt)
VALUES (@t, @item, 1, 0, '2030-01-08 13:00:00')`,
    setup: [
      PARK,
      ...customer('c'),
      ...ticket('t', 'c', null, '2030-01-08'),
      ...zone,
      `INSERT INTO Venue (ZoneID, VenueName, VenueType, ServiceType, IsActive) VALUES (@z, 'ZZ Old Cafe', 'Restaurant', 'Quick Service', 1)`,
      `SET @venue = LAST_INSERT_ID()`,
      `INSERT INTO Item (VenueID, ItemName, Category, Price, IsAlcoholic, IsActive) VALUES (@venue, 'ZZ Old Snack', 'Snack', 8.50, 0, 0)`,
      `SET @item = LAST_INSERT_ID()`,
    ],
    expect: 'error',
    errorText: 'Item is no longer sold',
  },
];
