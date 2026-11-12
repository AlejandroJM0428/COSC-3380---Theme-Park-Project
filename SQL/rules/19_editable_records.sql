-- 19_editable_records.sql
-- Purchases, game plays and ride log entries can now be corrected from the data entry forms (TA feedback: every
-- managed entity needs create, update and delete). 11_restore_triggers.sql made these rows read-only with three
-- BEFORE UPDATE triggers that refused every edit. This file replaces those three triggers:
--   trg_Purchase_BU   BEFORE UPDATE on Purchase
--   trg_GamePlay_BU   BEFORE UPDATE on GamePlay
--   trg_RideLog_BU    BEFORE UPDATE on RideLog
-- An edit now has to pass the same rules as a new row, but only for the part that changed:
--   * a new ticket or a new time -> the ticket must exist, not be refunded, match the date and fall in park hours
--   * a new item / game / ride   -> it must still be in service, and not be under maintenance at that time
--   * a new item / game          -> the price is copied from it again; otherwise the price the guest paid stays as it was
--   * ride log boardings         -> the same height, weather, maintenance and Express checks as a new boarding
-- The price columns (UnitPrice, AmountPaid) can never be typed in: the trigger sets them.
-- Safe to run more than once. Does not delete or change any rows.
-- REQUIRES the schema (sp_AssertTicketValid, fn_UnderMaintenance) and 11_restore_triggers.sql.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/rules/19_editable_records.sql
-- Test on a copy of the database first.
USE theme_park;

DROP TRIGGER IF EXISTS trg_Purchase_BU;
DROP TRIGGER IF EXISTS trg_GamePlay_BU;
DROP TRIGGER IF EXISTS trg_RideLog_BU;

DELIMITER $$

-- [RULE] Purchase edit: same checks as a new purchase for whatever changed; the price follows the item.
CREATE TRIGGER trg_Purchase_BU BEFORE UPDATE ON Purchase
FOR EACH ROW
BEGIN
    DECLARE v_venue  INT UNSIGNED;
    DECLARE v_price  DECIMAL(8,2);
    DECLARE v_active BOOL;

    IF NOT (OLD.TicketID <=> NEW.TicketID AND OLD.PurchasedAt <=> NEW.PurchasedAt) THEN
        CALL sp_AssertTicketValid(NEW.TicketID, NEW.PurchasedAt);
    END IF;

    IF NOT (OLD.ItemID <=> NEW.ItemID AND OLD.PurchasedAt <=> NEW.PurchasedAt) THEN
        SELECT i.VenueID, i.Price, (i.IsActive = 1 AND v.IsActive = 1) INTO v_venue, v_price, v_active
          FROM Item i JOIN Venue v ON v.VenueID = i.VenueID WHERE i.ItemID = NEW.ItemID;
        IF v_venue IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item does not exist';
        END IF;
        IF NOT (OLD.ItemID <=> NEW.ItemID) AND v_active = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item is no longer sold';
        END IF;
        IF fn_UnderMaintenance('Venue', v_venue, NEW.PurchasedAt) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Venue was under maintenance';
        END IF;
    END IF;

    IF OLD.ItemID <=> NEW.ItemID THEN
        SET NEW.UnitPrice = OLD.UnitPrice;
    ELSE
        SET NEW.UnitPrice = v_price;
    END IF;
END$$

-- [RULE] Game play edit: same checks as a new play for whatever changed; the amount follows the game.
CREATE TRIGGER trg_GamePlay_BU BEFORE UPDATE ON GamePlay
FOR EACH ROW
BEGIN
    DECLARE v_price  DECIMAL(6,2);
    DECLARE v_active BOOL;

    IF NOT (OLD.TicketID <=> NEW.TicketID AND OLD.PlayedAt <=> NEW.PlayedAt) THEN
        CALL sp_AssertTicketValid(NEW.TicketID, NEW.PlayedAt);
    END IF;

    SELECT PlayPrice, IsActive INTO v_price, v_active FROM Game WHERE GameID = NEW.GameID;

    IF NOT (OLD.GameID <=> NEW.GameID AND OLD.PlayedAt <=> NEW.PlayedAt) THEN
        IF fn_UnderMaintenance('Game', NEW.GameID, NEW.PlayedAt) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game was under maintenance';
        END IF;
    END IF;
    IF NOT (OLD.GameID <=> NEW.GameID) AND v_active = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game is no longer in service';
    END IF;

    IF OLD.GameID <=> NEW.GameID THEN
        SET NEW.AmountPaid = OLD.AmountPaid;
    ELSE
        SET NEW.AmountPaid = v_price;
    END IF;
END$$

-- [RULE] Ride log edit: a changed boarding is checked like a new boarding; a changed wait time needs no check.
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

DELIMITER ;
