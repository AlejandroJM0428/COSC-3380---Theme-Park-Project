// Drill-down for one report row. The SQL is fixed here; the clicked row only supplies bound values.
// Each lookup stops after CAP + 1 rows so a busy day never returns the whole table.

const CAP = 20;
const LIM = CAP + 1;

const TICKET = { table: 'Ticket', note: 'One row per ticket sold.' };
const REFUND = { table: 'TicketRefund', note: 'Refunded tickets. Reports that say "valid" leave these out.' };
const MEMBERSHIP = { table: 'Membership', note: 'One row per membership sold.' };
const PURCHASE = { table: 'Purchase', note: 'One row per food or shop sale.' };
const ITEM = { table: 'Item', note: 'The menu or shop item that was sold.' };
const VENUE = { table: 'Venue', note: 'The restaurant or gift shop.' };
const GAME = { table: 'GamePlay', note: 'One row per game played.' };
const RIDE = { table: 'Ride', note: 'The ride this row is about.' };
const RIDELOG = { table: 'RideLog', note: 'One row per boarding or wait reading.' };
const MAINT = { table: 'Maintenance', note: 'One row per maintenance job.' };
const SHIFT = { table: 'Shift', note: 'One row per shift worked.' };
const EMPLOYEE = { table: 'Employee', note: 'The staff member.' };
const ZONE = { table: 'Zone', note: 'The area of the park.' };
const WEATHER = { table: 'WeatherLog', note: 'One row per weather event.' };
const CUSTOMER = { table: 'Customer', note: 'The guest.' };

const DOW = { Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7 };
const ENDS = { '0-30 days': [0, 30], '31-60 days': [31, 60], '61-90 days': [61, 90] };

function clean(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  const out = {};
  for (const k of Object.keys(row).slice(0, 24)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) continue;
    const v = row[k];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (typeof v === 'string' && v.trim() && v.length <= 80) out[k] = v.trim();
  }
  return out;
}

const monthStart = (row) => (/^\d{4}-\d{2}$/.test(String(row.Month ?? '')) ? `${row.Month}-01` : null);
const day = (row, key) => (/^\d{4}-\d{2}-\d{2}$/.test(String(row[key] ?? '').slice(0, 10)) ? String(row[key]).slice(0, 10) : null);
const text = (row, key) => (typeof row[key] === 'string' ? row[key] : null);

function pack(sources, label, sql, params, note = null, rangeColumn = null, totals = null) {
  return { sources, label, sql, params, note, rangeColumn, totals };
}
function tablesOnly(sources, note) {
  return pack(sources, 'Source tables', null, [], note);
}

const notRefunded = 'NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)';

// Same definitions as v_MembershipSummary: Active = today is inside the term, Expiring = it ends within 30 days.
// So "Active now" in the report = the Active + Expiring rows here.
const MEMBERSHIP_STATUS = `CASE WHEN m.EndDate < CURDATE() THEN 'Expired'
        WHEN m.StartDate > CURDATE() THEN 'Upcoming'
        WHEN m.EndDate <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'Expiring'
        ELSE 'Active' END`;

// Totals over ALL matching rows, as one SQL statement (see totalsDetailSql). The expressions are fixed text and
// read the columns of the detail query. `match` is the report column the total must equal (checked on screen).
const TIER_TOTALS = [
  { label: 'Memberships', expr: 'COUNT(*)', match: 'Memberships' },
  { label: 'Price paid', expr: 'COALESCE(SUM(Price), 0)', money: true, match: 'MembershipRevenue' },
  { label: 'Active now', expr: 'COALESCE(SUM(CURDATE() BETWEEN StartDate AND EndDate), 0)', match: 'ActiveNow' },
  { label: 'Expiring in 30 days', expr: 'COALESCE(SUM(EndDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)), 0)', match: 'ExpiringIn30Days' },
];

