// Data-entry pages that used to say "not built yet". Same idea as config/entities.js: one config object per page,
// shown by <RecordManager entity={...} />. Server routes are in server/routes (customers.js, memberships.js, ...).
//
// Pages for guest activity (purchases, game plays, ride log) have no Edit button on purpose: the database
// refuses edits to them with a trigger. Managers can Delete an entry, then add it again to correct a mistake.

import { localDate } from '../utils/portalFormat.js'

const toInput = (s) => (s ? s.replace(' ', 'T').slice(0, 16) : '')
const shortDate = (s) => (s ? s.slice(0, 16) : '—')
const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`)
const yesNo = (v) => (Number(v) ? 'Yes' : 'No')
const num = (v) => (v === '' ? null : Number(v))

// ---- Customers: full add / edit / deactivate -------------------------------------------------------------
export const CUSTOMERS = {
  title: 'Customers',
  intro:
    'Guest records. Add a guest, correct their details, or deactivate them. Deactivating keeps the record, because tickets and memberships point at it. Edit a deactivated guest to turn them back on.',
  resource: 'customers',
  idKey: 'CustomerID',
  noun: 'customer',
  deleteRoles: ['Admin', 'RetailManager'],
  deleteLabel: 'Deactivate',
  deletePast: 'Deactivated',
  deleteNote: 'The record is kept and can be turned back on by editing it.',
  canDeleteRow: (row) => Number(row.IsActive) === 1,
  filters: [
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All customers'],
        ['active', 'Active customers'],
        ['inactive', 'Inactive customers'],
      ],
    },
  ],
  columns: [
    { key: 'CustomerID', label: 'Customer #' },
    { key: 'FullName', label: 'Name' },
    { key: 'DOB', label: 'Date of birth' },
    { key: 'HeightCm', label: 'Height (cm)' },
    { key: 'IsActive', label: 'Status', format: (v) => (Number(v) ? 'Active' : 'Inactive') },
  ],
  fields: [
    { key: 'firstName', label: 'First name', type: 'text', required: true, maxLength: 50 },
    { key: 'lastName', label: 'Last name', type: 'text', required: true, maxLength: 50 },
    { key: 'dob', label: 'Date of birth', type: 'date', required: true },
    { key: 'heightCm', label: 'Height (cm)', type: 'number', required: true, min: 30, step: '1' },
    { key: 'isActive', label: 'Status', type: 'select', options: [['yes', 'Active'], ['no', 'Inactive']] },
  ],
  blank: () => ({ firstName: '', lastName: '', dob: '', heightCm: '', isActive: 'yes' }),
  fromRecord: (rec) => ({
    firstName: rec.FirstName,
    lastName: rec.LastName,
    dob: rec.DOB,
    heightCm: String(rec.HeightCm),
    isActive: Number(rec.IsActive) ? 'yes' : 'no',
  }),
  toPayload: (form) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    dob: form.dob,
    heightCm: Number(form.heightCm),
    isActive: form.isActive === 'yes',
  }),
  describe: (row) => `customer #${row.CustomerID} (${row.FullName})`,
}

