-- 00_clear_data.sql: empties all data tables so 01 and 02 can be reloaded.
-- Keeps AppUser (logins) and MembershipTier (price list). Run only before re-loading 01 and 02.
USE theme_park;
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE RideLog;
TRUNCATE TABLE GamePlay;
TRUNCATE TABLE Purchase;
TRUNCATE TABLE TicketRefund;
TRUNCATE TABLE Ticket;
TRUNCATE TABLE Membership;
TRUNCATE TABLE MaintenanceCrew;
TRUNCATE TABLE Maintenance;
TRUNCATE TABLE Shift;
TRUNCATE TABLE RideCertification;
TRUNCATE TABLE EmployeeZone;
TRUNCATE TABLE Employee;
TRUNCATE TABLE Item;
TRUNCATE TABLE Venue;
TRUNCATE TABLE Game;
TRUNCATE TABLE Ride;
TRUNCATE TABLE WeatherLog;
TRUNCATE TABLE Zone;
TRUNCATE TABLE Customer;
TRUNCATE TABLE Park;
SET FOREIGN_KEY_CHECKS = 1;
