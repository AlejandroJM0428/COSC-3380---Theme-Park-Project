-- Q4 Best-selling items per venue in a date range. Venue 0 means all venues.
SELECT v.VenueName, i.ItemName, i.Category,
       SUM(p.Quantity) AS UnitsSold,
       SUM(p.Quantity * p.UnitPrice) AS Revenue
  FROM Purchase p
  JOIN Item i  ON i.ItemID  = p.ItemID
  JOIN Venue v ON v.VenueID = i.VenueID
 WHERE (? = 0 OR v.VenueID = ?)
   AND p.PurchasedAt >= CAST(? AS DATE)
   AND p.PurchasedAt <  DATE_ADD(CAST(? AS DATE), INTERVAL 1 DAY)
 GROUP BY v.VenueID, v.VenueName, i.ItemID, i.ItemName, i.Category
 ORDER BY v.VenueName, UnitsSold DESC, i.ItemName
 LIMIT 50