// Day tickets: the detail lists valid AND refunded tickets (Status column), so the totals split them the way v_DailyAttendance does.
const DAY_TOTALS = [
  { label: 'Valid tickets', expr: "COALESCE(SUM(Status = 'Valid'), 0)", match: 'ValidTickets' },
  { label: 'Refunded tickets', expr: "COALESCE(SUM(Status = 'Refunded'), 0)", match: 'RefundedTickets' },
  { label: 'Ticket revenue (valid only)', expr: "COALESCE(SUM(CASE WHEN Status = 'Valid' THEN TicketPrice ELSE 0 END), 0)", money: true, match: 'TicketRevenue' },
];

// Retail sales: one row per purchase line, so these equal the Orders, Units and Revenue of v_RetailSalesByVenue.
const RETAIL_TOTALS = [
  { label: 'Orders', expr: 'COUNT(*)', match: 'Orders' },
  { label: 'Units', expr: 'COALESCE(SUM(Quantity), 0)', match: 'Units' },
  { label: 'Revenue', expr: 'COALESCE(SUM(Quantity * UnitPrice), 0)', money: true, match: 'Revenue' },
];

function ticketsOnDay(date) {
  return pack(
    [TICKET, REFUND],
    `Tickets on ${date}`,
    `SELECT t.TicketID, t.CustomerID, t.VisitDate, t.TicketPrice,
            IF(rf.TicketID IS NULL, 'Valid', 'Refunded') AS Status
       FROM Ticket t
       LEFT JOIN TicketRefund rf ON rf.TicketID = t.TicketID
      WHERE t.VisitDate = ?
      ORDER BY t.TicketID
      LIMIT ${LIM}`,
    [date],
    null,
    't.VisitDate',
    DAY_TOTALS,
  );
}

function ticketsInMonth(start, extra = '') {
  return pack(
    [TICKET, REFUND],
    `Tickets in ${start.slice(0, 7)}`,
    `SELECT t.TicketID, t.CustomerID, t.VisitDate, t.TicketPrice
       FROM Ticket t
      WHERE t.VisitDate >= ? AND t.VisitDate < DATE_ADD(?, INTERVAL 1 MONTH)
        AND ${notRefunded}
        ${extra}
      ORDER BY t.VisitDate, t.TicketID
      LIMIT ${LIM}`,
    [start, start],
    null,
    't.VisitDate',
  );
}

function facilityJobs(name, start) {
  const params = [name];
  let month = '';
  if (start) {
    month = ' AND m.StartDate >= ? AND m.StartDate < DATE_ADD(?, INTERVAL 1 MONTH)';
    params.push(start, start);
  }
  return pack(
    [MAINT, RIDE, { table: 'Game', note: 'Used when the job is for a game.' }, VENUE],
    `Maintenance jobs for ${name}`,
    `SELECT m.MaintenanceID, m.MaintType, m.StartDate, m.EndDate, m.Outcome, m.RepairCost
       FROM Maintenance m
       LEFT JOIN Ride r ON r.RideID = m.RideID
       LEFT JOIN Game g ON g.GameID = m.GameID
       LEFT JOIN Venue v ON v.VenueID = m.VenueID
      WHERE COALESCE(r.RideName, g.GameName, v.VenueName) = ?${month}
      ORDER BY m.StartDate DESC
      LIMIT ${LIM}`,
    params,
    null,
    'm.StartDate',
  );
}

function jobsInMonth(start) {
  return pack(
    [MAINT],
    `Maintenance jobs started in ${start.slice(0, 7)}`,
    `SELECT m.MaintenanceID, COALESCE(r.RideName, g.GameName, v.VenueName) AS FacilityName,
            m.MaintType, m.StartDate, m.EndDate, m.RepairCost
       FROM Maintenance m
       LEFT JOIN Ride r ON r.RideID = m.RideID
       LEFT JOIN Game g ON g.GameID = m.GameID
       LEFT JOIN Venue v ON v.VenueID = m.VenueID
      WHERE m.StartDate >= ? AND m.StartDate < DATE_ADD(?, INTERVAL 1 MONTH)
      ORDER BY m.StartDate DESC
      LIMIT ${LIM}`,
    [start, start],
    null,
    'm.StartDate',
  );
}

