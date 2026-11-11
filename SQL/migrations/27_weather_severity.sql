-- 27_weather_severity.sql: a weather event gets a Severity, and the severity decides what closes. Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/27_weather_severity.sql
--   Low            logged only
--   Medium, High   outdoor rides close
--   Severe         the whole park closes (indoor rides too)
-- ClosesOutdoorRides and ClosesPark become generated columns. They depend only on the row's own Severity, so the
-- schema can compute them, and trg_WeatherLog_BI / trg_WeatherLog_BU (which read the Park limits) are dropped.
-- Rules that read other tables or the clock stay triggers: boardings during a closure, and the weather notices.
-- Existing rows: Severity = High where the row already closed outdoor rides, Low otherwise, so every past closure
-- and every weather refund stays valid. TemperatureF, WindMph and LightningMiles stay but become optional.
-- Load AFTER 02_test_data.sql: the seed inserts ClosesOutdoorRides values, which a generated column refuses.
USE theme_park;

DROP TRIGGER IF EXISTS trg_WeatherLog_BI;
DROP TRIGGER IF EXISTS trg_WeatherLog_BU;
DROP PROCEDURE IF EXISTS tmp_WeatherSeverity;

DELIMITER $$

-- One-off helper so the column changes only run once (MySQL has no ADD COLUMN IF NOT EXISTS).
CREATE PROCEDURE tmp_WeatherSeverity()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WeatherLog' AND COLUMN_NAME = 'Severity') THEN
        ALTER TABLE WeatherLog
          ADD COLUMN Severity ENUM('Low','Medium','High','Severe') NOT NULL DEFAULT 'Low' AFTER WeatherType;
        UPDATE WeatherLog SET Severity = IF(ClosesOutdoorRides = 1, 'High', 'Low');
    END IF;

    -- [RULE] Medium or worse closes the outdoor rides. Computed by the schema; nobody can set it by hand.
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WeatherLog' AND COLUMN_NAME = 'ClosesOutdoorRides'
                      AND EXTRA LIKE '%GENERATED%') THEN
        ALTER TABLE WeatherLog
          MODIFY ClosesOutdoorRides BOOL AS (Severity IN ('Medium','High','Severe')) STORED NOT NULL;
    END IF;

    -- [RULE] Severe closes the whole park.
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WeatherLog' AND COLUMN_NAME = 'ClosesPark') THEN
        ALTER TABLE WeatherLog
          ADD COLUMN ClosesPark BOOL AS (Severity = 'Severe') STORED NOT NULL AFTER ClosesOutdoorRides;
    END IF;
END$$

DELIMITER ;

CALL tmp_WeatherSeverity();
DROP PROCEDURE tmp_WeatherSeverity;

-- The readings are optional now: the form only asks for type, severity and times.
ALTER TABLE WeatherLog
  MODIFY TemperatureF   SMALLINT          NULL,
  MODIFY WindMph        SMALLINT UNSIGNED NULL,
  MODIFY LightningMiles DECIMAL(4,1)      NULL;

-- [VIEW] v_RideAvailability: same as 00_schema.sql, except a park closure also closes indoor rides.
CREATE OR REPLACE VIEW v_RideAvailability AS
SELECT z.ZoneName, r.RideID, r.RideName,
       CASE WHEN r.IsActive = 0 THEN 'Closed - Retired'
            WHEN fn_UnderMaintenance('Ride', r.RideID, NOW()) THEN 'Closed - Maintenance'
            WHEN EXISTS (
                 SELECT 1 FROM WeatherLog w
                  WHERE NOW() >= w.StartedAt
                    AND (w.EndedAt IS NULL OR NOW() < w.EndedAt)
                    AND (w.ClosesPark = 1 OR (r.IsIndoor = 0 AND w.ClosesOutdoorRides = 1))) THEN 'Closed - Weather'
            ELSE 'Open' END AS CurrentState
  FROM Ride r JOIN Zone z ON z.ZoneID = r.ZoneID;

