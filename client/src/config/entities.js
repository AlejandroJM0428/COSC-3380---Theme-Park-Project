// One entry per data-entry page. <RecordManager entity={...} /> turns an entry into a table plus an
// add / edit / delete form, so a new page is one config object and a few lines (see pages/MaintenancePage.jsx).
//
// fields:    what the form shows. type = text | number | datetime | select | multicheck.
//            writeRoles (optional): the only roles that see Add and Edit; everyone else who can open the page sees the table read only.
//            type 'lookup' picks a guest, ticket or membership by name or date (kind = customer | ticket | membership) and keeps the ID out of sight.
//            select options come from `options` ([value, label] pairs) or `optionsFrom(form, lookups)`.
// columns:   what the table shows. `format(value, row)` is optional.
// toPayload: form state -> the JSON body the server expects. The browser never sends ids, prices or roles.
// fromRecord: server record -> form state (used when you press Edit).

const MAINT_TYPES = ['Routine Inspection', 'Preventive Service', 'Refurbishment', 'Emergency Repair', 'Safety Recall']
const OUTCOMES = ['Fixed', 'Partially Fixed', 'Not Fixed']

// "2026-10-27 08:00:00" -> "2026-10-27T08:00" (what <input type="datetime-local"> wants).
const toInput = (s) => (s ? s.replace(' ', 'T').slice(0, 16) : '')
const shortDate = (s) => (s ? s.slice(0, 16) : '—')
const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`)

const kindOf = (rec) => (rec.RideID ? 'Ride' : rec.GameID ? 'Game' : 'Venue')
const LOOKUP_FOR_KIND = { Ride: 'rides', Game: 'games', Venue: 'venues' }

export const MAINTENANCE = {
  title: 'Maintenance',
  intro:
    'Log repair and inspection jobs. To close a job, fill in the end time, the outcome and the repair cost together. The database refuses to close a job without a cost.',
  resource: 'maintenance',
  idKey: 'MaintenanceID',
  noun: 'job',
  writeRoles: ['Admin', 'MaintenanceManager'], // the operations manager can view jobs but not add or change them
  deleteRoles: ['Admin', 'MaintenanceManager'],
  filters: [
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All jobs'],
        ['open', 'Open jobs'],
        ['closed', 'Closed jobs'],
      ],
    },
  ],
  columns: [
    { key: 'MaintenanceID', label: 'Job #' },
    { key: 'FacilityName', label: 'Where' },
    { key: 'MaintType', label: 'Type' },
    { key: 'StartDate', label: 'Started', format: shortDate },
    { key: 'EndDate', label: 'Closed', format: (v) => (v ? shortDate(v) : 'Open') },
    { key: 'Outcome', label: 'Outcome', format: (v) => v ?? '—' },
    { key: 'RepairCost', label: 'Repair cost', format: money },
    { key: 'HoursWorked', label: 'Hours', format: (v) => v ?? '—' },
    { key: 'Reason', label: 'Reason' },
  ],
  fields: [
    { key: 'maintType', label: 'Type of job', type: 'select', required: true, options: MAINT_TYPES.map((t) => [t, t]) },
    { key: 'facilityKind', label: 'What is being worked on', type: 'select', required: true, options: [['Ride', 'A ride'], ['Game', 'A game'], ['Venue', 'A shop or restaurant']] },
    {
      key: 'facilityId',
      label: 'Which one',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.[LOOKUP_FOR_KIND[form.facilityKind]] ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'startDate', label: 'Started', type: 'datetime', required: true },
    { key: 'reason', label: 'Reason', type: 'text', required: true, maxLength: 100, wide: true },
    { key: 'endDate', label: 'Closed (leave empty while the job is open)', type: 'datetime' },
    { key: 'outcome', label: 'Outcome', type: 'select', options: [['', '— not closed yet —'], ...OUTCOMES.map((o) => [o, o])] },
    { key: 'repairCost', label: 'Repair cost ($)', type: 'number', min: 0, step: '0.01' },
    {
      key: 'crewLead',
      label: 'Crew lead (technician)',
      type: 'select',
      optionsFrom: (form, lookups) => [['', '— none —'], ...(lookups?.technicians ?? []).map((x) => [String(x.id), x.name])],
    },
    {
      key: 'crewAssistants',
      label: 'Assistants',
      type: 'multicheck',
      wide: true,
      optionsFrom: (form, lookups) => (lookups?.technicians ?? []).map((x) => [String(x.id), x.name]),
    },
  ],
  blank: () => ({
    maintType: 'Routine Inspection',
    facilityKind: 'Ride',
    facilityId: '',
    startDate: '',
    reason: '',
    endDate: '',
    outcome: '',
    repairCost: '',
    crewLead: '',
    crewAssistants: [],
  }),
  fromRecord: (rec) => ({
    maintType: rec.MaintType,
    facilityKind: kindOf(rec),
    facilityId: String(rec.RideID ?? rec.GameID ?? rec.VenueID ?? ''),
    startDate: toInput(rec.StartDate),
    reason: rec.Reason ?? '',
    endDate: toInput(rec.EndDate),
    outcome: rec.Outcome ?? '',
    repairCost: rec.RepairCost ?? '',
    crewLead: String((rec.crew ?? []).find((c) => c.CrewRole === 'Lead')?.EmployeeID ?? ''),
    crewAssistants: (rec.crew ?? []).filter((c) => c.CrewRole === 'Assistant').map((c) => String(c.EmployeeID)),
  }),
  toPayload: (form) => {
    const id = form.facilityId === '' ? null : Number(form.facilityId)
    const crew = []
    if (form.crewLead) crew.push({ employeeId: Number(form.crewLead), crewRole: 'Lead' })
    for (const a of form.crewAssistants) if (a !== form.crewLead) crew.push({ employeeId: Number(a), crewRole: 'Assistant' })
    return {
      maintType: form.maintType,
      rideId: form.facilityKind === 'Ride' ? id : null,
      gameId: form.facilityKind === 'Game' ? id : null,
      venueId: form.facilityKind === 'Venue' ? id : null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      outcome: form.outcome || null,
      repairCost: form.repairCost === '' ? null : Number(form.repairCost),
      reason: form.reason.trim(),
      crew,
    }
  },
  describe: (row) => `job #${row.MaintenanceID} (${row.FacilityName}, ${row.MaintType})`,
}

