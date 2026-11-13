-- 32_ride_availability_live.sql: ride Open/Closed is worked out live, never from the stored Ride.Status label.
-- v_RideAvailability used "r.Status = 'Maintenance' OR fn_UnderMaintenance(...)". Ride.Status is only a label that is
-- not refreshed when time passes (see 08_simplify_triggers.sql), so a ride whose label said Maintenance stayed Closed
-- forever, and the homepage count ("4 of 16 rides open") never recovered. The live test is fn_UnderMaintenance().
-- Weather part is unchanged from 27: in effect = started and not ended yet; a park closure also closes indoor rides.
-- Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/32_ride_availability_live.sql
USE theme_park;

CREATE OR REPLACE VIEW v_RideAvailability AS
SELECT z.ZoneName, r.RideID, r.RideName,
       CASE WHEN r.IsActive = 0 THEN 'Closed - Retired'
            WHEN fn_UnderMaintenance('Ride', r.RideID, NOW()) THEN 'Closed - Maintenance'
            WHEN EXISTS (
                 SELECT 1 FROM WeatherLog w
                  WHERE NOW() >= w.StartedAt
                    AND (w.EndedAt IS NULL OR NOW() < w.EndedAt)
                    AND (w.ClosesPark = 1 OR (r.IsIndoor = 0 AND w.ClosesOutdoorRides = 1))) THEN 'Closed - Weather'
            ELSE 'Open' END AS CurrentState
  FROM Ride r JOIN Zone z ON z.ZoneID = r.ZoneID;

-- Resync the stored label with the live state so reports that print Ride.Status agree. Weather is not a label value.
UPDATE Ride
   SET Status = IF(IsActive = 1 AND fn_UnderMaintenance('Ride', RideID, NOW()), 'Maintenance', 'Open')
 WHERE Status <> IF(IsActive = 1 AND fn_UnderMaintenance('Ride', RideID, NOW()), 'Maintenance', 'Open');

-- Weather entries that are still "in effect" (no end time) are what keeps outdoor rides closed. List them:
SELECT WeatherID, WeatherType, Severity, StartedAt, EndedAt, ClosesOutdoorRides, ClosesPark
  FROM WeatherLog
 WHERE (ClosesOutdoorRides = 1 OR ClosesPark = 1) AND NOW() >= StartedAt AND (EndedAt IS NULL OR NOW() < EndedAt);
