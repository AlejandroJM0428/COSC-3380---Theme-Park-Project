-- 00_clear_data.sql: empties all data tables so 01 and the history files (02, or history/10 to 80) can be reloaded.
-- Keeps AppUser (logins), AdminAudit, MembershipTier (price list) and promo notices. Needs the full schema (files 14 and 16 add three of the tables it empties). Run only before re-loading 01 and the history.
-- AppUser.EmployeeID is not cleared, and employees come back with the same seven-digit ids (1000001 to 1000104), so every login still points at a real employee.
USE theme_park;
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE RideLog;
TRUNCATE TABLE GamePlay;
TRUNCATE TABLE Purchase;
TRUNCATE TABLE TicketRefund;
TRUNCATE TABLE Ticket;
TRUNCATE TABLE MembershipCancellationRequest;
TRUNCATE TABLE MemberPerk;
TRUNCATE TABLE Membership;
TRUNCATE TABLE DependentConsent;
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
-- Notices written by the triggers while the history loads (sold out, weather, maintenance) are rebuilt by the load. Promos are kept.
DELETE FROM Notification WHERE Kind <> 'Promo';
