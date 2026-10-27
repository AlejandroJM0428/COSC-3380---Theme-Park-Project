// Data-entry pages that used to say "not built yet". Same idea as config/entities.js: one config object per page,
// shown by <RecordManager entity={...} />. Server routes are in server/routes (customers.js, memberships.js, ...).
//
// Pages for permanent records (purchases, game plays, ride log) have no Edit or Delete button on purpose:
// the database refuses edits to them with a trigger. A mistake is corrected by adding a new row.

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
  deleteRoles: ['Admin', 'Manager', 'RetailManager'],
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
    'Annual memberships. Pick the guest, the tier and the start date. The database sets the price from the tier list, and the membership ends one year later. A membership with tickets on it cannot be deleted.',
  resource: 'memberships',
  idKey: 'MembershipID',
  noun: 'membership',
  deleteRoles: ['Admin', 'Manager', 'RetailManager'],
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
    { key: 'customerId', label: 'Customer ID', type: 'number', required: true, min: 1, step: '1' },
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
  blank: () => ({ customerId: '', tier: '', startDate: '', autoRenew: 'no' }),
  fromRecord: (rec) => ({
    customerId: String(rec.CustomerID),
    tier: rec.Tier,
    startDate: rec.StartDate,
    autoRenew: Number(rec.AutoRenew) ? 'yes' : 'no',
  }),
  toPayload: (form) => ({
    customerId: Number(form.customerId),
    tier: form.tier,
    startDate: form.startDate,
    autoRenew: form.autoRenew === 'yes',
  }),
  describe: (row) => `membership #${row.MembershipID} (${row.CustomerName}, ${row.Tier})`,
}

