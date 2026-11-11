// The triggers for the COSC 3380 demo: six INSERT triggers and trg_Ride_AU_Notify from the schema,
// plus the rules restored by SQL/rules/11_restore_triggers.sql, the notice triggers in SQL/rules/13_notification_triggers.sql, the purchase guards in SQL/rules/14_purchase_guards.sql and the
// dependent rules in SQL/rules/16_dependents_cancellation.sql.
// The Triggers page matches this list to information_schema.TRIGGERS by name.

export const TRIGGER_CATALOG = [
  {
    name: 'trg_Ride_AU_Notify', table: 'Ride', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'When a ride status changes to Maintenance, inserts a New Maintenance Alert.',
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
    name: 'trg_Ticket_BI_Window', table: 'Ticket', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Business rule: a ticket can be bought for a visit at most 180 days ahead (the limit moves with today\'s date).',
    errors: ['Tickets can be bought at most 180 days before the visit.'],
  },
  {
    name: 'trg_Ticket_BU_Window', table: 'Ticket', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Business rule: moving a ticket to a new visit date follows the same 180-day window.',
    errors: ['Tickets can be bought at most 180 days before the visit.'],
  },
  {
    name: 'trg_Purchase_BI_Alcohol21', table: 'Purchase', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Business rule: alcohol can only be sold to guests who are 21 or older on the day of the purchase.',
    errors: ['Alcohol can only be sold to guests who are 21 or older.'],
  },
  {
    name: 'trg_Purchase_BU_Alcohol21', table: 'Purchase', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Business rule: correcting a purchase follows the same 21-or-older alcohol rule.',
    errors: ['Alcohol can only be sold to guests who are 21 or older.'],
  },
  {
    name: 'trg_Purchase_BI_DrinkLimit', table: 'Purchase', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Business rule: at most 8 alcoholic drinks per ticket per day (counts the earlier purchases on the same ticket).',
    errors: ['Drink limit reached: at most 8 alcoholic drinks per ticket per day.'],
  },
  {
    name: 'trg_Purchase_BU_DrinkLimit', table: 'Purchase', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Business rule: correcting a purchase follows the same 8-drinks-per-day limit.',
    errors: ['Drink limit reached: at most 8 alcoholic drinks per ticket per day.'],
  },
  {
    name: 'trg_Membership_BI_Adult', table: 'Membership', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Business rule: a membership holder must be 18 or older.',
    errors: ['A membership holder must be 18 or older.'],
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
    rule: 'A boarding must have a valid ticket, and the ride must be open for that guest. Severe weather closes every ride; Medium or High closes the outdoor ones.',
    errors: [
      'Ride is no longer in service',
      'Ride was under maintenance',
      'Weather has closed the park',
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
    name: 'trg_TicketRefund_BI', table: 'TicketRefund', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'A refund cannot be dated before the purchase. A weather refund needs weather that closed outdoor rides. Any other refund needs at least 2 days notice before the visit (business rule).',
    errors: [
      'Refund cannot be dated before the ticket was purchased',
      'That weather did not close outdoor rides',
      'Refunds need at least 2 days notice before the visit.',
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
    rule: 'Needs an active employee. No overlapping shift, no clock-in before the hire date, and no more than 40 clocked hours in the shift\'s week (Monday to Sunday).',
    errors: [
      'Employee is inactive or does not exist',
      'Shift starts before the hire date',
      'Shift overlaps another shift for this employee',
      'Employee would work more than 40 hours this week (Monday to Sunday)',
    ],
  },
  {
    name: 'trg_Shift_BU', table: 'Shift', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'Changing the times or the employee gets the same overlap, hire date and 40-hour checks. A rating alone is always fine.',
    errors: [
      'Shift starts before the hire date',
      'Shift overlaps another shift for this employee',
      'Employee would work more than 40 hours this week (Monday to Sunday)',
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
    rule: 'A weather event that closes something posts a notice: "Park closed" for Severe, "Outdoor rides closed" for Medium or High.',
  },
  {
    name: 'trg_WeatherLog_AU_Notify', table: 'WeatherLog', timing: 'AFTER', event: 'UPDATE', kind: 'Notification',
    rule: 'When an ongoing weather event\'s severity or type is edited, its notice is posted, reworded, or switched off to match.',
  },
  {
    name: 'trg_RideLog_BU', table: 'RideLog', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'An edited boarding gets the same checks as a new one (maintenance, weather, height, Express) when its ride, ticket, time or Express use changes. A changed wait time needs no check.',
    errors: ['Ride is no longer in service', 'Ride was under maintenance', 'Weather has closed the park', 'Weather has closed outdoor rides', 'Guest is below the ride height requirement', 'Ticket does not include Express', 'Ride is not Express eligible'],
  },
  {
    name: 'trg_GamePlay_BU', table: 'GamePlay', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'An edited play needs a valid ticket and a game that is in service. The amount paid stays as it was unless the game changes, then it is copied from the new game.',
    errors: ['Game was under maintenance', 'Game is no longer in service'],
  },
  {
    name: 'trg_Purchase_BU', table: 'Purchase', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'An edited purchase needs a valid ticket and an item still sold at an open venue. The unit price stays as it was unless the item changes, then it is copied from the new item.',
    errors: ['Item does not exist', 'Item is no longer sold', 'Venue was under maintenance'],
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
  {
    name: 'trg_MaintWorkReport_BI', table: 'MaintenanceWorkReport', timing: 'BEFORE', event: 'INSERT', kind: 'Check',
    rule: 'Only a crew member of an open maintenance job can report it finished.',
    errors: [
      'This job is already closed.',
      'Only a crew member of this job can report it finished.',
    ],
  },
  {
    name: 'trg_MaintWorkReport_BU', table: 'MaintenanceWorkReport', timing: 'BEFORE', event: 'UPDATE', kind: 'Check',
    rule: 'A work-finished report cannot be changed once the manager has closed the job.',
    errors: ['This job is already closed.'],
  },
];

// The catalog entry (without the long error list) for a trigger name, or null.
export function describeTrigger(name) {
  const t = TRIGGER_CATALOG.find((x) => x.name === name);
  return t ? { name: t.name, table: t.table, timing: t.timing, event: t.event, rule: t.rule } : null;
}

// Which trigger sent this message? Used so the browser can show "trigger fired" cards.
// Exact match on the catalog's error list. An insert trigger and its edit trigger share the same messages,
// so `where` ({ event: 'INSERT' | 'UPDATE' | 'DELETE', table }) says which statement failed. The trigger that
// matches both event and table wins, then the one that matches the event, then the first one in the list.
export function triggerForMessage(message, where = {}) {
  const text = String(message ?? '');
  const matches = TRIGGER_CATALOG.filter((x) => x.errors?.includes(text));
  const t =
    matches.find((x) => x.event === where.event && x.table === where.table) ||
    matches.find((x) => x.event === where.event) ||
    matches[0];
  return t ? describeTrigger(t.name) : null;
}
