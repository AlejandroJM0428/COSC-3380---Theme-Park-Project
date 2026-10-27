// One entry per report. ReportPage reads this list, so adding a report = adding an entry here.
//   key         URL part (/reports/<key>)
//   endpoint    which data to fetch (api/index.js -> GET /api/reports/<endpoint>)
//   view        the database view behind it (for your own reference)
//   title       short name shown in the menu
//   description the question this report answers
//   group       which menu section it sits in (one of REPORT_GROUPS at the bottom of this file)
//   roles       who may open it (the server enforces the same list in server/routes/reports.js)
//   required    true = one of the reports the professor listed
//   hidden      true = kept here but not shown anywhere (see the weather reports)
//   prepare     optional: reshape the rows before showing them
//   filters     optional: [{ key, label }] drop-downs built from the values in that column
//   dateFilter  optional: { key, label } adds a from/to date range on that column
//   kpis        optional: (rows) => [{ label, value, note? }] headline numbers, recalculated for the filtered rows
//   chartRows   optional: (rows) => rows to plot (default: the filtered rows)
//   chart       optional: { type: 'bar' | 'line', x, y, y2?, yLabel?, y2Label?, angle? }  y2 = comparison series
//   columns     optional: which columns the table shows, in order
//   summary     optional: older style, one line of text above the data

// Keep in step with the lists in server/routes/reports.js
const ADMINS = ['Admin', 'Manager']
const RETAIL = [...ADMINS, 'RetailManager']
const HR = [...ADMINS, 'HRManager']
const MAINTENANCE = [...ADMINS, 'MaintenanceManager']
const EVERY_MANAGER = [...ADMINS, 'RetailManager', 'HRManager', 'MaintenanceManager']

// ---------- helpers ----------

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

// MySQL sends DECIMAL values as text, so turn the listed columns into real numbers.
function toNumbers(rows, keys) {
  return rows.map((r) => {
    const out = { ...r }
    for (const k of keys) out[k] = num(r[k])
    return out
  })
}