// Revenue: ticket sales. "Refund" adds a permanent refund row, so money records are never erased.
export const TICKETS = {
  title: 'Ticket Sales & Refunds',
  intro:
    'Revenue records. Add a ticket sale, correct its guest, membership, visit date or Express add-on, or refund it. The database sets the price. Refunding keeps the record and marks it refunded.',
  resource: 'tickets',
  idKey: 'TicketID',
  noun: 'ticket',
  deleteRoles: ['Admin', 'RetailManager'],
  deleteLabel: 'Refund',
  deletePast: 'Refunded',
  askReason: true,
  canEditRow: (row) => !row.IsVoided,
  canDeleteRow: (row) => !row.IsVoided,
  filters: [
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All tickets'],
        ['active', 'Active tickets'],
        ['voided', 'Refunded tickets'],
      ],
    },
  ],
  columns: [
    { key: 'TicketID', label: 'Ticket #' },
    { key: 'CustomerName', label: 'Guest' },
    { key: 'MembershipID', label: 'Membership', format: (v) => (v ? `#${v}` : '—') },
    { key: 'VisitDate', label: 'Visit date' },
    { key: 'HasExpress', label: 'Express', format: (v) => (Number(v) ? 'Yes' : 'No') },
    { key: 'TicketPrice', label: 'Price', format: money },
    { key: 'PurchaseDate', label: 'Bought', format: shortDate },
    { key: 'IsVoided', label: 'Status', format: (v, row) => (Number(v) ? `Refunded: ${row.RefundReason}` : 'Active') },
    { key: 'RefundedAt', label: 'Refunded on', format: shortDate },
  ],
  fields: [
    { key: 'customerId', label: 'Guest', type: 'lookup', kind: 'customer', required: true },
    { key: 'membershipId', label: 'Membership (optional)', type: 'lookup', kind: 'membership', forCustomerKey: 'customerId', wide: false },
    { key: 'visitDate', label: 'Visit date', type: 'date', required: true },
    { key: 'hasExpress', label: 'Express add-on', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
  ],
  blank: () => ({ customerId: '', membershipId: '', visitDate: '', hasExpress: 'no' }),
  fromRecord: (rec) => ({
    customerId: String(rec.CustomerID),
    membershipId: rec.MembershipID ? String(rec.MembershipID) : '',
    visitDate: rec.VisitDate,
    hasExpress: Number(rec.HasExpress) ? 'yes' : 'no',
  }),
  toPayload: (form) => ({
    customerId: Number(form.customerId),
    membershipId: form.membershipId === '' ? null : Number(form.membershipId),
    visitDate: form.visitDate,
    hasExpress: form.hasExpress === 'yes',
  }),
  describe: (row) => `ticket #${row.TicketID} (${row.CustomerName}, ${row.VisitDate})`,
}

