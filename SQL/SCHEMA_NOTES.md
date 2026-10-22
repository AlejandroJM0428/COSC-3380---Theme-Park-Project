# SCHEMA_NOTES: cheat sheet for `SQL/theme-park-schema.sql`

Read this instead of re-reading the 999-line schema. MySQL 8.4, database `theme_park`. 22 tables, 11 views, 20 triggers.

## Rules that bite when writing INSERTs

- **Placeholder columns** (NOT NULL, so send any value, a trigger overwrites it): `WeatherLog.ClosesOutdoorRides`, `Membership.Price`, `Ticket.TicketPrice`, `GamePlay.AmountPaid`, `Purchase.UnitPrice`.
- **Generated columns, leave out of INSERT:** `Membership.IncludesExpress`, `Membership.AnyDayAccess`, `Maintenance.IsPlanned`, `RideLog.WaitRideID`, `RideLog.WaitAt`.
- `Ticket.HasExpress` is forced to 1 for Premier members.
- `Membership.EndDate` must equal `StartDate + 1 year - 1 day`.
- `RideLog`: Boarding needs `TicketID` and no `WaitMinutes`. Wait Reading is the reverse and has `UsedExpress = 0`.
- `Maintenance`: exactly one of `RideID`, `GameID`, `VenueID`. `EndDate` and `Outcome` are both NULL or both set.
- Weather closes outdoor rides at wind >= 35, lightning <= 8.0 miles, temp >= 100 or temp <= 32 (limits live in `Park`).
- "Delete" = `IsActive = 0` on master tables. `RideLog`, `GamePlay`, `Purchase`, `TicketRefund` cannot be updated. A refund is a `TicketRefund` row.
- `AppUser.EmployeeID` is nullable.

## Tables (key columns)

| Table | Key columns |
|---|---|
| Park | ParkID (always 1), OpeningTime, ClosingTime, MaxOccupancy, weather limits, DayPassPrice, ExpressAddOnPrice |
| Zone | ZoneID, ZoneName |
| Ride | RideID, ZoneID, RideType, SeatCapacity, MinHeightCm, IsIndoor, IsExpressEligible, Status, IsActive |
| Game / Venue / Item | GameID + PlayPrice. VenueID + VenueType (Restaurant, Gift Shop) + ServiceType. ItemID + VenueID + Category + Price + IsAlcoholic |
| Customer | CustomerID, DOB, HeightCm, IsActive |
| MembershipTier / Membership | Tier (Basic, Plus, Premier) + AnnualPrice + IsForSale. Membership: CustomerID, Tier, StartDate, EndDate, AutoRenew |
| Ticket / TicketRefund | Ticket: CustomerID, MembershipID, VisitDate, HasExpress, PurchaseDate. Refund: TicketID (PK), WeatherID, RefundedAt, RefundReason |
| RideLog / GamePlay / Purchase | Boarding or Wait Reading. GamePlay: GameID, TicketID, PlayedAt. Purchase: TicketID, ItemID, Quantity, PurchasedAt |
| WeatherLog | WeatherType, StartedAt, EndedAt (NULL = ongoing), TemperatureF, WindMph, LightningMiles (99.9 = none) |
| Employee / EmployeeZone / RideCertification / Shift | JobTitle (Ride Operator, Game Attendant, Cook, Server, Shop Associate, Performer, Technician, Manager). Shift: ClockIn, ClockOut (NULL = open), ShiftRating |
| Maintenance / MaintenanceCrew | MaintType, StartDate, EndDate, Outcome (Fixed, Partially Fixed, Not Fixed), Reason. Crew: technicians only |
| AppUser | Username, PasswordHash, Role (Admin, Manager, Cashier), EmployeeID, IsActive |

## Views (report endpoints in `server/routes/reports.js`)

`v_CustomersPerMonth`, `v_DailyAttendance`, `v_RideAvailability`, `v_ZoneRideTraffic`, `v_VisitSpending`, `v_WeatherImpact`, `v_MaintenanceHistory`, `v_MembershipSummary`, `v_WaitTimeByRide`, `v_RevenueBySource`, `v_StaffByZone`.
`v_RideAvailability`, `v_MembershipSummary` and `v_MaintenanceHistory` use `NOW()` / `CURDATE()`, so their output depends on today's date.

## Exact trigger messages (copied from the schema, SQLSTATE 45000, errno 1644)

