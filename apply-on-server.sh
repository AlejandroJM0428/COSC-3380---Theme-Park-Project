#!/usr/bin/env bash
# Run this ON THE SERVER after the patch is pushed to main.
# Applies SQL/13_notification_triggers.sql to the live database straight from origin/main
# (the deploy clone stays clean), then checks that the three triggers exist.
set -euo pipefail
cd ~/repo/theme-park
git fetch -q origin main
git show origin/main:SQL/13_notification_triggers.sql \
  | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' 2>/dev/null
echo "Triggers now in the database:"
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park -N -e "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_NAME IN (\"trg_Ride_AU_Reopen\",\"trg_WeatherLog_AU_Clear\",\"trg_Ticket_AI_SellingFast\")"' 2>/dev/null
echo "Expect 3 names above. Next: deploy-now --allow-infra"
