// Plain-English names for report columns.
//
// The database columns have technical names (RevenueDate, FacilityKind, PctOfCapacity). A person should never have to read them,
// so the report page shows a label instead: in the Search options panel, the table headers, the CSV file and the summaries.
// The column name itself is still what is sent to the server, so nothing about the queries changes.
//
// How a label is found (makeLabeler below):
//   1. the report tab's own `labels` map (config/reports.js)   2. COLUMN_LABELS here, shared by every report
//   3. otherwise the name is split into words: EmployeeName -> "Employee name"
// Summaries get plain names too: "sum of Revenue" -> "Total revenue", "RevenueDate (month)" -> "Date by month".

export const COLUMN_LABELS = {
  RevenueDate: 'Date',
  VisitDate: 'Visit date',
  StartDate: 'Start date',
  EndDate: 'End date',
  FacilityKind: 'Ride, game or venue',
  FacilityName: 'Name',
  MaintType: 'Job type',
  IsPlanned: 'Planned job',
  CrewSize: 'Crew size',
  PctOfCapacity: '% of capacity',
  AvailabilityPct: 'Availability (%)',
  AvgFill: 'Average % full',
  AvgWaitMinutes: 'Average wait (minutes)',
  MaxWaitMinutes: 'Longest wait (minutes)',
  HoursDown: 'Hours closed',
  TotalHoursDown: 'Total hours closed',
  DowntimeHours: 'Hours closed',
  DowntimeOpenHours: 'Hours closed while open',
  RepairCost: 'Repair cost',
  AvgCost: 'Average cost',
  AvgCostPerJob: 'Average cost per job',
  AvgHoursPerJob: 'Average hours per job',
  DaysBetweenJobs: 'Days between jobs',
  DaysOpen: 'Days open',
  DaysLeft: 'Days left',
  EndsIn: 'Ends in',
  UsedExpress: 'Used express',
  ExpressBoardings: 'Express boardings',
  ExpressShare: 'Express share',
  AutoRenew: 'Auto-renew',
  NotAutoRenew: 'Not on auto-renew',
  AutoRenewShare: 'Share on auto-renew',
  RevenueAtRiskEstimate: 'Revenue at risk (estimate)',
  EstimatedLostRevenue: 'Lost revenue (estimate)',
  ExpiringIn30Days: 'Expiring in 30 days',
  ActiveNow: 'Active now',
  NeverVisited: 'Never visited',
  VisitsPerMembership: 'Visits per membership',
  AvgVisits: 'Average visits',
  AvgExtraSpend: 'Average extra spending',
  AvgPricePaid: 'Average price paid',
  AvgFood: 'Average food spending',
  AvgShop: 'Average shop spending',
  AvgGames: 'Average games spending',
  AvgExtras: 'Average extras spending',
  AvgRating: 'Average rating',
  JobTitleAvgRating: 'Job-title average rating',
  RatedShifts: 'Rated shifts',
  HoursWorked: 'Hours worked',
  LastShift: 'Last shift',
  ClockedInNow: 'Clocked in now',
  RetentionRate: 'Retention rate',
  RefundRate: 'Refund rate',
  RefundedTickets: 'Refunded tickets',
  ValidTickets: 'Valid tickets',
  AvgTickets: 'Average tickets',
  AvgRevenue: 'Average revenue',
  InParkSpending: 'In-park spending',
  MembershipFees: 'Membership fees',
  MembershipsSold: 'Memberships sold',
  ShareOfRevenue: 'Share of revenue',
  ShareOfSales: 'Share of sales',
  UnitsSold: 'Units sold',
  AverageSale: 'Average sale',
  BoardingsPerOpenHour: 'Boardings per open hour',
  BoardingsPerRide: 'Boardings per ride',
  LostBoardings: 'Lost boardings',
  LastReadingAt: 'Last reading',
  CurrentState: 'Current state',
  CurrentPrice: 'Current price',
  WhatItMeans: 'What it means',
  ZoneName: 'Zone',
  VenueName: 'Venue',
  VenueType: 'Venue type',
  RideName: 'Ride',
  ItemName: 'Item',
  EmployeeName: 'Employee',
  JobTitle: 'Job title',
  FirstName: 'First name',
  LastName: 'Last name',
}

const FN_WORDS = { sum: 'Total', avg: 'Average', min: 'Smallest', max: 'Largest' }

// 'EmployeeName' -> 'Employee name', 'ExpiringIn30Days' -> 'Expiring in 30 days', 'VisitYear' -> 'Visit year'
export function humanize(key) {
  const words = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim()
  if (!words) return ''
  const [first, ...rest] = words.split(' ')
  return [first, ...rest.map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase()))].join(' ')
}

// 'Revenue' -> 'revenue', but 'ID' / '% of capacity' stay as they are.
const lowerFirst = (s) => (s.length > 1 && /[a-z]/.test(s[1]) ? s[0].toLowerCase() + s.slice(1) : s)

// makeLabeler(reportLabels) -> (name) => the plain label. Safe to call with any string the server can send back.
export function makeLabeler(reportLabels) {
  const own = reportLabels ?? {}
  const label = (name) => {
    if (name === null || name === undefined) return ''
    const key = String(name)
    if (Object.hasOwn(own, key)) return own[key]
    if (Object.hasOwn(COLUMN_LABELS, key)) return COLUMN_LABELS[key]
    if (key === 'Rows') return 'Number of rows'
    const fn = /^(sum|avg|min|max) of (.+)$/.exec(key)
    if (fn) return `${FN_WORDS[fn[1]]} ${lowerFirst(label(fn[2]))}`
    const bucket = /^(.+) \((day|month|year)\)$/.exec(key)
    if (bucket) return `${label(bucket[1])} by ${bucket[2]}`
    return humanize(key)
  }
  return label
}
