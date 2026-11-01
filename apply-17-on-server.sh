#!/usr/bin/env bash
# Run this ON THE SERVER after the patch is pushed to main.
# Applies SQL/17_shift_hours_cap.sql (the 40-hour rule on clocked hours, inside sp_AssertShift) to the live database straight
# from origin/main (the deploy clone stays clean), then runs the boundary test SQL/tools/test_shift_hours.sql.
# The test works inside a transaction that is rolled back, on a week in January 2030, so it leaves no shifts behind
# (it does use up a few Shift ids). Safe to run twice. Run it AGAIN after anyone re-runs the schema file:
# that puts the old sp_AssertShift back and the 40-hour rule disappears.
set -euo pipefail
cd ~/repo/theme-park
git fetch -q origin main
git show origin/main:SQL/17_shift_hours_cap.sql \
  | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' 2>/dev/null
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park -N' 2>/dev/null <<'SQL'
SELECT 'sp_AssertShift has the 40-hour rule', COUNT(*) FROM information_schema.ROUTINES
 WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = 'sp_AssertShift' AND ROUTINE_DEFINITION LIKE '%144000%';
SELECT 'shift triggers', COUNT(*) FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN ('trg_Shift_BI', 'trg_Shift_BU');
SELECT 'all triggers', COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();
SQL
echo "Expect: sp_AssertShift has the 40-hour rule 1, shift triggers 2, all triggers 32 (this rule adds no trigger)."
echo "Boundary test (every row must say PASS):"
git show origin/main:SQL/tools/test_shift_hours.sql \
  | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park -t' 2>/dev/null
echo "Next: deploy-now --allow-infra (the Triggers tab and the shift screens carry the new message), then try saving a 41-hour week in the Row Editor."
