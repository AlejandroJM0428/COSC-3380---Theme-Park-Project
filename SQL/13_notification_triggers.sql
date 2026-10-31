-- 13_notification_triggers.sql
-- Three more homepage notices, made by triggers:
--   1. trg_Ride_AU_Reopen         a ride leaves Maintenance -> its "unavailable" notice is removed.
--   2. trg_WeatherLog_AU_Clear    a weather event gets an end time -> its closure notice is removed.
--   3. trg_Ticket_AI_SellingFast  a visit date reaches 90% of MaxOccupancy -> "Selling fast" notice.
-- Safe to run more than once. Does not delete rows (notices are switched off with IsActive = 0).
-- REQUIRES 05_notifications.sql (Notification) and 11_restore_triggers.sql (the existing _Notify triggers).
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/13_notification_triggers.sql
-- Test on a copy of the database first.
USE theme_park;

-- [RULE] New notice kind for the "selling fast" warning. Safe to repeat.
ALTER TABLE Notification
  MODIFY Kind ENUM('SoldOut','Weather','MaintenanceClosed','Promo','Maintenance','SellingFast') NOT NULL;

DROP TRIGGER IF EXISTS trg_Ride_AU_Reopen;
DROP TRIGGER IF EXISTS trg_WeatherLog_AU_Clear;
DROP TRIGGER IF EXISTS trg_Ticket_AI_SellingFast;

DELIMITER $$

-- [RULE] Ride update: when Status moves away from Maintenance, switch off that ride's maintenance notice.
-- The notice is found by its text, which trg_Ride_AU_Notify builds from the ride name.
-- Keep the two messages identical if either is ever reworded.
CREATE TRIGGER trg_Ride_AU_Reopen AFTER UPDATE ON Ride
FOR EACH ROW
BEGIN
    IF NOT (OLD.Status <=> NEW.Status) AND OLD.Status = 'Maintenance' THEN
        UPDATE Notification
           SET IsActive = 0
         WHERE Kind = 'Maintenance'
           AND IsActive = 1
           AND Message = CONCAT(NEW.RideName, ' is currently unavailable due to maintenance.');
    END IF;
END$$

-- [RULE] Weather update: when EndedAt is filled in, switch off the closure notice made by trg_WeatherLog_AI_Notify.
-- That notice is found by its DedupeKey ('Weather:' + WeatherID).
CREATE TRIGGER trg_WeatherLog_AU_Clear AFTER UPDATE ON WeatherLog
FOR EACH ROW
BEGIN
    IF OLD.EndedAt IS NULL AND NEW.EndedAt IS NOT NULL THEN
        UPDATE Notification
           SET IsActive = 0
         WHERE DedupeKey = CONCAT('Weather:', NEW.WeatherID);
    END IF;
END$$

-- [RULE] New ticket: when the visit date reaches 90% of MaxOccupancy (but is not sold out yet), post a warning.
-- Refunded tickets do not count. Same counting rule as trg_Ticket_AI_Notify. One notice per date (DedupeKey).
-- It expires at the end of the visit date.
CREATE TRIGGER trg_Ticket_AI_SellingFast AFTER INSERT ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_max  INT UNSIGNED;
    DECLARE v_sold INT UNSIGNED;
    IF NEW.VisitDate >= CURDATE() THEN
        SELECT MaxOccupancy INTO v_max FROM Park WHERE ParkID = 1;
        SELECT COUNT(*) INTO v_sold FROM Ticket t
         WHERE t.VisitDate = NEW.VisitDate
           AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);
        IF v_sold >= v_max * 0.9 AND v_sold < v_max THEN
            INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
            VALUES ('SellingFast', 'Info', 'Selling fast',
                    CONCAT(DATE_FORMAT(NEW.VisitDate, '%a %b %e, %Y'), ' is almost full. Book soon.'),
                    CAST(NEW.VisitDate AS DATETIME) + INTERVAL 1 DAY - INTERVAL 1 SECOND,
                    CONCAT('SellingFast:', NEW.VisitDate));
        END IF;
    END IF;
END$$

DELIMITER ;