DROP TRIGGER IF EXISTS trg_RideLog_BI;
DROP TRIGGER IF EXISTS trg_RideLog_BU;
DROP TRIGGER IF EXISTS trg_WeatherLog_AI_Notify;
DROP TRIGGER IF EXISTS trg_WeatherLog_AU_Notify;

DELIMITER $$

-- [RULE] Ride log insert: same as 00_schema.sql, plus no boardings at all while weather has closed the park.
CREATE TRIGGER trg_RideLog_BI BEFORE INSERT ON RideLog
FOR EACH ROW
BEGIN
    DECLARE v_indoor BOOL;
    DECLARE v_minh   SMALLINT UNSIGNED;
    DECLARE v_height SMALLINT UNSIGNED;
    DECLARE v_elig   BOOL;
    DECLARE v_tkexp  BOOL;
    DECLARE v_active BOOL;

    SELECT IsIndoor, MinHeightCm, IsExpressEligible, IsActive INTO v_indoor, v_minh, v_elig, v_active FROM Ride WHERE RideID = NEW.RideID;
    IF v_active = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride is no longer in service';
    END IF;

    IF NEW.EventType = 'Boarding' THEN
        CALL sp_AssertTicketValid(NEW.TicketID, NEW.LoggedAt);

        IF fn_UnderMaintenance('Ride', NEW.RideID, NEW.LoggedAt) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride was under maintenance';
        END IF;

        IF EXISTS (SELECT 1 FROM WeatherLog w
                    WHERE w.ClosesPark = 1
                      AND NEW.LoggedAt >= w.StartedAt
                      AND (w.EndedAt IS NULL OR NEW.LoggedAt < w.EndedAt)) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Weather has closed the park';
        END IF;

        IF v_indoor = 0 AND EXISTS (SELECT 1 FROM WeatherLog w
                                     WHERE w.ClosesOutdoorRides = 1
                                       AND NEW.LoggedAt >= w.StartedAt
                                       AND (w.EndedAt IS NULL OR NEW.LoggedAt < w.EndedAt)) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Weather has closed outdoor rides';
        END IF;

        SELECT c.HeightCm INTO v_height
          FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID
         WHERE t.TicketID = NEW.TicketID;
        IF v_height < v_minh THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Guest is below the ride height requirement';
        END IF;

        IF NEW.UsedExpress = 1 THEN
            SELECT HasExpress INTO v_tkexp FROM Ticket WHERE TicketID = NEW.TicketID;
            IF v_tkexp = 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket does not include Express';
            END IF;
            IF v_elig = 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride is not Express eligible';
            END IF;
        END IF;
    END IF;
END$$

-- [RULE] Ride log edit: same as 19_editable_records.sql, plus the park-closure check.
CREATE TRIGGER trg_RideLog_BU BEFORE UPDATE ON RideLog
FOR EACH ROW
BEGIN
    DECLARE v_indoor BOOL;
    DECLARE v_minh   SMALLINT UNSIGNED;
    DECLARE v_height SMALLINT UNSIGNED;
    DECLARE v_elig   BOOL;
    DECLARE v_tkexp  BOOL;
    DECLARE v_active BOOL;

    IF NOT (OLD.RideID <=> NEW.RideID AND OLD.EventType <=> NEW.EventType AND OLD.TicketID <=> NEW.TicketID
            AND OLD.UsedExpress <=> NEW.UsedExpress AND OLD.LoggedAt <=> NEW.LoggedAt) THEN

        SELECT IsIndoor, MinHeightCm, IsExpressEligible, IsActive INTO v_indoor, v_minh, v_elig, v_active
          FROM Ride WHERE RideID = NEW.RideID;
        IF NOT (OLD.RideID <=> NEW.RideID) AND v_active = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride is no longer in service';
        END IF;

        IF NEW.EventType = 'Boarding' THEN
            CALL sp_AssertTicketValid(NEW.TicketID, NEW.LoggedAt);

            IF fn_UnderMaintenance('Ride', NEW.RideID, NEW.LoggedAt) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride was under maintenance';
            END IF;

            IF EXISTS (SELECT 1 FROM WeatherLog w
                        WHERE w.ClosesPark = 1
                          AND NEW.LoggedAt >= w.StartedAt
                          AND (w.EndedAt IS NULL OR NEW.LoggedAt < w.EndedAt)) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Weather has closed the park';
            END IF;

            IF v_indoor = 0 AND EXISTS (SELECT 1 FROM WeatherLog w
                                         WHERE w.ClosesOutdoorRides = 1
                                           AND NEW.LoggedAt >= w.StartedAt
                                           AND (w.EndedAt IS NULL OR NEW.LoggedAt < w.EndedAt)) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Weather has closed outdoor rides';
            END IF;

            SELECT c.HeightCm INTO v_height
              FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID
             WHERE t.TicketID = NEW.TicketID;
            IF v_height < v_minh THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Guest is below the ride height requirement';
            END IF;

            IF NEW.UsedExpress = 1 THEN
                SELECT HasExpress INTO v_tkexp FROM Ticket WHERE TicketID = NEW.TicketID;
                IF v_tkexp = 0 THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket does not include Express';
                END IF;
                IF v_elig = 0 THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride is not Express eligible';
                END IF;
            END IF;
        END IF;
    END IF;
