-- verify_history.sql: checks on a loaded history, written from the schema rules and not from the generator.
-- Run on the finished database:  mysql theme_park < SQL/tools/verify_history.sql
-- Every "violations" row must be 0. The last blocks show counts and the spread over months for the five required reports.
-- Read-only. The data is made up for the demo.
USE theme_park;

SELECT 'violations' AS block, check_name, n FROM (
  SELECT 'ticket day over MaxOccupancy' check_name, COUNT(*) n FROM (
      SELECT t.VisitDate FROM Ticket t WHERE NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)
       GROUP BY t.VisitDate HAVING COUNT(*) > (SELECT MaxOccupancy FROM Park LIMIT 1)) x
  UNION ALL SELECT 'ticket visit before purchase date', COUNT(*) FROM Ticket WHERE VisitDate < DATE(PurchaseDate)
  UNION ALL SELECT 'ticket for an inactive customer', COUNT(*) FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID WHERE c.IsActive = 0
  UNION ALL SELECT 'ticket with a membership of another customer', COUNT(*) FROM Ticket t JOIN Membership m ON m.MembershipID = t.MembershipID WHERE m.CustomerID <> t.CustomerID
  UNION ALL SELECT 'ticket outside its membership term', COUNT(*) FROM Ticket t JOIN Membership m ON m.MembershipID = t.MembershipID WHERE t.VisitDate NOT BETWEEN m.StartDate AND m.EndDate
  UNION ALL SELECT 'Basic member ticket on a weekend', COUNT(*) FROM Ticket t JOIN Membership m ON m.MembershipID = t.MembershipID WHERE m.AnyDayAccess = 0 AND DAYOFWEEK(t.VisitDate) IN (1, 7)
  UNION ALL SELECT 'overlapping memberships of one customer', COUNT(*) FROM Membership a JOIN Membership b ON a.CustomerID = b.CustomerID AND a.MembershipID < b.MembershipID AND a.StartDate <= b.EndDate AND b.StartDate <= a.EndDate
  UNION ALL SELECT 'boarding on a refunded ticket', COUNT(*) FROM RideLog l JOIN TicketRefund r ON r.TicketID = l.TicketID WHERE l.EventType = 'Boarding'
  UNION ALL SELECT 'boarding on another day than the visit', COUNT(*) FROM RideLog l JOIN Ticket t ON t.TicketID = l.TicketID WHERE l.EventType = 'Boarding' AND DATE(l.LoggedAt) <> t.VisitDate
  UNION ALL SELECT 'boarding while the ride is under maintenance', COUNT(*) FROM RideLog WHERE EventType = 'Boarding' AND fn_UnderMaintenance('Ride', RideID, LoggedAt)
  UNION ALL SELECT 'boarding below the ride minimum height', COUNT(*) FROM RideLog l JOIN Ride r ON r.RideID = l.RideID JOIN Ticket t ON t.TicketID = l.TicketID JOIN Customer c ON c.CustomerID = t.CustomerID WHERE l.EventType = 'Boarding' AND c.HeightCm < r.MinHeightCm
  UNION ALL SELECT 'maintenance job closed without a cost', COUNT(*) FROM Maintenance WHERE EndDate IS NOT NULL AND RepairCost IS NULL
  UNION ALL SELECT 'maintenance job with end and outcome out of step', COUNT(*) FROM Maintenance WHERE (EndDate IS NULL) <> (Outcome IS NULL)
  UNION ALL SELECT 'shift before the hire date', COUNT(*) FROM Shift s JOIN Employee e ON e.EmployeeID = s.EmployeeID WHERE s.ClockIn < e.HireDate
  UNION ALL SELECT 'overlapping shifts of one employee', COUNT(*) FROM Shift a JOIN Shift b ON a.EmployeeID = b.EmployeeID AND a.ShiftID < b.ShiftID AND a.ClockIn < COALESCE(b.ClockOut, '9999-12-31') AND b.ClockIn < COALESCE(a.ClockOut, '9999-12-31')
  UNION ALL SELECT 'employee week over 40 hours (Mon to Sun)', COUNT(*) FROM (SELECT EmployeeID FROM Shift GROUP BY EmployeeID, YEARWEEK(ClockIn, 1)
        HAVING SUM(TIMESTAMPDIFF(MINUTE, ClockIn, COALESCE(ClockOut, NOW()))) > 2400) x
  UNION ALL SELECT 'employee week over the scheduled hours', COUNT(*) FROM (SELECT s.EmployeeID FROM Shift s JOIN Employee e ON e.EmployeeID = s.EmployeeID GROUP BY s.EmployeeID, YEARWEEK(s.ClockIn, 1), e.HoursPerWeek
        HAVING SUM(TIMESTAMPDIFF(MINUTE, s.ClockIn, COALESCE(s.ClockOut, NOW()))) > e.HoursPerWeek * 60) x
  UNION ALL SELECT 'dependent not under 18 on first visit', COUNT(*) FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID WHERE c.ParentCustomerID IS NOT NULL AND TIMESTAMPDIFF(YEAR, c.DOB, t.VisitDate) >= 18
  UNION ALL SELECT 'parent with more than 6 active dependents', COUNT(*) FROM (SELECT ParentCustomerID FROM Customer WHERE ParentCustomerID IS NOT NULL AND IsActive = 1 GROUP BY ParentCustomerID HAVING COUNT(*) > 6) x
  UNION ALL SELECT 'dependent without a consent row', COUNT(*) FROM Customer c WHERE c.ParentCustomerID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM DependentConsent d WHERE d.CustomerID = c.CustomerID)
) v;