// ---- Memberships: add / edit / delete --------------------------------------------------------------------
export const MEMBERSHIPS = {
  title: 'Memberships',
  intro:
    'Annual memberships. Pick the guest (they must already have an account), the tier and the start date. The database sets the price from the tier list, and the membership ends one year later. If those dates overlap a membership this guest already has, MySQL rejects the save. A membership with tickets on it cannot be deleted.',
  resource: 'memberships',
  idKey: 'MembershipID',
  noun: 'membership',
  writeRoles: ['Admin', 'RetailManager', 'Cashier'], // same as CAN_WRITE in server/routes/memberships.js
  deleteRoles: ['Admin', 'RetailManager'],
  deleteNote: 'Memberships that already have tickets cannot be deleted.',
  filters: [
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All memberships'],
        ['current', 'Current memberships'],
        ['expired', 'Expired memberships'],
      ],
    },
  ],
  columns: [
    { key: 'MembershipID', label: 'Membership #' },
    { key: 'CustomerName', label: 'Guest', format: (v, row) => `${v} (#${row.CustomerID})` },
    { key: 'Tier', label: 'Tier' },
    { key: 'StartDate', label: 'Starts' },
    { key: 'EndDate', label: 'Ends' },
    { key: 'Price', label: 'Price', format: money },
    { key: 'AutoRenew', label: 'Auto-renew', format: yesNo },
    { key: 'IsCurrent', label: 'Status', format: (v) => (Number(v) ? 'Current' : 'Not current') },
  ],
  fields: [
    { key: 'customerId', label: 'Guest (must have an account)', type: 'lookup', kind: 'customer', required: true, needsLogin: true },
    {
      key: 'tier',
      label: 'Tier',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.tiers ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'startDate', label: 'Start date', type: 'date', required: true },
    { key: 'autoRenew', label: 'Auto-renew', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
  ],
  blank: () => ({ customerId: '', tier: '', startDate: localDate(), autoRenew: 'no' }),
  fromRecord: (rec) => ({
    customerId: String(rec.CustomerID),
    tier: rec.Tier,
    startDate: rec.StartDate,
    autoRenew: Number(rec.AutoRenew) ? 'yes' : 'no',
  }),
  rejectToast: (message) =>
    message.includes('overlaps with the selected dates')
      ? {
          title: 'Membership Rejected',
          message,
          footnote: 'Database prevents invalid data from being saved.',
          bad: true,
        }
      : null,
  toPayload: (form) => ({
    customerId: Number(form.customerId),
    tier: form.tier,
    startDate: form.startDate,
    autoRenew: form.autoRenew === 'yes',
  }),
  describe: (row) => `membership #${row.MembershipID} (${row.CustomerName}, ${row.Tier})`,
}

// ---- Food & shop purchases: add / edit / delete --------------------------------------------------
export const PURCHASES = {
  title: 'Food & Shop Purchases',
  intro:
    'Revenue records for food, drinks and merchandise. Add what a guest bought on their ticket, or correct an entry. The database fills in the price: it keeps the price the guest paid unless the item changes.',
  resource: 'purchases',
  idKey: 'PurchaseID',
  noun: 'purchase',
  editRoles: ['Admin', 'RetailManager'], // the booth adds sales; the retail desk corrects or removes them
  deleteRoles: ['Admin', 'RetailManager'],
  deleteNote: 'This removes the entry for good, and the revenue reports drop it. Add it again if it was a mistake.',
  columns: [
    { key: 'PurchaseID', label: 'Purchase #' },
    { key: 'PurchasedAt', label: 'When', format: shortDate },
    { key: 'CustomerName', label: 'Guest' },
    { key: 'TicketID', label: 'Ticket #' },
    { key: 'VenueName', label: 'Where' },
    { key: 'ItemName', label: 'Item' },
    { key: 'Quantity', label: 'Qty' },
    { key: 'UnitPrice', label: 'Unit price', format: money },
    { key: 'LineTotal', label: 'Total', format: money },
  ],
  fields: [
    { key: 'ticketId', label: 'Ticket', type: 'lookup', kind: 'ticket', required: true },
    {
      key: 'itemFilter',
      label: 'Show',
      type: 'select',
      wide: true,
      optionsFrom: () => [['all', 'All items'], ['alcohol', 'Alcoholic drinks only']],
    },
    {
      key: 'itemId',
      label: 'Item',
      type: 'select',
      required: true,
      wide: true,
      optionsFrom: (form, lookups) =>
        (lookups?.items ?? []).filter((x) => form.itemFilter !== 'alcohol' || Number(x.alcoholic) === 1).map((x) => [String(x.id), x.name]),
    },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1, step: '1' },
    { key: 'purchasedAt', label: 'When', type: 'whenNow' },
  ],
  blank: () => ({ ticketId: '', itemFilter: 'all', itemId: '', quantity: '1', purchasedAt: '' }),
  fromRecord: (rec) => ({
    ticketId: String(rec.TicketID),
    itemFilter: 'all',
    itemId: String(rec.ItemID),
    quantity: String(rec.Quantity),
    purchasedAt: toInput(rec.PurchasedAt),
  }),
  toPayload: (form) => ({
    ticketId: Number(form.ticketId),
    itemId: Number(form.itemId),
    quantity: Number(form.quantity),
    purchasedAt: form.purchasedAt || null,
  }),
  describe: (row) => `purchase #${row.PurchaseID}`,
}

