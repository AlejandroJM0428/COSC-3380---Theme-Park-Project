#!/usr/bin/env bash
# Run this ON THE SERVER after the patch is pushed to main.
# Applies SQL/16_dependents_cancellation.sql to the live database straight from origin/main
# (the deploy clone stays clean), then checks that the objects exist and the ticket discount is in place.
# Safe to run twice. Run it AGAIN after anyone re-runs SQL/11_restore_triggers.sql or the schema file:
# those put the old ticket triggers back and the dependent discount disappears.
set -euo pipefail
cd ~/repo/theme-park
git fetch -q origin main
git show origin/main:SQL/16_dependents_cancellation.sql \
  | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' 2>/dev/null
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park -N' 2>/dev/null <<'SQL'
SELECT 'dependent triggers', COUNT(*) FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN ('trg_Customer_BI_Dependent', 'trg_Customer_BU_Dependent');
SELECT 'ticket triggers with the discount', COUNT(*) FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN ('trg_Ticket_BI', 'trg_Ticket_BU') AND ACTION_STATEMENT LIKE '%fn_DependentDiscount%';
SELECT 'discount functions', COUNT(*) FROM information_schema.ROUTINES
 WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME IN ('fn_DependentDiscountPct', 'fn_DependentDiscount');
SELECT 'new tables', COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('DependentConsent', 'MembershipCancellationRequest');
SELECT 'all triggers', COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();
SQL
echo "Expect: dependent triggers 2, ticket triggers with the discount 2, discount functions 2, new tables 2, all triggers 32."
echo "Next: deploy-now --allow-infra, then open the Triggers tab and check it says 32 triggers and matches."