// Employee performance: shifts with a 1 to 5 rating and notes. The performance reports read these rows.
export const SHIFTS = {
  title: 'Shift Ratings',
  intro:
    'Employee performance records. Log a shift, then rate it from 1 to 5 once it has ended. The database refuses overlapping shifts and shifts before the hire date.',
  resource: 'shifts',
  idKey: 'ShiftID',
  noun: 'shift',
  deleteRoles: ['Admin', 'HRManager'],
  filters: [
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All shifts'],
        ['open', 'Open shifts (no clock-out)'],
        ['unrated', 'Ended, not rated yet'],
        ['rated', 'Rated shifts'],
      ],
    },
  ],
  columns: [
    { key: 'ShiftID', label: 'Shift #' },
    { key: 'EmployeeName', label: 'Employee' },
    { key: 'JobTitle', label: 'Job' },
    { key: 'ClockIn', label: 'Clock in', format: shortDate },
    { key: 'ClockOut', label: 'Clock out', format: (v) => (v ? shortDate(v) : 'Open') },
    { key: 'HoursWorked', label: 'Hours', format: (v) => v ?? '—' },
    { key: 'ShiftRating', label: 'Rating', format: (v) => (v ? `${v} / 5` : '—') },
    { key: 'ShiftNotes', label: 'Notes' },
  ],
  fields: [
    {
      key: 'employeeId',
      label: 'Employee',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.employees ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'clockIn', label: 'Clock in', type: 'datetime', required: true },
    { key: 'clockOut', label: 'Clock out (leave empty while the shift is open)', type: 'datetime' },
    {
      key: 'rating',
      label: 'Rating (after the shift ends)',
      type: 'select',
      options: [['', '— not rated —'], ['1', '1 (poor)'], ['2', '2'], ['3', '3 (good)'], ['4', '4'], ['5', '5 (excellent)']],
    },
    { key: 'notes', label: 'Notes', type: 'text', maxLength: 255, wide: true },
  ],
  blank: () => ({ employeeId: '', clockIn: '', clockOut: '', rating: '', notes: '' }),
  fromRecord: (rec) => ({
    employeeId: String(rec.EmployeeID),
    clockIn: toInput(rec.ClockIn),
    clockOut: toInput(rec.ClockOut),
    rating: rec.ShiftRating ? String(rec.ShiftRating) : '',
    notes: rec.ShiftNotes ?? '',
  }),
  toPayload: (form) => ({
    employeeId: Number(form.employeeId),
    clockIn: form.clockIn,
    clockOut: form.clockOut || null,
    rating: form.rating === '' ? null : Number(form.rating),
    notes: form.notes.trim(),
  }),
  describe: (row) => `shift #${row.ShiftID} (${row.EmployeeName}, ${row.ClockIn?.slice(0, 16)})`,
}
