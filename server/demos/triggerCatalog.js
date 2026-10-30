// The six INSERT triggers kept for the COSC 3380 demo.
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
    rule: 'Checks capacity and membership, applies Express, and sets the ticket price.',
    errors: [
      'Park is at capacity for that date',
      'This membership tier is valid on weekdays only',
      'Membership does not belong to this customer',
      'Membership is not active on the visit date',
      'Customer is inactive or does not exist',
    ],
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
];
