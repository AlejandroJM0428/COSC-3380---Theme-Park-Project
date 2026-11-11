-- 30_ride_added_deactivated.sql
-- Stage 3: the park announces when a ride is added or taken out of service. Rides/attractions only (Park stays one row).
--   trg_Ride_AI_Notify         AFTER INSERT on Ride: an active new ride posts "New ride: <name>".
--   trg_Ride_AU_ActiveNotify   AFTER UPDATE on Ride, when IsActive changes:
--                                1 -> 0  posts "<name> is no longer available." and switches off that ride's other notices
--                                0 -> 1  switches the "no longer available" notice off and posts "<name> is available again."
-- These are real Notification rows that expire after 7 days (the default window: change the INTERVAL if Uma wants another).
-- They live in the table, so they survive a page reload and a server restart.
-- DedupeKey carries the ride id (and the date for a deactivation), so a repeat updates the same row and never fails:
--   RideAdded:<id>   RideBack:<id>   RideDeactivated:<id>:<YYYY-MM-DD>
-- Safe to run more than once. Does not delete rows (notices are switched off with IsActive = 0).
-- REQUIRES 05_notifications.sql and 28_ride_notice_dedupe.sql (trg_Ride_AU_Notify must exist, this trigger runs after it).
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/rules/30_ride_added_deactivated.sql
-- Test on a copy of the database first.
USE theme_park;

-- Widen the notice kinds. Keeps every existing value, so it is safe to repeat.
ALTER TABLE Notification
  MODIFY Kind ENUM('SoldOut','Weather','MaintenanceClosed','Promo','Maintenance','SellingFast','RideAdded','RideDeactivated') NOT NULL;

DROP TRIGGER IF EXISTS trg_Ride_AI_Notify;
DROP TRIGGER IF EXISTS trg_Ride_AU_ActiveNotify;

DELIMITER $$

-- [RULE] A new active ride is announced. A ride added already retired is not news, so it posts nothing.
CREATE TRIGGER trg_Ride_AI_Notify AFTER INSERT ON Ride
FOR EACH ROW
BEGIN
    IF NEW.IsActive = 1 THEN
        INSERT INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('RideAdded', 'Info', 'New ride', NEW.RideName,
                NOW() + INTERVAL 7 DAY, CONCAT('RideAdded:', NEW.RideID)) AS n
        ON DUPLICATE KEY UPDATE Message = n.Message, CreatedAt = NOW(), ExpiresAt = n.ExpiresAt, IsActive = 1;
    END IF;
END$$

-- [RULE] A ride taken out of service (IsActive 1 -> 0) is announced and its older notices are switched off.
-- A ride put back (0 -> 1) clears the "no longer available" notice and is announced again.
-- Runs AFTER trg_Ride_AU_Notify, so if a ride is retired and set to Maintenance in one update, the retired state wins.
CREATE TRIGGER trg_Ride_AU_ActiveNotify AFTER UPDATE ON Ride
FOR EACH ROW FOLLOWS trg_Ride_AU_Notify
BEGIN
    IF OLD.IsActive = 1 AND NEW.IsActive = 0 THEN
        INSERT INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('RideDeactivated', 'Warning', 'Ride retired', CONCAT(NEW.RideName, ' is no longer available.'),
                NOW() + INTERVAL 7 DAY, CONCAT('RideDeactivated:', NEW.RideID, ':', CURDATE())) AS n
        ON DUPLICATE KEY UPDATE Message = n.Message, CreatedAt = NOW(), ExpiresAt = n.ExpiresAt, IsActive = 1;

        UPDATE Notification
           SET IsActive = 0
         WHERE DedupeKey IN (CONCAT('Maintenance:', NEW.RideID), CONCAT('RideAdded:', NEW.RideID), CONCAT('RideBack:', NEW.RideID));
    ELSEIF OLD.IsActive = 0 AND NEW.IsActive = 1 THEN
        UPDATE Notification
           SET IsActive = 0
         WHERE DedupeKey LIKE CONCAT('RideDeactivated:', NEW.RideID, ':%');

        INSERT INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('RideAdded', 'Info', 'Ride back', CONCAT(NEW.RideName, ' is available again.'),
                NOW() + INTERVAL 7 DAY, CONCAT('RideBack:', NEW.RideID)) AS n
        ON DUPLICATE KEY UPDATE Message = n.Message, CreatedAt = NOW(), ExpiresAt = n.ExpiresAt, IsActive = 1;
    END IF;
END$$

DELIMITER ;
