-- 05_notifications.sql
-- Notification table, the notification triggers, and one validation trigger.
-- REQUIRES 04_staff_roles_and_costs.sql (RepairCost) to be applied first.
-- Load AFTER the seed data (02_test_data.sql), so loading data does not create notifications.
-- Safe to run more than once. Test on a copy of the database first.
USE theme_park;

-- [TABLE] Notification: messages shown on the homepage and staff dashboards.
-- [RULE] Triggers create SoldOut, Weather and MaintenanceClosed rows. Promo rows are entered by hand.
-- [RULE] DedupeKey is unique, so the same event never creates two rows. Manual rows leave it empty.
-- [RULE] IsActive = 0 means dismissed; ExpiresAt empty means no expiry.
CREATE TABLE IF NOT EXISTS Notification (
    NotificationID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    Kind           ENUM('SoldOut','Weather','MaintenanceClosed','Promo') NOT NULL,
    Severity       ENUM('Info','Warning','Alert') NOT NULL,
    Title          VARCHAR(100) NOT NULL,
    Message        VARCHAR(255) NOT NULL,
    CreatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt      DATETIME NULL,
    IsActive       BOOL NOT NULL DEFAULT 1,
    DedupeKey      VARCHAR(60) NULL,
    CONSTRAINT PK_Notification PRIMARY KEY (NotificationID),
    CONSTRAINT UQ_Notification_Dedupe UNIQUE (DedupeKey)
) ENGINE = InnoDB;

CREATE INDEX IX_Notification_Active ON Notification (IsActive, CreatedAt);

-- [VIEW] v_ActiveNotifications: what the homepage shows, newest first.
CREATE OR REPLACE VIEW v_ActiveNotifications AS
SELECT NotificationID, Kind, Severity, Title, Message, CreatedAt, ExpiresAt
  FROM Notification
 WHERE IsActive = 1 AND (ExpiresAt IS NULL OR ExpiresAt > NOW())
 ORDER BY CreatedAt DESC;

-- Notifications for dates that are already sold out in the seed data (for example Sat Nov 28, 2026).
INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
SELECT 'SoldOut', 'Warning', 'Sold out',
       CONCAT('Tickets for ', DATE_FORMAT(x.VisitDate, '%a %b %e, %Y'), ' are sold out.'),
       CAST(x.VisitDate AS DATETIME) + INTERVAL 1 DAY - INTERVAL 1 SECOND,
       CONCAT('SoldOut:', x.VisitDate)
  FROM (SELECT t.VisitDate
          FROM Ticket t
         WHERE t.VisitDate >= CURDATE()
           AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)
         GROUP BY t.VisitDate
        HAVING COUNT(*) >= (SELECT MaxOccupancy FROM Park WHERE ParkID = 1)) x;

DELIMITER $$

-- [RULE] Ticket insert: when a visit date reaches park capacity, post a "sold out" notification.
DROP TRIGGER IF EXISTS trg_Ticket_AI_Notify$$
CREATE TRIGGER trg_Ticket_AI_Notify AFTER INSERT ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_max  INT UNSIGNED;
    DECLARE v_sold INT UNSIGNED;
    SELECT MaxOccupancy INTO v_max FROM Park WHERE ParkID = 1;
    SELECT COUNT(*) INTO v_sold FROM Ticket t
     WHERE t.VisitDate = NEW.VisitDate
       AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);
    IF v_max IS NOT NULL AND v_sold >= v_max THEN
        INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('SoldOut', 'Warning', 'Sold out',
                CONCAT('Tickets for ', DATE_FORMAT(NEW.VisitDate, '%a %b %e, %Y'), ' are sold out.'),
                CAST(NEW.VisitDate AS DATETIME) + INTERVAL 1 DAY - INTERVAL 1 SECOND,
                CONCAT('SoldOut:', NEW.VisitDate));
    END IF;
END$$

-- [RULE] Weather insert: when the reading closes outdoor rides, post a weather alert.
DROP TRIGGER IF EXISTS trg_WeatherLog_AI_Notify$$
CREATE TRIGGER trg_WeatherLog_AI_Notify AFTER INSERT ON WeatherLog
FOR EACH ROW
BEGIN
    IF NEW.ClosesOutdoorRides = 1 THEN
        INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('Weather', 'Alert', 'Weather alert',
                CONCAT(NEW.WeatherType, ' conditions: outdoor rides are closed (',
                       NEW.TemperatureF, ' F, wind ', NEW.WindMph, ' mph).'),
                COALESCE(NEW.EndedAt, DATE_ADD(NEW.StartedAt, INTERVAL 6 HOUR)),
                CONCAT('Weather:', NEW.WeatherID));
    END IF;
END$$

-- [RULE] Maintenance update: when a job gets an end date, post a "maintenance closed" notification.
-- Runs after the existing trg_Maint_AU, which refreshes the ride status.
DROP TRIGGER IF EXISTS trg_Maint_AU_Notify$$
CREATE TRIGGER trg_Maint_AU_Notify AFTER UPDATE ON Maintenance
FOR EACH ROW FOLLOWS trg_Maint_AU
BEGIN
    DECLARE v_name VARCHAR(100);
    IF OLD.EndDate IS NULL AND NEW.EndDate IS NOT NULL THEN
        SELECT COALESCE((SELECT RideName  FROM Ride  WHERE RideID  = NEW.RideID),
                        (SELECT GameName  FROM Game  WHERE GameID  = NEW.GameID),
                        (SELECT VenueName FROM Venue WHERE VenueID = NEW.VenueID))
          INTO v_name;
        INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('MaintenanceClosed',
                IF(NEW.Outcome = 'Fixed', 'Info', 'Warning'),
                'Maintenance closed',
                CONCAT(COALESCE(v_name, 'Facility'), ': ', NEW.MaintType, ' finished (', NEW.Outcome, ')',
                       IF(NEW.RepairCost IS NULL, '', CONCAT(', cost $', FORMAT(NEW.RepairCost, 2)))),
                DATE_ADD(NEW.EndDate, INTERVAL 1 DAY),
                CONCAT('MaintClosed:', NEW.MaintenanceID));
    END IF;
END$$

-- [RULE] Maintenance update: a job cannot be closed without a repair cost.
-- Update only, on purpose: the existing ride-maintenance trigger demo inserts an already-closed job.
DROP TRIGGER IF EXISTS trg_Maint_BU_Cost$$
CREATE TRIGGER trg_Maint_BU_Cost BEFORE UPDATE ON Maintenance
FOR EACH ROW
BEGIN
    IF OLD.EndDate IS NULL AND NEW.EndDate IS NOT NULL AND NEW.RepairCost IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Repair cost is required to close a maintenance job';
    END IF;
END$$

DELIMITER ;