| Fires on | Message |
|---|---|
| Ticket insert | Customer is inactive or does not exist |
| Ticket insert | Park is at capacity for that date |
| Ticket insert | Membership does not belong to this customer |
| Ticket insert | Membership is not active on the visit date |
| Ticket insert | This membership tier is valid on weekdays only |
| Ticket update | Ticket has activity; guest, membership and date cannot change |
| Membership insert | Customer already has a membership covering those dates |
| Membership insert | This membership tier is no longer sold |
| RideLog boarding | Ticket does not exist |
| RideLog boarding | Ticket is not valid for this date |
| RideLog boarding | Ticket has been refunded |
| RideLog boarding | Park is closed at that time |
| RideLog boarding | Ride was under maintenance |
| RideLog boarding | Weather has closed outdoor rides |
| RideLog boarding | Guest is below the ride height requirement |
| RideLog boarding | Ticket does not include Express |
| RideLog boarding | Ride is not Express eligible |
| RideLog any | Ride is no longer in service |
| GamePlay insert | Game was under maintenance / Game is no longer in service |
| Purchase insert | Item does not exist / Item is no longer sold / Venue was under maintenance |
| TicketRefund insert | Refund is dated before the ticket was bought |
| TicketRefund insert | Weather event did not close rides on the visit date |
| MaintenanceCrew insert | Only technicians can be on a maintenance crew / Employee is inactive |
| RideCertification insert | Only ride operators can be ride certified / Certification date is before the hire date |
| Shift insert | Employee is inactive or does not exist / Shift starts before the hire date / Shift overlaps another shift for this employee |
| Update on RideLog, GamePlay, Purchase, TicketRefund | Ride log entries cannot be edited / Game play entries cannot be edited / Purchases cannot be edited / Refunds cannot be edited |

Order matters on a boarding: ticket checks, then maintenance, then weather, then height, then Express. A refunded ticket on a past date reports "not valid for this date" first, so demo the refund with a ticket for today.

## Test data layout (`SQL/02_test_data.sql`)

- Visits Jul 20 to Oct 21 2026: 1,253 tickets, about 4,300 boardings, 2,400 wait readings, 47 refunds, 12 storm or heat days.
- `MaxOccupancy` is 120. **Sat Nov 28 2026 is sold out** (exactly 120 tickets): any new ticket that day shows the capacity message.
- Demo customers: 1 Dana (adult, 172 cm), 2 Kit (95 cm), 3 Bailey (Basic, membership 1), 4 Pat (Plus, membership 2), 5 Eve (expired Basic, membership 3), 6 Ian (inactive).
- Demo tickets with no activity: **1130** Dana today (Oct 22, no Express), **1131** Kit today, 1132 Dana Oct 23 (Express), 1133 Kit Oct 23.
- Ride 12 Dragon's Nest is closed (job "Not Fixed"). Ride 2 Grand Carousel is in an ongoing job. Ride 13 Old Mill is retired. Ride 3 Thunder Run needs 122 cm and is Express eligible. Ride 9 Enchanted Journey is indoor with no requirements.
- Ongoing weather event: Cloudy since Oct 22 07:00 (does not close rides).

## Demo recipes for Step 4 (run each inside a transaction and ROLLBACK)

| Demo | Insert | Expected message |
|---|---|---|
| Capacity | Ticket, any customer, VisitDate 2026-11-28 | Park is at capacity for that date |
| Basic weekday | Ticket, customer 3, membership 1, VisitDate 2026-10-24 (Saturday) | This membership tier is valid on weekdays only |
| Passing partner | Same, VisitDate 2026-10-26 (Monday) | saves, then rollback |
| Ownership | Ticket, customer 1, membership 2 | Membership does not belong to this customer |
| Not active | Ticket, customer 5, membership 3, VisitDate 2026-10-24 | Membership is not active on the visit date |
| Closed | Boarding, ticket 1130, ride 9, 2026-10-22 23:30:00 | Park is closed at that time |
| Maintenance | Boarding, ticket 1130, ride 12, 2026-10-22 14:00:00 | Ride was under maintenance |
| Weather | First insert a Storm WeatherLog (start 2026-10-22 13:00, wind 40), then boarding ticket 1130, ride 3, 14:00 | Weather has closed outdoor rides |
| Height | Boarding, ticket 1131, ride 3, 14:00 | Guest is below the ride height requirement |
| Express | Boarding, ticket 1130, ride 3, UsedExpress 1 | Ticket does not include Express |
| Refunded | Refund ticket 1130, then boarding ride 9 | Ticket has been refunded |
