-- Q2 Busiest rides in a date range (boardings only, top 10).
SELECT r.RideName, z.ZoneName,
       COUNT(*) AS Boardings,
       SUM(l.UsedExpress) AS ExpressBoardings
  FROM RideLog l
  JOIN Ride r ON r.RideID = l.RideID
  JOIN Zone z ON z.ZoneID = r.ZoneID
 WHERE l.EventType = 'Boarding'
   AND l.LoggedAt >= CAST(? AS DATE)
   AND l.LoggedAt <  DATE_ADD(CAST(? AS DATE), INTERVAL 1 DAY)
 GROUP BY r.RideID, r.RideName, z.ZoneName
 ORDER BY Boardings DESC, r.RideName
 LIMIT 10