// ---- Game plays: add / edit / delete -------------------------------------------------------------
export const GAME_PLAYS = {
  title: 'Game Plays',
  intro:
    'Revenue records for midway games. Add a play on a guest\'s ticket, or correct one. The database fills in the price and refuses games that are retired or under maintenance. It keeps the amount the guest paid unless the game changes.',
  resource: 'game-plays',
  idKey: 'GamePlayID',
  noun: 'game play',
  editRoles: ['Admin', 'RetailManager'], // the booth adds plays; the retail desk corrects or removes them
  deleteRoles: ['Admin', 'RetailManager'],
  deleteNote: 'This removes the entry for good, and the revenue reports drop it. Add it again if it was a mistake.',
  columns: [
    { key: 'GamePlayID', label: 'Play #' },
    { key: 'PlayedAt', label: 'When', format: shortDate },
    { key: 'CustomerName', label: 'Guest' },
    { key: 'TicketID', label: 'Ticket #' },
    { key: 'GameName', label: 'Game' },
    { key: 'AmountPaid', label: 'Paid', format: money },
  ],
  fields: [
    { key: 'ticketId', label: 'Ticket', type: 'lookup', kind: 'ticket', required: true },
    {
      key: 'gameId',
      label: 'Game',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.games ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'playedAt', label: 'When', type: 'whenNow' },
  ],
  blank: () => ({ ticketId: '', gameId: '', playedAt: '' }),
  fromRecord: (rec) => ({ ticketId: String(rec.TicketID), gameId: String(rec.GameID), playedAt: toInput(rec.PlayedAt) }),
  toPayload: (form) => ({
    ticketId: Number(form.ticketId),
    gameId: Number(form.gameId),
    playedAt: form.playedAt || null,
  }),
  describe: (row) => `game play #${row.GamePlayID}`,
}

