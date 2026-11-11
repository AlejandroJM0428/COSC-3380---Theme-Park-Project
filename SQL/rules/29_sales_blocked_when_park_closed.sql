-- 29_sales_blocked_when_park_closed.sql
-- While a Severe weather event is in effect (WeatherLog.ClosesPark = 1) the park is closed, so selling must stop too.
-- Migration 27 already blocks ride boardings. This file adds the rest:
--   fn_ParkClosedByWeather(p_at)     true when a park-closing weather event covers p_at
--   trg_Ticket_BI_WeatherClosed      BEFORE INSERT on Ticket: no ticket for TODAY while closed (future dates stay on sale)
--   trg_Purchase_BI_WeatherClosed    BEFORE INSERT on Purchase: no food, drink or merchandise sale while closed
--   trg_GamePlay_BI_WeatherClosed    BEFORE INSERT on GamePlay: no game play while closed
-- Small new triggers on purpose: the existing trigger bodies are not rewritten.
-- Safe to run more than once. Does not delete or change any rows.
-- REQUIRES migration 27 (WeatherLog.ClosesPark) and the schema triggers trg_Ticket_BI, trg_Purchase_BI, trg_GamePlay_BI.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/rules/29_sales_blocked_when_park_closed.sql
-- Test on a copy of the database first.
USE theme_park;

DROP TRIGGER IF EXISTS trg_Ticket_BI_WeatherClosed;
DROP TRIGGER IF EXISTS trg_Purchase_BI_WeatherClosed;
DROP TRIGGER IF EXISTS trg_GamePlay_BI_WeatherClosed;
DROP FUNCTION IF EXISTS fn_ParkClosedByWeather;

DELIMITER $$

-- [RULE] fn_ParkClosedByWeather: true when a weather event that closes the park is in effect at p_at.
-- Same "in effect" test as v_RideAvailability: started, and not ended yet.
CREATE FUNCTION fn_ParkClosedByWeather(p_at DATETIME)
RETURNS BOOL
READS SQL DATA
BEGIN
    RETURN EXISTS (SELECT 1 FROM WeatherLog w
                    WHERE w.ClosesPark = 1
                      AND w.StartedAt <= p_at
                      AND (w.EndedAt IS NULL OR p_at < w.EndedAt));
END$$

-- [RULE] A ticket for today cannot be sold while weather has closed the park. Tickets for a later date are fine.
CREATE TRIGGER trg_Ticket_BI_WeatherClosed BEFORE INSERT ON Ticket
FOR EACH ROW PRECEDES trg_Ticket_BI
BEGIN
    IF NEW.VisitDate = CURDATE() AND fn_ParkClosedByWeather(NOW()) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tickets for today are not on sale: weather has closed the park';
    END IF;
END$$

-- [RULE] No purchase is recorded while weather has closed the park.
CREATE TRIGGER trg_Purchase_BI_WeatherClosed BEFORE INSERT ON Purchase
FOR EACH ROW PRECEDES trg_Purchase_BI
BEGIN
    IF fn_ParkClosedByWeather(NEW.PurchasedAt) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchases are paused: weather has closed the park';
    END IF;
END$$

-- [RULE] No game play is recorded while weather has closed the park.
CREATE TRIGGER trg_GamePlay_BI_WeatherClosed BEFORE INSERT ON GamePlay
FOR EACH ROW PRECEDES trg_GamePlay_BI
BEGIN
    IF fn_ParkClosedByWeather(NEW.PlayedAt) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Games are closed: weather has closed the park';
    END IF;
END$$

DELIMITER ;
