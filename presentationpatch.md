CHANGES YOU WILL MAKE AND YOU WILL NOT TAG THIS
ONCE YOU MAKE THE FOLLOWING CHANGES YOU WILL ZIP A PATCH I CAN UNZIP AND APPLY EASILY
WE WILL WORK IN STEPS TO ACCOMPLISH EASY DEMONSTRATION OF Presentation.md



1. Admin Portal: Staff Accounts accounts for our guest accounts this SHOULD NOT BE THE CASE. It should only count the Staff accounts.
   STATUS: DONE (patch-stage1). Admin Home "Active staff accounts" counts only the 8 staff roles.

2. On staff reports the front end reads it as a number with no formatting like 242332424 we need to fix this and for monetary values we want to add a dollar sign to the front
   STATUS: DONE (patch-stage1). Thousands separators; money columns show $ and 2 decimals.

3. DATA AHEAD OF Today's date should be marked as Pre-ordered. We do not want to have data beyond pre ordered like revenue for a date past november 10th we only want to have preorder of people who have booked their ticket ahead make sense? So queries by defualt end date should be the current date. And our start date should be the start date we opened or our first recorded edata. 
   STATUS: DONE (patch-stage2). Future days show as Pre-ordered (ticket count only); Q1-Q4 default to first recorded date through today.

CONCERNS FOUND WHEN CHECKING THE PLAN AGAINST THE ZIP (added under the items above)

4. Syed's refund: the refund route only accepts tickets with a FUTURE visit date. A past ticket is refused, and so is a ticket for today. So "refund an older ticket" will not work on the ticket he just bought. He needs a different ticket already booked for a later date (this fits item 3, a Pre-ordered ticket).
   STATUS: DONE (patch-stage3, no code change). Demo steps below.

5. Maintenance seeding: the history data already has an open job (ID 16, ride 2, started Nov 1). Q3 counts open jobs up to now, so it probably already shows hours, and Availability now and Open repairs should already show that ride. Tam may only need to check this, not seed anything. History also has closed jobs from Aug to Oct.
   STATUS: DONE (patch-stage3, check only). Nothing to seed: job 16 (ride 2, started 2026-11-01, EndDate NULL) is in SQL/history/40_maintenance.sql and the open-job views use EndDate IS NULL.

6. Logins: the usernames in roles.md come from the existing database. A fresh npm run seed picks different employees and gives them one shared random password. To get username equals password, run set-password.js on each existing account. It can reset an existing user of any role, but it can only create new accounts for Admin, Manager and Cashier.
   STATUS: DONE (patch-stage3). New script server/scripts/demo-logins.js sets username = password for any role.
   - RestaurantWorker (ella0013) still has no presenter, so "all 9 roles shown" is not true yet. Needs an owner (Syed or Jackson, both at 13).
   STATUS: OPEN: pick the owner (Syed or Jackson). The login itself is handled by demo-logins.js below.

7. Future data (related to item 3): history tickets run to 2026-12-05 and query end dates default to 2099-12-31, so Q1 and attendance show future dates today. Items 1 and 2 (staff account count, number formatting) have not been checked against the code yet.
   STATUS: DONE (patch-stage2). Server cuts end dates back to today.


---------------------------------------------------------------
STAGE 3 DEMO STEPS

Item 4, Syed's refund (no code change)
 1. Log in as Syed's customer account. Buy a ticket for a later date (the purchase route accepts any date from today on).
 2. That ticket shows as Pre-ordered in reports. Refund it from his tickets page: refunds work only for a future visit date.
 3. A ticket bought for today cannot be refunded ("Only tickets for a future visit can be refunded.").

Item 5, maintenance (check only)
 Open Availability now and Open repairs: ride 2 should show with the Nov 1 preventive service. Q3 should show hours for it.

Item 6, logins (username = password)
 From the server/ folder, with the database running:
   node scripts/demo-logins.js --list
   node scripts/demo-logins.js ella0013 <other usernames from roles.md>
   node scripts/demo-logins.js --create-missing     (only if --list shows a role with no login)
 In Docker: docker compose exec app node scripts/demo-logins.js ella0013
