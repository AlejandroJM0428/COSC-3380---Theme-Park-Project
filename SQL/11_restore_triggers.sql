-- 11_restore_triggers.sql
-- Puts back the rules that 08_simplify_triggers.sql moved out of MySQL, as real triggers.
-- Safe to run more than once. Does not delete or change rows.
-- REQUIRES the schema, 04_staff_roles_and_costs.sql (RepairCost) and 05_notifications.sql (Notification).
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/11_restore_triggers.sql
--
-- The routes still call the same sp_Assert* procedures, so a rule is checked twice
-- (once by the route for a friendly message, once here so a direct SQL edit cannot get around it).
USE theme_park;

DROP TRIGGER IF EXISTS trg_Ticket_BU;
DROP TRIGGER IF EXISTS trg_Membership_BU;
DROP TRIGGER IF EXISTS trg_WeatherLog_BU;
DROP TRIGGER IF EXISTS trg_TicketRefund_BI;
DROP TRIGGER IF EXISTS trg_RideCert_BI;
DROP TRIGGER IF EXISTS trg_Shift_BI;
DROP TRIGGER IF EXISTS trg_Shift_BU;
DROP TRIGGER IF EXISTS trg_MaintCrew_BI;
DROP TRIGGER IF EXISTS trg_Maint_BU_Cost;
DROP TRIGGER IF EXISTS trg_Maint_AI;
DROP TRIGGER IF EXISTS trg_Maint_AU;
DROP TRIGGER IF EXISTS trg_Maint_AU_Notify;
DROP TRIGGER IF EXISTS trg_Ticket_AI_Notify;
DROP TRIGGER IF EXISTS trg_WeatherLog_AI_Notify;
DROP TRIGGER IF EXISTS trg_RideLog_BU;
DROP TRIGGER IF EXISTS trg_GamePlay_BU;
DROP TRIGGER IF EXISTS trg_Purchase_BU;
DROP TRIGGER IF EXISTS trg_TicketRefund_BU;

DELIMITER $$

-- [RULE] Ticket edit: a ticket with activity is frozen; otherwise the same checks and price as a new ticket.
CREATE TRIGGER trg_Ticket_BU BEFORE UPDATE ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_exp BOOL;
    IF NOT (OLD.CustomerID <=> NEW.CustomerID AND OLD.MembershipID <=> NEW.MembershipID
            AND OLD.VisitDate <=> NEW.VisitDate AND OLD.HasExpress <=> NEW.HasExpress) THEN
        IF EXISTS (SELECT 1 FROM RideLog  WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM GamePlay WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM Purchase WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM TicketRefund WHERE TicketID = OLD.TicketID) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket already has activity and cannot be changed';
        END IF;
        CALL sp_AssertTicketRules(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate, OLD.TicketID, v_exp);
        IF v_exp THEN
            SET NEW.HasExpress = 1;
        END IF;
    END IF;
    SET NEW.TicketPrice = fn_TicketPrice(NEW.MembershipID, NEW.HasExpress);
END$$

-- [RULE] Membership edit: no overlap, tier still for sale when the tier changes, price always comes from the tier.
CREATE TRIGGER trg_Membership_BU BEFORE UPDATE ON Membership
FOR EACH ROW
BEGIN
    DECLARE v_price DECIMAL(8,2);
    DECLARE v_sale  BOOL;
    IF NOT (OLD.CustomerID <=> NEW.CustomerID AND OLD.StartDate <=> NEW.StartDate AND OLD.EndDate <=> NEW.EndDate) THEN
        IF NOT EXISTS (SELECT 1 FROM Customer WHERE CustomerID = NEW.CustomerID AND IsActive = 1) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer is inactive or does not exist';
        END IF;
        CALL sp_AssertNoMembershipOverlap(OLD.MembershipID, NEW.CustomerID, NEW.StartDate, NEW.EndDate);
    END IF;
    SELECT AnnualPrice, IsForSale INTO v_price, v_sale FROM MembershipTier WHERE Tier = NEW.Tier;
    IF NOT (OLD.Tier <=> NEW.Tier) AND v_sale = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This membership tier is no longer sold';
    END IF;
    SET NEW.Price = v_price;