// ---- Ride log: add / edit / delete ---------------------------------------------------------------
export const RIDE_LOG = {
  title: 'Ride Log',
  intro:
    'Ride activity. A boarding records a guest getting on a ride. A wait reading records the posted wait time. The database refuses boardings on rides under maintenance, closed by weather, or above the guest\'s height, and checks a corrected boarding the same way.',
  resource: 'ride-log',
  idKey: 'RideLogID',
  noun: 'ride log entry',
  deleteRoles: ['Admin', 'Manager'],
  deleteNote: 'This removes the entry for good, and the ride reports drop it. Add it again if it was a mistake.',
  filters: [
    {
      key: 'type',
      label: 'Show',
      options: [
        ['', 'All entries'],
        ['boarding', 'Boardings'],
        ['wait', 'Wait readings'],
      ],
    },
  ],
  columns: [
    { key: 'RideLogID', label: 'Entry #' },
    { key: 'LoggedAt', label: 'When', format: shortDate },
    { key: 'RideName', label: 'Ride' },
    { key: 'EventType', label: 'Type' },
    { key: 'TicketID', label: 'Ticket #', format: (v) => v ?? '—' },
    { key: 'WaitMinutes', label: 'Wait (min)', format: (v) => v ?? '—' },
    { key: 'UsedExpress', label: 'Express', format: (v, row) => (row.EventType === 'Boarding' ? yesNo(v) : '—') },
  ],
  fields: [
    {
      key: 'eventType',
      label: 'What happened',
      type: 'select',
      required: true,
      options: [['Boarding', 'Boarding (a guest rides)'], ['Wait Reading', 'Wait reading (posted wait time)']],
    },
    {
      key: 'rideId',
      label: 'Ride',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.rides ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'ticketId', label: 'Ticket (for a boarding)', type: 'lookup', kind: 'ticket', show: (form) => form.eventType === 'Boarding' },
    { key: 'waitMinutes', label: 'Wait minutes (for a wait reading)', type: 'number', min: 0, step: '1' },
    { key: 'usedExpress', label: 'Used the Express line (boardings)', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
    { key: 'loggedAt', label: 'When', type: 'whenNow' },
  ],
  blank: () => ({ eventType: 'Boarding', rideId: '', ticketId: '', waitMinutes: '', usedExpress: 'no', loggedAt: '' }),
  fromRecord: (rec) => ({
    eventType: rec.EventType,
    rideId: String(rec.RideID),
    ticketId: rec.TicketID ? String(rec.TicketID) : '',
    waitMinutes: rec.WaitMinutes === null ? '' : String(rec.WaitMinutes),
    usedExpress: Number(rec.UsedExpress) ? 'yes' : 'no',
    loggedAt: toInput(rec.LoggedAt),
  }),
  toPayload: (form) => ({
    eventType: form.eventType,
    rideId: num(form.rideId),
    ticketId: form.eventType === 'Boarding' ? num(form.ticketId) : null,
    waitMinutes: form.eventType === 'Wait Reading' ? num(form.waitMinutes) : null,
    usedExpress: form.eventType === 'Boarding' && form.usedExpress === 'yes',
    loggedAt: form.loggedAt || null,
  }),
  describe: (row) => `ride log entry #${row.RideLogID}`,
}

// ---- Weather log: add / edit / delete ---------------------------------------------------------------------
export const WEATHER = {
  title: 'Weather Log',
  intro:
    'Weather events. Set every value of an entry directly: the weather, its severity (a label), the start and end times, and whether the outdoor rides and the whole park are Open or Closed while it lasts. Leave the end time empty while the weather is still going on.',
  resource: 'weather',
  idKey: 'WeatherID',
  noun: 'weather entry',
  deleteRoles: ['Admin', 'Manager', 'RetailManager'],
  deleteNote: 'Entries that a refund uses cannot be deleted.',
  // An entry that closes the park: only an Admin can change, end or delete it.
  rowLock: (row, user) => (Number(row.ClosesPark) === 1 && user?.role !== 'Admin' ? 'Insufficient privileges: only an Admin can change an entry that closes the park' : ''),
  filters: [
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All entries'],
        ['ongoing', 'Ongoing'],
        ['closing', 'Closed outdoor rides'],
      ],
    },
  ],
  columns: [
    { key: 'WeatherID', label: 'Entry #' },
    { key: 'WeatherType', label: 'Weather' },
    { key: 'Severity', label: 'Severity' },
    { key: 'StartedAt', label: 'Started', format: shortDate },
    { key: 'EndedAt', label: 'Ended', format: (v) => (v ? shortDate(v) : 'Ongoing') },
    { key: 'ClosesOutdoorRides', label: 'Outdoor rides', format: (v) => (Number(v) ? 'Closed' : 'Open') },
    { key: 'ClosesPark', label: 'Park', format: (v) => (Number(v) ? 'Closed' : 'Open') },
  ],
  fields: [
    {
      key: 'weatherType',
      label: 'Weather',
      type: 'select',
      required: true,
      options: ['Clear', 'Cloudy', 'Rain', 'Storm', 'Heat', 'Cold'].map((t) => [t, t]),
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'select',
      required: true,
      // Only a label now. What closes is set by the two fields below (SQL/migrations/31_weather_flags_editable.sql).
      options: [
        ['Low', 'Low'],
        ['Medium', 'Medium'],
        ['High', 'High'],
        ['Severe', 'Severe'],
      ],
    },
    { key: 'startedAt', label: 'Started', type: 'datetime', required: true },
    { key: 'endedAt', label: 'Ended (leave empty while it is ongoing)', type: 'datetime' },
    {
      key: 'closesOutdoorRides',
      label: 'Outdoor rides',
      type: 'select',
      required: true,
      options: [['0', 'Open'], ['1', 'Closed']],
    },
    {
      key: 'closesPark',
      label: 'Park',
      type: 'select',
      required: true,
      options: [['0', 'Open'], ['1', 'Closed (the whole park)']],
      // Closing the park is Admin-only (the server checks too: server/routes/weather.js).
      optionLock: (v, user) => v === '1' && user?.role !== 'Admin',
    },
  ],
  blank: () => ({ weatherType: 'Clear', severity: 'Low', startedAt: '', endedAt: '', closesOutdoorRides: '0', closesPark: '0' }),
  fromRecord: (rec) => ({
    weatherType: rec.WeatherType,
    severity: rec.Severity,
    startedAt: toInput(rec.StartedAt),
    endedAt: toInput(rec.EndedAt),
    closesOutdoorRides: String(Number(rec.ClosesOutdoorRides)),
    closesPark: String(Number(rec.ClosesPark)),
  }),
  toPayload: (form) => ({
    weatherType: form.weatherType,
    severity: form.severity,
    startedAt: form.startedAt,
    endedAt: form.endedAt || null,
    closesOutdoorRides: form.closesOutdoorRides === '1',
    closesPark: form.closesPark === '1',
  }),
  describe: (row) => `weather entry #${row.WeatherID} (${row.WeatherType}, ${row.Severity}, ${row.StartedAt?.slice(0, 16)})`,
}

