-- Q5 Memberships ending within the next N days, with guest names.
SELECT c.FirstName, c.LastName, m.Tier, m.EndDate,
       DATEDIFF(m.EndDate, CURDATE()) AS DaysLeft,
       IF(m.AutoRenew, 'Yes', 'No') AS AutoRenew
  FROM Membership m
  JOIN Customer c ON c.CustomerID = m.CustomerID
 WHERE m.EndDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
 ORDER BY m.EndDate, c.LastName
