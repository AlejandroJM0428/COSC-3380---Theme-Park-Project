-- 12_report_views.sql
-- Views for the merged reports (TA fixes plan, phase T3). Safe to run more than once.
-- Apply on an existing database by hand (see docs/DEV_SETUP.md). On a fresh database it runs by itself.
USE theme_park;

-- [VIEW] v_ItemSales: units and revenue per menu or shop item per month (Report: Revenue & Sales Performance).
-- [RULE] Items that were never sold appear once, with SaleYear and SaleMonth empty and 0 units, so they can show up as worst sellers.
-- No ID columns on purpose: the reports show names only.
CREATE OR REPLACE VIEW v_ItemSales AS
SELECT v.VenueName, v.VenueType, i.Category, i.ItemName,
       YEAR(p.PurchasedAt)  AS SaleYear,
       MONTH(p.PurchasedAt) AS SaleMonth,
       SUM(p.Quantity)      AS Units,
       SUM(p.Quantity * p.UnitPrice) AS Revenue
  FROM Purchase p
  JOIN Item i  ON i.ItemID  = p.ItemID
  JOIN Venue v ON v.VenueID = i.VenueID
 GROUP BY i.ItemID, v.VenueName, v.VenueType, i.Category, i.ItemName, YEAR(p.PurchasedAt), MONTH(p.PurchasedAt)
UNION ALL
SELECT v.VenueName, v.VenueType, i.Category, i.ItemName, NULL, NULL, 0, 0
  FROM Item i
  JOIN Venue v ON v.VenueID = i.VenueID
 WHERE i.IsActive = 1
   AND NOT EXISTS (SELECT 1 FROM Purchase p WHERE p.ItemID = i.ItemID);

-- [VIEW] v_MembershipPerformance: one row per membership with its state, visits and spend (Report: Membership Performance).
-- [RULE] RenewedLater = the same customer has a membership that starts after this one. Visits and spend leave out refunded tickets.
-- Spend = food and shop purchases plus game plays on tickets that used the membership. No ID columns on purpose.
CREATE OR REPLACE VIEW v_MembershipPerformance AS
SELECT m.Tier, m.StartDate, m.EndDate, m.Price, m.AutoRenew,
       (CURDATE() BETWEEN m.StartDate AND m.EndDate) AS IsActiveNow,
       DATEDIFF(m.EndDate, CURDATE()) AS DaysToExpiry,
       EXISTS (SELECT 1 FROM Membership n
                WHERE n.CustomerID = m.CustomerID AND n.StartDate > m.StartDate) AS RenewedLater,
       (SELECT COUNT(*) FROM Ticket t
         WHERE t.MembershipID = m.MembershipID
           AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)) AS Visits,
       COALESCE((SELECT SUM(p.Quantity * p.UnitPrice)
                   FROM Purchase p JOIN Ticket t ON t.TicketID = p.TicketID
                  WHERE t.MembershipID = m.MembershipID
                    AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)), 0)
     + COALESCE((SELECT SUM(g.AmountPaid)
                   FROM GamePlay g JOIN Ticket t ON t.TicketID = g.TicketID
                  WHERE t.MembershipID = m.MembershipID
                    AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)), 0) AS ExtrasSpend
  FROM Membership m;

-- [VIEW] v_RepairImpactEstimate: per ride, an ESTIMATE of what its downtime cost (Report: Repair Cost by Facility, lost revenue tab).
-- How the estimate works (rides only, games and venues have no boarding log):
--   DowntimeOpenHours    = hours the ride was under maintenance, scaled to the park's opening hours (nights are not lost sales).
--   BoardingsPerOpenHour = the ride's boardings divided by (days it had boardings x opening hours per day).
--   RevenuePerBoarding   = all non-refunded ticket revenue divided by all boardings (what one ride taken is worth in ticket money).
-- Lost revenue is then DowntimeOpenHours x BoardingsPerOpenHour x RevenuePerBoarding, worked out in the report. No ID columns.
CREATE OR REPLACE VIEW v_RepairImpactEstimate AS
SELECT r.RideName AS FacilityName,
       ROUND(dt.HoursDown * TIME_TO_SEC(TIMEDIFF(p.ClosingTime, p.OpeningTime)) / 86400, 1) AS DowntimeOpenHours,
       ROUND(rb.Boardings / NULLIF(rb.ActiveDays * TIME_TO_SEC(TIMEDIFF(p.ClosingTime, p.OpeningTime)) / 3600, 0), 2) AS BoardingsPerOpenHour,
       ROUND(tk.Revenue / NULLIF(tot.Boardings, 0), 2) AS RevenuePerBoarding
  FROM Ride r
  JOIN Park p ON p.ParkID = 1
  JOIN (SELECT RideID, COUNT(*) AS Boardings, COUNT(DISTINCT DATE(LoggedAt)) AS ActiveDays
          FROM RideLog WHERE EventType = 'Boarding' GROUP BY RideID) rb ON rb.RideID = r.RideID
  JOIN (SELECT m.RideID, SUM(TIMESTAMPDIFF(HOUR, m.StartDate, COALESCE(m.EndDate, NOW()))) AS HoursDown
          FROM Maintenance m WHERE m.RideID IS NOT NULL GROUP BY m.RideID) dt ON dt.RideID = r.RideID
  CROSS JOIN (SELECT SUM(t.TicketPrice) AS Revenue FROM Ticket t
               WHERE NOT EXISTS (SELECT 1 FROM TicketRefund rf WHERE rf.TicketID = t.TicketID)) tk
  CROSS JOIN (SELECT COUNT(*) AS Boardings FROM RideLog WHERE EventType = 'Boarding') tot;
