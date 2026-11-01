// The triggers for the COSC 3380 demo: six INSERT triggers and trg_Ride_AU_Notify from the schema,
// plus the rules restored by SQL/11_restore_triggers.sql, the notice triggers in SQL/13_notification_triggers.sql, the purchase guards in SQL/14_purchase_guards.sql and the
// dependent rules in SQL/16_dependents_cancellation.sql.
// The Triggers page matches this list to information_schema.TRIGGERS by name.

export const TRIGGER_CATALOG = [
  {
    name: 'trg_Ride_AU_Notify', table: 'Ride', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'When a ride status changes to Maintenance, inserts a New Maintenance Alert.',
  },
  {
    name: 'trg_WeatherLog_BI', table: 'WeatherLog', timing: 'BEFORE', event: 'INSERT', kind: 'Automatic',
    rule: 'Sets ClosesOutdoorRides from the reading and the park limits.',
  },
  {
    name: 'trg_Ticket_BI', table: 'Ticket', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Checks capacity and membership, applies Express, and sets the ticket price (less the dependent discount for a child).',
    errors: [
      'Park is at capacity for that date',
      'This membership tier is valid on weekdays only',
      'Membership does not belong to this customer',
      'Membership is not active on the visit date',
      'Customer is inactive or does not exist',
    ],
  },
  {
    name: 'trg_Ticket_BI_Guard', table: 'Ticket', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Stops accidental double-bookings: the same customer and visit date within a minute, or 5 tickets in 10 minutes.',
    errors: [
      'You just booked a ticket for that date. Check My Tickets before booking another.',
      'Too many tickets too quickly. Please wait a few minutes and try again.',
    ],
  },
  {
    name: 'trg_Membership_AI_Welcome', table: 'Membership', timing: 'AFTER', event: 'INSERT', kind: 'Automatic',
    rule: 'A new membership unlocks its welcome perks (pin, parking day, VIP photo session, depending on the tier).',
  },
  {
    name: 'trg_Membership_BI', table: 'Membership', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs an active customer and a tier still for sale. Blocks an overlap and copies the tier price.',
    errors: [
      'Customer is inactive or does not exist',
      'This membership tier is no longer sold',
      'This guest already has a membership that overlaps with the selected dates.',
    ],
  },
  {
    name: 'trg_RideLog_BI', table: 'RideLog', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'A boarding must have a valid ticket, and the ride must be open for that guest.',
    errors: [
      'Ride is no longer in service',
      'Ride was under maintenance',
      'Weather has closed outdoor rides',
      'Guest is below the ride height requirement',
      'Ticket does not include Express',
      'Ride is not Express eligible',
    ],
  },
  {
    name: 'trg_GamePlay_BI', table: 'GamePlay', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs a valid ticket and a game that is in service. Copies PlayPrice into AmountPaid.',
    errors: ['Game was under maintenance', 'Game is no longer in service'],
  },
  {
    name: 'trg_Purchase_BI', table: 'Purchase', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs a valid ticket and an item still sold at an open venue. Copies the item price into UnitPrice.',
    errors: ['Item does not exist', 'Item is no longer sold', 'Venue was under maintenance'],
  },
  {
    name: 'trg_Ticket_BU', table: 'Ticket', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'A ticket with rides, plays, purchases or a refund cannot be changed. Other edits get the same checks and price as a new ticket.',
    errors: [
      'Ticket already has activity and cannot be changed',
      'Park is at capacity for that date',
      'Membership does not belong to this customer',
    ],
  },
  {
    name: 'trg_Membership_BU', table: 'Membership', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Blocks an overlap and a tier no longer sold. The price always comes from the tier.',
    errors: [
      'This guest already has a membership that overlaps with the selected dates.',
      'This membership tier is no longer sold',
    ],
  },
  {
    name: 'trg_WeatherLog_BU', table: 'WeatherLog', timing: 'BEFORE', event: 'UPDATE', kind: 'Automatic',
    rule: 'Recomputes ClosesOutdoorRides whenever a reading is edited.',
  },
  {
    name: 'trg_TicketRefund_BI', table: 'TicketRefund', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'A refund cannot be dated before the purchase. A weather refund needs weather that closed outdoor rides.',
    errors: [
      'Refund cannot be dated before the ticket was purchased',
      'That weather did not close outdoor rides',
    ],
  },
  {
    name: 'trg_RideCert_BI', table: 'RideCertification', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Only ride operators can be certified, and not before their hire date.',
    errors: [
      'Only ride operators can be certified on a ride',
      'Certification starts before the hire date',
    ],
  },
  {
    name: 'trg_Shift_BI', table: 'Shift', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Needs an active employee. No overlapping shift and no clock-in before the hire date.',
    errors: [
      'Employee is inactive or does not exist',
      'Shift starts before the hire date',
      'Shift overlaps another shift for this employee',
    ],
  },
  {
    name: 'trg_Shift_BU', table: 'Shift', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Changing the times or the employee gets the same overlap and hire date checks. A rating alone is always fine.',
    errors: [
      'Shift starts before the hire date',
      'Shift overlaps another shift for this employee',
    ],
  },
  {
    name: 'trg_MaintCrew_BI', table: 'MaintenanceCrew', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Only an active technician can join a repair crew.',
    errors: ['Only an active technician can join a repair crew'],
  },
  {
    name: 'trg_Maint_BU_Cost', table: 'Maintenance', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'A job cannot be closed without a repair cost.',
    errors: ['A closed maintenance job needs a repair cost'],
  },
  {
    name: 'trg_Maint_AI', table: 'Maintenance', timing: 'AFTER', event: 'INSERT', kind: 'Automatic',
    rule: 'A new job sets the ride to Maintenance when it is under maintenance now, which fires the maintenance alert.',
  },
  {
    name: 'trg_Maint_AU', table: 'Maintenance', timing: 'AFTER', event: 'UPDATE', kind: 'Automatic',
    rule: 'Closing or editing a job puts the ride back to Open, or keeps it in Maintenance if the repair did not fix it.',
  },
  {
    name: 'trg_Maint_AU_Notify', table: 'Maintenance', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'A job that closes without a full fix posts a notice that the facility stays closed.',
  },
  {
    name: 'trg_Ticket_AI_Notify', table: 'Ticket', timing: 'AFTER', event: 'INSERT', kind: 'Notification',
    rule: 'The ticket that fills the park for a day posts a sold-out notice for that day.',
  },
  {
    name: 'trg_WeatherLog_AI_Notify', table: 'WeatherLog', timing: 'AFTER', event: 'INSERT', kind: 'Notification',
    rule: 'A reading that closes outdoor rides posts a weather notice.',
  },
  {
    name: 'trg_RideLog_BU', table: 'RideLog', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Ride log entries are records and are never edited.',
    errors: ['Ride log entries are records and cannot be edited'],
  },
  {
    name: 'trg_GamePlay_BU', table: 'GamePlay', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Game plays are records and are never edited.',
    errors: ['Game plays are records and cannot be edited'],
  },
  {
    name: 'trg_Purchase_BU', table: 'Purchase', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Purchases are records and are never edited.',
    errors: ['Purchases are records and cannot be edited'],
  },
  {
    name: 'trg_TicketRefund_BU', table: 'TicketRefund', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Refunds are records and are never edited.',
    errors: ['Refunds are records and cannot be edited'],
  },
  {
    name: 'trg_Customer_BI_Dependent', table: 'Customer', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'A new dependent needs an active parent who is not a dependent, must be under 18, and a parent can have at most 6 active dependents.',
    errors: [
      'A customer cannot be their own parent.',
      'The parent must be an active customer.',
      'A dependent cannot have dependents of their own.',
      'A customer who has dependents cannot become a dependent.',
      'The birth date cannot be in the future.',
      'A dependent must be under 18.',
      'A parent can have at most 6 dependents.',
    ],
  },
  {
    name: 'trg_Customer_BU_Dependent', table: 'Customer', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Changing a dependent\'s parent or birth date runs the same dependent rules again. Renaming or anonymising a dependent does not.',
    errors: [
      'A customer cannot be their own parent.',
      'The parent must be an active customer.',
      'A dependent cannot have dependents of their own.',
      'A customer who has dependents cannot become a dependent.',
      'The birth date cannot be in the future.',
      'A dependent must be under 18.',
      'A parent can have at most 6 dependents.',
    ],
  },
  {
    name: 'trg_Ride_AU_Reopen', table: 'Ride', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'When a ride leaves Maintenance, switches off its "unavailable" notice.',
  },
  {
    name: 'trg_WeatherLog_AU_Clear', table: 'WeatherLog', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'When a weather event gets an end time, switches off its closure notice.',
  },
  {
    name: 'trg_Ticket_AI_SellingFast', table: 'Ticket', timing: 'AFTER', event: 'INSERT', kind: 'Notification',
    rule: 'When a visit date reaches 90% of capacity (and is not sold out), posts a "Selling fast" notice for that date.',
  },
];

// The catalog entry (without the long error list) for a trigger name, or null.
export function describeTrigger(name) {
  const t = TRIGGER_CATALOG.find((x) => x.name === name);
  return t ? { name: t.name, table: t.table, timing: t.timing, event: t.event, rule: t.rule } : null;
}

// Which trigger sent this message? Used so the browser can show "trigger fired" cards.
// Exact match on the catalog's error list; the first entry wins when two triggers share a message.
export function triggerForMessage(message) {
  const text = String(message ?? '');
  const t = TRIGGER_CATALOG.find((x) => x.errors?.includes(text));
  return t ? describeTrigger(t.name) : null;
}