-- Tables with no rows (lookup tables that stay empty by design are listed too; judge them by name)
SELECT 'empty table' AS block, TABLE_NAME AS check_name, TABLE_ROWS AS n FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'theme_park' AND TABLE_TYPE = 'BASE TABLE' AND TABLE_ROWS = 0;

SELECT 'triggers' AS block, 'trigger count' AS check_name, COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'theme_park';

-- Spread over months for the five required reports (number of distinct months with data, then the smallest and largest month)
SELECT 'months' AS block, 'Customers per Month (ticket visits)' AS report, COUNT(*) AS months, MIN(n) AS smallest, MAX(n) AS largest FROM (SELECT DATE_FORMAT(VisitDate, '%Y-%m') m, COUNT(DISTINCT CustomerID) n FROM Ticket GROUP BY m) x
UNION ALL SELECT 'months', 'Daily Attendance (visit days)', COUNT(*), MIN(n), MAX(n) FROM (SELECT DATE_FORMAT(VisitDate, '%Y-%m') m, COUNT(DISTINCT VisitDate) n FROM Ticket GROUP BY m) x
UNION ALL SELECT 'months', 'Maintenance Jobs per Month', COUNT(*), MIN(n), MAX(n) FROM (SELECT DATE_FORMAT(StartDate, '%Y-%m') m, COUNT(*) n FROM Maintenance GROUP BY m) x
UNION ALL SELECT 'months', 'Most Ridden Rides per Month (boardings)', COUNT(*), MIN(n), MAX(n) FROM (SELECT DATE_FORMAT(LoggedAt, '%Y-%m') m, COUNT(*) n FROM RideLog WHERE EventType = 'Boarding' GROUP BY m) x
UNION ALL SELECT 'months', 'Rain-outs per Month (closing events)', COUNT(*), MIN(n), MAX(n) FROM (SELECT DATE_FORMAT(StartedAt, '%Y-%m') m, COUNT(*) n FROM WeatherLog
        WHERE WindMph >= (SELECT MaxWindMph FROM Park LIMIT 1) OR LightningMiles <= (SELECT MinLightningMiles FROM Park LIMIT 1)
           OR TemperatureF >= (SELECT MaxTempF FROM Park LIMIT 1) OR TemperatureF <= (SELECT MinTempF FROM Park LIMIT 1) GROUP BY m) x;

-- Row counts
SELECT 'rows' AS block, t AS check_name, n FROM (
  SELECT 'Employee' t, COUNT(*) n FROM Employee UNION ALL SELECT 'Customer (all)', COUNT(*) FROM Customer
  UNION ALL SELECT 'Dependents', COUNT(*) FROM Customer WHERE ParentCustomerID IS NOT NULL UNION ALL SELECT 'Membership', COUNT(*) FROM Membership
  UNION ALL SELECT 'Ticket', COUNT(*) FROM Ticket UNION ALL SELECT 'TicketRefund', COUNT(*) FROM TicketRefund
  UNION ALL SELECT 'RideLog boardings', COUNT(*) FROM RideLog WHERE EventType = 'Boarding' UNION ALL SELECT 'RideLog readings', COUNT(*) FROM RideLog WHERE EventType <> 'Boarding'
  UNION ALL SELECT 'Purchase', COUNT(*) FROM Purchase UNION ALL SELECT 'GamePlay', COUNT(*) FROM GamePlay UNION ALL SELECT 'Maintenance', COUNT(*) FROM Maintenance
  UNION ALL SELECT 'WeatherLog', COUNT(*) FROM WeatherLog UNION ALL SELECT 'Shift', COUNT(*) FROM Shift) c;
