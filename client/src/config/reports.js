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
//   sections    optional: [{ key, title, sectionDescription, endpoint, ...the settings above }] one tab each (a merged report).
//               The report itself then only needs key, group, title, description and roles.
//   insights    optional: (rows) => ['plain sentence', ...] calculated notes for the filtered rows
//   notes       optional: ['plain sentence', ...] fixed notes, shown with the insights in "What the numbers mean"
//   extraChart  optional: { title, rows: (rows) => rows, chart } a second chart under the first
//   tableRows   optional: (rows) => rows to show in the table (a summary instead of raw records; the CSV matches)
//   rowClass    optional: (row) => 'high' | 'low' | undefined shades that table row (see markOutliers)

// Keep in step with the lists in server/routes/reports.js
// Role matrix (TA fixes plan). Admin sees every report; each manager sees only the reports for their own area.
const OPERATIONS = ['Admin', 'Manager']
const ATTENDANCE = ['Admin', 'Manager', 'RetailManager']
const RETAIL = ['Admin', 'RetailManager']
const HR = ['Admin', 'HRManager']
const MAINTENANCE = ['Admin', 'MaintenanceManager']

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

const money2 = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const round2 = (n) => Math.round(n * 100) / 100

// Share of a whole, as a percentage with one decimal (0 when the whole is 0).
const pct = (part, whole) => (whole ? Math.round((1000 * part) / whole) / 10 : 0)

// Group rows by one or more columns and add up the listed number columns -> one row per group (`Rows` = how many rows were added up).
function groupSum(rows, keys, sumKeys) {
  const groups = new Map()
  for (const r of rows) {
    const id = keys.map((k) => r[k]).join('\u0000')
    let g = groups.get(id)
    if (!g) {
      g = { Rows: 0 }
      for (const k of keys) g[k] = r[k]
      for (const s of sumKeys) g[s] = 0
      groups.set(id, g)
    }
    g.Rows += 1
    for (const s of sumKeys) g[s] += num(r[s]) ?? 0
  }
  return [...groups.values()].map((g) => {
    for (const s of sumKeys) g[s] = round2(g[s])
    return g
  })
}

// Totals per month, oldest first (for trend charts).
const trendByMonth = (rows, valueKey) => sumBy(rows, 'Month', valueKey).sort((a, b) => a.Month.localeCompare(b.Month))

// Add a `Note` column and a `_mark` flag ('high' / 'low') to rows far from their group's usual value
// (more than `z` standard deviations from the group average; needs at least 4 rows in the group).
function markOutliers(rows, groupKey, valueKey, z = 1.5) {
  const values = {}
  for (const r of rows) (values[r[groupKey]] ??= []).push(num(r[valueKey]) ?? 0)
  const stats = {}
  for (const [g, v] of Object.entries(values)) {
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    stats[g] = { n: v.length, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) }
  }
  return rows.map((r) => {
    const s = stats[r[groupKey]]
    const v = num(r[valueKey]) ?? 0
    if (s.n >= 4 && s.sd > 0 && v > s.mean + z * s.sd) return { ...r, Note: 'Unusually high', _mark: 'high' }
    if (s.n >= 4 && s.sd > 0 && v < s.mean - z * s.sd) return { ...r, Note: 'Unusually low', _mark: 'low' }
    return { ...r, Note: '' }
  })
}

const markOf = (row) => row._mark

