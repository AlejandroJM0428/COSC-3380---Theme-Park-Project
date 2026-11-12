-- 28_ride_notice_dedupe.sql
-- Stage 1: one "under maintenance" notice per ride, found by the ride's id instead of by its message text.
--   trg_Ride_AU_Notify  Status becomes Maintenance -> post (or switch back on) that ride's notice.
--   trg_Ride_AU_Reopen  Status leaves Maintenance  -> switch that ride's notice off.
-- Both use DedupeKey 'Maintenance:<RideID>'. Renaming a ride while it is down no longer breaks the reopen,
-- and a ride that goes down twice reuses its row instead of adding a second one.
-- Safe to run more than once. Does not delete rows (notices are switched off with IsActive = 0).
-- REQUIRES 05_notifications.sql (Notification, DedupeKey is UNIQUE). Replaces the versions in 05, 09 and 13.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/rules/28_ride_notice_dedupe.sql
-- Test on a copy of the database first.
USE theme_park;

-- Existing rows: if a ride has several live legacy notices (no key), keep only the newest one live.
UPDATE Notification o
   SET o.IsActive = 0
 WHERE o.Kind = 'Maintenance' AND o.DedupeKey IS NULL AND o.IsActive = 1
   AND o.NotificationID < (SELECT m.MaxID
                             FROM (SELECT Message, MAX(NotificationID) AS MaxID
                                     FROM Notification
                                    WHERE Kind = 'Maintenance' AND DedupeKey IS NULL AND IsActive = 1
                                    GROUP BY Message) m
                            WHERE m.Message = o.Message);

-- Give the remaining live legacy notice of each ride its key, so the new Reopen trigger can find it.
UPDATE Notification n
  JOIN Ride r ON n.Message = CONCAT(r.RideName, ' is currently unavailable due to maintenance.')
   SET n.DedupeKey = CONCAT('Maintenance:', r.RideID)
 WHERE n.Kind = 'Maintenance' AND n.DedupeKey IS NULL AND n.IsActive = 1;

DROP TRIGGER IF EXISTS trg_Ride_AU_Notify;
DROP TRIGGER IF EXISTS trg_Ride_AU_Reopen;

DELIMITER $$

-- [RULE] Ride update: Status becomes Maintenance -> post that ride's notice.
-- The key is unique, so the second time a ride goes down the old row is switched back on with fresh text and time.
CREATE TRIGGER trg_Ride_AU_Notify AFTER UPDATE ON Ride
FOR EACH ROW
BEGIN
    IF NOT (OLD.Status <=> NEW.Status) AND NEW.Status = 'Maintenance' THEN
        INSERT INTO Notification (Kind, Severity, Title, Message, DedupeKey)
        VALUES ('Maintenance', 'Alert', 'New Maintenance Alert',
                CONCAT(NEW.RideName, ' is currently unavailable due to maintenance.'),
                CONCAT('Maintenance:', NEW.RideID)) AS n
        ON DUPLICATE KEY UPDATE Message = n.Message, CreatedAt = NOW(), IsActive = 1;
    END IF;
END$$

-- [RULE] Ride update: Status leaves Maintenance -> switch that ride's notice off. Found by key, not by text.
CREATE TRIGGER trg_Ride_AU_Reopen AFTER UPDATE ON Ride
FOR EACH ROW
BEGIN
    IF NOT (OLD.Status <=> NEW.Status) AND OLD.Status = 'Maintenance' THEN
        UPDATE Notification
           SET IsActive = 0
         WHERE DedupeKey = CONCAT('Maintenance:', NEW.RideID);
    END IF;
END$$

DELIMITER ;
