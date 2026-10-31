# Project notes: limits and decisions (for the project document)

These notes answer the checkpoint #3 review. Copy the sections you need into the project document.

## 1. Metrics the data cannot support (D5)

We did not invent numbers the database does not hold. Where a report needs one, it says so on screen.

| Wanted | Why we cannot show it | What we show instead |
|---|---|---|
| Profit margin | `Item` has a selling price but no cost column | Revenue by category, best and worst sellers, average order value |
| Expected reopening date for a ride | No such column exists in the maintenance data | Open repairs with how long each has been open |
| Exact ride availability | A maintenance job only has start and end times | Availability %, labelled "estimate": every maintenance hour counts as fully closed |
| Membership cancellation | No cancel date is stored | Retention = a membership that ended and was followed by a later one for the same customer |
| Lost revenue from downtime | Sales are not recorded per ride | "Lost revenue (estimate)" = open hours lost x boardings per open hour x ticket revenue per boarding. Rides only. It leaves out food, shop and game sales, and games and venues |
| Revenue at risk from expiring memberships | Renewals are not known in advance | "Revenue at risk (estimate)" adds up what each non-auto-renew membership paid, assuming none renew |

Every estimate is labelled "estimate" in the report, and the formula is shown on the tab.

## 2. Why three forms have no Edit button (D1)

Purchases, Game Plays and Ride Log are records of money or guest activity. Database triggers (`_BU`) refuse any update to them, so an edited record could never silently change revenue or history. To fix a mistake, delete the entry and add it again. Delete works for the roles that own each form. Each of the three forms shows a note, "Why there is no Edit button", so a user is told the reason and not left guessing.

Open question for Uma or a TA: if edits are required on these forms, we can relax the `_BU` triggers for non-money fields only. That needs a SQL change.

## 3. Why Rain-outs per Month stays (D2, D3)

The TA asked us to remove the weather report. The professor's required list includes Rain-outs per Month, so it stays as one tab inside Ride Performance & Availability, not as a report of its own.

The five required reports and where they are:

| Required report | Where it is |
|---|---|
| Customers per Month | Attendance & Capacity Performance, first tab |
| Daily Attendance | Attendance & Capacity Performance, second tab |
| Maintenance Jobs per Month | Maintenance Activity & History, Jobs per Month tab |
| Most Ridden Rides per Month | Ride Performance & Availability, first tab |
| Rain-outs per Month | Ride Performance & Availability, last tab |

## 4. Reports, roles and forms after the review

- 8 reports in the menu: Revenue & Sales Performance, Membership Performance, Attendance & Capacity Performance, Maintenance Activity & History, Repair Cost by Facility, Employee Performance, Staff by Zone, Ride Performance & Availability.
- Each manager role has its own menu, landing page and reports. The server refuses anything outside the role (HTTP 403).
- No form asks a user to type an ID they would not know: guests, tickets and memberships are picked from lists that show names and dates.
- No report table shows a Ride ID column.
- 25 triggers, listed on the Triggers tab. The Live Database section is gone.
- The home page links to Member sign in and Staff sign in in the header, and again in the hero and footer.