function boardings(name, start) {
  const params = [name];
  let month = '';
  if (start) {
    month = ' AND l.LoggedAt >= ? AND l.LoggedAt < DATE_ADD(?, INTERVAL 1 MONTH)';
    params.push(start, start);
  }
  return pack(
    [RIDELOG, RIDE],
    `Boardings for ${name}`,
    `SELECT l.RideLogID, l.LoggedAt, l.EventType
       FROM RideLog l
       JOIN Ride r ON r.RideID = l.RideID
      WHERE r.RideName = ? AND l.EventType = 'Boarding'${month}
      ORDER BY l.LoggedAt DESC
      LIMIT ${LIM}`,
    params,
    null,
    'l.LoggedAt',
  );
}

function byTier(row) {
  const tier = text(row, 'Tier');
  if (!tier) return null;
  if (tier === 'Day Pass') {
    return pack(
      [TICKET, MEMBERSHIP],
      'Day-pass tickets (no membership)',
      `SELECT t.TicketID, t.CustomerID, t.VisitDate, t.TicketPrice
         FROM Ticket t
        WHERE t.MembershipID IS NULL AND ${notRefunded}
        ORDER BY t.VisitDate DESC
        LIMIT ${LIM}`,
      [],
      null,
      't.VisitDate',
    );
  }
  return pack(
    [MEMBERSHIP, CUSTOMER],
    `${tier} memberships`,
    `SELECT m.MembershipID, c.FirstName, c.LastName, m.StartDate, m.EndDate, m.Price, m.AutoRenew,
            ${MEMBERSHIP_STATUS} AS Status
       FROM Membership m
       JOIN Customer c ON c.CustomerID = m.CustomerID
      WHERE m.Tier = ?
      ORDER BY m.StartDate DESC
      LIMIT ${LIM}`,
    [tier],
    null,
    'm.StartDate',
    TIER_TOTALS,
  );
}

function byItem(row) {
  const name = text(row, 'ItemName');
  const venue = text(row, 'VenueName');
  const category = text(row, 'Category');
  const start = monthStart(row);
  if (name) {
    const params = [name];
    let where = 'i.ItemName = ?';
    if (venue) {
      where += ' AND v.VenueName = ?';
      params.push(venue);
    }
    if (start) {
      where += ' AND (p.PurchasedAt IS NULL OR (p.PurchasedAt >= ? AND p.PurchasedAt < DATE_ADD(?, INTERVAL 1 MONTH)))';
      params.push(start, start);
    }
    return pack(
      [PURCHASE, ITEM, VENUE],
      `Sales of ${name}`,
      `SELECT i.ItemName, v.VenueName, DATE(p.PurchasedAt) AS PurchasedAt, p.Quantity, p.UnitPrice
         FROM Item i
         JOIN Venue v ON v.VenueID = i.VenueID
         LEFT JOIN Purchase p ON p.ItemID = i.ItemID
        WHERE ${where}
        ORDER BY p.PurchasedAt DESC
        LIMIT ${LIM}`,
      params,
      null,
      'p.PurchasedAt',
    );
  }
  if (category) {
    return pack(
      [PURCHASE, ITEM],
      `Sales in ${category}`,
      `SELECT i.ItemName, DATE(p.PurchasedAt) AS PurchasedAt, p.Quantity, p.UnitPrice
         FROM Purchase p
         JOIN Item i ON i.ItemID = p.ItemID
        WHERE i.Category = ?
        ORDER BY p.PurchasedAt DESC
        LIMIT ${LIM}`,
      [category],
      null,
      'p.PurchasedAt',
    );
  }
  return null;
}

