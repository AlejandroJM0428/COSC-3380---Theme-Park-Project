-- 31_weather_flags_editable.sql: ClosesOutdoorRides and ClosesPark become ordinary columns you set directly.
-- Migration 27 made them generated from Severity, so they could only be changed indirectly. Now Severity is a label
-- and the two flags are edited on their own. Existing rows keep their current values. Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/31_weather_flags_editable.sql
USE theme_park;

ALTER TABLE WeatherLog
  MODIFY ClosesOutdoorRides BOOL NOT NULL DEFAULT 0,
  MODIFY ClosesPark         BOOL NOT NULL DEFAULT 0;
