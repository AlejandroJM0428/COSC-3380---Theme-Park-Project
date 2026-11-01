# Roadmap: dependents, dependent discount, membership cancellation requests

Starting point: the Oct 31 project zip, which includes `SQL/15_price_update.sql`. Nothing for this feature existed in that zip. Apply file 15 before anything here.

Each stage is small and ends with a zip of only the changed files at their repo paths. Tick a stage only when its zip has been delivered. A fresh session resumes from the first unticked stage.

## Decisions (defaults, change only if told)

- Dependents under 18 are stored as their own `Customer` rows, linked to a parent. Up to 6 per parent. They have no login.
- Collected for a dependent: first name, date of birth, height. Nothing else.
- The parent must tick a consent box. The date and time and the parent are stored.
- Pricing: 20% off the day pass for a dependent ($47.20 at $59). 35% off when the parent has an active membership ($38.35). Under 3 is free but still counted in headcount. The percentages live in one place.
- Cancellation is a request. A manager approves or rejects it. Approving sets `AutoRenew = 0` and marks the request Approved. The membership runs to its normal end date. There is no refund and `EndDate` is never changed, because `CHK_Membership_Term` forces it to start + 1 year - 1 day.
- Removing a dependent anonymises the row (name replaced, `IsActive = 0`) because `Ticket` points at `Customer` with no cascade. Past tickets stay for revenue reporting.
- Demo data uses made-up names only.

## What the code already does (checked in the repo)

- Ride height checks: `trg_RideLog_BI` reads `Customer.HeightCm` through the ticket. No change needed.
- Headcount: `sp_AssertTicketRules` counts every unrefunded ticket for the date. No change needed.
- Pricing: `fn_TicketPrice(p_membership, p_express)` does not know the customer. It is called by `trg_Ticket_BI` and `trg_Ticket_BU`. Leave it alone. Add a separate discount function and edit only those two triggers.
- A dependent's ticket has no membership of its own. The member price comes from the parent's membership.
- Other places that need entries: `server/demos/triggerCatalog.js`, the "25 triggers" line in `docs/DEMO_SCRIPT.md`, the `check.sh` role matrix, `client/src/api/mock.js`, and an `apply-16-on-server.sh` modelled on `apply-14-on-server.sh`.

## Stages

- [x] **0. Confirm decisions and test setup.** Done. Local MySQL 8.0.46 installs and runs in the work sandbox. The full chain (schema through file 15) loads with no errors in the docker init order. Baseline: day pass 59.00, tiers 69/89/179, `Customer` has no parent column and no triggers. Live ticket triggers: `trg_Ticket_BI_Guard`, `trg_Ticket_BI` (from the schema file), `trg_Ticket_BU` (from file 11), plus the two AFTER notice triggers.
- [x] **1. Tables.** Done. `SQL/16_dependents_cancellation.sql` adds `Customer.ParentCustomerID`, `DependentConsent`, `MembershipCancellationRequest`, `sp_AssertDependent` and two triggers (`trg_Customer_BI_Dependent`, `trg_Customer_BU_Dependent`). `docker-compose.yml` has the new mount line. Loaded twice (safe to repeat), rebuilt from nothing in docker order, and 28 of 28 rule checks passed on MySQL 8.0.46. Rules enforced in the database: a parent is active and not a dependent, a dependent is under 18, at most 6 active dependents, one consent row per dependent naming the real parent, a cancellation needs a reason, a decided request needs a time and a deciding user, and only one Pending request per membership.
- [ ] **2. Discount.** Discount function and the edits to `trg_Ticket_BI` and `trg_Ticket_BU`. Same SQL file. Highest risk, so tested on its own.
- [ ] **3. Dependent routes.** Add, edit, remove a dependent and buy a dependent's ticket. Files: `server/routes/family.js`, `server/index.js`.
- [ ] **4. Cancellation routes.** Member request and staff review. Files: `server/routes/cancellations.js`, `server/index.js`, `server/demos/triggerCatalog.js`, `check.sh`.
- [ ] **5. Portal.** My Family tab and a cancel button on the membership tab. Files: `client/src/components/portal/*`, `client/src/api/index.js`, `client/src/api/mock.js`.
- [ ] **6. Manager screen.** Review cancellations. Files: `client/src/config/nav.js` and the matching page.
- [ ] **7. Docs and deploy.** Update the cancellation row and add the privacy note in `docs/PROJECT_NOTES.md`, fix the trigger count, add `apply-16-on-server.sh`. Unzip everything onto a clean copy of the repo and confirm it matches.

## Open items found in stage 0

- The database holds 30 triggers after the full load, but the docs say 25. Stage 7 must check what the Triggers page counts (it matches `triggerCatalog.js` by name) before changing any number.

- Two new triggers exist now, so the database holds 32. Both need entries in `server/demos/triggerCatalog.js` (stage 4) and the trigger-count wording needs fixing in stage 7.
- `SQL/00_clear_data.sql` does not know the new tables. A reseed truncates `Customer` and would leave stale consent rows behind. Handle in stage 7 (`MemberPerk` from file 14 has the same gap).
- A membership that has a cancellation request cannot be deleted (the FK has no cascade, on purpose, to keep history). Row Editor deletes of such a membership will be refused.
- Not tested yet: two dependents added at exactly the same moment (the `Park` row lock is the same pattern as the capacity check).
- Do not deploy file 16 until stage 2 is done; stage 2 edits the same file. Running it again is safe.

## Working rules

- Read only what a stage needs, with `grep` and line ranges. Never open `SQL/02_test_data.sql` or `client/src/config/reports.js` whole.
- Use only names that exist in the repo. Check every table, column, function and trigger before referencing it.
- Add no attribution of any kind (no author line, no session link, no credit note) in any file or commit message.
- Never run anything on the owner's directory. Give commands instead.
- After each stage, state what is done and what is next.

## Deploy order on the server

1. Back up the database.
2. Apply `SQL/15_price_update.sql`.
3. Apply `SQL/16_dependents_cancellation.sql` with `apply-16-on-server.sh`.
4. `deploy-now --allow-infra`.
5. Open the Triggers tab and confirm the count matches.