function rangeOf(column, start, oneDay) {
  if (!start) return { sql: '1 = 1', params: [] };
  const unit = oneDay ? 'DAY' : 'MONTH';
  return { sql: `${column} >= ? AND ${column} < DATE_ADD(?, INTERVAL 1 ${unit})`, params: [start, start] };
}

function byRevenue(row) {
  const source = text(row, 'Source');
  const start = monthStart(row) ?? day(row, 'RevenueDate');
  const oneDay = !monthStart(row) && Boolean(day(row, 'RevenueDate'));
  if (!source && !start) return null;
  const when = start ? String(start).slice(0, oneDay ? 10 : 7) : 'all dates';
  if (source === 'Tickets' || (!source && start)) {
    const range = rangeOf('t.VisitDate', start, oneDay);
    return pack(
      [TICKET, REFUND],
      `Tickets, ${when}`,
      `SELECT t.TicketID, t.VisitDate, t.TicketPrice
         FROM Ticket t
        WHERE ${range.sql} AND ${notRefunded}
        ORDER BY t.VisitDate, t.TicketID
        LIMIT ${LIM}`,
      range.params,
      null,
      't.VisitDate',
    );
  }
  if (source === 'Memberships') {
    const range = rangeOf('m.StartDate', start, oneDay);
    return pack(
      [MEMBERSHIP],
      `Memberships starting ${when}`,
      `SELECT m.MembershipID, m.CustomerID, m.Tier, m.StartDate, m.Price
         FROM Membership m
        WHERE ${range.sql}
        ORDER BY m.StartDate, m.MembershipID
        LIMIT ${LIM}`,
      range.params,
      null,
      'm.StartDate',
    );
  }
  if (source === 'Food' || source === 'Shop') {
    const kind = source === 'Food' ? "v.VenueType = 'Restaurant'" : "v.VenueType <> 'Restaurant'";
    const range = rangeOf('p.PurchasedAt', start, oneDay);
    return pack(
      [PURCHASE, ITEM, VENUE],
      `${source} sales, ${when}`,
      `SELECT p.PurchaseID, i.ItemName, v.VenueName, DATE(p.PurchasedAt) AS PurchasedAt, p.Quantity, p.UnitPrice
         FROM Purchase p
         JOIN Item i ON i.ItemID = p.ItemID
         JOIN Venue v ON v.VenueID = i.VenueID
        WHERE ${kind} AND ${range.sql}
        ORDER BY p.PurchasedAt DESC
        LIMIT ${LIM}`,
      range.params,
      null,
      'p.PurchasedAt',
    );
  }
  if (source === 'Games') {
    const range = rangeOf('g.PlayedAt', start, oneDay);
    return pack(
      [GAME],
      `Game plays, ${when}`,
      `SELECT g.GamePlayID, g.TicketID, g.PlayedAt, g.AmountPaid
         FROM GamePlay g
        WHERE ${range.sql}
        ORDER BY g.PlayedAt DESC
        LIMIT ${LIM}`,
      range.params,
      null,
      'g.PlayedAt',
    );
  }
  return null;
}

