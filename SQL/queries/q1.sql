-- Q1 Revenue by membership tier, with day passes as a fourth row. Date range on visit date and membership start date.
SELECT b.Tier,
       COALESCE(f.Memberships, 0)    AS MembershipsSold,
       COALESCE(f.Fees, 0)           AS MembershipFees,
       COALESCE(s.Tickets, 0)        AS Tickets,
       COALESCE(s.TicketRevenue, 0)  AS TicketRevenue,
       COALESCE(s.InParkSpending, 0) AS InParkSpending,
       COALESCE(f.Fees, 0) + COALESCE(s.TicketRevenue, 0) + COALESCE(s.InParkSpending, 0) AS TotalRevenue
  FROM (SELECT CAST(Tier AS CHAR) AS Tier, 1 AS Ord FROM MembershipTier
        UNION ALL
        SELECT 'Day Pass', 2) b
  LEFT JOIN (SELECT CAST(Tier AS CHAR) AS Tier, COUNT(*) AS Memberships, SUM(Price) AS Fees
               FROM Membership
              WHERE StartDate BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
              GROUP BY Tier) f ON f.Tier = b.Tier
  LEFT JOIN (SELECT COALESCE(CAST(m.Tier AS CHAR), 'Day Pass') AS Tier,
                    COUNT(*) AS Tickets,
                    SUM(v.TicketPrice) AS TicketRevenue,
                    SUM(v.FoodTotal + v.ShopTotal + v.GameTotal) AS InParkSpending
               FROM v_VisitSpending v
               JOIN Ticket t ON t.TicketID = v.TicketID
               LEFT JOIN Membership m ON m.MembershipID = t.MembershipID
              WHERE v.VisitDate BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
              GROUP BY COALESCE(CAST(m.Tier AS CHAR), 'Day Pass')) s ON s.Tier = b.Tier
 ORDER BY b.Ord, b.Tier