// ---- Food & shop purchases: add only (permanent records) --------------------------------------------------
export const PURCHASES = {
  title: 'Food & Shop Purchases',
  intro:
    'Revenue records for food, drinks and merchandise. Add what a guest bought on their ticket. The database fills in the price. Purchases are permanent: to fix a mistake, add a correcting entry.',
  resource: 'purchases',
  idKey: 'PurchaseID',
  noun: 'purchase',
  deleteRoles: [],
  canEditRow: () => false,
  canDeleteRow: () => false,
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
    { key: 'ticketId', label: 'Ticket ID', type: 'number', required: true, min: 1, step: '1' },
    {
      key: 'itemId',
      label: 'Item',
      type: 'select',
      required: true,
      wide: true,
      optionsFrom: (form, lookups) => (lookups?.items ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1, step: '1' },
    { key: 'purchasedAt', label: 'Time (leave empty for now)', type: 'datetime' },
  ],
  blank: () => ({ ticketId: '', itemId: '', quantity: '1', purchasedAt: '' }),
  fromRecord: (rec) => ({
    ticketId: String(rec.TicketID),
    itemId: '',
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

// ---- Game plays: add only (permanent records) -------------------------------------------------------------
export const GAME_PLAYS = {
  title: 'Game Plays',
  intro:
    'Revenue records for midway games. Add a play on a guest\'s ticket. The database fills in the price and refuses games that are retired or under maintenance. Game plays are permanent.',
  resource: 'game-plays',
  idKey: 'GamePlayID',
  noun: 'game play',
  deleteRoles: [],
  canEditRow: () => false,
  canDeleteRow: () => false,
  columns: [
    { key: 'GamePlayID', label: 'Play #' },
    { key: 'PlayedAt', label: 'When', format: shortDate },
    { key: 'CustomerName', label: 'Guest' },
    { key: 'TicketID', label: 'Ticket #' },
    { key: 'GameName', label: 'Game' },
    { key: 'AmountPaid', label: 'Paid', format: money },
  ],
  fields: [
    { key: 'ticketId', label: 'Ticket ID', type: 'number', required: true, min: 1, step: '1' },
    {
      key: 'gameId',
      label: 'Game',
      type: 'select',
      required: true,
      optionsFrom: (form, lookups) => (lookups?.games ?? []).map((x) => [String(x.id), x.name]),
    },
    { key: 'playedAt', label: 'Time (leave empty for now)', type: 'datetime' },
  ],
  blank: () => ({ ticketId: '', gameId: '', playedAt: '' }),
  fromRecord: (rec) => ({ ticketId: String(rec.TicketID), gameId: '', playedAt: toInput(rec.PlayedAt) }),
  toPayload: (form) => ({
    ticketId: Number(form.ticketId),
    gameId: Number(form.gameId),
    playedAt: form.playedAt || null,
  }),
  describe: (row) => `game play #${row.GamePlayID}`,
}

// ---- Ride log: add only (permanent records) ---------------------------------------------------------------
export const RIDE_LOG = {
  title: 'Ride Log',
  intro:
    'Ride activity. A boarding records a guest getting on a ride. A wait reading records the posted wait time. The database refuses boardings on rides under maintenance, closed by weather, or above the guest\'s height. Entries are permanent.',
  resource: 'ride-log',
  idKey: 'RideLogID',
  noun: 'ride log entry',
  deleteRoles: [],
  canEditRow: () => false,
  canDeleteRow: () => false,
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
    { key: 'ticketId', label: 'Ticket ID (for a boarding)', type: 'number', min: 1, step: '1' },
    { key: 'waitMinutes', label: 'Wait minutes (for a wait reading)', type: 'number', min: 0, step: '1' },
    { key: 'usedExpress', label: 'Used the Express line (boardings)', type: 'select', options: [['no', 'No'], ['yes', 'Yes']] },
    { key: 'loggedAt', label: 'Time (leave empty for now)', type: 'datetime' },
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
    'Weather readings. The database decides whether a reading closes outdoor rides, and posts a notice on the homepage when it does. Try adding a Storm with strong wind to see the notice appear.',
  resource: 'weather',
  idKey: 'WeatherID',
  noun: 'weather entry',
  deleteRoles: ['Admin', 'Manager'],
  deleteNote: 'Entries that a refund uses cannot be deleted.',
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
    { key: 'StartedAt', label: 'Started', format: shortDate },
    { key: 'EndedAt', label: 'Ended', format: (v) => (v ? shortDate(v) : 'Ongoing') },
    { key: 'TemperatureF', label: 'Temp (F)' },
    { key: 'WindMph', label: 'Wind (mph)' },
    { key: 'LightningMiles', label: 'Lightning', format: (v) => (Number(v) >= 99.9 ? 'None detected' : `${v} mi`) },
    { key: 'ClosesOutdoorRides', label: 'Outdoor rides', format: (v) => (Number(v) ? 'Closed' : 'Open') },
  ],
  fields: [
    {
      key: 'weatherType',
      label: 'Weather',
      type: 'select',
      required: true,
      options: ['Clear', 'Cloudy', 'Rain', 'Storm', 'Heat', 'Cold'].map((t) => [t, t]),
    },
    { key: 'startedAt', label: 'Started', type: 'datetime', required: true },
    { key: 'endedAt', label: 'Ended (leave empty while it is ongoing)', type: 'datetime' },
    { key: 'temperatureF', label: 'Temperature (F)', type: 'number', required: true, step: '1' },
    { key: 'windMph', label: 'Wind (mph)', type: 'number', required: true, min: 0, step: '1' },
    { key: 'lightningMiles', label: 'Lightning distance (miles, 99.9 = none detected)', type: 'number', required: true, min: 0, step: '0.1' },
  ],
  blank: () => ({ weatherType: 'Clear', startedAt: '', endedAt: '', temperatureF: '', windMph: '', lightningMiles: '99.9' }),
  fromRecord: (rec) => ({
    weatherType: rec.WeatherType,
    startedAt: toInput(rec.StartedAt),
    endedAt: toInput(rec.EndedAt),
    temperatureF: String(rec.TemperatureF),
    windMph: String(rec.WindMph),
    lightningMiles: String(rec.LightningMiles),
  }),
  toPayload: (form) => ({
    weatherType: form.weatherType,
    startedAt: form.startedAt,
    endedAt: form.endedAt || null,
    temperatureF: num(form.temperatureF),
    windMph: num(form.windMph),
    lightningMiles: num(form.lightningMiles),
  }),
  describe: (row) => `weather entry #${row.WeatherID} (${row.WeatherType}, ${row.StartedAt?.slice(0, 16)})`,
}
