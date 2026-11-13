-- 35_admin_refund_override.sql: an Admin can refund a ticket inside the 2-day notice window. Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/35_admin_refund_override.sql
-- Rule 2 in 25_business_rules.sql (refunds need 2 days notice) stays in force for everyone else.
-- The server sets the session variable @admin_refund_override = 1 for one refund insert, only for a signed-in
-- Admin, and clears it straight after (server/routes/tickets.js and server/routes/adminRows.js).
-- Only the notice check is skipped: a refund still cannot be dated before the purchase, and a weather refund
-- still needs weather that closed outdoor rides.
-- This is trg_TicketRefund_BI from 25_business_rules.sql with one extra condition on the notice check.
USE theme_park;

DROP TRIGGER IF EXISTS trg_TicketRefund_BI;

DELIMITER $$

CREATE TRIGGER trg_TicketRefund_BI BEFORE INSERT ON TicketRefund
FOR EACH ROW
BEGIN
    DECLARE v_bought DATETIME;
    DECLARE v_visit  DATE;
    DECLARE v_closes BOOL;
    SELECT PurchaseDate, VisitDate INTO v_bought, v_visit FROM Ticket WHERE TicketID = NEW.TicketID;
    IF v_bought IS NOT NULL AND NEW.RefundedAt < v_bought THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refund cannot be dated before the ticket was purchased';
    END IF;
    IF NEW.WeatherID IS NOT NULL THEN
        SELECT ClosesOutdoorRides INTO v_closes FROM WeatherLog WHERE WeatherID = NEW.WeatherID;
        IF v_closes IS NULL OR v_closes = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That weather did not close outdoor rides';
        END IF;
    ELSEIF COALESCE(@admin_refund_override, 0) <> 1
           AND v_visit IS NOT NULL AND NEW.RefundedAt >= NOW() - INTERVAL 5 MINUTE
           AND v_visit < CURDATE() + INTERVAL 2 DAY THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds need at least 2 days notice before the visit.';
    END IF;
END$$

DELIMITER ;