END$$

-- [RULE] New weather event that closes something posts a notice: "Park closed" for Severe, "Outdoor rides closed"
-- for Medium or High. Replaces the version in 11_restore_triggers.sql. trg_WeatherLog_AU_Clear (13) still switches
-- it off when the event gets an end time; both find it by DedupeKey 'Weather:' + WeatherID.
CREATE TRIGGER trg_WeatherLog_AI_Notify AFTER INSERT ON WeatherLog
FOR EACH ROW
BEGIN
    IF NEW.ClosesOutdoorRides = 1 THEN
        INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
        VALUES ('Weather', 'Alert',
                IF(NEW.ClosesPark = 1, 'Park closed', 'Outdoor rides closed'),
                IF(NEW.ClosesPark = 1,
                   CONCAT(NEW.WeatherType, ' has closed the park.'),
                   CONCAT(NEW.WeatherType, ' has closed the outdoor rides.')),
                COALESCE(NEW.EndedAt, NEW.StartedAt + INTERVAL 6 HOUR),
                CONCAT('Weather:', NEW.WeatherID));
    END IF;
END$$

-- [RULE] Weather event edited while it is still going on (new severity or type): its notice follows the change.
-- Now closes something -> the notice is posted, or reworded and switched back on. Closes nothing -> switched off.
CREATE TRIGGER trg_WeatherLog_AU_Notify AFTER UPDATE ON WeatherLog
FOR EACH ROW
BEGIN
    IF (NEW.EndedAt IS NULL OR NEW.EndedAt > NOW())
       AND NOT (OLD.Severity <=> NEW.Severity AND OLD.WeatherType <=> NEW.WeatherType) THEN
        IF NEW.ClosesOutdoorRides = 1 THEN
            INSERT INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
            VALUES ('Weather', 'Alert',
                    IF(NEW.ClosesPark = 1, 'Park closed', 'Outdoor rides closed'),
                    IF(NEW.ClosesPark = 1,
                       CONCAT(NEW.WeatherType, ' has closed the park.'),
                       CONCAT(NEW.WeatherType, ' has closed the outdoor rides.')),
                    COALESCE(NEW.EndedAt, NOW() + INTERVAL 6 HOUR),
                    CONCAT('Weather:', NEW.WeatherID)) AS n
            ON DUPLICATE KEY UPDATE Title = n.Title, Message = n.Message, ExpiresAt = n.ExpiresAt, IsActive = 1;
        ELSE
            UPDATE Notification SET IsActive = 0 WHERE DedupeKey = CONCAT('Weather:', NEW.WeatherID);
        END IF;
    END IF;
END$$

DELIMITER ;
