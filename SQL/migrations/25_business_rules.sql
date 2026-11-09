-- 25_business_rules.sql: the two graded business rules (step 7). Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/25_business_rules.sql
-- Both rules compare against today's date or against another table, so a CHECK cannot express them.
-- Seed and history rows are not affected (see the notes on each rule).
USE theme_park;

DROP TRIGGER IF EXISTS trg_Ticket_BI_Window;
DROP TRIGGER IF EXISTS trg_Ticket_BU_Window;
DROP TRIGGER IF EXISTS trg_TicketRefund_BI;

DELIMITER $$

-- [RULE 1] Advance-purchase window: a ticket can be bought for a visit at most 180 days ahead.
-- Why not a CHECK: the limit moves with today's date and MySQL does not allow CURDATE() in a CHECK.
-- Runs before trg_Ticket_BI, so a far-future date is refused before capacity and price are worked out.
CREATE TRIGGER trg_Ticket_BI_Window BEFORE INSERT ON Ticket
FOR EACH ROW PRECEDES trg_Ticket_BI
BEGIN
    IF NEW.VisitDate > CURDATE() + INTERVAL 180 DAY THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets can be bought at most 180 days before the visit.';
    END IF;
END$$

-- Same window when an admin moves an existing ticket to a new visit date.
CREATE TRIGGER trg_Ticket_BU_Window BEFORE UPDATE ON Ticket
FOR EACH ROW
BEGIN
    IF NOT (OLD.VisitDate <=> NEW.VisitDate) AND NEW.VisitDate > CURDATE() + INTERVAL 180 DAY THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets can be bought at most 180 days before the visit.';
    END IF;
END$$

-- [RULE 2] Refund notice: a ticket refund needs at least 2 days' notice before the visit.
-- A weather refund (WeatherID set) is excepted. Why not a CHECK: it compares today with the visit date in Ticket.
-- Only refunds stamped within the last 5 minutes are checked (same pattern as trg_Ticket_BI_Guard), so the demo
-- history, which holds refunds made a day before the visit, still loads.
-- This is trg_TicketRefund_BI from 11_restore_triggers.sql with the notice check added; the two old checks are unchanged.
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
    ELSEIF v_visit IS NOT NULL AND NEW.RefundedAt >= NOW() - INTERVAL 5 MINUTE
           AND v_visit < CURDATE() + INTERVAL 2 DAY THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds need at least 2 days notice before the visit.';
    END IF;
END$$

DELIMITER ;
