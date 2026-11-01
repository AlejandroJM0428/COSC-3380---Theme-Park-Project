-- 14_purchase_guards.sql
-- Two new triggers for the customer portal, plus the small table the second one writes to:
--   1. trg_Ticket_BI_Guard        BEFORE INSERT on Ticket. Stops accidental double-bookings and ticket spam.
--   2. trg_Membership_AI_Welcome  AFTER INSERT on Membership. Grants the welcome perks for the tier.
--   MemberPerk                    one row per perk a membership has unlocked.
-- Safe to run more than once. Does not delete or change existing rows (it only ADDS perks for current members).
-- REQUIRES the schema (trg_Ticket_BI) and 05_notifications.sql.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/14_purchase_guards.sql
-- Test on a copy of the database first.
USE theme_park;

-- [TABLE] MemberPerk: perks unlocked by a membership. Written by trg_Membership_AI_Welcome, read by the portal.
-- [CONSTRAINT] A perk is granted once per membership. Deleting a membership removes its perks.
CREATE TABLE IF NOT EXISTS MemberPerk (
    PerkID       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    MembershipID INT UNSIGNED NOT NULL,
    PerkName     VARCHAR(80) NOT NULL,
    GrantedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT PK_MemberPerk PRIMARY KEY (PerkID),
    CONSTRAINT UQ_MemberPerk UNIQUE (MembershipID, PerkName),
    CONSTRAINT FK_MemberPerk_Membership FOREIGN KEY (MembershipID) REFERENCES Membership (MembershipID) ON DELETE CASCADE
) ENGINE = InnoDB;

DROP TRIGGER IF EXISTS trg_Ticket_BI_Guard;
DROP TRIGGER IF EXISTS trg_Membership_AI_Welcome;

DELIMITER $$

-- [RULE] Ticket insert (runs BEFORE trg_Ticket_BI): a live purchase is refused when
--   (a) the same customer already booked a ticket for the same visit date in the last minute (a double click), or
--   (b) the same customer has booked 5 or more tickets in the last 10 minutes (spam).
-- Refunded tickets do not count. Only purchases stamped within the last 5 minutes are checked, so seed data and
-- back-dated rows are not affected. The customer row is locked first, so two clicks that arrive at the same
-- moment are handled one after the other and the second one sees the first.
CREATE TRIGGER trg_Ticket_BI_Guard BEFORE INSERT ON Ticket
FOR EACH ROW PRECEDES trg_Ticket_BI
BEGIN
    DECLARE v_lock   INT UNSIGNED;
    DECLARE v_recent INT UNSIGNED;
    IF NEW.PurchaseDate >= NOW() - INTERVAL 5 MINUTE THEN
        SELECT CustomerID INTO v_lock FROM Customer WHERE CustomerID = NEW.CustomerID FOR UPDATE;

        IF EXISTS (SELECT 1 FROM Ticket t
                    WHERE t.CustomerID = NEW.CustomerID
                      AND t.VisitDate = NEW.VisitDate
                      AND t.PurchaseDate >= NOW() - INTERVAL 1 MINUTE
                      AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You just booked a ticket for that date. Check My Tickets before booking another.';
        END IF;

        SELECT COUNT(*) INTO v_recent FROM Ticket t
         WHERE t.CustomerID = NEW.CustomerID
           AND t.PurchaseDate >= NOW() - INTERVAL 10 MINUTE
           AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);
        IF v_recent >= 5 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Too many tickets too quickly. Please wait a few minutes and try again.';
        END IF;
    END IF;
END$$

-- [RULE] Membership insert: grant the welcome perks for the tier.
-- Basic = welcome pin. Plus = pin + free parking day. Premier = pin + free parking day + VIP photo session.
-- INSERT IGNORE plus UQ_MemberPerk means a perk is never granted twice.
CREATE TRIGGER trg_Membership_AI_Welcome AFTER INSERT ON Membership
FOR EACH ROW
BEGIN
    INSERT IGNORE INTO MemberPerk (MembershipID, PerkName) VALUES (NEW.MembershipID, 'Welcome pin');
    IF NEW.Tier IN ('Plus', 'Premier') THEN
        INSERT IGNORE INTO MemberPerk (MembershipID, PerkName) VALUES (NEW.MembershipID, 'Free parking day');
    END IF;
    IF NEW.Tier = 'Premier' THEN
        INSERT IGNORE INTO MemberPerk (MembershipID, PerkName) VALUES (NEW.MembershipID, 'VIP photo session');
    END IF;
END$$

DELIMITER ;

-- Members who joined before this trigger existed get the same perks (current memberships only). Safe to repeat.
INSERT IGNORE INTO MemberPerk (MembershipID, PerkName)
SELECT m.MembershipID, 'Welcome pin' FROM Membership m WHERE CURDATE() BETWEEN m.StartDate AND m.EndDate;
INSERT IGNORE INTO MemberPerk (MembershipID, PerkName)
SELECT m.MembershipID, 'Free parking day' FROM Membership m WHERE m.Tier IN ('Plus', 'Premier') AND CURDATE() BETWEEN m.StartDate AND m.EndDate;
INSERT IGNORE INTO MemberPerk (MembershipID, PerkName)
SELECT m.MembershipID, 'VIP photo session' FROM Membership m WHERE m.Tier = 'Premier' AND CURDATE() BETWEEN m.StartDate AND m.EndDate;