END$$

-- [RULE] Weather edit: ClosesOutdoorRides is always recomputed from the reading and the park limits.
CREATE TRIGGER trg_WeatherLog_BU BEFORE UPDATE ON WeatherLog
FOR EACH ROW
BEGIN
    SET NEW.ClosesOutdoorRides = fn_WeatherCloses(NEW.ParkID, NEW.TemperatureF, NEW.WindMph, NEW.LightningMiles);
END$$

-- [RULE] Refund insert: not dated before the purchase; a weather refund needs a storm that closed rides.
CREATE TRIGGER trg_TicketRefund_BI BEFORE INSERT ON TicketRefund
FOR EACH ROW
BEGIN
    DECLARE v_bought DATETIME;
    DECLARE v_closes BOOL;
    SELECT PurchaseDate INTO v_bought FROM Ticket WHERE TicketID = NEW.TicketID;
    IF v_bought IS NOT NULL AND NEW.RefundedAt < v_bought THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refund cannot be dated before the ticket was purchased';
    END IF;
    IF NEW.WeatherID IS NOT NULL THEN
        SELECT ClosesOutdoorRides INTO v_closes FROM WeatherLog WHERE WeatherID = NEW.WeatherID;
        IF v_closes IS NULL OR v_closes = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That weather did not close outdoor rides';
        END IF;
    END IF;
END$$

-- [RULE] Ride certification insert: ride operators only, and not before the hire date.
CREATE TRIGGER trg_RideCert_BI BEFORE INSERT ON RideCertification
FOR EACH ROW
BEGIN
    DECLARE v_title VARCHAR(30);
    DECLARE v_hired DATE;
    SELECT JobTitle, HireDate INTO v_title, v_hired FROM Employee WHERE EmployeeID = NEW.EmployeeID;
    IF v_title IS NULL OR v_title <> 'Ride Operator' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only ride operators can be certified on a ride';
    END IF;
    IF NEW.CertifiedOn < v_hired THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Certification starts before the hire date';
    END IF;
END$$

-- [RULE] Shift insert: active employee, no overlap, no clock-in before the hire date.
CREATE TRIGGER trg_Shift_BI BEFORE INSERT ON Shift
FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Employee WHERE EmployeeID = NEW.EmployeeID AND IsActive = 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee is inactive or does not exist';
    END IF;
    CALL sp_AssertShift(0, NEW.EmployeeID, NEW.ClockIn, NEW.ClockOut);
END$$

-- [RULE] Shift edit: the same checks when the times or the employee change (a rating alone is always fine).
CREATE TRIGGER trg_Shift_BU BEFORE UPDATE ON Shift
FOR EACH ROW
BEGIN
    IF NOT (OLD.EmployeeID <=> NEW.EmployeeID AND OLD.ClockIn <=> NEW.ClockIn AND OLD.ClockOut <=> NEW.ClockOut) THEN
        CALL sp_AssertShift(OLD.ShiftID, NEW.EmployeeID, NEW.ClockIn, NEW.ClockOut);
    END IF;
END$$

-- [RULE] Repair crew insert: an active technician only.
CREATE TRIGGER trg_MaintCrew_BI BEFORE INSERT ON MaintenanceCrew
FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Employee
                    WHERE EmployeeID = NEW.EmployeeID AND JobTitle = 'Technician' AND IsActive = 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an active technician can join a repair crew';
    END IF;
END$$

-- [RULE] Maintenance edit: a job cannot be closed without a repair cost.
CREATE TRIGGER trg_Maint_BU_Cost BEFORE UPDATE ON Maintenance
FOR EACH ROW
BEGIN
    IF NEW.EndDate IS NOT NULL AND NEW.RepairCost IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A closed maintenance job needs a repair cost';
    END IF;
END$$

