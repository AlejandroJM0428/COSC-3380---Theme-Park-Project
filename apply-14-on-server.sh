#!/usr/bin/env bash
# Run this ON THE SERVER after the patch is pushed to main.
# Applies SQL/14_purchase_guards.sql to the live database straight from origin/main
# (the deploy clone stays clean), then checks that the two triggers exist.
set -euo pipefail
cd ~/repo/theme-park
git fetch -q origin main
git show origin/main:SQL/14_purchase_guards.sql \
  | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' 2>/dev/null
echo "Triggers now in the database:"
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park -N -e "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_NAME IN (\"trg_Ticket_BI_Guard\",\"trg_Membership_AI_Welcome\")"' 2>/dev/null
echo "Expect 2 names above. Next: deploy-now --allow-infra"