const PROFILES = {
  'customers-per-month': (row) => {
    const start = monthStart(row);
    if (!start) return tablesOnly([TICKET, REFUND], 'This row has no month, so the matching tickets cannot be picked out.');
    return ticketsInMonth(start);
  },
  'daily-attendance': (row) => {
    const date = day(row, 'VisitDate');
    if (date) return ticketsOnDay(date);
    const dow = DOW[text(row, 'Weekday') ?? ''];
    if (!dow) return tablesOnly([TICKET, REFUND, { table: 'Park', note: 'Max occupancy, used for the fill percent.' }], 'Click a single date to see that day’s tickets.');
    return pack(
      [TICKET, REFUND],
      `${text(row, 'Weekday')} tickets`,
      `SELECT t.TicketID, t.CustomerID, t.VisitDate, t.TicketPrice,
              IF(rf.TicketID IS NULL, 'Valid', 'Refunded') AS Status
         FROM Ticket t
         LEFT JOIN TicketRefund rf ON rf.TicketID = t.TicketID
        WHERE DAYOFWEEK(t.VisitDate) = ?
        ORDER BY t.VisitDate DESC, t.TicketID DESC
        LIMIT ${LIM}`,
      [dow],
      null,
      't.VisitDate',
    );
  },
  'revenue-by-source': (row) => byRevenue(row) ?? tablesOnly([TICKET, MEMBERSHIP, PURCHASE, GAME], 'Pick a row that has a source or a month.'),
  'visit-spending': (row) => {
    const id = Number.isInteger(row.TicketID) ? row.TicketID : null;
    if (id) {
      return pack(
        [TICKET, PURCHASE, GAME],
        `Spending on ticket ${id}`,
        `SELECT 'Purchase' AS Kind, i.ItemName AS Name, p.Quantity, p.UnitPrice AS Amount, p.PurchasedAt AS AtTime
           FROM Purchase p JOIN Item i ON i.ItemID = p.ItemID
          WHERE p.TicketID = ?
          UNION ALL
         SELECT 'Game', NULL, NULL, g.AmountPaid, g.PlayedAt
           FROM GamePlay g
          WHERE g.TicketID = ?
          LIMIT ${LIM}`,
        [id, id],
      );
    }
    const start = monthStart(row);
    if (!start) return tablesOnly([TICKET, PURCHASE, GAME], 'This average is built from ticket, purchase and game rows.');
    return pack(
      [PURCHASE, ITEM, TICKET],
      `Purchases in ${start.slice(0, 7)}`,
      `SELECT p.PurchaseID, p.TicketID, i.ItemName, p.Quantity, p.UnitPrice, DATE(p.PurchasedAt) AS PurchasedAt
         FROM Purchase p
         JOIN Item i ON i.ItemID = p.ItemID
        WHERE p.PurchasedAt >= ? AND p.PurchasedAt < DATE_ADD(?, INTERVAL 1 MONTH)
        ORDER BY p.PurchasedAt DESC
        LIMIT ${LIM}`,
      [start, start],
      null,
      'p.PurchasedAt',
    );
  },
  'item-sales': (row) => byItem(row) ?? tablesOnly([PURCHASE, ITEM, VENUE], 'Click a row with an item or a category.'),
  q4: (row) => byItem(row) ?? tablesOnly([PURCHASE, ITEM, VENUE], 'Click a row with an item name.'),
  'retail-sales': (row) => {
    const venue = text(row, 'VenueName');
    const start = monthStart(row);
    if (!venue && !start) return tablesOnly([PURCHASE, VENUE], 'Click a venue to see its sales.');
    const params = [];
    const where = [];
    if (venue) {
      where.push('v.VenueName = ?');
      params.push(venue);
    }
    if (start) {
      where.push('p.PurchasedAt >= ? AND p.PurchasedAt < DATE_ADD(?, INTERVAL 1 MONTH)');
      params.push(start, start);
    }
    return pack(
      [PURCHASE, ITEM, VENUE],
      venue ? `Sales at ${venue}` : `Sales in ${start.slice(0, 7)}`,
      `SELECT p.PurchaseID, i.ItemName, v.VenueName, DATE(p.PurchasedAt) AS PurchasedAt, p.Quantity, p.UnitPrice
         FROM Purchase p
         JOIN Item i ON i.ItemID = p.ItemID
         JOIN Venue v ON v.VenueID = i.VenueID
        WHERE ${where.join(' AND ')}
        ORDER BY p.PurchasedAt DESC
        LIMIT ${LIM}`,
      params,
      null,
      'p.PurchasedAt',
      RETAIL_TOTALS,
    );
  },
  'membership-summary': (row) => byTier(row) ?? tablesOnly([MEMBERSHIP, TICKET], 'Click a tier to see its memberships.'),
  q1: (row) => byTier(row) ?? tablesOnly([MEMBERSHIP, TICKET, PURCHASE, GAME], 'Click a tier to see the rows behind it.'),
  'membership-performance': (row) => {
    const first = text(row, 'FirstName');
    const last = text(row, 'LastName');
    if (first && last) {
      const end = day(row, 'EndDate');
      const params = [first, last];
      let endSql = '';
      if (end) {
        endSql = ' AND m.EndDate = ?';
        params.push(end);
      }
      return pack(
        [MEMBERSHIP, CUSTOMER],
        `${first} ${last}`,
        `SELECT m.MembershipID, m.Tier, m.StartDate, m.EndDate, m.Price, m.AutoRenew
           FROM Membership m
           JOIN Customer c ON c.CustomerID = m.CustomerID
          WHERE c.FirstName = ? AND c.LastName = ?${endSql}
          ORDER BY m.StartDate DESC
          LIMIT ${LIM}`,
        params,
        null,
        'm.StartDate',
      );
    }
    const window = ENDS[text(row, 'EndsIn') ?? ''];
    const tier = text(row, 'Tier');
    if (window) {
      const params = [...window];
      let tierSql = '';
      if (tier && tier !== 'All tiers') {
        tierSql = ' AND m.Tier = ?';
        params.push(tier);
      }
      return pack(
        [MEMBERSHIP, CUSTOMER],
        tier ? `${tier}, ending in ${text(row, 'EndsIn')}` : `Memberships ending in ${text(row, 'EndsIn')}`,
        `SELECT m.MembershipID, c.FirstName, c.LastName, m.Tier, m.EndDate, m.Price, m.AutoRenew
           FROM Membership m
           JOIN Customer c ON c.CustomerID = m.CustomerID
          WHERE CURDATE() BETWEEN m.StartDate AND m.EndDate
            AND DATEDIFF(m.EndDate, CURDATE()) BETWEEN ? AND ?${tierSql}
          ORDER BY m.EndDate
          LIMIT ${LIM}`,
        params,
        null,
        'm.EndDate',
      );
    }
    return byTier(row) ?? tablesOnly([MEMBERSHIP, TICKET, PURCHASE], 'Click a tier or a guest to see the membership rows.');
  },
  q5: (row) => PROFILES['membership-performance'](row),
  'maintenance-history': (row) => {
    const name = text(row, 'FacilityName') ?? text(row, 'RideName');
    const start = monthStart(row);
    if (name) return facilityJobs(name, start);
    if (start) return jobsInMonth(start);
    return tablesOnly([MAINT, RIDE], 'Click a facility or a month to see the jobs.');
  },
  'open-maintenance': (row) => {
    const name = text(row, 'FacilityName');
    if (!name) return tablesOnly([MAINT], 'Click a facility to see its open job.');
    return pack(
      [MAINT, RIDE],
      `Open job for ${name}`,
      `SELECT m.MaintenanceID, m.MaintType, m.StartDate, m.Outcome
         FROM Maintenance m
         LEFT JOIN Ride r ON r.RideID = m.RideID
         LEFT JOIN Game g ON g.GameID = m.GameID
         LEFT JOIN Venue v ON v.VenueID = m.VenueID
        WHERE m.EndDate IS NULL AND COALESCE(r.RideName, g.GameName, v.VenueName) = ?
        ORDER BY m.StartDate
        LIMIT ${LIM}`,
      [name],
      null,
      'm.StartDate',
    );
  },
  'maintenance-cost': (row) => PROFILES['maintenance-history'](row),
  'repair-impact': (row) => {
    const name = text(row, 'FacilityName') ?? text(row, 'RideName');
    if (!name) return tablesOnly([MAINT, RIDELOG, TICKET], 'The estimate uses maintenance hours, boardings and ticket revenue.');
    const jobs = facilityJobs(name, null);
    jobs.sources = [MAINT, RIDELOG, TICKET];
    jobs.note = 'The dollar estimate also divides all ticket revenue by all boardings. These are the ride’s own jobs.';
    return jobs;
  },
  q3: (row) => PROFILES['repair-impact'](row),
  'ride-traffic-by-month': (row) => {
    const name = text(row, 'RideName');
    if (!name) return tablesOnly([RIDELOG, RIDE], 'Click a ride to see its boardings.');
    return boardings(name, monthStart(row));
  },
  q2: (row) => PROFILES['ride-traffic-by-month'](row),
  'ride-performance': (row) => {
    const name = text(row, 'RideName');
    if (!name) return tablesOnly([RIDELOG, MAINT, RIDE], 'Boardings, waits and maintenance hours are combined per ride.');
    return boardings(name, monthStart(row));
  },
  'zone-ride-traffic': (row) => {
    const ride = text(row, 'RideName');
    if (ride) return boardings(ride, null);
    const zone = text(row, 'ZoneName');
    if (!zone) return tablesOnly([RIDELOG, RIDE, ZONE], 'Click a zone to see recent boardings there.');
    return pack(
      [RIDELOG, RIDE, ZONE],
      `Recent boardings in ${zone}`,
      `SELECT r.RideName, l.LoggedAt
         FROM RideLog l
         JOIN Ride r ON r.RideID = l.RideID
         JOIN Zone z ON z.ZoneID = r.ZoneID
        WHERE z.ZoneName = ? AND l.EventType = 'Boarding'
        ORDER BY l.LoggedAt DESC
        LIMIT ${LIM}`,
      [zone],
      null,
      'l.LoggedAt',
    );
  },
  'wait-time-by-ride': (row) => {
    const name = text(row, 'RideName');
    if (!name) return tablesOnly([RIDELOG, RIDE], 'Click a ride to see its wait readings.');
    return pack(
      [RIDELOG, RIDE],
      `Wait readings for ${name}`,
      `SELECT l.RideLogID, l.LoggedAt, l.WaitMinutes
         FROM RideLog l
         JOIN Ride r ON r.RideID = l.RideID
        WHERE r.RideName = ? AND l.EventType = 'Wait Reading'
        ORDER BY l.LoggedAt DESC
        LIMIT ${LIM}`,
      [name],
      null,
      'l.LoggedAt',
    );
  },
  'ride-availability': (row) => {
    const name = text(row, 'RideName');
    if (!name) return tablesOnly([RIDE, MAINT, WEATHER], 'Open, maintenance, weather and retired all come from the ride row plus those logs.');
    return pack(
      [RIDE, ZONE, MAINT, WEATHER],
      name,
      `SELECT r.RideName, z.ZoneName, r.Status, r.IsActive, r.IsIndoor
         FROM Ride r
         JOIN Zone z ON z.ZoneID = r.ZoneID
        WHERE r.RideName = ?`,
      [name],
      'Status is the stored label. A weather closure is decided from WeatherLog at the moment you run the report.',
    );
  },
  'employee-performance': (row) => {
    const name = text(row, 'EmployeeName');
    if (!name) return tablesOnly([SHIFT, EMPLOYEE], 'Click an employee to see their shifts.');
    return pack(
      [SHIFT, EMPLOYEE],
      `Shifts for ${name}`,
      `SELECT s.ShiftID, s.ClockIn, s.ClockOut, s.ShiftRating
         FROM Shift s
         JOIN Employee e ON e.EmployeeID = s.EmployeeID
        WHERE CONCAT(e.FirstName, ' ', e.LastName) = ?
        ORDER BY s.ClockIn DESC
        LIMIT ${LIM}`,
      [name],
      null,
      's.ClockIn',
    );
  },
  'staff-by-zone': (row) => {
    const zone = text(row, 'ZoneName');
    if (!zone) return tablesOnly([EMPLOYEE, ZONE, SHIFT], 'Click a zone to see who is assigned there.');
    const title = text(row, 'JobTitle');
    const params = [zone];
    let titleSql = '';
    if (title) {
      titleSql = ' AND e.JobTitle = ?';
      params.push(title);
    }
    return pack(
      [EMPLOYEE, ZONE, SHIFT],
      title ? `${title} in ${zone}` : `Staff in ${zone}`,
      `SELECT e.EmployeeID, e.FirstName, e.LastName, e.JobTitle
         FROM Employee e
         JOIN EmployeeZone ez ON ez.EmployeeID = e.EmployeeID
         JOIN Zone z ON z.ZoneID = ez.ZoneID
        WHERE z.ZoneName = ?${titleSql}
        ORDER BY e.LastName, e.FirstName
        LIMIT ${LIM}`,
      params,
    );
  },
  'weather-impact': (row) => {
    const id = Number.isInteger(row.WeatherID) ? row.WeatherID : null;
    if (!id) return tablesOnly([WEATHER, REFUND, TICKET], 'Each weather row counts the refunds linked to that event.');
    return pack(
      [WEATHER, REFUND, TICKET],
      `Refunds for weather event ${id}`,
      `SELECT t.TicketID, t.VisitDate, t.TicketPrice
         FROM TicketRefund rf
         JOIN Ticket t ON t.TicketID = rf.TicketID
        WHERE rf.WeatherID = ?
        ORDER BY t.VisitDate
        LIMIT ${LIM}`,
      [id],
      null,
      't.VisitDate',
    );
  },
};

