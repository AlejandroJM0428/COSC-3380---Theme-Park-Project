// Plain-English description of every trigger in the project's SQL
// (SQL/theme-park-schema.sql and SQL/05_notifications.sql).
// The Triggers page reads the LIVE list from the database and matches it to this catalog by name,
// so the page can tell you if a trigger described here is missing from the database.
//
// kind:   'Notification'  = writes a row to the Notification table (shown on the homepage)
//         'Automatic'     = fills in or refreshes data by itself
//         'Check'         = refuses a bad insert/update with an error message
// errors: the exact text the database sends back when the trigger refuses a change
// demos:  ids from server/demos/definitions.js that exercise this trigger

export const TRIGGER_CATALOG = [
  // ---- Notifications -------------------------------------------------------------------
  {
    name: 'trg_Ticket_AI_Notify', table: 'Ticket', timing: 'AFTER', event: 'INSERT', kind: 'Notification',
    rule: 'When a visit date sells out, posts a "Sold out" notice for that date.',
  },
  {
    name: 'trg_WeatherLog_AI_Notify', table: 'WeatherLog', timing: 'AFTER', event: 'INSERT', kind: 'Notification',
    rule: 'When a weather reading closes outdoor rides, posts a weather alert.',
  },
  {
    name: 'trg_Maint_AU_Notify', table: 'Maintenance', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'When a maintenance job gets an end date, posts a "Maintenance closed" notice.',
  },

  // ---- Automatic -----------------------------------------------------------------------
  {
    name: 'trg_WeatherLog_BI', table: 'WeatherLog', timing: 'BEFORE', event: 'INSERT', kind: 'Automatic',
    rule: 'Works out whether a new weather reading closes outdoor rides.',
  },
  {
    name: 'trg_WeatherLog_BU', table: 'WeatherLog', timing: 'BEFORE', event: 'UPDATE', kind: 'Automatic',
    rule: 'Recalculates the outdoor-ride closure flag whenever a reading is edited.',
  },
  {
    name: 'trg_Maint_AI', table: 'Maintenance', timing: 'AFTER', event: 'INSERT', kind: 'Automatic',
    rule: 'Refreshes the ride\'s status when a maintenance job is added.',
  },
  {
    name: 'trg_Maint_AU', table: 'Maintenance', timing: 'AFTER', event: 'UPDATE', kind: 'Automatic',
    rule: 'Refreshes the ride\'s status when a maintenance job changes.',
  },

  // ---- Checks --------------------------------------------------------------------------
  {
    name: 'trg_Ticket_BI', table: 'Ticket', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Checks park capacity and membership rules, applies the Express benefit and sets the price.',
    errors: [
      'Park is at capacity for that date',
      'This membership tier is valid on weekdays only',
      'Membership does not belong to this customer',
      'Membership is not active on the visit date',
    ],
    demos: ['capacity', 'basic-weekend', 'membership-owner', 'membership-expired'],
  },
  {
    name: 'trg_Ticket_BU', table: 'Ticket', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Locks guest, membership and date once a ticket has been used. Otherwise re-checks it like a new ticket.',
    errors: ['Ticket has activity; guest, membership and date cannot change'],
  },
  {
    name: 'trg_Membership_BI', table: 'Membership', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs an active customer and a tier that is still sold. Blocks overlapping memberships and takes the price from the tier list.',
    errors: ['Customer is inactive or does not exist', 'This membership tier is no longer sold'],
  },
  {
    name: 'trg_Membership_BU', table: 'Membership', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Blocks overlapping memberships. Re-prices from the tier list when the tier changes.',
  },
  {
    name: 'trg_RideLog_BI', table: 'RideLog', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Rejects retired rides. A boarding is also checked for maintenance, weather, ride height and Express rules.',
    errors: [
      'Ride is no longer in service',
      'Ride was under maintenance',
      'Weather has closed outdoor rides',
      'Guest is below the ride height requirement',
      'Ticket does not include Express',
      'Ride is not Express eligible',
    ],
    demos: ['ride-height', 'ride-maintenance', 'ride-weather'],
  },
  {
    name: 'trg_RideLog_BU', table: 'RideLog', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Ride log entries are permanent and cannot be edited.',
    errors: ['Ride log entries cannot be edited'],
  },
  {
    name: 'trg_GamePlay_BI', table: 'GamePlay', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs a valid ticket and a game that is in service. Saves the price at the time of play.',
    errors: ['Game was under maintenance', 'Game is no longer in service'],
  },
  {
    name: 'trg_GamePlay_BU', table: 'GamePlay', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Game play entries are permanent and cannot be edited.',
    errors: ['Game play entries cannot be edited'],
  },
  {
    name: 'trg_Purchase_BI', table: 'Purchase', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs a valid ticket and an item that is still sold at a venue that is open. Saves the price at the time of purchase.',
    errors: ['Item does not exist', 'Item is no longer sold', 'Venue was under maintenance'],
  },
  {
    name: 'trg_Purchase_BU', table: 'Purchase', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Purchases are permanent and cannot be edited.',
    errors: ['Purchases cannot be edited'],
  },
  {
    name: 'trg_TicketRefund_BI', table: 'TicketRefund', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'A refund cannot be dated before the purchase. A weather refund needs a weather event that closed rides on the visit date.',
    errors: [
      'Refund is dated before the ticket was bought',
      'Weather event did not close rides on the visit date',
    ],
  },
  {
    name: 'trg_TicketRefund_BU', table: 'TicketRefund', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Refunds are permanent and cannot be edited. Add a new row instead.',
    errors: ['Refunds cannot be edited'],
  },
  {
    name: 'trg_MaintCrew_BI', table: 'MaintenanceCrew', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Only active technicians can be put on a maintenance crew.',
    errors: ['Only technicians can be on a maintenance crew', 'Employee is inactive'],
  },
  {
    name: 'trg_RideCert_BI', table: 'RideCertification', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Only ride operators can be ride certified, and not before their hire date.',
    errors: ['Only ride operators can be ride certified', 'Certification date is before the hire date'],
  },
  {
    name: 'trg_Shift_BI', table: 'Shift', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'The employee must be active and hired. A shift cannot overlap another shift for the same employee.',
    errors: ['Employee is inactive or does not exist', 'Shift overlaps another shift for this employee'],
  },
  {
    name: 'trg_Shift_BU', table: 'Shift', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'On a change such as clock-out: after the hire date and not overlapping another shift.',
    errors: ['Shift overlaps another shift for this employee'],
  },
  {
    name: 'trg_Maint_BU_Cost', table: 'Maintenance', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'A maintenance job cannot be closed without a repair cost.',
    errors: ['Repair cost is required to close a maintenance job'],
  },
];

// The schema also has one scheduled event (not a trigger): ev_RefreshRideStatus, every 15 minutes.
export const EVENT_NOTE =
  'Not a trigger: a scheduled event, ev_RefreshRideStatus, also runs every 15 minutes so rides with a repair that has just started change status.';
