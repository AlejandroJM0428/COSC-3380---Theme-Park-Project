-- 09_ride_maintenance_notice.sql
-- Adds the maintenance notification trigger and the presentation wording for overlapping memberships.
-- Safe to run more than once. Does not delete rows.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/09_ride_maintenance_notice.sql
USE theme_park;

ALTER TABLE Notification
  MODIFY Kind ENUM('SoldOut','Weather','MaintenanceClosed','Promo','Maintenance') NOT NULL;

DROP TRIGGER IF EXISTS trg_Ride_AU_Notify;

DELIMITER $$

CREATE TRIGGER trg_Ride_AU_Notify AFTER UPDATE ON Ride
FOR EACH ROW
BEGIN
    IF NOT (OLD.Status <=> NEW.Status) AND NEW.Status = 'Maintenance' THEN
        INSERT INTO Notification (Kind, Severity, Title, Message)
        VALUES ('Maintenance', 'Alert', 'New Maintenance Alert',
                CONCAT(NEW.RideName, ' is currently unavailable due to maintenance.'));
    END IF;
END$$

DROP PROCEDURE IF EXISTS sp_AssertNoMembershipOverlap$$
CREATE PROCEDURE sp_AssertNoMembershipOverlap(IN p_self INT UNSIGNED, IN p_customer INT UNSIGNED,
                                              IN p_start DATE, IN p_end DATE)
BEGIN
    IF EXISTS (SELECT 1 FROM Membership m
                WHERE m.CustomerID = p_customer
                  AND m.MembershipID <> p_self
                  AND p_start <= m.EndDate
                  AND p_end   >= m.StartDate) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This guest already has a membership that overlaps with the selected dates.';
    END IF;
END$$

DELIMITER ;