// { sources, label, sql, params, note, rangeColumn } or null when this report has no drill-down.
export function describeDetail(name, rawRow) {
  const profile = PROFILES[name];
  if (!profile) return null;
  return profile(clean(rawRow ?? {}));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_COL = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;

// Keep the from/to dates the report was run with. Values are bound, and the column name comes from this file.
export function applyDetailRange(spec, from, to) {
  const start = ISO_DATE.test(String(from ?? '')) ? String(from) : '';
  const end = ISO_DATE.test(String(to ?? '')) ? String(to) : '';
  if (!spec?.sql || !RANGE_COL.test(spec.rangeColumn ?? '') || (!start && !end)) return spec;
  const params = [...spec.params];
  let clause = '';
  if (start) {
    clause += ` AND ${spec.rangeColumn} >= ?`;
    params.push(start);
  }
  if (end) {
    clause += ` AND ${spec.rangeColumn} < DATE_ADD(?, INTERVAL 1 DAY)`;
    params.push(end);
  }
  const sql = /\s+(ORDER BY|LIMIT)\b/i.test(spec.sql)
    ? spec.sql.replace(/\s+(ORDER BY|LIMIT)\b/i, `${clause} $1`)
    : `${spec.sql}${clause}`;
  return { ...spec, sql, params };
}

// Full match count for the same statement, without the 20-row cap.
export function countDetailSql(sql) {
  const body = sql.replace(/\s+ORDER BY[\s\S]*$/i, '').replace(/\s+LIMIT\s+\d+\s*$/i, '');
  return `SELECT COUNT(*) AS total FROM (${body}) detail_rows`;
}

// One statement that works out the totals over ALL matching rows. Each expression is fixed text from this file
// (see TIER_TOTALS) that reads the detail query's columns; the clicked row only supplies bound values.
export function totalsDetailSql(sql, totals) {
  const body = sql.replace(/\s+ORDER BY[\s\S]*$/i, '').replace(/\s+LIMIT\s+\d+\s*$/i, '');
  const picks = totals.map((t, i) => `${t.expr} AS t${i}`).join(', ');
  return `SELECT ${picks} FROM (${body}) detail_rows`;
}

export const DETAIL_CAP = CAP;
