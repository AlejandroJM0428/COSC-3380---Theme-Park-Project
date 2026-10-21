// One entry per report. ReportPage reads this list, so adding a report = adding an entry here.
//   key       URL part (/reports/<key>)
//   endpoint  which data to fetch (api/index.js -> GET /api/reports/<endpoint>)
//   view      the database view behind it (for your own reference)
//   prepare   optional: reshape the rows before showing them
//   chart     optional: { type: 'bar' | 'line', x: <field>, y: <field> }
//   summary   optional: one line of text shown above the data
//   required  true = one of the reports the professor listed

// Count rows per calendar month using a date column -> [{ Month: '2026-03', <outKey>: 4 }, ...]
function countByMonth(rows, dateKey, outKey) {
  const counts = {}
  for (const r of rows) {
    const month = String(r[dateKey]).slice(0, 7) // 'YYYY-MM' works for ISO and MySQL date strings
    counts[month] = (counts[month] ?? 0) + 1
  }
  return Object.keys(counts)
    .sort()
    .map((m) => ({ Month: m, [outKey]: counts[m] }))
}

function average(rows, key) {
  if (rows.length === 0) return '0'
  return (rows.reduce((sum, r) => sum + Number(r[key]), 0) / rows.length).toFixed(1)
}

export const REPORTS = [
  {
    key: 'customers-per-month',
    endpoint: 'customers-per-month',
    view: 'v_CustomersPerMonth',
    title: 'Customers per Month',
    description: 'Distinct visiting customers each month (refunded tickets excluded).',
    required: true,
    prepare: (rows) =>
      rows.map((r) => ({ ...r, Month: `${r.VisitYear}-${String(r.VisitMonth).padStart(2, '0')}` })),
    chart: { type: 'bar', x: 'Month', y: 'Customers' },
    summary: (rows) => `Average per month: ${average(rows, 'Customers')} customers`,
  },
  {
    key: 'attendance-spikes',
    endpoint: 'daily-attendance',
    view: 'v_DailyAttendance',
    title: 'Daily Attendance & Spikes',
    description: 'Valid and refunded tickets per day as a percent of capacity. Look for peaks.',
    required: true,
    chart: { type: 'line', x: 'VisitDate', y: 'PctOfCapacity' },
  },
  {
    key: 'maintenance-per-month',
    endpoint: 'maintenance-history',
    view: 'v_MaintenanceHistory (grouped by month here)',
    title: 'Maintenance Jobs per Month',
    description: 'How many maintenance jobs started each month.',
    required: true,
    prepare: (rows) => countByMonth(rows, 'StartDate', 'Jobs'),
    chart: { type: 'bar', x: 'Month', y: 'Jobs' },
    summary: (rows) => `Average per month: ${average(rows, 'Jobs')} jobs`,
  },
  {
    key: 'ride-traffic-by-month',
    endpoint: 'ride-traffic-by-month',
    view: 'NEW VIEW NEEDED (boardings per ride per month)',
    title: 'Most Ridden Rides per Month',
    description: 'Boardings per ride per month. Needs a monthly view from the database team.',
    required: true,
    pending: true,
    chart: { type: 'bar', x: 'RideName', y: 'Boardings' },
  },
  {
    key: 'rainouts-per-month',
    endpoint: 'weather-impact',
    view: 'v_WeatherImpact (grouped by month here)',
    title: 'Rain-outs per Month',
    description: 'Rain or storm events that closed outdoor rides, per month.',
    required: true,
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
    key: 'ride-availability',
    endpoint: 'ride-availability',
    view: 'v_RideAvailability',
    title: 'Ride Availability Now',
    description: 'Current state of every ride: open, maintenance, weather, or retired.',
  },
  {
    key: 'zone-ride-traffic',
    endpoint: 'zone-ride-traffic',
    view: 'v_ZoneRideTraffic',
    title: 'Ride Traffic by Zone',
    description: 'Total boardings per ride, grouped by zone.',
    chart: { type: 'bar', x: 'RideName', y: 'Boardings' },
  },
  {
    key: 'wait-times',
    endpoint: 'wait-time-by-ride',
    view: 'v_WaitTimeByRide',
    title: 'Wait Times by Ride',
    description: 'Average and maximum posted wait per ride.',
    chart: { type: 'bar', x: 'RideName', y: 'AvgWaitMinutes' },
  },
  {
    key: 'revenue',
    endpoint: 'revenue-by-source',
    view: 'v_RevenueBySource',
    title: 'Revenue by Source',
    description: 'Daily revenue from tickets, memberships, food, shop, and games.',
  },
  {
    key: 'visit-spending',
    endpoint: 'visit-spending',
    view: 'v_VisitSpending',
    title: 'Spending per Visit',
    description: 'Per-ticket spend on food, shop, and games.',
  },
  {
    key: 'weather-impact',
    endpoint: 'weather-impact',
    view: 'v_WeatherImpact',
    title: 'Weather Impact',
    description: 'Weather events with weather-related refunds.',
  },
  {
    key: 'maintenance-history',
    endpoint: 'maintenance-history',
    view: 'v_MaintenanceHistory',
    title: 'Maintenance History',
    description: 'Every maintenance job with crew size, downtime, and outcome.',
  },
  {
    key: 'memberships',
    endpoint: 'membership-summary',
    view: 'v_MembershipSummary',
    title: 'Membership Summary',
    description: 'Per tier: sold, active, expiring, revenue, visits.',
    chart: { type: 'bar', x: 'Tier', y: 'Memberships' },
  },
  {
    key: 'staff-by-zone',
    endpoint: 'staff-by-zone',
    view: 'v_StaffByZone',
    title: 'Staff by Zone',
    description: 'Staff per zone and job title, and how many are clocked in now.',
  },
]
