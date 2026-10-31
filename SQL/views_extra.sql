-- views_extra.sql: report views that are not in theme-park-schema.sql yet.
-- Safe to run more than once. Load after the schema:
--   sudo docker exec -i mysql-tp mysql -uroot -proot theme_park < SQL/views_extra.sql
USE theme_park;

-- [VIEW] v_RideTrafficByMonth: boardings per ride per month (Report: Most Ridden Rides per Month).
CREATE OR REPLACE VIEW v_RideTrafficByMonth AS
SELECT YEAR(l.LoggedAt)  AS VisitYear,
       MONTH(l.LoggedAt) AS VisitMonth,
       r.RideID,
       r.RideName,
       COUNT(*)          AS Boardings
  FROM RideLog l
  JOIN Ride r ON r.RideID = l.RideID
 WHERE l.EventType = 'Boarding'
 GROUP BY YEAR(l.LoggedAt), MONTH(l.LoggedAt), r.RideID, r.RideName;
