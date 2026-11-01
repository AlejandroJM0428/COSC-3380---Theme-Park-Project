# Project notes: limits and decisions (for the project document)

These notes answer the checkpoint #3 review. Copy the sections you need into the project document.

## 1. Metrics the data cannot support (D5)

We did not invent numbers the database does not hold. Where a report needs one, it says so on screen.

| Wanted | Why we cannot show it | What we show instead |
|---|---|---|
| Profit margin | `Item` has a selling price but no cost column | Revenue by category, best and worst sellers, average order value |
| Expected reopening date for a ride | No such column exists in the maintenance data | Open repairs with how long each has been open |
| Exact ride availability | A maintenance job only has start and end times | Availability %, labelled "estimate": every maintenance hour counts as fully closed |
| Membership cancellation date | A cancellation is a request, and approving it only turns auto-renew off. The membership runs to its normal end date, because the term rule forces the end date to start + 1 year - 1 day. So no earlier "cancelled on" date exists | Retention = a membership that ended and was followed by a later one for the same customer. The request itself (when asked, the reason, who decided, when) is kept in `MembershipCancellationRequest` and shown on the Membership Cancellations screen |
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
- 32 triggers, listed on the Triggers tab, which says the live count matches the list. The Live Database section is gone.
- The home page links to Member sign in and Staff sign in in the header, and again in the hero and footer.

## 5. Dependents and membership cancellation requests

Added after the review. The database rules are in `SQL/16_dependents_cancellation.sql`.

**Dependents (children under 18)**
- A dependent is its own `Customer` row linked to a parent (`ParentCustomerID`). A parent can have at most 6 active dependents. A dependent has no login, and only the parent can add, edit, remove or buy tickets for them (My Family tab).
- We collect a first name, a date of birth and a height. Nothing else. The last name is copied from the parent. Height is needed for the ride height checks, and the date of birth for the under-18 and under-3 rules.
- The parent must tick a consent box. `DependentConsent` stores which parent agreed and when.
- Prices (day pass $59): a dependent pays 20% less ($47.20), or 35% less ($38.35) when the parent has a membership active on the visit date. A child under 3 on the visit date is free but still counts toward park capacity. The discount is on the day pass only (Express is full price) and the percentages are written in one place, `fn_DependentDiscountPct`. The database sets the price, so the browser cannot change it.

**Privacy note: what removing a dependent does and does not erase**
- Removing a dependent anonymises the row: the name becomes "Removed Dependent" and the row is set inactive. It frees one of the parent's 6 places. Staff customer lists and search never show dependents.
- The row is kept, not deleted, because `Ticket` points at `Customer` and past tickets must stay for revenue reporting.
- What stays: the date of birth and height (both columns cannot be empty), the link to the parent, and the consent record (parent and time). With the name gone, the row no longer says who the child is, but the parent's own record still links to it.
- If we must erase more, the date of birth and height columns would first need to allow empty values. That is a schema change and has not been made.
- Demo and test data uses made-up names only.

**Membership cancellation requests**
- A member sends a request with a reason (200 characters or fewer). The reviewers are `Admin` and `RetailManager`, the roles that own memberships. A cashier or other roles cannot review.
- Approving sets `AutoRenew = 0` and marks the request Approved. It does not end the membership early and it does not refund anything. Rejecting changes nothing. A decided request is final and is never deleted.
- A member cannot withdraw a Pending request, and only one Pending request can exist per membership.
- A membership that has a request cannot be deleted in the Row Editor (on purpose, to keep the history).

**Known limits**
- Approving a cancellation also re-prices the membership row, because `trg_Membership_BU` sets the price to the tier's current price on every update. This is old behaviour that any edit to a membership shares. It is not fixed. See the open decision in `docs/ROADMAP_DEPENDENTS.md`.
- Re-running `SQL/11_restore_triggers.sql` or the schema file on a live database puts the old ticket triggers back and the discount disappears. Run `apply-16-on-server.sh` again afterwards.