// Like markOutliers, but for costs: an unusually high month is bad (red) and an unusually low one is simply noted.
function markCosts(rows, groupKey, valueKey) {
  return markOutliers(rows, groupKey, valueKey).map((r) => {
    if (r._mark === 'high') return { ...r, Note: 'Unusually costly', _mark: 'low' }
    if (r._mark === 'low') return { ...r, Note: 'Unusually cheap', _mark: undefined }
    return r
  })
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Add Month, Weekday and RefundRate (% of that day's tickets that were refunded) to a daily attendance row.
function withDayInfo(r) {
  const day = String(r.VisitDate).slice(0, 10)
  const dow = new Date(day + 'T00:00:00Z').getUTCDay() // 0 = Sunday
  const all = (r.ValidTickets ?? 0) + (r.RefundedTickets ?? 0)
  return { ...r, VisitDate: day, Month: day.slice(0, 7), Weekday: WEEKDAYS[(dow + 6) % 7], RefundRate: pct(r.RefundedTickets ?? 0, all) }
}

// One row per day of the week with the average tickets, fill, refund rate and revenue. Monday first; weekdays with no data are left out.
function byWeekday(rows) {
  return WEEKDAYS.map((Weekday) => {
    const days = rows.filter((r) => r.Weekday === Weekday)
    if (days.length === 0) return null
    const valid = total(days, 'ValidTickets')
    const refunded = total(days, 'RefundedTickets')
    return {
      Weekday,
      Days: days.length,
      AvgTickets: round2(valid / days.length),
      AvgFill: round2(total(days, 'PctOfCapacity') / days.length),
      RefundRate: pct(refunded, valid + refunded),
      AvgRevenue: round2(total(days, 'TicketRevenue') / days.length),
    }
  }).filter(Boolean)
}

// Flag days that are full, far busier than usual, or have an unusually high share of refunds.
function markDays(rows) {
  const fills = rows.map((r) => r.PctOfCapacity ?? 0)
  const mean = fills.length ? fills.reduce((a, b) => a + b, 0) / fills.length : 0
  const sd = Math.sqrt(fills.length ? fills.reduce((a, b) => a + (b - mean) ** 2, 0) / fills.length : 0)
  return rows.map((r) => {
    if ((r.RefundedTickets ?? 0) >= 3 && r.RefundRate >= 15) return { ...r, Note: 'High refund rate', _mark: 'low' }
    if (r.PctOfCapacity >= 100) return { ...r, Note: 'At capacity', _mark: 'high' }
    if (rows.length >= 8 && sd > 0 && r.PctOfCapacity > mean + 2 * sd) return { ...r, Note: 'Spike', _mark: 'high' }
    return { ...r, Note: '' }
  })
}

// A facility with three or more unplanned jobs, or availability under 95%.
const isConcern = (f) => f.Unplanned >= 3 || f.AvailabilityPct < 95

const TIERS = ['Basic', 'Plus', 'Premier']

// One row per membership (v_MembershipPerformance) with real numbers, a Status and a Month.
function prepMemberships(rows) {
  return toNumbers(rows, ['Price', 'Visits', 'ExtrasSpend', 'DaysToExpiry']).map((r) => {
    const active = Number(r.IsActiveNow) === 1
    return {
      ...r,
      AutoRenew: Number(r.AutoRenew) === 1,
      RenewedLater: Number(r.RenewedLater) === 1,
      Status: active ? 'Active' : r.DaysToExpiry < 0 ? 'Expired' : 'Not started',
      Month: monthOf(r.StartDate),
    }
  })
}

const tiersIn = (rows) => TIERS.filter((t) => rows.some((r) => r.Tier === t))

// Per tier (and a last "All tiers" row): ended memberships, how many were followed by another one, and auto-renew share of the active ones.
function retentionByTier(rows) {
  const line = (label, list) => {
    const expired = list.filter((r) => r.Status === 'Expired')
    const active = list.filter((r) => r.Status === 'Active')
    const renewed = expired.filter((r) => r.RenewedLater).length
    return {
      Tier: label,
      Expired: expired.length,
      Renewed: renewed,
      RetentionRate: pct(renewed, expired.length),
      Active: active.length,
      AutoRenewShare: active.length ? `${pct(active.filter((r) => r.AutoRenew).length, active.length)}%` : '—',
    }
  }
  return [...tiersIn(rows).map((t) => line(t, rows.filter((r) => r.Tier === t))), line('All tiers', rows)]
}

// Active memberships ending in 0-30, 31-60 and 61-90 days. perTier = one row per window and tier, otherwise one row per window.
function expiringBuckets(rows, perTier) {
  const windows = [
    ['0-30 days', 0, 30],
    ['31-60 days', 31, 60],
    ['61-90 days', 61, 90],
  ]
  const active = rows.filter((r) => r.Status === 'Active')
  const out = []
  for (const [EndsIn, lo, hi] of windows) {
    const inWindow = active.filter((r) => r.DaysToExpiry >= lo && r.DaysToExpiry <= hi)
    const groups = perTier ? tiersIn(inWindow).map((t) => [t, inWindow.filter((r) => r.Tier === t)]) : [['All tiers', inWindow]]
    for (const [Tier, list] of groups) {
      const lapse = list.filter((r) => !r.AutoRenew)
      const row = { EndsIn, Expiring: list.length, AutoRenew: list.length - lapse.length, NotAutoRenew: lapse.length }
      if (perTier) Object.assign(row, { Tier, RevenueAtRiskEstimate: round2(total(lapse, 'Price')) })
      out.push(row)
    }
  }
  return out
}

// One row per tier: average visits, extra spend, price paid, and how many memberships were never used (started ones only).
function spendByTier(rows) {
  return tiersIn(rows).map((Tier) => {
    const list = rows.filter((r) => r.Tier === Tier)
    const started = list.filter((r) => r.Status !== 'Not started')
    return {
      Tier,
      Memberships: list.length,
      AvgVisits: round2(total(list, 'Visits') / list.length),
      AvgExtraSpend: round2(total(list, 'ExtrasSpend') / list.length),
      AvgPricePaid: round2(total(list, 'Price') / list.length),
      NeverVisited: started.length ? `${pct(started.filter((r) => r.Visits === 0).length, started.length)}%` : '—',
    }
  })
}

// Parse a MySQL date or datetime as a UTC time in ms (both ends of a comparison use the same rule, so the offset cancels out).
const stamp = (v) => Date.parse(String(v).slice(0, 19).replace(' ', 'T') + 'Z')

// One row per maintenance job (v_MaintenanceHistory) with real numbers, a Month and a plain Kind (Planned or Unplanned).
function prepJobs(rows) {
  return toNumbers(rows, ['CrewSize', 'HoursDown', 'RepairCost']).map((r) => ({
    ...r,
    Month: monthOf(r.StartDate),
    Kind: Number(r.IsPlanned) === 1 ? 'Planned' : 'Unplanned',
  }))
}

// One row per ride, game or venue: jobs, planned vs unplanned, hours down, cost, and availability over the period the rows cover.
// Availability is an estimate: it treats every maintenance hour as fully closed.
function facilityStats(rows) {
  const starts = rows.map((r) => stamp(r.StartDate)).filter((t) => !Number.isNaN(t))
  const ends = rows.map((r) => (r.EndDate ? stamp(r.EndDate) : Date.now())).filter((t) => !Number.isNaN(t))
  const windowHours = starts.length ? Math.max(24, (Math.max(...ends) - Math.min(...starts)) / 3600000) : 24
  return groupSum(rows, ['FacilityKind', 'FacilityName'], ['HoursDown', 'RepairCost']).map((g) => {
    const jobs = rows.filter((r) => r.FacilityName === g.FacilityName && r.FacilityKind === g.FacilityKind)
    const unplanned = jobs.filter((r) => r.Kind === 'Unplanned').length
    return {
      FacilityKind: g.FacilityKind,
      FacilityName: g.FacilityName,
      Jobs: jobs.length,
      Planned: jobs.length - unplanned,
      Unplanned: unplanned,
      HoursDown: g.HoursDown,
      AvailabilityPct: Math.max(0, round2(100 - (100 * g.HoursDown) / windowHours)),
      WindowDays: round2(windowHours / 24),
      RepairCost: g.RepairCost,
    }
  })
}

const withMonth = (yearKey, monthKey) => (rows) =>
  rows.map((r) => ({ ...r, Month: `${r[yearKey]}-${String(r[monthKey]).padStart(2, '0')}` }))

// ---------- the reports ----------

const ALL_REPORTS = [
  // ---- Revenue and retail ----
  // One merged report. Each tab is a section with its own data, filters, chart and plain-words notes.
  // No profit margin: items have a price but no cost in the database (see the project document).
  {
    key: 'revenue',
    group: 'Revenue reports',
    title: 'Revenue & Sales Performance',
    description: 'Where the money comes from, what sells best and worst, and what visitors spend. Pick a tab.',
    roles: RETAIL,
    sections: [
      {
        key: 'overview',
        title: 'Revenue by source',
        sectionDescription: 'Where does the money come from, and is it growing? Refunded tickets are left out.',
        endpoint: 'revenue-by-source',
        view: 'v_RevenueBySource',
        prepare: (rows) => toNumbers(rows, ['Revenue']).map((r) => ({ ...r, Month: monthOf(r.RevenueDate) })),
        filters: [{ key: 'Source', label: 'Source' }],
        dateFilter: { key: 'RevenueDate', label: 'Date' },
        kpis: (rows) => {
          const bySource = sumBy(rows, 'Source', 'Revenue')
          const change = periodChange(rows, 'RevenueDate', 'Revenue')
          const months = trendByMonth(rows, 'Revenue')
          const best = extreme(months, 'Revenue')
          return [
            { label: 'Total revenue', value: money(total(rows, 'Revenue')) },
            { label: 'Biggest source', value: bySource[0] ? bySource[0].Source : '—', note: bySource[0] ? money(bySource[0].Revenue) : '' },
            { label: 'Best month', value: best ? best.row.Month : '—', note: best ? money(best.v) : '' },
            {
              label: 'Last 30 days vs the 30 before',
              value: change ? `${change.pct >= 0 ? '+' : ''}${change.pct.toFixed(1)}%` : '—',
              note: change ? `${money(change.recent)} vs ${money(change.prior)}` : 'Not enough data to compare',
            },
          ]
        },
        insights: (rows) => {
          const by = sumBy(rows, 'Source', 'Revenue')
          const all = total(rows, 'Revenue')
          if (by.length === 0) return []
          const last = by[by.length - 1]
          const out = [`${by[0].Source} is the biggest source: ${pct(by[0].Revenue, all)}% of all revenue.`]
          if (by.length > 1) out.push(`${last.Source} is the smallest: ${pct(last.Revenue, all)}%.`)
          return out
        },
        notes: [
          'Memberships are counted in full on the day they start, so they make single days or months look high.',
          'The newest month may be unfinished, so it can look low. Shaded table rows are far from that source\'s usual month: green is high, red is low.',
        ],
        chartRows: (rows) => sumBy(rows, 'Source', 'Revenue'),
        chart: { type: 'bar', x: 'Source', y: 'Revenue', yLabel: 'Revenue ($)' },
        extraChart: { title: 'Revenue per month (all sources)', rows: (rows) => trendByMonth(rows, 'Revenue'), chart: { type: 'line', x: 'Month', y: 'Revenue', yLabel: 'Revenue ($)' } },
        tableRows: (rows) =>
          markOutliers(groupSum(rows, ['Month', 'Source'], ['Revenue']), 'Source', 'Revenue').sort(
            (a, b) => a.Month.localeCompare(b.Month) || a.Source.localeCompare(b.Source),
          ),
        columns: ['Month', 'Source', 'Revenue', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'categories',
        title: 'By category',
        sectionDescription: 'Which kinds of food and merchandise earn the most?',
        endpoint: 'item-sales',
        view: 'v_ItemSales',
        prepare: (rows) =>
          toNumbers(rows, ['Units', 'Revenue']).map((r) => ({
            ...r,
            Month: r.SaleYear ? `${r.SaleYear}-${String(r.SaleMonth).padStart(2, '0')}` : 'Never sold',
          })),
        filters: [
          { key: 'VenueType', label: 'Venue type' },
          { key: 'Month', label: 'Month' },
        ],
        kpis: (rows) => {
          const by = sumBy(rows, 'Category', 'Revenue')
          const all = total(rows, 'Revenue')
          const worst = by[by.length - 1]
          return [
            { label: 'Food and shop revenue', value: money(all) },
            { label: 'Top category', value: by[0] ? by[0].Category : '—', note: by[0] ? `${money(by[0].Revenue)} (${pct(by[0].Revenue, all)}%)` : '' },
            { label: 'Weakest category', value: worst ? worst.Category : '—', note: worst ? `${money(worst.Revenue)} (${pct(worst.Revenue, all)}%)` : '' },
            { label: 'Units sold', value: total(rows, 'Units').toLocaleString('en-US') },
          ]
        },
        notes: [
          'Category groups items the way the menu and shops do (Entree, Drink, Toy, Souvenir...). Tickets, memberships and games are not items, so they are not here.',
          'Green rows lead their category group; red rows earn less than half the average category.',
        ],
        chartRows: (rows) => sumBy(rows, 'Category', 'Revenue'),
        chart: { type: 'bar', x: 'Category', y: 'Revenue', yLabel: 'Revenue ($)' },
        tableRows: (rows) => {
          const cats = groupSum(rows, ['Category'], ['Units', 'Revenue']).sort((a, b) => b.Revenue - a.Revenue)
          const all = total(cats, 'Revenue')
          const avg = cats.length ? all / cats.length : 0
          return cats.map((c, i) => ({
            Category: c.Category,
            Units: c.Units,
            Revenue: c.Revenue,
            ShareOfSales: `${pct(c.Revenue, all)}%`,
            Note: i === 0 ? 'Top category' : c.Revenue < avg / 2 ? 'Well below average' : '',
            _mark: i === 0 ? 'high' : c.Revenue < avg / 2 ? 'low' : undefined,
          }))
        },
        columns: ['Category', 'Units', 'Revenue', 'ShareOfSales', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'sellers',
        title: 'Best & worst sellers',
        sectionDescription: 'Which items sell best, and which barely sell at all?',
        endpoint: 'item-sales',
        view: 'v_ItemSales',
        prepare: (rows) =>
          toNumbers(rows, ['Units', 'Revenue']).map((r) => ({
            ...r,
            Month: r.SaleYear ? `${r.SaleYear}-${String(r.SaleMonth).padStart(2, '0')}` : 'Never sold',
          })),
        filters: [
          { key: 'VenueName', label: 'Venue' },
          { key: 'Category', label: 'Category' },
          { key: 'Month', label: 'Month' },
        ],
        kpis: (rows) => {
          const items = groupSum(rows, ['ItemName', 'VenueName'], ['Units', 'Revenue']).sort((a, b) => b.Revenue - a.Revenue)
          const best = items[0]
          const worst = items[items.length - 1]
          return [
            { label: 'Best seller', value: best ? best.ItemName : '—', note: best ? `${money(best.Revenue)} at ${best.VenueName}` : '' },
            { label: 'Weakest seller', value: worst ? worst.ItemName : '—', note: worst ? `${money(worst.Revenue)} at ${worst.VenueName}` : '' },
            { label: 'Items with no sales', value: items.filter((i) => i.Units === 0).length.toLocaleString('en-US'), note: 'in this selection' },
          ]
        },
        notes: [
          'Items that were never sold show with 0 units. They only appear while Month is "All" or "Never sold", because they have no month.',
          'Green rows are the five best sellers, red rows the five weakest. A weak seller may need a promotion, a new price, or removal from the menu.',
        ],
        chartRows: (rows) => groupSum(rows, ['ItemName'], ['Revenue']).sort((a, b) => b.Revenue - a.Revenue).slice(0, 10),
        chart: { type: 'bar', x: 'ItemName', y: 'Revenue', yLabel: 'Top 10 items by revenue ($)', angle: true },
        tableRows: (rows) => {
          const items = groupSum(rows, ['ItemName', 'VenueName', 'Category'], ['Units', 'Revenue']).sort((a, b) => b.Revenue - a.Revenue)
          return items.map((r, i) => {
            const top = i < 5
            const bottom = items.length > 10 && i >= items.length - 5
            return {
              Rank: i + 1,
              ItemName: r.ItemName,
              VenueName: r.VenueName,
              Category: r.Category,
              Units: r.Units,
              Revenue: r.Revenue,
              Note: top ? 'Top seller' : bottom ? (r.Units === 0 ? 'Never sold' : 'Weak seller') : '',
              _mark: top ? 'high' : bottom ? 'low' : undefined,
            }
          })
        },
        columns: ['Rank', 'ItemName', 'VenueName', 'Category', 'Units', 'Revenue', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'venues',
        title: 'By venue',
        sectionDescription: 'Which restaurants and shops earn the most, and how big is an average sale?',
        endpoint: 'retail-sales',
        view: 'v_RetailSalesByVenue',
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
          const orders = total(rows, 'Orders')
          return [
            { label: 'Total sales', value: money(total(rows, 'Revenue')) },
            { label: 'Top venue', value: byVenue[0] ? byVenue[0].VenueName : '—', note: byVenue[0] ? money(byVenue[0].Revenue) : '' },
            { label: 'Lowest venue', value: worst ? worst.VenueName : '—', note: worst ? money(worst.Revenue) : '' },
            { label: 'Average sale', value: orders ? money2(total(rows, 'Revenue') / orders) : '—', note: 'per purchase line' },
          ]
        },
        notes: [
          'A purchase line is one item bought in one sale, not a whole basket, so "average sale" is the average spend on one line.',
          'Green rows are venues earning well above the average venue, red rows well below it.',
        ],
        chartRows: (rows) => sumBy(rows, 'VenueName', 'Revenue'),
        chart: { type: 'bar', x: 'VenueName', y: 'Revenue', yLabel: 'Revenue ($)', angle: true },
        tableRows: (rows) => {
          const venues = groupSum(rows, ['VenueName', 'VenueType'], ['Orders', 'Units', 'Revenue']).sort((a, b) => b.Revenue - a.Revenue)
          const avg = venues.length ? total(venues, 'Revenue') / venues.length : 0
          return venues.map((v) => {
            const mark = venues.length >= 4 && v.Revenue > avg * 1.5 ? 'high' : venues.length >= 4 && v.Revenue < avg * 0.5 ? 'low' : undefined
            return {
              VenueName: v.VenueName,
              VenueType: v.VenueType,
              Orders: v.Orders,
              Units: v.Units,
              Revenue: v.Revenue,
              AverageSale: v.Orders ? round2(v.Revenue / v.Orders) : null,
              Note: mark === 'high' ? 'Well above average' : mark === 'low' ? 'Well below average' : '',
              _mark: mark,
            }
          })
        },
        columns: ['VenueName', 'VenueType', 'Orders', 'Units', 'Revenue', 'AverageSale', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'spending',
        title: 'Spending per visit',
        sectionDescription: 'How much does a visitor spend on food, shopping and games on top of the ticket? Refunded tickets are left out.',
        endpoint: 'visit-spending',
        view: 'v_VisitSpending',
        prepare: (rows) =>
          toNumbers(rows, ['TicketPrice', 'FoodTotal', 'ShopTotal', 'GameTotal']).map((r) => ({
            ...r,
            Month: monthOf(r.VisitDate),
            ExtrasTotal: round2((r.FoodTotal ?? 0) + (r.ShopTotal ?? 0) + (r.GameTotal ?? 0)),
          })),
        dateFilter: { key: 'VisitDate', label: 'Visit date' },
        kpis: (rows) => {
          const spenders = rows.filter((r) => r.ExtrasTotal > 0)
          return [
            { label: 'Visits', value: rows.length.toLocaleString('en-US') },
            { label: 'Average extra spend per visit', value: '$' + average(rows, 'ExtrasTotal'), note: 'food + shop + games' },
            { label: 'Average basket', value: spenders.length ? '$' + average(spenders, 'ExtrasTotal') : '—', note: 'visits that bought something' },
            { label: 'Visits with no extra spend', value: rows.length ? `${pct(rows.length - spenders.length, rows.length)}%` : '—' },
          ]
        },
        notes: [
          'Extra spend is everything bought after the ticket: food, gift shop items and games.',
          'Average basket only counts visits that bought something. A high share of no-spend visits means guests are not buying inside the park.',
          'Red months spend at least a fifth less per visit than the overall average, green months at least a fifth more.',
        ],
        chartRows: (rows) => [
          { Type: 'Food', Average: Number(average(rows, 'FoodTotal')) },
          { Type: 'Shop', Average: Number(average(rows, 'ShopTotal')) },
          { Type: 'Games', Average: Number(average(rows, 'GameTotal')) },
        ],
        chart: { type: 'bar', x: 'Type', y: 'Average', yLabel: 'Average spend per visit ($)' },
        tableRows: (rows) => {
          const overall = rows.length ? total(rows, 'ExtrasTotal') / rows.length : 0
          return groupSum(rows, ['Month'], ['FoodTotal', 'ShopTotal', 'GameTotal', 'ExtrasTotal'])
            .sort((a, b) => a.Month.localeCompare(b.Month))
            .map((m) => {
              const avg = m.Rows ? m.ExtrasTotal / m.Rows : 0
              const mark = overall > 0 && m.Rows >= 5 ? (avg < overall * 0.8 ? 'low' : avg > overall * 1.2 ? 'high' : undefined) : undefined
              return {
                Month: m.Month,
                Visits: m.Rows,
                AvgFood: round2(m.FoodTotal / m.Rows),
                AvgShop: round2(m.ShopTotal / m.Rows),
                AvgGames: round2(m.GameTotal / m.Rows),
                AvgExtras: round2(avg),
                Note: mark === 'high' ? 'Spending well above average' : mark === 'low' ? 'Spending well below average' : '',
                _mark: mark,
              }
            })
        },
        columns: ['Month', 'Visits', 'AvgFood', 'AvgShop', 'AvgGames', 'AvgExtras', 'Note'],
        rowClass: markOf,
      },
    ],
  },
  // One merged report. Four tabs; the first is the old Membership Summary.
  // Retention is "bought another membership later", which is as close as the data gets (there is no cancel date).
  {
    key: 'memberships',
    group: 'Revenue reports',
    title: 'Membership Performance',
    description: 'Which tiers sell, who renews, which memberships are about to lapse, and what members spend.',
    roles: RETAIL,
    sections: [
      {
        key: 'tiers',
        title: 'Tiers',
        sectionDescription: 'Which membership tiers sell, and how often do members visit?',
        endpoint: 'membership-summary',
        view: 'v_MembershipSummary',
        prepare: (rows) =>
          toNumbers(rows, ['CurrentPrice', 'Memberships', 'ActiveNow', 'ExpiringIn30Days', 'MembershipRevenue', 'Visits', 'VisitsPerMembership']),
        kpis: (rows) => {
          const top = extreme(rows, 'MembershipRevenue')
          return [
            { label: 'Memberships sold', value: total(rows, 'Memberships').toLocaleString('en-US') },
            { label: 'Active now', value: total(rows, 'ActiveNow').toLocaleString('en-US') },
            { label: 'Expiring in 30 days', value: total(rows, 'ExpiringIn30Days').toLocaleString('en-US') },
            { label: 'Membership revenue', value: money(total(rows, 'MembershipRevenue')), note: top ? `${top.row.Tier} earns the most` : '' },
          ]
        },
        notes: [
          'Membership revenue is the price paid when each membership was sold, so it can differ from today\'s tier price.',
          'Green is the tier that earns the most. Red means a quarter or more of that tier\'s active members expire within 30 days.',
        ],
        chart: { type: 'bar', x: 'Tier', y: 'Memberships' },
        tableRows: (rows) => {
          const all = total(rows, 'MembershipRevenue')
          const top = extreme(rows, 'MembershipRevenue')
          return rows.map((r) => {
            const lapsing = r.ActiveNow > 0 && r.ExpiringIn30Days / r.ActiveNow >= 0.25
            const best = top && top.row === r
            return {
              Tier: r.Tier,
              CurrentPrice: r.CurrentPrice,
              Memberships: r.Memberships,
              ActiveNow: r.ActiveNow,
              ExpiringIn30Days: r.ExpiringIn30Days,
              MembershipRevenue: r.MembershipRevenue,
              ShareOfRevenue: `${pct(r.MembershipRevenue, all)}%`,
              VisitsPerMembership: r.VisitsPerMembership,
              Note: lapsing ? 'Many expiring soon' : best ? 'Top earner' : '',
              _mark: lapsing ? 'low' : best ? 'high' : undefined,
            }
          })
        },
        columns: ['Tier', 'CurrentPrice', 'Memberships', 'ActiveNow', 'ExpiringIn30Days', 'MembershipRevenue', 'ShareOfRevenue', 'VisitsPerMembership', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'retention',
        title: 'Renewals & retention',
        sectionDescription: 'Of the memberships that ended, how many came back with another one?',
        endpoint: 'membership-performance',
        view: 'v_MembershipPerformance',
        prepare: prepMemberships,
        filters: [{ key: 'Tier', label: 'Tier' }],
        kpis: (rows) => {
          const t = retentionByTier(rows)
          const all = t[t.length - 1]
          const active = rows.filter((r) => r.Status === 'Active')
          return [
            { label: 'Retention rate', value: all.Expired ? `${all.RetentionRate}%` : '—', note: `${all.Renewed} of ${all.Expired} ended memberships renewed` },
            { label: 'Ended memberships', value: all.Expired.toLocaleString('en-US') },
            { label: 'Active memberships', value: active.length.toLocaleString('en-US') },
            { label: 'Active on auto-renew', value: active.length ? `${pct(active.filter((r) => r.AutoRenew).length, active.length)}%` : '—' },
          ]
        },
        notes: [
          'Retention is the share of ended memberships whose owner later bought another one. There is no cancellation date in the data, so this is the closest measure.',
          'Auto-renew members usually stay, so a high auto-renew share protects next year\'s revenue.',
          'Red tiers keep at least 10 points fewer members than the park overall.',
        ],
        chartRows: (rows) => retentionByTier(rows).filter((t) => t.Tier !== 'All tiers'),
        chart: { type: 'bar', x: 'Tier', y: 'RetentionRate', yLabel: 'Retention rate (%)' },
        tableRows: (rows) => {
          const t = retentionByTier(rows)
          const overall = t[t.length - 1].RetentionRate
          return t.map((r) => {
            const low = r.Tier !== 'All tiers' && r.Expired >= 5 && r.RetentionRate < overall - 10
            return { ...r, Note: low ? 'Keeps fewer members than average' : '', _mark: low ? 'low' : undefined }
          })
        },
        columns: ['Tier', 'Expired', 'Renewed', 'RetentionRate', 'Active', 'AutoRenewShare', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'expiring',
        title: 'Expiring soon',
        sectionDescription: 'How many active memberships end in the next 90 days, and how many are set to renew by themselves?',
        endpoint: 'membership-performance',
        view: 'v_MembershipPerformance',
        prepare: prepMemberships,
        filters: [{ key: 'Tier', label: 'Tier' }],
        kpis: (rows) => {
          const soon = rows.filter((r) => r.Status === 'Active' && r.DaysToExpiry <= 90)
          const lapse = soon.filter((r) => !r.AutoRenew)
          const next30 = soon.filter((r) => r.DaysToExpiry <= 30)
          return [
            { label: 'Ending in 30 days', value: next30.length.toLocaleString('en-US') },
            { label: 'Ending in 90 days', value: soon.length.toLocaleString('en-US') },
            { label: 'Not on auto-renew', value: lapse.length.toLocaleString('en-US'), note: 'likely to lapse unless contacted' },
            { label: 'Revenue at risk (estimate)', value: money(total(lapse, 'Price')), note: 'what these memberships paid' },
          ]
        },
        notes: [
          'These are active memberships only. The ones on auto-renew should continue by themselves.',
          'Revenue at risk is an estimate: it adds up what each non-auto-renew membership paid, assuming none of them renew.',
          'Red rows have at least half of their memberships off auto-renew. Those are the guests worth a reminder or an offer.',
        ],
        chartRows: (rows) => expiringBuckets(rows, false),
        chart: { type: 'bar', x: 'EndsIn', y: 'NotAutoRenew', y2: 'AutoRenew', yLabel: 'Not on auto-renew', y2Label: 'On auto-renew' },
        tableRows: (rows) =>
          expiringBuckets(rows, true).map((r) => {
            const low = r.Expiring >= 3 && r.NotAutoRenew / r.Expiring >= 0.5
            return { ...r, Note: low ? 'Most may lapse' : '', _mark: low ? 'low' : undefined }
          }),
        columns: ['EndsIn', 'Tier', 'Expiring', 'AutoRenew', 'NotAutoRenew', 'RevenueAtRiskEstimate', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'spend',
        title: 'Spend per member',
        sectionDescription: 'Do members visit and spend enough to be worth their discount?',
        endpoint: 'membership-performance',
        view: 'v_MembershipPerformance',
        prepare: prepMemberships,
        filters: [
          { key: 'Tier', label: 'Tier' },
          { key: 'Status', label: 'Status' },
        ],
        kpis: (rows) => {
          const unused = rows.filter((r) => r.Visits === 0 && r.Status !== 'Not started')
          return [
            { label: 'Memberships', value: rows.length.toLocaleString('en-US') },
            { label: 'Average visits', value: average(rows, 'Visits'), note: 'per membership' },
            { label: 'Average extra spend', value: '$' + average(rows, 'ExtrasSpend'), note: 'food, shop and games per membership' },
            { label: 'Never visited', value: rows.length ? `${pct(unused.length, rows.length)}%` : '—', note: 'memberships with no visit' },
          ]
        },
        notes: [
          'Extra spend is what members bought inside the park (food, shop, games) on visits that used their membership.',
          'A membership that was never used is unlikely to renew, so a high "never visited" share is a retention warning.',
          'Green is the tier whose members spend the most inside the park.',
        ],
        chartRows: (rows) => spendByTier(rows),
        chart: { type: 'bar', x: 'Tier', y: 'AvgExtraSpend', y2: 'AvgPricePaid', yLabel: 'Average extra spend ($)', y2Label: 'Average price paid ($)' },
        tableRows: (rows) => {
          const t = spendByTier(rows)
          const top = extreme(t, 'AvgExtraSpend')
          return t.map((r) => {
            const best = t.length > 1 && top && top.row === r
            return { ...r, Note: best ? 'Highest in-park spend' : '', _mark: best ? 'high' : undefined }
          })
        },
        columns: ['Tier', 'Memberships', 'AvgVisits', 'AvgExtraSpend', 'AvgPricePaid', 'NeverVisited', 'Note'],
        rowClass: markOf,
      },
    ],
  },

  // ---- Attendance ----
  // One merged report. Customers per Month and Daily Attendance are both on the professor's list, so each keeps its own tab (first two).
  {
    key: 'attendance',
    group: 'Attendance reports',
    title: 'Attendance & Capacity Performance',
    description: 'How many guests visit, which days and months are busiest or slowest, and how close the park gets to its limit.',
    required: true,
    roles: ATTENDANCE,
    sections: [
      {
        key: 'customers-per-month',
        title: 'Customers per Month',
        sectionDescription: 'How many different customers visit each month (refunded tickets excluded)?',
        endpoint: 'customers-per-month',
        view: 'v_CustomersPerMonth',
        prepare: (rows) => toNumbers(withMonth('VisitYear', 'VisitMonth')(rows), ['Customers']).map((r) => ({ ...r, All: 'all' })),
        kpis: (rows) => {
          const best = extreme(rows, 'Customers')
          const slow = extreme(rows, 'Customers', true)
          const sorted = [...rows].sort((a, b) => a.Month.localeCompare(b.Month))
          const last = sorted[sorted.length - 1]
          const before = sorted[sorted.length - 2]
          return [
            { label: 'Average per month', value: average(rows, 'Customers') },
            { label: 'Best month', value: best ? best.row.Month : '—', note: best ? `${best.v.toLocaleString('en-US')} customers` : '' },
            { label: 'Slowest month', value: slow ? slow.row.Month : '—', note: slow ? `${slow.v.toLocaleString('en-US')} customers` : '' },
            {
              label: 'Latest month vs the one before',
              value: last && before && before.Customers ? `${last.Customers >= before.Customers ? '+' : ''}${(((last.Customers - before.Customers) / before.Customers) * 100).toFixed(1)}%` : '—',
              note: last ? last.Month : '',
            },
          ]
        },
        notes: [
          'A customer counts once per month, however many times they visit. Refunded tickets are not counted.',
          'The newest month may be unfinished, so it can look low. Green months are far above the usual month, red months far below.',
        ],
        chartRows: (rows) => [...rows].sort((a, b) => a.Month.localeCompare(b.Month)),
        chart: { type: 'bar', x: 'Month', y: 'Customers' },
        tableRows: (rows) => markOutliers([...rows].sort((a, b) => a.Month.localeCompare(b.Month)), 'All', 'Customers'),
        columns: ['Month', 'Customers', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'daily',
        title: 'Daily Attendance & Spikes',
        sectionDescription: 'Which days fill the park, and how close do we get to capacity?',
        endpoint: 'daily-attendance',
        view: 'v_DailyAttendance',
        prepare: (rows) => toNumbers(rows, ['ValidTickets', 'RefundedTickets', 'PctOfCapacity', 'TicketRevenue']).map(withDayInfo),
        filters: [{ key: 'Weekday', label: 'Day of week' }],
        dateFilter: { key: 'VisitDate', label: 'Visit date' },
        kpis: (rows) => {
          const busiest = extreme(rows, 'PctOfCapacity')
          const quiet = extreme(rows, 'PctOfCapacity', true)
          const valid = total(rows, 'ValidTickets')
          const refunded = total(rows, 'RefundedTickets')
          return [
            { label: 'Busiest day', value: busiest ? busiest.row.VisitDate : '—', note: busiest ? `${busiest.v}% of capacity` : '' },
            { label: 'Quietest day', value: quiet ? quiet.row.VisitDate : '—', note: quiet ? `${quiet.v}% of capacity` : '' },
            { label: 'Average fill', value: average(rows, 'PctOfCapacity') + '%' },
            { label: 'Days at capacity', value: rows.filter((r) => r.PctOfCapacity >= 100).length.toLocaleString('en-US') },
            { label: 'Refund rate', value: valid + refunded ? `${pct(refunded, valid + refunded)}%` : '—', note: `${refunded.toLocaleString('en-US')} refunded tickets` },
          ]
        },
        notes: [
          'Fill is the share of the park\'s daily limit that valid tickets use. At 100% the park is full and no more tickets can be sold for that day.',
          'Green rows are spikes: far busier than a usual day, or full. Red rows are days with an unusually high share of refunds, which is often bad weather or a closure.',
        ],
        chartRows: (rows) => [...rows].sort((a, b) => a.VisitDate.localeCompare(b.VisitDate)),
        chart: { type: 'line', x: 'VisitDate', y: 'PctOfCapacity', yLabel: '% of capacity' },
        extraChart: {
          title: 'Average fill by day of week',
          rows: (rows) => byWeekday(rows).map((w) => ({ Weekday: w.Weekday, AvgFill: w.AvgFill })),
          chart: { type: 'bar', x: 'Weekday', y: 'AvgFill', yLabel: 'Average % of capacity' },
        },
        tableRows: (rows) => markDays(rows).sort((a, b) => b.VisitDate.localeCompare(a.VisitDate)),
        columns: ['VisitDate', 'Weekday', 'ValidTickets', 'RefundedTickets', 'RefundRate', 'PctOfCapacity', 'TicketRevenue', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'peaks',
        title: 'Peak & slow periods',
        sectionDescription: 'Which days of the week and which months are busiest, and where is there room to grow?',
        endpoint: 'daily-attendance',
        view: 'v_DailyAttendance',
        prepare: (rows) => toNumbers(rows, ['ValidTickets', 'RefundedTickets', 'PctOfCapacity', 'TicketRevenue']).map(withDayInfo),
        filters: [{ key: 'Month', label: 'Month' }],
        kpis: (rows) => {
          const days = byWeekday(rows)
          const top = extreme(days, 'AvgTickets')
          const low = extreme(days, 'AvgTickets', true)
          const spare = rows.length ? rows.filter((r) => r.PctOfCapacity < 50).length : 0
          return [
            { label: 'Busiest day of week', value: top ? top.row.Weekday : '—', note: top ? `${top.v} tickets on average` : '' },
            { label: 'Slowest day of week', value: low ? low.row.Weekday : '—', note: low ? `${low.v} tickets on average` : '' },
            { label: 'Days under half full', value: spare.toLocaleString('en-US'), note: rows.length ? `${pct(spare, rows.length)}% of days` : '' },
          ]
        },
        insights: (rows) => {
          const days = byWeekday(rows)
          const top = extreme(days, 'AvgTickets')
          const low = extreme(days, 'AvgTickets', true)
          if (!top || !low || top.row.Weekday === low.row.Weekday || !low.v) return []
          return [`${top.row.Weekday} brings about ${(top.v / low.v).toFixed(1)} times the guests of ${low.row.Weekday}.`]
        },
        notes: [
          'Slow days have the most room for promotions or weekday-only deals. Busy days are where queues and staffing need the most attention.',
          'Green weekdays are well above the weekly average, red ones well below.',
        ],
        chartRows: (rows) => byWeekday(rows),
        chart: { type: 'bar', x: 'Weekday', y: 'AvgTickets', yLabel: 'Average valid tickets per day' },
        tableRows: (rows) => {
          const days = byWeekday(rows)
          const avg = days.length ? days.reduce((a, d) => a + d.AvgTickets, 0) / days.length : 0
          return days.map((d) => {
            const mark = days.length >= 5 && avg > 0 ? (d.AvgTickets > avg * 1.25 ? 'high' : d.AvgTickets < avg * 0.75 ? 'low' : undefined) : undefined
            return { ...d, Note: mark === 'high' ? 'Peak day' : mark === 'low' ? 'Slow day' : '', _mark: mark }
          })
        },
        columns: ['Weekday', 'Days', 'AvgTickets', 'AvgFill', 'RefundRate', 'AvgRevenue', 'Note'],
        rowClass: markOf,
      },
    ],
  },

  // ---- Maintenance ----
  // One merged report. Maintenance Jobs per Month is on the professor's list, so it keeps the first tab.
  // Planned = inspections, preventive service and refurbishment. Unplanned = emergency repairs and safety recalls.
  {
    key: 'maintenance-activity',
    group: 'Maintenance reports',
    title: 'Maintenance Activity & History',
    description: 'How much maintenance happens, which rides and games are unreliable, and what is still open.',
    required: true,
    roles: MAINTENANCE,
    sections: [
      {
        key: 'per-month',
        title: 'Jobs per Month',
        sectionDescription: 'How many maintenance jobs start each month, and how many are planned work versus unplanned repairs?',
        endpoint: 'maintenance-history',
        view: 'v_MaintenanceHistory',
        prepare: prepJobs,
        filters: [{ key: 'FacilityKind', label: 'Type' }],
        dateFilter: { key: 'StartDate', label: 'Started' },
        kpis: (rows) => {
          const months = groupSum(rows, ['Month'], [])
          const busiest = extreme(months.map((m) => ({ Month: m.Month, Jobs: m.Rows })), 'Jobs')
          const unplanned = rows.filter((r) => r.Kind === 'Unplanned').length
          return [
            { label: 'Jobs', value: rows.length.toLocaleString('en-US') },
            { label: 'Average per month', value: months.length ? (rows.length / months.length).toFixed(1) : '0' },
            { label: 'Busiest month', value: busiest ? busiest.row.Month : '—', note: busiest ? `${busiest.v} jobs` : '' },
            { label: 'Unplanned share', value: rows.length ? `${pct(unplanned, rows.length)}%` : '—', note: 'emergency repairs and recalls' },
          ]
        },
        insights: (rows) => {
          const times = rows.map((r) => stamp(r.StartDate)).filter((t) => !Number.isNaN(t))
          if (times.length < 6) return []
          const mid = (Math.min(...times) + Math.max(...times)) / 2
          const count = (kind, early) => rows.filter((r) => r.Kind === kind && (stamp(r.StartDate) < mid) === early).length
          return [
            `Unplanned jobs: ${count('Unplanned', true)} in the first half of the period, ${count('Unplanned', false)} in the second.`,
            `Planned jobs: ${count('Planned', true)} in the first half, ${count('Planned', false)} in the second.`,
          ]
        },
        notes: [
          'Planned work is inspections, preventive service and refurbishment. Unplanned work is emergency repairs and safety recalls.',
          'If planned work goes up while unplanned repairs go down, preventive maintenance is paying off. If both rise, the park is simply busier or older.',
          'The newest month may be unfinished. Green months are far busier than usual, red months far quieter.',
        ],
        chartRows: (rows) => groupSum(rows, ['Month'], []).map((m) => ({ Month: m.Month, Jobs: m.Rows })).sort((a, b) => a.Month.localeCompare(b.Month)),
        chart: { type: 'bar', x: 'Month', y: 'Jobs' },
        extraChart: {
          title: 'Planned work vs unplanned repairs',
          rows: (rows) =>
            groupSum(rows, ['Month'], [])
              .map((m) => {
                const mine = rows.filter((r) => r.Month === m.Month)
                const unplanned = mine.filter((r) => r.Kind === 'Unplanned').length
                return { Month: m.Month, Planned: mine.length - unplanned, Unplanned: unplanned }
              })
              .sort((a, b) => a.Month.localeCompare(b.Month)),
          chart: { type: 'bar', x: 'Month', y: 'Planned', y2: 'Unplanned', yLabel: 'Planned jobs', y2Label: 'Unplanned jobs' },
        },
        tableRows: (rows) => {
          const months = groupSum(rows, ['Month'], ['HoursDown', 'RepairCost']).map((m) => {
            const mine = rows.filter((r) => r.Month === m.Month)
            const unplanned = mine.filter((r) => r.Kind === 'Unplanned').length
            return { Month: m.Month, Jobs: m.Rows, Planned: m.Rows - unplanned, Unplanned: unplanned, HoursDown: m.HoursDown, RepairCost: m.RepairCost, All: 'all' }
          })
          return markOutliers(months.sort((a, b) => a.Month.localeCompare(b.Month)), 'All', 'Jobs')
        },
        columns: ['Month', 'Jobs', 'Planned', 'Unplanned', 'HoursDown', 'RepairCost', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'reliability',
        title: 'Reliability by facility',
        sectionDescription: 'Which rides, games and venues break down most, and how much of the time are they available?',
        endpoint: 'maintenance-history',
        view: 'v_MaintenanceHistory',
        prepare: prepJobs,
        filters: [{ key: 'FacilityKind', label: 'Type' }],
        dateFilter: { key: 'StartDate', label: 'Started' },
        kpis: (rows) => {
          const f = facilityStats(rows)
          const worst = extreme(f, 'HoursDown')
          const low = extreme(f, 'AvailabilityPct', true)
          return [
            { label: 'Facilities serviced', value: f.length.toLocaleString('en-US') },
            { label: 'Most hours down', value: worst ? worst.row.FacilityName : '—', note: worst ? `${worst.v.toLocaleString('en-US')} hours` : '' },
            { label: 'Lowest availability', value: low ? low.row.FacilityName : '—', note: low ? `${low.v}% (estimate)` : '' },
            { label: 'Reliability concerns', value: f.filter(isConcern).length.toLocaleString('en-US'), note: 'see the red rows' },
          ]
        },
        notes: [
          'Availability is an estimate: it treats every maintenance hour as fully closed and measures it over the period the jobs cover.',
          'A reliability concern means three or more unplanned jobs, or availability under 95%. It points to equipment that keeps breaking, not to a guest safety finding.',
          'Facilities with unplanned jobs and no planned work may need a preventive service schedule.',
        ],
        chartRows: (rows) => facilityStats(rows).sort((a, b) => b.HoursDown - a.HoursDown).slice(0, 10),
        chart: { type: 'bar', x: 'FacilityName', y: 'HoursDown', yLabel: 'Hours down', angle: true },
        tableRows: (rows) =>
          facilityStats(rows)
            .sort((a, b) => b.HoursDown - a.HoursDown)
            .map((f) => {
              const concern = isConcern(f)
              const note = concern ? (f.Planned === 0 ? 'Reliability concern, no planned work' : 'Reliability concern') : ''
              return { ...f, Note: note, _mark: concern ? 'low' : undefined }
            }),
        columns: ['FacilityKind', 'FacilityName', 'Jobs', 'Planned', 'Unplanned', 'HoursDown', 'AvailabilityPct', 'RepairCost', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'open',
        title: 'Open repairs',
        sectionDescription: 'Which repairs are still open, and which have waited the longest?',
        endpoint: 'open-maintenance',
        view: 'v_OpenMaintenance',
        prepare: (rows) => toNumbers(rows, ['DaysOpen', 'CrewSize']),
        filters: [{ key: 'FacilityKind', label: 'Type' }],
        kpis: (rows) => {
          const oldest = extreme(rows, 'DaysOpen')
          return [
            { label: 'Open jobs', value: rows.length.toLocaleString('en-US') },
            { label: 'Open the longest', value: oldest ? oldest.row.FacilityName : '—', note: oldest ? `${oldest.v} days` : '' },
            { label: 'Average days open', value: average(rows, 'DaysOpen') },
            { label: 'Open over 14 days', value: rows.filter((r) => r.DaysOpen > 14).length.toLocaleString('en-US') },
          ]
        },
        notes: [
          'An open job has started but has no end date yet. A ride with an open job stays closed to guests.',
          'Red rows have been open for more than two weeks and need a follow-up.',
        ],
        chart: { type: 'bar', x: 'FacilityName', y: 'DaysOpen', yLabel: 'Days open', angle: true },
        tableRows: (rows) =>
          [...rows]
            .sort((a, b) => b.DaysOpen - a.DaysOpen)
            .map((r) => ({ ...r, Note: r.DaysOpen > 14 ? 'Open over 2 weeks' : '', _mark: r.DaysOpen > 14 ? 'low' : undefined })),
        columns: ['FacilityKind', 'FacilityName', 'MaintType', 'StartDate', 'CrewSize', 'DaysOpen', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'history',
        title: 'Job history',
        sectionDescription: 'Every maintenance job with crew size, downtime, outcome and repair cost.',
        endpoint: 'maintenance-history',
        view: 'v_MaintenanceHistory',
        prepare: prepJobs,
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
          { label: 'Not fully fixed', value: rows.filter((r) => r.Outcome === 'Partially Fixed' || r.Outcome === 'Not Fixed').length.toLocaleString('en-US') },
        ],
        notes: [
          'Hours down counts from the start of the job to its end (or to now if it is still open).',
          'Red rows were not fully fixed, or kept the facility down much longer than a usual job.',
        ],
        chartRows: (rows) =>
          groupSum(rows, ['MaintType'], ['HoursDown']).map((g) => ({ MaintType: g.MaintType, AvgHoursDown: round2(g.HoursDown / g.Rows) })),
        chart: { type: 'bar', x: 'MaintType', y: 'AvgHoursDown', yLabel: 'Average hours down per job' },
        tableRows: (rows) => {
          const hours = rows.map((r) => r.HoursDown ?? 0)
          const mean = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0
          const sd = Math.sqrt(hours.length ? hours.reduce((a, b) => a + (b - mean) ** 2, 0) / hours.length : 0)
          return [...rows]
            .sort((a, b) => String(b.StartDate).localeCompare(String(a.StartDate)))
            .map((r) => {
              const unfixed = r.Outcome === 'Partially Fixed' || r.Outcome === 'Not Fixed'
              const long = rows.length >= 8 && sd > 0 && r.HoursDown > mean + 2 * sd
              const note = unfixed ? r.Outcome : long ? 'Unusually long downtime' : ''
              return { ...r, Note: note, _mark: note ? 'low' : undefined }
            })
        },
        columns: ['FacilityKind', 'FacilityName', 'MaintType', 'StartDate', 'EndDate', 'Outcome', 'CrewSize', 'HoursDown', 'RepairCost', 'Note'],
        rowClass: markOf,
      },
    ],
  },
  // Kept (the TA liked it) and expanded into tabs: by facility, cost over time, repair frequency, estimated lost revenue.
  {
    key: 'maintenance-cost',
    group: 'Maintenance reports',
    title: 'Repair Cost by Facility',
    description: 'What repairs cost, how the cost changes over time, which facilities need repair most often, and what downtime may have cost in lost sales.',
    roles: MAINTENANCE,
    sections: [
      {
        key: 'by-facility',
        title: 'By facility',
        sectionDescription: 'Which rides, games and venues cost the most to repair, and how long are they down?',
        endpoint: 'maintenance-cost',
        view: 'v_MaintenanceCostByFacility',
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
            { label: 'Most expensive', value: top ? top.row.FacilityName : '—', note: top ? `${money(top.v)} (${pct(top.v, total(rows, 'TotalCost'))}% of the total)` : '' },
            { label: 'Hours down', value: total(rows, 'TotalHoursDown').toLocaleString('en-US') },
            { label: 'Emergency share', value: jobs ? `${Math.round((100 * total(rows, 'EmergencyJobs')) / jobs)}% of jobs` : '—' },
          ]
        },
        notes: [
          'Total cost is every repair bill for the facility. Average cost is the bill per job.',
          'Red rows cost at least twice as much as the average facility. A high emergency share means repairs were not planned ahead.',
        ],
        chartRows: (rows) => rows.slice(0, 10),
        chart: { type: 'bar', x: 'FacilityName', y: 'TotalCost', yLabel: 'Total repair cost ($)', angle: true },
        tableRows: (rows) => {
          const avg = rows.length ? total(rows, 'TotalCost') / rows.length : 0
          return rows.map((r) => {
            const costly = rows.length >= 4 && avg > 0 && r.TotalCost >= avg * 2
            return { ...r, Note: costly ? 'Costs 2x the average' : '', _mark: costly ? 'low' : undefined }
          })
        },
        columns: ['FacilityKind', 'FacilityName', 'Jobs', 'EmergencyJobs', 'TotalCost', 'AvgCost', 'TotalHoursDown', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'over-time',
        title: 'Cost over time',
        sectionDescription: 'Is the repair bill going up or down month by month?',
        endpoint: 'maintenance-history',
        view: 'v_MaintenanceHistory',
        prepare: prepJobs,
        filters: [{ key: 'FacilityKind', label: 'Type' }],
        dateFilter: { key: 'StartDate', label: 'Started' },
        kpis: (rows) => {
          const months = groupSum(rows, ['Month'], ['RepairCost']).sort((a, b) => a.Month.localeCompare(b.Month))
          const worst = extreme(months, 'RepairCost')
          const last3 = months.slice(-3)
          const prior3 = months.slice(-6, -3)
          const change = prior3.length === 3 && total(prior3, 'RepairCost') > 0 ? ((total(last3, 'RepairCost') - total(prior3, 'RepairCost')) / total(prior3, 'RepairCost')) * 100 : null
          return [
            { label: 'Total repair cost', value: money(total(rows, 'RepairCost')) },
            { label: 'Average per month', value: months.length ? money(total(months, 'RepairCost') / months.length) : '—' },
            { label: 'Costliest month', value: worst ? worst.row.Month : '—', note: worst ? money(worst.v) : '' },
            { label: 'Last 3 months vs the 3 before', value: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`, note: change === null ? 'Not enough months to compare' : '' },
          ]
        },
        notes: [
          'Cost is counted in the month a job started, even if it finished later.',
          'The newest month may be unfinished. Red months cost far more than a usual month, which usually means one big repair.',
        ],
        chartRows: (rows) => groupSum(rows, ['Month'], ['RepairCost']).sort((a, b) => a.Month.localeCompare(b.Month)),
        chart: { type: 'line', x: 'Month', y: 'RepairCost', yLabel: 'Repair cost per month ($)' },
        extraChart: {
          title: 'Unplanned vs planned repair cost',
          rows: (rows) =>
            groupSum(rows, ['Month'], [])
              .map((m) => {
                const mine = rows.filter((r) => r.Month === m.Month)
                return {
                  Month: m.Month,
                  Planned: round2(total(mine.filter((r) => r.Kind === 'Planned'), 'RepairCost')),
                  Unplanned: round2(total(mine.filter((r) => r.Kind === 'Unplanned'), 'RepairCost')),
                }
              })
              .sort((a, b) => a.Month.localeCompare(b.Month)),
          chart: { type: 'bar', x: 'Month', y: 'Planned', y2: 'Unplanned', yLabel: 'Planned work ($)', y2Label: 'Unplanned repairs ($)' },
        },
        tableRows: (rows) => {
          const months = groupSum(rows, ['Month'], ['RepairCost']).map((m) => ({
            Month: m.Month,
            Jobs: m.Rows,
            RepairCost: m.RepairCost,
            AvgCostPerJob: m.Rows ? round2(m.RepairCost / m.Rows) : null,
            All: 'all',
          }))
          return markCosts(months.sort((a, b) => a.Month.localeCompare(b.Month)), 'All', 'RepairCost')
        },
        columns: ['Month', 'Jobs', 'RepairCost', 'AvgCostPerJob', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'frequency',
        title: 'Repair frequency',
        sectionDescription: 'Which facilities need work most often, and how long do they run between jobs?',
        endpoint: 'maintenance-history',
        view: 'v_MaintenanceHistory',
        prepare: prepJobs,
        filters: [{ key: 'FacilityKind', label: 'Type' }],
        dateFilter: { key: 'StartDate', label: 'Started' },
        kpis: (rows) => {
          const f = facilityStats(rows)
          const top = extreme(f, 'Jobs')
          const unplanned = rows.filter((r) => r.Kind === 'Unplanned').length
          return [
            { label: 'Most repaired', value: top ? top.row.FacilityName : '—', note: top ? `${top.v} jobs` : '' },
            { label: 'Jobs per facility', value: f.length ? (rows.length / f.length).toFixed(1) : '—', note: 'on average' },
            { label: 'Unplanned jobs', value: unplanned.toLocaleString('en-US'), note: rows.length ? `${pct(unplanned, rows.length)}% of all jobs` : '' },
          ]
        },
        notes: [
          'Days between jobs is the length of the period covered divided by the number of jobs. Fewer days means more frequent work.',
          'Red rows need work at least twice as often as the average facility.',
        ],
        chartRows: (rows) => facilityStats(rows).sort((a, b) => b.Jobs - a.Jobs).slice(0, 10),
        chart: { type: 'bar', x: 'FacilityName', y: 'Jobs', yLabel: 'Jobs in the period', angle: true },
        tableRows: (rows) => {
          const f = facilityStats(rows).sort((a, b) => b.Jobs - a.Jobs)
          const avg = f.length ? total(f, 'Jobs') / f.length : 0
          return f.map((x) => {
            const often = f.length >= 4 && x.Jobs >= avg * 2
            return {
              FacilityKind: x.FacilityKind,
              FacilityName: x.FacilityName,
              Jobs: x.Jobs,
              Unplanned: x.Unplanned,
              DaysBetweenJobs: x.Jobs ? round2(x.WindowDays / x.Jobs) : null,
              RepairCost: x.RepairCost,
              Note: often ? 'Repaired twice as often as average' : '',
              _mark: often ? 'low' : undefined,
            }
          })
        },
        columns: ['FacilityKind', 'FacilityName', 'Jobs', 'Unplanned', 'DaysBetweenJobs', 'RepairCost', 'Note'],
        rowClass: markOf,
      },
      {
        key: 'lost-revenue',
        title: 'Lost revenue (estimate)',
        sectionDescription: 'ESTIMATE: what each ride\'s downtime may have cost in ticket money. Rides only.',
        endpoint: 'repair-impact',
        view: 'v_RepairImpactEstimate',
        prepare: (rows) =>
          toNumbers(rows, ['DowntimeOpenHours', 'BoardingsPerOpenHour', 'RevenuePerBoarding']).map((r) => {
            const lostBoardings = Math.round((r.DowntimeOpenHours ?? 0) * (r.BoardingsPerOpenHour ?? 0))
            return { ...r, LostBoardings: lostBoardings, EstimatedLostRevenue: round2(lostBoardings * (r.RevenuePerBoarding ?? 0)) }
          }),
        kpis: (rows) => {
          const worst = extreme(rows, 'EstimatedLostRevenue')
          return [
            { label: 'Lost revenue (estimate)', value: money(total(rows, 'EstimatedLostRevenue')) },
            { label: 'Hardest hit ride (estimate)', value: worst ? worst.row.FacilityName : '—', note: worst ? money(worst.v) : '' },
            { label: 'Missed rides (estimate)', value: total(rows, 'LostBoardings').toLocaleString('en-US') },
            { label: 'Ticket money per ride taken', value: rows[0] ? money2(rows[0].RevenuePerBoarding) : '—', note: 'average' },
          ]
        },
        notes: [
          'This is an estimate, not an accounting figure. Lost revenue = open hours lost x boardings per open hour x ticket revenue per boarding.',
          'Open hours lost are the maintenance hours scaled to the park\'s opening hours, because a repair at night costs no sales.',
          'Ticket revenue per boarding spreads all ticket money over all rides taken. It leaves out food, shop and game sales, so the real loss may be higher.',
          'Games and venues are not included: only rides have a boarding log. Red rows are the rides with the largest estimated loss.',
        ],
        chartRows: (rows) => [...rows].sort((a, b) => b.EstimatedLostRevenue - a.EstimatedLostRevenue).slice(0, 10),
        chart: { type: 'bar', x: 'FacilityName', y: 'EstimatedLostRevenue', yLabel: 'Estimated lost revenue ($)', angle: true },
        tableRows: (rows) => {
          const sorted = [...rows].sort((a, b) => b.EstimatedLostRevenue - a.EstimatedLostRevenue)
          const avg = sorted.length ? total(sorted, 'EstimatedLostRevenue') / sorted.length : 0
          return sorted.map((r) => {
            const big = sorted.length >= 4 && avg > 0 && r.EstimatedLostRevenue >= avg * 2
            return {
              FacilityName: r.FacilityName,
              DowntimeOpenHours: r.DowntimeOpenHours,
              BoardingsPerOpenHour: r.BoardingsPerOpenHour,
              LostBoardings: r.LostBoardings,
              EstimatedLostRevenue: r.EstimatedLostRevenue,
              Note: big ? 'Largest estimated losses' : '',
              _mark: big ? 'low' : undefined,
            }
          })
        },
        columns: ['FacilityName', 'DowntimeOpenHours', 'BoardingsPerOpenHour', 'LostBoardings', 'EstimatedLostRevenue', 'Note'],
        rowClass: markOf,
      },
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
    roles: OPERATIONS,
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
    roles: OPERATIONS,
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
    roles: OPERATIONS,
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
    roles: OPERATIONS,
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

  // ---- Weather ----
  // The TAs said not to build a weather report, but the professor's list includes "Rain-outs per month".
  // So Rain-outs per Month is shown (Admin and Manager only, under Ride reports) and the broader
  // Weather Impact report stays hidden. Put `hidden: true` back on Rain-outs to hide it again.
  {
    key: 'rainouts-per-month',
    group: 'Ride reports',
    endpoint: 'weather-impact',
    view: 'v_WeatherImpact (grouped by month here)',
    title: 'Rain-outs per Month',
    description: 'Rain or storm events that closed outdoor rides, per month.',
    required: true,
    roles: OPERATIONS,
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
    roles: OPERATIONS,
  },
]

// The rest of the app (menu, dashboard, report page) uses REPORTS, so hidden reports vanish everywhere.
export const REPORTS = ALL_REPORTS.filter((r) => !r.hidden)

// Menu sections for the reports, in the order they are shown (config/nav.js builds one section per entry).
export const REPORT_GROUPS = ['Revenue reports', 'Attendance reports', 'Maintenance reports', 'Employee reports', 'Ride reports']
