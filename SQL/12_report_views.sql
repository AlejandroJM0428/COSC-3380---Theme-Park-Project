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
