-- 06_report_and_portal_views.sql
-- Views for the admin reports, the customer dashboard and the employee portal.
-- REQUIRES 04_staff_roles_and_costs.sql (RepairCost). Safe to run more than once.
-- Test on a copy of the database first.
USE theme_park;

-- REPORTS: maintenance ------------------------------------------------------

-- [VIEW] v_MaintenanceHistory: same as before, plus RepairCost (added as the last column).
CREATE OR REPLACE VIEW v_MaintenanceHistory AS
SELECT m.MaintenanceID,
       CASE WHEN m.RideID IS NOT NULL THEN 'Ride'
            WHEN m.GameID IS NOT NULL THEN 'Game'
            ELSE v.VenueType END AS FacilityKind,
       COALESCE(r.RideName, g.GameName, v.VenueName) AS FacilityName,
       m.MaintType, m.IsPlanned, m.StartDate, m.EndDate, m.Outcome,
       (SELECT COUNT(*) FROM MaintenanceCrew c WHERE c.MaintenanceID = m.MaintenanceID) AS CrewSize,
       TIMESTAMPDIFF(HOUR, m.StartDate, COALESCE(m.EndDate, NOW())) AS HoursDown,
       m.RepairCost
  FROM Maintenance m
  LEFT JOIN Ride r  ON r.RideID  = m.RideID
  LEFT JOIN Game g  ON g.GameID  = m.GameID
  LEFT JOIN Venue v ON v.VenueID = m.VenueID;

-- [VIEW] v_MaintenanceCostByFacility: which rides, games and venues cost the most, and how long they are down.
CREATE OR REPLACE VIEW v_MaintenanceCostByFacility AS
SELECT h.FacilityKind, h.FacilityName,
       COUNT(*)                          AS Jobs,
       SUM(h.MaintType = 'Emergency Repair') AS EmergencyJobs,
       COALESCE(SUM(h.RepairCost), 0)    AS TotalCost,
       ROUND(AVG(h.RepairCost), 2)       AS AvgCost,
       SUM(h.HoursDown)                  AS TotalHoursDown
  FROM v_MaintenanceHistory h
 GROUP BY h.FacilityKind, h.FacilityName;

-- [VIEW] v_OpenMaintenance: jobs still open, oldest first.
CREATE OR REPLACE VIEW v_OpenMaintenance AS
SELECT h.MaintenanceID, h.FacilityKind, h.FacilityName, h.MaintType, h.IsPlanned,
       h.StartDate, h.CrewSize,
       TIMESTAMPDIFF(DAY, h.StartDate, NOW()) AS DaysOpen
  FROM v_MaintenanceHistory h
 WHERE h.EndDate IS NULL
 ORDER BY h.StartDate;

-- REPORTS: employees --------------------------------------------------------

-- [VIEW] v_EmployeePerformance: shifts, hours and average rating per employee, against the job-title average.
CREATE OR REPLACE VIEW v_EmployeePerformance AS
SELECT p.EmployeeID, p.EmployeeName, p.JobTitle, p.IsActive,
       p.Shifts, p.RatedShifts, p.AvgRating, p.HoursWorked, p.LastShift,
       ROUND(AVG(p.AvgRating) OVER (PARTITION BY p.JobTitle), 2) AS JobTitleAvgRating
  FROM (SELECT e.EmployeeID,
               CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName,
               e.JobTitle, e.IsActive,
               COUNT(s.ShiftID)     AS Shifts,
               COUNT(s.ShiftRating) AS RatedShifts,
               ROUND(AVG(s.ShiftRating), 2) AS AvgRating,
               ROUND(SUM(TIMESTAMPDIFF(MINUTE, s.ClockIn, s.ClockOut)) / 60, 1) AS HoursWorked,
               MAX(s.ClockIn) AS LastShift
          FROM Employee e
          LEFT JOIN Shift s ON s.EmployeeID = e.EmployeeID
         GROUP BY e.EmployeeID, e.FirstName, e.LastName, e.JobTitle, e.IsActive) p;

-- REPORTS: retail -----------------------------------------------------------

-- [VIEW] v_RetailSalesByVenue: units, orders and revenue per venue per month.
CREATE OR REPLACE VIEW v_RetailSalesByVenue AS
SELECT v.VenueID, v.VenueName, v.VenueType,
       YEAR(p.PurchasedAt)  AS SaleYear,
       MONTH(p.PurchasedAt) AS SaleMonth,
       COUNT(*)             AS Orders,
       SUM(p.Quantity)      AS Units,
       SUM(p.Quantity * p.UnitPrice) AS Revenue
  FROM Purchase p
  JOIN Item i  ON i.ItemID  = p.ItemID
  JOIN Venue v ON v.VenueID = i.VenueID
 GROUP BY v.VenueID, v.VenueName, v.VenueType, YEAR(p.PurchasedAt), MONTH(p.PurchasedAt);

-- CUSTOMER DASHBOARD (visitor portal) ----------------------------------------
-- The app must always filter these by the CustomerID from the logged-in session, never from the request.

-- [VIEW] v_CustomerTickets: every ticket with its refund state.
CREATE OR REPLACE VIEW v_CustomerTickets AS
SELECT t.CustomerID, t.TicketID, t.VisitDate, t.HasExpress, t.TicketPrice,
       t.PurchaseDate, t.MembershipID,
       EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID) AS IsRefunded
  FROM Ticket t;

-- [VIEW] v_CustomerMemberships: memberships with whether each is active today.
CREATE OR REPLACE VIEW v_CustomerMemberships AS
SELECT m.CustomerID, m.MembershipID, m.Tier, m.StartDate, m.EndDate, m.Price,
       m.AutoRenew, m.IncludesExpress, m.AnyDayAccess,
       (CURDATE() BETWEEN m.StartDate AND m.EndDate) AS IsActiveNow
  FROM Membership m;

-- EMPLOYEE PORTAL ------------------------------------------------------------
-- The app must filter by the EmployeeID of the logged-in account.

-- [VIEW] v_EmployeeMaintenanceJobs: each maintenance job with the crew member and their role.
CREATE OR REPLACE VIEW v_EmployeeMaintenanceJobs AS
SELECT c.EmployeeID, c.CrewRole,
       h.MaintenanceID, h.FacilityKind, h.FacilityName, h.MaintType,
       h.StartDate, h.EndDate, h.Outcome, h.RepairCost, h.HoursDown
  FROM MaintenanceCrew c
  JOIN v_MaintenanceHistory h ON h.MaintenanceID = c.MaintenanceID;
