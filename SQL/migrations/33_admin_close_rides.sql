-- 33_admin_close_rides.sql: an Admin can close and reopen a ride (Close ride / Reopen ride on Rides, Games & Venues).
-- That flips Ride.Status between 'Open' and 'Maintenance', so the view must treat the label as a real closure again.
-- (32_ride_availability_live.sql ignored the label; this puts it back, so the admin button actually closes the ride.)
-- A ride is Closed for guests when: retired, OR Status = 'Maintenance' (admin closure), OR a maintenance job covers it,
-- OR weather closes it. Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/33_admin_close_rides.sql
USE theme_park;

CREATE OR REPLACE VIEW v_RideAvailability AS
SELECT z.ZoneName, r.RideID, r.RideName,
       CASE WHEN r.IsActive = 0 THEN 'Closed - Retired'
            WHEN r.Status = 'Maintenance' OR fn_UnderMaintenance('Ride', r.RideID, NOW()) THEN 'Closed - Maintenance'
            WHEN EXISTS (
                 SELECT 1 FROM WeatherLog w
                  WHERE NOW() >= w.StartedAt
                    AND (w.EndedAt IS NULL OR NOW() < w.EndedAt)
                    AND (w.ClosesPark = 1 OR (r.IsIndoor = 0 AND w.ClosesOutdoorRides = 1))) THEN 'Closed - Weather'
            ELSE 'Open' END AS CurrentState
  FROM Ride r JOIN Zone z ON z.ZoneID = r.ZoneID;
