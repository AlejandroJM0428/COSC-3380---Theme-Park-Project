-- 23_sold_out_replaces_selling_fast.sql
-- BUG: the homepage showed "Sold out" and "Selling fast" for the same date at once.
-- CAUSE: "Selling fast" is posted at 90% full and was never switched off when the date later sold out.
-- FIX (three parts, safe to run more than once, deletes nothing):
--   1. trg_Ticket_AI_Notify now switches off the date's "Selling fast" notice when it posts "Sold out".
--   2. v_ActiveNotifications hides a "Selling fast" notice while that date's "Sold out" notice is live.
--      (Covers refunds and any case a trigger missed.)
--   3. One-time cleanup of "Selling fast" rows that are already stale.
-- Run once on the live database:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/23_sold_out_replaces_selling_fast.sql
-- Test on a copy of the database first.
USE theme_park;

-- 2. The view.
CREATE OR REPLACE VIEW v_ActiveNotifications AS
SELECT n.NotificationID, n.Kind, n.Severity, n.Title, n.Message, n.CreatedAt, n.ExpiresAt
  FROM Notification n
 WHERE n.IsActive = 1 AND (n.ExpiresAt IS NULL OR n.ExpiresAt > NOW())
   AND NOT (n.Kind = 'SellingFast' AND EXISTS (
         SELECT 1 FROM Notification s
          WHERE s.Kind = 'SoldOut' AND s.IsActive = 1 AND (s.ExpiresAt IS NULL OR s.ExpiresAt > NOW())
            AND s.DedupeKey = REPLACE(n.DedupeKey, 'SellingFast:', 'SoldOut:')))
 ORDER BY n.CreatedAt DESC;

-- 1. The trigger.
DROP TRIGGER IF EXISTS trg_Ticket_AI_Notify;

DELIMITER $$

-- [RULE] The ticket that fills the park for a day posts a sold-out notice and retires that day's selling-fast notice.
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
            UPDATE Notification SET IsActive = 0 WHERE DedupeKey = CONCAT('SellingFast:', NEW.VisitDate);
        END IF;
    END IF;
END$$

DELIMITER ;

-- 3. One-time cleanup of stale "Selling fast" rows.
UPDATE Notification n
  JOIN Notification s ON s.Kind = 'SoldOut' AND s.DedupeKey = REPLACE(n.DedupeKey, 'SellingFast:', 'SoldOut:')
   SET n.IsActive = 0
 WHERE n.Kind = 'SellingFast' AND n.IsActive = 1;

-- Check: must return no rows (a date showing both "Sold out" and "Selling fast").
SELECT f.Message AS StillShowingBoth
  FROM v_ActiveNotifications f
  JOIN v_ActiveNotifications s
    ON s.Kind = 'SoldOut'
   AND f.Message LIKE CONCAT(SUBSTRING_INDEX(SUBSTRING_INDEX(s.Message, 'Tickets for ', -1), ' are sold out.', 1), '%')
 WHERE f.Kind = 'SellingFast';