-- [RULE] Maintenance insert and edit: Ride.Status follows the live state, which also fires trg_Ride_AU_Notify.
CREATE TRIGGER trg_Maint_AI AFTER INSERT ON Maintenance
FOR EACH ROW
BEGIN
    IF NEW.RideID IS NOT NULL THEN
        UPDATE Ride
           SET Status = IF(fn_UnderMaintenance('Ride', NEW.RideID, NOW()), 'Maintenance', 'Open')
         WHERE RideID = NEW.RideID;
    END IF;
END$$

CREATE TRIGGER trg_Maint_AU AFTER UPDATE ON Maintenance
FOR EACH ROW
BEGIN
    IF NEW.RideID IS NOT NULL THEN
        UPDATE Ride
           SET Status = IF(fn_UnderMaintenance('Ride', NEW.RideID, NOW()), 'Maintenance', 'Open')
         WHERE RideID = NEW.RideID;
    END IF;
END$$

-- [RULE] A job that closes without a full fix posts a notice that the facility stays closed.
CREATE TRIGGER trg_Maint_AU_Notify AFTER UPDATE ON Maintenance
FOR EACH ROW
BEGIN
    DECLARE v_name VARCHAR(100);
    IF OLD.EndDate IS NULL AND NEW.EndDate IS NOT NULL AND NEW.Outcome <> 'Fixed' THEN
        SET v_name = COALESCE((SELECT RideName  FROM Ride  WHERE RideID  = NEW.RideID),
                              (SELECT GameName  FROM Game  WHERE GameID  = NEW.GameID),
                              (SELECT VenueName FROM Venue WHERE VenueID = NEW.VenueID));
        INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, DedupeKey)
        VALUES ('MaintenanceClosed', 'Alert', 'Closed after maintenance',
                CONCAT(v_name, ' stays closed: the repair was ', LOWER(NEW.Outcome), '.'),
                CONCAT('MaintClosed:', NEW.MaintenanceID));
    END IF;
END$$

-- [RULE] The ticket that fills the park for a day posts a sold-out notice for that day.
CREATE TRIGGER trg_Ticket_AI_Notify AFTER INSERT ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_max  INT UNSIGNED;
    DECLARE v_sold INT UNSIGNED;
    IF NEW.VisitDate >= CURDATE() THEN
        SELECT MaxOccupancy INTO v_max FROM Park WHERE ParkID = 1;
        SELECT COUNT(*) INTO v_sold FROM Ticket t
         WHERE t.VisitDate = NEW.VisitDate
           AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);
        IF v_sold >= v_max THEN
            INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
            VALUES ('SoldOut', 'Warning', 'Sold out',
                    CONCAT('Tickets for ', DATE_FORMAT(NEW.VisitDate, '%a %b %e, %Y'), ' are sold out.'),
                    CAST(NEW.VisitDate AS DATETIME) + INTERVAL 1 DAY - INTERVAL 1 SECOND,
                    CONCAT('SoldOut:', NEW.VisitDate));
        END IF;
    END IF;
END$$

-- [RULE] A weather reading that closes outdoor rides posts a weather notice.
CREATE TRIGGER trg_WeatherLog_AI_Notify AFTER INSERT ON WeatherLog
FOR EACH ROW
BEGIN
    IF NEW.ClosesOutdoorRides = 1 THEN
        INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('Weather', 'Alert', 'Outdoor rides closed',
                CONCAT(NEW.WeatherType, ' has closed the outdoor rides.'),
                COALESCE(NEW.EndedAt, NEW.StartedAt + INTERVAL 6 HOUR),
                CONCAT('Weather:', NEW.WeatherID));
    END IF;
END$$

-- [RULE] Boardings, plays, purchases and refunds are records: they are never edited.
CREATE TRIGGER trg_RideLog_BU BEFORE UPDATE ON RideLog
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride log entries are records and cannot be edited';
END$$

CREATE TRIGGER trg_GamePlay_BU BEFORE UPDATE ON GamePlay
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game plays are records and cannot be edited';
END$$

CREATE TRIGGER trg_Purchase_BU BEFORE UPDATE ON Purchase
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchases are records and cannot be edited';
END$$

CREATE TRIGGER trg_TicketRefund_BU BEFORE UPDATE ON TicketRefund
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds are records and cannot be edited';
END$$

DELIMITER ;
