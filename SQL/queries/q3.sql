-- Q3 Maintenance downtime per ride inside a date range (jobs that overlap the range, hours clipped to the range).
SELECT r.RideName,
       COUNT(*) AS Jobs,
       SUM(TIMESTAMPDIFF(HOUR,
             GREATEST(m.StartDate, CAST(? AS DATETIME)),
             LEAST(COALESCE(m.EndDate, NOW()), DATE_ADD(CAST(? AS DATE), INTERVAL 1 DAY)))) AS HoursDown
  FROM Maintenance m
  JOIN Ride r ON r.RideID = m.RideID
 WHERE m.StartDate < DATE_ADD(CAST(? AS DATE), INTERVAL 1 DAY)
   AND COALESCE(m.EndDate, NOW()) >= CAST(? AS DATETIME)
 GROUP BY r.RideID, r.RideName
 ORDER BY HoursDown DESC, r.RideName