// ---- Rides, Games & Venues (Admin): add / edit / deactivate -----------------------------------------------
// One page for three tables. The first field picks the kind; the form shows every field, and the
// server uses only the ones that fit the kind. The kind of an existing row cannot be changed.
export const FACILITIES = {
  title: 'Rides, Games & Venues',
  intro:
    'The attractions of the park. Add a ride, game or venue, correct its details, or deactivate it. Deactivating keeps the record, because tickets, ride logs and repairs point at it. Press Reactivate on a deactivated one to turn it back on. Use Close ride to shut a ride now and Reopen ride to open it again (a reason is saved in the audit log); MySQL adds the notice. "Right now" is what guests see, so it also shows closures caused by weather or a maintenance job, which are changed on the Weather and Maintenance pages.',
  resource: 'facilities',
  idKey: 'FacilityKey',
  hideIds: true, // the page never shows internal keys
  noun: 'attraction',
  deleteRoles: ['Admin'],
  deleteLabel: 'Deactivate',
  deletePast: 'Deactivated',
  deleteNote: 'The record is kept and can be turned back on with the Reactivate button.',
  // Turning an attraction off or on asks for a reason first (a dialog with ready-made choices). It is saved in the audit log.
  requireReason: true,
  reasonChoices: {
    deactivate: ['Permanently retired', 'Closed for the season', 'Safety concern', 'Being replaced', 'Added by mistake'],
    reactivate: ['Repairs finished', 'Back in season', 'Safety check passed', 'Deactivated by mistake'],
    close: ['Mechanical issue', 'Safety check', 'Staff shortage', 'Guest incident', 'Weather precaution'],
    open: ['Repairs finished', 'Safety check passed', 'Staffed again', 'Closed by mistake'],
  },
  // Rides only: Close ride / Reopen ride flips Ride.Status (Maintenance / Open), which is what guests see.
  canCloseRow: (row) => row.Kind === 'Ride' && Number(row.IsActive) === 1 && row.RideStatus !== 'Maintenance',
  canOpenRow: (row) => row.Kind === 'Ride' && Number(row.IsActive) === 1 && row.RideStatus === 'Maintenance',
  canDeleteRow: (row) => Number(row.IsActive) === 1,
  reactivateLabel: 'Reactivate',
  canReactivateRow: (row) => Number(row.IsActive) !== 1,
  filters: [
    {
      key: 'kind',
      label: 'Type',
      options: [
        ['', 'Rides, games and venues'],
        ['Ride', 'Rides'],
        ['Game', 'Games'],
        ['Venue', 'Venues'],
      ],
    },
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All'],
        ['active', 'Active'],
        ['inactive', 'Inactive'],
      ],
    },
  ],
  columns: [
    { key: 'Kind', label: 'Type' },
    { key: 'Name', label: 'Name' },
    { key: 'ZoneName', label: 'Zone' },
    { key: 'Details', label: 'Details' },
    { key: 'LiveState', label: 'Right now', format: (v) => (v ? v.replace('Closed - ', 'Closed: ') : '—') },
    { key: 'IsActive', label: 'Active', format: (v) => (Number(v) ? 'Active' : 'Inactive') },
  ],
  fields: [
    {
      key: 'kind',
      label: 'What are you adding?',
      type: 'select',
      options: [['Ride', 'Ride'], ['Game', 'Game'], ['Venue', 'Venue (restaurant or shop)']],
    },
    {
      key: 'zoneId',
      label: 'Zone',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.zones ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 100 },
    {
      key: 'rideType',
      label: 'Ride type (rides)',
      type: 'select',
      options: ['Coaster', 'Dark Ride', 'Water Ride', 'Carousel', 'Train', 'Simulator', 'Walkthrough'].map((t) => [t, t]),
    },
    { key: 'seatCapacity', label: 'Seats (rides)', type: 'number', min: 1, step: '1' },
    { key: 'minHeightCm', label: 'Minimum height in cm, 0 for none (rides)', type: 'number', min: 0, step: '1' },
    { key: 'isIndoor', label: 'Indoor (rides)', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
    { key: 'isExpressEligible', label: 'Express line (rides)', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
    {
      key: 'rideStatus',
      label: 'Operating status (rides)',
      type: 'select',
      show: (form) => form.kind === 'Ride',
      options: [['Open', 'Open'], ['Maintenance', 'Maintenance']],
    },
    { key: 'playPrice', label: 'Price per play in dollars (games)', type: 'number', min: 0, step: '0.01' },
    { key: 'venueType', label: 'Venue type (venues)', type: 'select', options: [['Restaurant', 'Restaurant'], ['Gift Shop', 'Gift shop']] },
    {
      key: 'serviceType',
      label: 'Service (restaurants only)',
      type: 'select',
      options: [['', 'None (gift shops)'], ['Table Service', 'Table service'], ['Quick Service', 'Quick service'], ['Snack Cart', 'Snack cart']],
    },
    { key: 'isActive', label: 'Active', type: 'select', options: [['yes', 'Active'], ['no', 'Inactive']] },
  ],
  blank: () => ({
    kind: 'Ride',
    zoneId: '',
    name: '',
    rideType: 'Coaster',
    seatCapacity: '',
    minHeightCm: '0',
    isIndoor: 'no',
    isExpressEligible: 'no',
    rideStatus: 'Open',
    playPrice: '',
    venueType: 'Restaurant',
    serviceType: '',
    isActive: 'yes',
  }),
  fromRecord: (rec) => ({
    kind: rec.Kind,
    zoneId: String(rec.ZoneID),
    name: rec.Name,
    rideType: rec.RideType ?? 'Coaster',
    seatCapacity: rec.SeatCapacity == null ? '' : String(rec.SeatCapacity),
    minHeightCm: rec.MinHeightCm == null ? '0' : String(rec.MinHeightCm),
    isIndoor: Number(rec.IsIndoor) ? 'yes' : 'no',
    isExpressEligible: Number(rec.IsExpressEligible) ? 'yes' : 'no',
    rideStatus: rec.RideStatus ?? 'Open',
    playPrice: rec.PlayPrice == null ? '' : String(rec.PlayPrice),
    venueType: rec.VenueType ?? 'Restaurant',
    serviceType: rec.ServiceType ?? '',
    isActive: Number(rec.IsActive) ? 'yes' : 'no',
  }),
  toPayload: (form) => ({
    kind: form.kind,
    zoneId: num(form.zoneId),
    name: form.name.trim(),
    rideType: form.rideType,
    seatCapacity: num(form.seatCapacity),
    minHeightCm: num(form.minHeightCm),
    isIndoor: form.isIndoor === 'yes',
    isExpressEligible: form.isExpressEligible === 'yes',
    rideStatus: form.rideStatus || 'Open',
    playPrice: form.playPrice === '' ? null : form.playPrice,
    venueType: form.venueType,
    serviceType: form.serviceType === '' ? null : form.serviceType,
    isActive: form.isActive === 'yes',
  }),
  describe: (row) => `${row.Kind.toLowerCase()} "${row.Name}"`,
  savedToast: (saved) =>
    saved.notification
      ? {
          title: saved.notification.Title,
          badge: 'New',
          message: saved.notification.Message,
          footnote: 'Automatically created by the database trigger.',
        }
      : null,
}

// ---- App Users (Admin): everyone in one list, add / edit / deactivate staff ------------------------------
// Shows staff logins, member accounts and guests (customer records with no login). Starts grouped by role.
// Only staff rows can be edited or deactivated here; members and guests are managed on the Customers page.
// The password is sent to the server, hashed there, and never comes back. On edit, leave it empty to keep the current one.
const STAFF_ROLE_LIST = ['Admin', 'Manager', 'Cashier', 'RetailManager', 'HRManager', 'MaintenanceManager', 'MaintenanceWorker', 'RestaurantWorker']
const isStaffRow = (row) => row.UserID != null && row.Role !== 'Customer'

export const USERS = {
  title: 'App Users',
  intro:
    'Everyone in one place, grouped by role: staff logins, employees who do not have a login yet, member accounts and guests (customer records with no login). Filter by role or search by name or username. Staff logins belong to an employee and are named after them (first name plus the last four digits of their ID); you can add one, change its role, set a new password, or deactivate it. Members and guests are view only here (members and guests show the newest 300; search to find others). You cannot deactivate yourself or change your own role.',
  resource: 'users',
  idKey: 'UserID',
  rowKey: 'RowKey', // guests have no UserID, so rows are keyed by RowKey
  // Starts as "Group by: Role": the people under a heading per role, in this order.
  groupBy: {
    key: 'Role',
    label: 'Group by',
    optionLabel: 'Role',
    defaultOn: true,
    order: ['Admin', 'Manager', 'RetailManager', 'HRManager', 'MaintenanceManager', 'Cashier', 'MaintenanceWorker', 'RestaurantWorker', 'NoLogin', 'Customer', 'Guest'],
    labels: { Customer: 'Member accounts', Guest: 'Guests (no login)', NoLogin: 'Staff without a login' },
  },
  hideIds: true, // the page never shows user numbers
  noun: 'user',
  deleteRoles: ['Admin'],
  deleteLabel: 'Deactivate',
  deletePast: 'Deactivated',
  deleteNote: 'The account is kept and can be turned back on by editing it.',
  canEditRow: isStaffRow,
  // Employees with no login get an "Add login" button that opens the form with that employee already chosen.
  canAddLoginRow: (row) => row.Role === 'NoLogin',
  addLoginForm: (row, lookups) => {
    const emp = (lookups?.employees ?? []).find((e) => String(e.id) === String(row.EmployeeID))
    return { username: emp?.username ?? '', suggested: emp?.username ?? '', role: '', password: '', employeeId: String(row.EmployeeID), isActive: 'yes' }
  },
  canDeleteRow: (row) => isStaffRow(row) && Number(row.IsActive) === 1,
  filters: [
    {
      key: 'role',
      label: 'Role',
      options: [
        ['', 'All roles'],
        ...STAFF_ROLE_LIST.map((r) => [r, r.replace(/([a-z])([A-Z])/g, '$1 $2')]),
        ['NoLogin', 'Staff without a login'],
        ['Customer', 'Member accounts'],
        ['Guest', 'Guests (no login)'],
      ],
    },
    {
      key: 'status',
      label: 'Show',
      options: [
        ['', 'All'],
        ['active', 'Active'],
        ['inactive', 'Inactive'],
      ],
    },
    { key: 'q', label: 'Search', type: 'search', placeholder: 'Name or username' },
  ],
  columns: [
    { key: 'PersonName', label: 'Name', format: (v) => v || '—' },
    { key: 'Username', label: 'Username', format: (v) => v || '—' },
    { key: 'Role', label: 'Role', format: (v, row) => (v === 'Customer' ? 'Member' : v === 'Guest' ? 'Guest' : v === 'NoLogin' ? `${row?.JobTitle ?? 'Staff'} (no login)` : v) },
    { key: 'EmployeeID', label: 'Employee ID', format: (v) => v || '—' },
    { key: 'CustomerID', label: 'Customer #', format: (v) => v || '—' },
    { key: 'IsActive', label: 'Status', format: (v) => (Number(v) ? 'Active' : 'Inactive') },
  ],
  fields: [
    {
      key: 'employeeId',
      label: 'Employee (every staff login belongs to one)',
      type: 'select',
      required: true,
      options: [],
      optionsFrom: (form, lookups) => (lookups?.employees ?? []).map((e) => [String(e.id), e.name]),
    },
    { key: 'username', label: 'Username (filled from the employee: first name and last four digits of their ID; never a role name)', type: 'text', required: true, maxLength: 50 },
    {
      key: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      options: ['Admin', 'Manager', 'Cashier', 'RetailManager', 'HRManager', 'MaintenanceManager', 'MaintenanceWorker', 'RestaurantWorker'].map((r) => [r, r]),
    },
    { key: 'password', label: 'Password, at least 8 characters (empty keeps the current one)', type: 'password', maxLength: 72 },
    { key: 'isActive', label: 'Status', type: 'select', options: [['yes', 'Active'], ['no', 'Inactive']] },
  ],
  blank: () => ({ username: '', suggested: '', role: '', password: '', employeeId: '', isActive: 'yes' }),
  // Picking an employee fills the username with that person's suggested name. It never overwrites a name you typed.
  onFieldChange: (key, value, form, lookups) => {
    if (key !== 'employeeId') return null
    const emp = (lookups?.employees ?? []).find((e) => String(e.id) === value)
    if (!emp) return null
    if (form.username === '' || form.username === form.suggested) return { username: emp.username, suggested: emp.username }
    return null
  },
  fromRecord: (rec) => ({
    username: rec.Username,
    role: rec.Role,
    password: '',
    employeeId: rec.EmployeeID == null ? '' : String(rec.EmployeeID),
    isActive: Number(rec.IsActive) ? 'yes' : 'no',
  }),
  toPayload: (form) => ({
    username: form.username.trim(),
    role: form.role,
    password: form.password,
    employeeId: form.employeeId === '' ? null : Number(form.employeeId),
    isActive: form.isActive === 'yes',
  }),
  describe: (row) => `user ${row.Username}`,
}
