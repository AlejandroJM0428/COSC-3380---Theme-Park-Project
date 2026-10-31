# Presentation demo script (15 minutes)

Tuesday Nov 10. About 2 min on the DBMS and design, 3 on roles, 6 on triggers in action, 2 on data importance, 2 spare.

There are no demo buttons. Every trigger is shown through the pages a real user uses, or through the admin Row Editor and SQL console. A refused change returns the trigger's own message.

Credentials are not in the repo. Passwords come from the reseed (plan step 2.5) and go only in the submission email. Log in as these usernames:

| Username | Role | Used for |
|---|---|---|
| `admin` | Admin | Everything, the SQL console, the Triggers tab |
| `manager` | Manager | Ride log, weather, reports |
| `cashier` | Cashier | Sell Ticket, refunds |
| `maintmgr` | MaintenanceManager | Maintenance page and its reports |
| `hr` | HRManager | Shift Ratings |
| `tech` | MaintenanceWorker | My Work |

## Before you start (5 minutes, the day before and again 30 minutes before)

1. Open `/admin`, then Database tools, then Triggers. The line must say 25 triggers and match. Any "Missing from database" means SQL/11 was not loaded on `geto`.
2. Check the data the script names. In the SQL console run:
   `SELECT Tier, AnyDayAccess, IsForSale FROM MembershipTier`
   Note one tier with AnyDayAccess = 0 (weekday only). The script calls it the weekday tier.
3. In Browse, open Membership and note one customer who already has a membership. The script calls it the member.
4. Sell Kit Demo (customer 2, height 95 cm) a ticket for today as `cashier`. Kit is the short guest.
5. Log in once as each account in the table so nothing surprises you on stage.

## 1. DBMS and design (2 min)

- Say what the park is: Thunder Valley Adventure Park, one park, zones, rides, games, venues, guests, staff.
- Open Database tools, then Browse Table. Show two linked tables, for example Ticket and Customer.
- Say the numbers: 22 core tables plus Notification and AdminAudit, 25 triggers, stored procedures `sp_Assert*` for the shared rules, views for every report, one login table (AppUser) that carries the role.
- Say why: rules live in the database, so no page can skip them.

## 2. Roles (3 min)

Do this only after the role cleanup from the TA review is merged (plan step 2.1). The TA called role access a violation.

1. `cashier`: show the menu. Sell Ticket, refunds, purchases. No reports, no staff pages.
2. `maintmgr`: show only maintenance reports and the Maintenance page.
3. `hr`: show only Shift Ratings and staff reports.
4. `admin`: show everything, then say the admin is the only role that reaches `/admin`.
5. Try to open `/admin` as `cashier`. It sends you back to `/staff`. Say the check is enforced on the server, not just hidden links.

## 3. Triggers in action (6 min, about one minute each)

Open `/admin`, Database tools, Triggers once at the start. Say: these 25 run on every save from every page. Then show six.

1. **Ride gate (trg_RideLog_BI).** As `manager`, Ride Log: record a boarding for Kit Demo on Thunder Run (ride 3, minimum height 122 cm). Expect: "Guest is below the ride height requirement".
2. **Maintenance closes a ride (trg_Maint_AI, then trg_Ride_AU_Notify).** As `maintmgr`, Maintenance: open an Emergency Repair on Canyon Cyclone (ride 4). Show the new maintenance alert in the notification bar. Then try a boarding on ride 4 as `manager`. Expect: "Ride was under maintenance".
3. **Ticket rules (trg_Ticket_BI).** As `cashier`, Sell Ticket: sell the member a ticket on the next Saturday using the weekday tier. Expect: "This membership tier is valid on weekdays only".
4. **Membership overlap (trg_Membership_BI).** As `cashier`, Memberships: add a second membership for the member with dates inside the first. Expect: "This guest already has a membership that overlaps with the selected dates."
5. **Records are never edited (trg_RideLog_BU).** As `admin`, SQL console:
   `UPDATE RideLog SET UsedExpress = UsedExpress LIMIT 1`
   Expect: "Ride log entries are records and cannot be edited".
6. **No close without a cost (trg_Maint_BU_Cost).** As `admin`, SQL console:
   `UPDATE Maintenance SET RepairCost = NULL WHERE EndDate IS NOT NULL LIMIT 1`
   Expect: "A closed maintenance job needs a repair cost".

After beat 2, close the Canyon Cyclone job on the Maintenance page with outcome Fixed and a repair cost, so the ride is open again. Beat 3 to 6 change nothing, because every change is refused.

If a form shows its own friendly message instead of the trigger's, say the page checked first and the trigger is the safety net, then repeat the same change in the SQL console to show the database refusing it alone.

## 4. Data importance (2 min)

Say which data matters most and which trigger guards it. In the SQL console run:

`SELECT 'Ticket' AS t, COUNT(*) AS n FROM Ticket UNION ALL SELECT 'RideLog', COUNT(*) FROM RideLog UNION ALL SELECT 'Membership', COUNT(*) FROM Membership UNION ALL SELECT 'Maintenance', COUNT(*) FROM Maintenance UNION ALL SELECT 'Employee', COUNT(*) FROM Employee`

| Data | Why it matters | Guard |
|---|---|---|
| Ride and Maintenance | Safety and downtime. Answers whether low ridership is downtime or low demand | trg_Maint_AI, trg_Ride_AU_Notify, trg_Maint_BU_Cost |
| Ticket, Purchase, GamePlay, RideLog, TicketRefund | The money and attendance records | the `_BI` checks and the `_BU` locks |
| Membership, MembershipTier, Customer | Revenue per tier and retention | trg_Membership_BI, trg_Membership_BU |
| Employee, Shift, RideCertification, AppUser | Who works, who is certified, who can log in | trg_Shift_BI, trg_RideCert_BI, role checks |

## 5. Spare (2 min)

Open Database tools, then Required Queries, and run one query. Or open one report. Keep this for questions.

## If something goes wrong

- A trigger beat does not refuse: go to Triggers and check the "In database" mark for it. Missing means SQL/11 was not loaded.
- A login fails: use another account from the table and keep going.
- Out of time: skip beat 4, then beat 6.