function money(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const monthOf = (v) => String(v).slice(0, 7) // 'YYYY-MM' (dates arrive as text)

function total(rows, key) {
  return rows.reduce((sum, r) => sum + (num(r[key]) ?? 0), 0)
}

function average(rows, key) {
  const vals = rows.map((r) => num(r[key])).filter((v) => v !== null)
  if (vals.length === 0) return '0'
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
}

// The row with the highest (or lowest) value in a column, or null.
function extreme(rows, key, lowest = false) {
  let best = null
  for (const r of rows) {
    const v = num(r[key])
    if (v === null) continue
    if (best === null || (lowest ? v < best.v : v > best.v)) best = { v, row: r }
  }
  return best
}

// Add up `valueKey` per `groupKey` -> [{ [groupKey]: 'x', [valueKey]: 12 }], biggest first.
function sumBy(rows, groupKey, valueKey) {
  const totals = {}
  for (const r of rows) {
    const k = r[groupKey]
    totals[k] = (totals[k] ?? 0) + (num(r[valueKey]) ?? 0)
  }
  return Object.entries(totals)
    .map(([k, v]) => ({ [groupKey]: k, [valueKey]: Math.round(v * 100) / 100 }))
    .sort((a, b) => b[valueKey] - a[valueKey])
}

// Count rows per calendar month using a date column -> [{ Month: '2026-03', <outKey>: 4 }, ...]
function countByMonth(rows, dateKey, outKey) {
  const counts = {}
  for (const r of rows) {
    const month = monthOf(r[dateKey])
    counts[month] = (counts[month] ?? 0) + 1
  }
  return Object.keys(counts)
    .sort()
    .map((m) => ({ Month: m, [outKey]: counts[m] }))
}

// Compare the last `days` days of data with the `days` before them (counted back from the newest date in the rows).
function periodChange(rows, dateKey, valueKey, days = 30) {
  const dayMs = 86400000
  const toTime = (v) => new Date(String(v).slice(0, 10) + 'T00:00:00Z').getTime()
  const times = rows.map((r) => toTime(r[dateKey])).filter((t) => !Number.isNaN(t))
  if (times.length === 0) return null
  const end = Math.max(...times)
  let recent = 0
  let prior = 0
  for (const r of rows) {
    const t = toTime(r[dateKey])
    if (Number.isNaN(t)) continue
    const age = Math.floor((end - t) / dayMs)
    const v = num(r[valueKey]) ?? 0
    if (age >= 0 && age < days) recent += v
    else if (age >= days && age < days * 2) prior += v
  }
  if (prior === 0) return null
  return { recent, prior, pct: ((recent - prior) / prior) * 100 }
}

const withMonth = (yearKey, monthKey) => (rows) =>
  rows.map((r) => ({ ...r, Month: `${r[yearKey]}-${String(r[monthKey]).padStart(2, '0')}` }))

// ---------- the reports ----------

const ALL_REPORTS = [
  // ---- Revenue and retail ----
  {
    key: 'revenue',
    group: 'Revenue reports',
    endpoint: 'revenue-by-source',
    view: 'v_RevenueBySource',
    title: 'Revenue by Source',
    description: 'Where does the money come from, and is it growing?',
    roles: RETAIL,
    prepare: (rows) => toNumbers(rows, ['Revenue']).map((r) => ({ ...r, Month: monthOf(r.RevenueDate) })),
    filters: [{ key: 'Source', label: 'Source' }],
    dateFilter: { key: 'RevenueDate', label: 'Date' },
    kpis: (rows) => {
      const bySource = sumBy(rows, 'Source', 'Revenue')
      const change = periodChange(rows, 'RevenueDate', 'Revenue')
      return [
        { label: 'Total revenue', value: money(total(rows, 'Revenue')) },
        { label: 'Biggest source', value: bySource[0] ? bySource[0].Source : '—', note: bySource[0] ? money(bySource[0].Revenue) : '' },
        {
          label: 'Last 30 days vs the 30 before',
          value: change ? `${change.pct >= 0 ? '+' : ''}${change.pct.toFixed(1)}%` : '—',
          note: change ? `${money(change.recent)} vs ${money(change.prior)}` : 'Not enough data to compare',
        },
      ]
    },
    chartRows: (rows) => sumBy(rows, 'Source', 'Revenue'),
    chart: { type: 'bar', x: 'Source', y: 'Revenue' },
    columns: ['RevenueDate', 'Source', 'Revenue'],
  },
  {
    key: 'retail-sales',
    group: 'Revenue reports',
    endpoint: 'retail-sales',
    view: 'v_RetailSalesByVenue',
    title: 'Sales by Venue',
    description: 'What sells best at each restaurant and shop, and which venues earn the most?',
    roles: RETAIL,
    prepare: (rows) =>
      toNumbers(rows, ['Orders', 'Units', 'Revenue']).map((r) => ({
        ...r,
        Month: `${r.SaleYear}-${String(r.SaleMonth).padStart(2, '0')}`,
      })),
    filters: [
      { key: 'VenueType', label: 'Venue type' },
      { key: 'Month', label: 'Month' },
    ],
    kpis: (rows) => {
      const byVenue = sumBy(rows, 'VenueName', 'Revenue')
      const worst = byVenue[byVenue.length - 1]
      return [
        { label: 'Total sales', value: money(total(rows, 'Revenue')) },
        { label: 'Top venue', value: byVenue[0] ? byVenue[0].VenueName : '—', note: byVenue[0] ? money(byVenue[0].Revenue) : '' },
        { label: 'Lowest venue', value: worst ? worst.VenueName : '—', note: worst ? money(worst.Revenue) : '' },
        { label: 'Units sold', value: total(rows, 'Units').toLocaleString('en-US') },
      ]
    },
    chartRows: (rows) => sumBy(rows, 'VenueName', 'Revenue'),
    chart: { type: 'bar', x: 'VenueName', y: 'Revenue', angle: true },
    columns: ['Month', 'VenueName', 'VenueType', 'Orders', 'Units', 'Revenue'],
  },
  {
    key: 'visit-spending',
    group: 'Revenue reports',
    endpoint: 'visit-spending',
    view: 'v_VisitSpending',
    title: 'Spending per Visit',
    description: 'How much does a visitor spend on food, shopping and games on top of the ticket?',
    roles: RETAIL,
    prepare: (rows) => toNumbers(rows, ['TicketPrice', 'FoodTotal', 'ShopTotal', 'GameTotal']),
    dateFilter: { key: 'VisitDate', label: 'Visit date' },
    kpis: (rows) => [
      { label: 'Visits', value: rows.length.toLocaleString('en-US') },
      { label: 'Average food spend', value: '$' + average(rows, 'FoodTotal') },
      { label: 'Average shop spend', value: '$' + average(rows, 'ShopTotal') },
      { label: 'Average game spend', value: '$' + average(rows, 'GameTotal') },
    ],
    chartRows: (rows) => [
      { Type: 'Food', Average: Number(average(rows, 'FoodTotal')) },
      { Type: 'Shop', Average: Number(average(rows, 'ShopTotal')) },
      { Type: 'Games', Average: Number(average(rows, 'GameTotal')) },
    ],
    chart: { type: 'bar', x: 'Type', y: 'Average', yLabel: 'Average spend per visit ($)' },
  },
  {
    key: 'memberships',
    group: 'Revenue reports',
    endpoint: 'membership-summary',
    view: 'v_MembershipSummary',
    title: 'Membership Summary',
    description: 'Which membership tiers sell, who is expiring soon, and how often do members visit?',
    roles: RETAIL,
    prepare: (rows) =>
      toNumbers(rows, ['CurrentPrice', 'Memberships', 'ActiveNow', 'ExpiringIn30Days', 'MembershipRevenue', 'Visits', 'VisitsPerMembership']),
    kpis: (rows) => [
      { label: 'Memberships sold', value: total(rows, 'Memberships').toLocaleString('en-US') },
      { label: 'Active now', value: total(rows, 'ActiveNow').toLocaleString('en-US') },
      { label: 'Expiring in 30 days', value: total(rows, 'ExpiringIn30Days').toLocaleString('en-US') },
      { label: 'Membership revenue', value: money(total(rows, 'MembershipRevenue')) },
    ],
    chart: { type: 'bar', x: 'Tier', y: 'Memberships' },
  },
  {
    key: 'customers-per-month',
    group: 'Revenue reports',
    endpoint: 'customers-per-month',
    view: 'v_CustomersPerMonth',
    title: 'Customers per Month',
    description: 'How many different customers visit each month (refunded tickets excluded)?',
    required: true,
    roles: RETAIL,
    prepare: (rows) => toNumbers(withMonth('VisitYear', 'VisitMonth')(rows), ['Customers']),
    kpis: (rows) => {
      const best = extreme(rows, 'Customers')
      return [
        { label: 'Average per month', value: average(rows, 'Customers') },
        { label: 'Best month', value: best ? best.row.Month : '—', note: best ? `${best.v.toLocaleString('en-US')} customers` : '' },
      ]
    },
    chart: { type: 'bar', x: 'Month', y: 'Customers' },
  },
  {
    key: 'attendance-spikes',
    group: 'Revenue reports',
    endpoint: 'daily-attendance',
    view: 'v_DailyAttendance',
    title: 'Daily Attendance & Spikes',
    description: 'Which days fill the park, and how close do we get to capacity?',
    required: true,
    roles: RETAIL,
    prepare: (rows) => toNumbers(rows, ['ValidTickets', 'RefundedTickets', 'PctOfCapacity', 'TicketRevenue']),
    dateFilter: { key: 'VisitDate', label: 'Visit date' },
    kpis: (rows) => {
      const busiest = extreme(rows, 'PctOfCapacity')
      return [
        { label: 'Busiest day', value: busiest ? busiest.row.VisitDate : '—', note: busiest ? `${busiest.v}% of capacity` : '' },
        { label: 'Average fill', value: average(rows, 'PctOfCapacity') + '%' },
        { label: 'Days at capacity', value: rows.filter((r) => r.PctOfCapacity >= 100).length.toLocaleString('en-US') },
      ]
    },
    chart: { type: 'line', x: 'VisitDate', y: 'PctOfCapacity', yLabel: '% of capacity' },
  },

  // ---- Maintenance ----
  {
    key: 'maintenance-cost',
    group: 'Maintenance reports',
    endpoint: 'maintenance-cost',
    view: 'v_MaintenanceCostByFacility',
    title: 'Repair Cost by Facility',
    description: 'Which rides, games and venues cost the most to repair, and how long are they down?',
    roles: MAINTENANCE,
    prepare: (rows) =>
      toNumbers(rows, ['Jobs', 'EmergencyJobs', 'TotalCost', 'AvgCost', 'TotalHoursDown']).sort(
        (a, b) => (b.TotalCost ?? 0) - (a.TotalCost ?? 0),
      ),
    filters: [{ key: 'FacilityKind', label: 'Type' }],
    kpis: (rows) => {
      const top = extreme(rows, 'TotalCost')
      const jobs = total(rows, 'Jobs')
      return [
        { label: 'Total repair cost', value: money(total(rows, 'TotalCost')) },
        { label: 'Most expensive', value: top ? top.row.FacilityName : '—', note: top ? money(top.v) : '' },
        { label: 'Hours down', value: total(rows, 'TotalHoursDown').toLocaleString('en-US') },
        { label: 'Emergency share', value: jobs ? `${Math.round((100 * total(rows, 'EmergencyJobs')) / jobs)}% of jobs` : '—' },
      ]
    },
    chartRows: (rows) => rows.slice(0, 10),
    chart: { type: 'bar', x: 'FacilityName', y: 'TotalCost', yLabel: 'Total repair cost ($)', angle: true },
    columns: ['FacilityKind', 'FacilityName', 'Jobs', 'EmergencyJobs', 'TotalCost', 'AvgCost', 'TotalHoursDown'],
  },
  {
    key: 'open-maintenance',
    group: 'Maintenance reports',
    endpoint: 'open-maintenance',
    view: 'v_OpenMaintenance',
    title: 'Open Repairs',
    description: 'Which repairs are still open, and which have waited the longest?',
    roles: MAINTENANCE,
    prepare: (rows) => toNumbers(rows, ['DaysOpen', 'CrewSize']),
    kpis: (rows) => {
      const oldest = extreme(rows, 'DaysOpen')
      return [
        { label: 'Open jobs', value: rows.length.toLocaleString('en-US') },
        { label: 'Open the longest', value: oldest ? oldest.row.FacilityName : '—', note: oldest ? `${oldest.v} days` : '' },
      ]
    },
    chart: { type: 'bar', x: 'FacilityName', y: 'DaysOpen', yLabel: 'Days open' },
  },
  {
    key: 'maintenance-per-month',
    group: 'Maintenance reports',
    endpoint: 'maintenance-history',
    view: 'v_MaintenanceHistory (grouped by month here)',
    title: 'Maintenance Jobs per Month',
    description: 'How many maintenance jobs start each month?',
    required: true,
    roles: MAINTENANCE,
    prepare: (rows) => countByMonth(rows, 'StartDate', 'Jobs'),
    kpis: (rows) => {
      const busiest = extreme(rows, 'Jobs')
      return [
        { label: 'Average per month', value: average(rows, 'Jobs') },
        { label: 'Busiest month', value: busiest ? busiest.row.Month : '—', note: busiest ? `${busiest.v} jobs` : '' },
      ]
    },
    chart: { type: 'bar', x: 'Month', y: 'Jobs' },
  },
  {
    key: 'maintenance-history',
    group: 'Maintenance reports',
    endpoint: 'maintenance-history',
    view: 'v_MaintenanceHistory',
    title: 'Maintenance History',
    description: 'Every maintenance job with crew size, downtime, outcome and repair cost.',
    roles: MAINTENANCE,
    prepare: (rows) => toNumbers(rows, ['CrewSize', 'HoursDown', 'RepairCost']),
    filters: [
      { key: 'FacilityKind', label: 'Type' },
      { key: 'MaintType', label: 'Job type' },
      { key: 'Outcome', label: 'Outcome' },
    ],
    dateFilter: { key: 'StartDate', label: 'Started' },
    kpis: (rows) => [
      { label: 'Jobs', value: rows.length.toLocaleString('en-US') },
      { label: 'Total repair cost', value: money(total(rows, 'RepairCost')) },
      { label: 'Average hours down', value: average(rows, 'HoursDown') },
    ],
  },

  // ---- Employees ----
  {
    key: 'employee-performance',
    group: 'Employee reports',
    endpoint: 'employee-performance',
    view: 'v_EmployeePerformance',
    title: 'Employee Performance',
    description: 'Who is doing well, and who needs attention? Average shift rating against the job-title average.',
    roles: HR,
    prepare: (rows) =>
      toNumbers(rows, ['Shifts', 'RatedShifts', 'AvgRating', 'HoursWorked', 'JobTitleAvgRating']).sort(
        (a, b) => (b.AvgRating ?? -1) - (a.AvgRating ?? -1),
      ),
    filters: [{ key: 'JobTitle', label: 'Job title' }],
    kpis: (rows) => {
      const best = extreme(rows, 'AvgRating')
      const worst = extreme(rows, 'AvgRating', true)
      const below = rows.filter((r) => r.AvgRating !== null && r.JobTitleAvgRating !== null && r.AvgRating < r.JobTitleAvgRating).length
      return [
        { label: 'Average rating', value: average(rows, 'AvgRating') + ' / 5' },
        { label: 'Highest rated', value: best ? best.row.EmployeeName : '—', note: best ? `${best.v.toFixed(2)} / 5` : '' },
        { label: 'Lowest rated', value: worst ? worst.row.EmployeeName : '—', note: worst ? `${worst.v.toFixed(2)} / 5` : '' },
        { label: 'Below their job-title average', value: below.toLocaleString('en-US'), note: 'employees' },
      ]
    },
    chartRows: (rows) => rows.filter((r) => r.AvgRating !== null),
    chart: {
      type: 'bar',
      x: 'EmployeeName',
      y: 'AvgRating',
      y2: 'JobTitleAvgRating',
      yLabel: 'Employee average rating',
      y2Label: 'Job-title average',
      angle: true,
    },
    columns: ['EmployeeName', 'JobTitle', 'Shifts', 'RatedShifts', 'AvgRating', 'JobTitleAvgRating', 'HoursWorked', 'LastShift'],
  },
  {
    key: 'staff-by-zone',
    group: 'Employee reports',
    endpoint: 'staff-by-zone',
    view: 'v_StaffByZone',
    title: 'Staff by Zone',
    description: 'Is every zone staffed, and who is clocked in right now?',
    roles: HR,
    prepare: (rows) => toNumbers(rows, ['Staff', 'ClockedInNow']),
    filters: [{ key: 'JobTitle', label: 'Job title' }],
    kpis: (rows) => [
      { label: 'Staff assigned', value: total(rows, 'Staff').toLocaleString('en-US') },
      { label: 'Clocked in now', value: total(rows, 'ClockedInNow').toLocaleString('en-US') },
    ],
    chartRows: (rows) => sumBy(rows, 'ZoneName', 'Staff'),
    chart: { type: 'bar', x: 'ZoneName', y: 'Staff' },
  },

  // ---- Rides and operations ----
  {
    key: 'ride-traffic-by-month',
    group: 'Ride reports',
    endpoint: 'ride-traffic-by-month',
    view: 'v_RideTrafficByMonth',
    title: 'Most Ridden Rides per Month',
    description: 'Which rides do visitors ride most? Pick a month, or look at all of them.',
    required: true,
    roles: EVERY_MANAGER,
    prepare: (rows) => toNumbers(withMonth('VisitYear', 'VisitMonth')(rows), ['Boardings']),
    filters: [{ key: 'Month', label: 'Month' }],
    kpis: (rows) => {
      const byRide = sumBy(rows, 'RideName', 'Boardings')
      return [
        { label: 'Total boardings', value: total(rows, 'Boardings').toLocaleString('en-US') },
        { label: 'Most ridden', value: byRide[0] ? byRide[0].RideName : '—', note: byRide[0] ? `${byRide[0].Boardings.toLocaleString('en-US')} boardings` : '' },
      ]
    },
    chartRows: (rows) => sumBy(rows, 'RideName', 'Boardings').slice(0, 10),
    chart: { type: 'bar', x: 'RideName', y: 'Boardings', angle: true },
    columns: ['Month', 'RideName', 'Boardings'],
  },
  {
    key: 'ride-availability',
    group: 'Ride reports',
    endpoint: 'ride-availability',
    view: 'v_RideAvailability',
    title: 'Ride Availability Now',
    description: 'Which rides are open right now, and why are the others closed?',
    roles: EVERY_MANAGER,
    filters: [{ key: 'CurrentState', label: 'State' }],
    kpis: (rows) => [
      { label: 'Open', value: rows.filter((r) => r.CurrentState === 'Open').length.toLocaleString('en-US') },
      { label: 'Closed', value: rows.filter((r) => r.CurrentState !== 'Open').length.toLocaleString('en-US'), note: 'maintenance, weather or retired' },
    ],
  },
  {
    key: 'zone-ride-traffic',
    group: 'Ride reports',
    endpoint: 'zone-ride-traffic',
    view: 'v_ZoneRideTraffic',
    title: 'Ride Traffic by Zone',
    description: 'How many boardings does each ride get, grouped by zone?',
    roles: EVERY_MANAGER,
    prepare: (rows) => toNumbers(rows, ['Boardings']),
    filters: [{ key: 'ZoneName', label: 'Zone' }],
    kpis: (rows) => {
      const top = extreme(rows, 'Boardings')
      return [
        { label: 'Total boardings', value: total(rows, 'Boardings').toLocaleString('en-US') },
        { label: 'Busiest ride', value: top ? top.row.RideName : '—', note: top ? `${top.v.toLocaleString('en-US')} boardings` : '' },
      ]
    },
    chart: { type: 'bar', x: 'RideName', y: 'Boardings', angle: true },
  },
  {
    key: 'wait-times',
    group: 'Ride reports',
    endpoint: 'wait-time-by-ride',
    view: 'v_WaitTimeByRide',
    title: 'Wait Times by Ride',
    description: 'Which rides have the longest waits?',
    roles: EVERY_MANAGER,
    prepare: (rows) => toNumbers(rows, ['Readings', 'AvgWaitMinutes', 'MaxWaitMinutes']),
    filters: [{ key: 'ZoneName', label: 'Zone' }],
    kpis: (rows) => {
      const longest = extreme(rows, 'AvgWaitMinutes')
      return [
        { label: 'Longest average wait', value: longest ? longest.row.RideName : '—', note: longest ? `${longest.v} min` : '' },
        { label: 'Average of all rides', value: average(rows, 'AvgWaitMinutes') + ' min' },
      ]
    },
    chart: { type: 'bar', x: 'RideName', y: 'AvgWaitMinutes', yLabel: 'Average wait (min)', angle: true },
  },

  // ---- Weather: hidden on purpose ----
  // The TAs said not to build a weather report, but the professor's list includes "Rain-outs per month".
  // Both are kept here with hidden: true. Remove `hidden` to show them again.
  {
    key: 'rainouts-per-month',
    endpoint: 'weather-impact',
    view: 'v_WeatherImpact (grouped by month here)',
    title: 'Rain-outs per Month',
    description: 'Rain or storm events that closed outdoor rides, per month.',
    required: true,
    hidden: true,
    roles: ADMINS,
    prepare: (rows) =>
      countByMonth(
        rows.filter((r) => r.ClosesOutdoorRides && ['Rain', 'Storm'].includes(r.WeatherType)),
        'StartedAt',
        'RainOuts',
      ),
    chart: { type: 'bar', x: 'Month', y: 'RainOuts' },
    summary: (rows) => `Average per month (months with at least one): ${average(rows, 'RainOuts')}`,
  },
  {
    key: 'weather-impact',
    endpoint: 'weather-impact',
    view: 'v_WeatherImpact',
    title: 'Weather Impact',
    description: 'Weather events with weather-related refunds.',
    hidden: true,
    roles: ADMINS,
  },
]

// The rest of the app (menu, dashboard, report page) uses REPORTS, so hidden reports vanish everywhere.
export const REPORTS = ALL_REPORTS.filter((r) => !r.hidden)

// Menu sections for the reports, in the order they are shown (config/nav.js builds one section per entry).
export const REPORT_GROUPS = ['Revenue reports', 'Maintenance reports', 'Employee reports', 'Ride reports']
