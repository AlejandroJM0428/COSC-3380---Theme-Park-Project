-- 26_cashier_rules.sql: patch 08, three more business rules. Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/26_cashier_rules.sql
-- Rule 3: only guests 21 or older can be sold alcohol (Food & Shop Purchases).
-- Rule 4: at most 8 alcoholic drinks per ticket per day (Food & Shop Purchases).
-- Rule 5: a membership holder must be 18 or older (Memberships, and the member portal).
-- Each compares against another table (Item, Customer, earlier Purchase rows) or today's date, so none can be a CHECK.
-- Checked against the live data first: 0 alcohol rows to under-21 guests, and the most alcohol on one ticket in one day is 6.
USE theme_park;

DROP TRIGGER IF EXISTS trg_Purchase_BI_Alcohol21;
DROP TRIGGER IF EXISTS trg_Purchase_BU_Alcohol21;
DROP TRIGGER IF EXISTS trg_Purchase_BI_DrinkLimit;
DROP TRIGGER IF EXISTS trg_Purchase_BU_DrinkLimit;
DROP TRIGGER IF EXISTS trg_Membership_BI_Adult;

DELIMITER $$

-- [RULE 3] Alcohol only to guests 21 or older, measured on the day of the purchase.
CREATE TRIGGER trg_Purchase_BI_Alcohol21 BEFORE INSERT ON Purchase
FOR EACH ROW FOLLOWS trg_Purchase_BI
BEGIN
    DECLARE v_alc BOOL;
    DECLARE v_dob DATE;
    SELECT IsAlcoholic INTO v_alc FROM Item WHERE ItemID = NEW.ItemID;
    IF v_alc = 1 THEN
        SELECT c.DOB INTO v_dob FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID WHERE t.TicketID = NEW.TicketID;
        IF v_dob IS NOT NULL AND v_dob > DATE(NEW.PurchasedAt) - INTERVAL 21 YEAR THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alcohol can only be sold to guests who are 21 or older.';
        END IF;
    END IF;
END$$

-- Same rule when a purchase is corrected (another item, ticket or time).
CREATE TRIGGER trg_Purchase_BU_Alcohol21 BEFORE UPDATE ON Purchase
FOR EACH ROW FOLLOWS trg_Purchase_BU
BEGIN
    DECLARE v_alc BOOL;
    DECLARE v_dob DATE;
    IF NOT (OLD.ItemID <=> NEW.ItemID AND OLD.TicketID <=> NEW.TicketID AND OLD.PurchasedAt <=> NEW.PurchasedAt) THEN
        SELECT IsAlcoholic INTO v_alc FROM Item WHERE ItemID = NEW.ItemID;
        IF v_alc = 1 THEN
            SELECT c.DOB INTO v_dob FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID WHERE t.TicketID = NEW.TicketID;
            IF v_dob IS NOT NULL AND v_dob > DATE(NEW.PurchasedAt) - INTERVAL 21 YEAR THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alcohol can only be sold to guests who are 21 or older.';
            END IF;
        END IF;
    END IF;
END$$

-- [RULE 4] At most 8 alcoholic drinks per ticket per day (counts the earlier purchases on the same ticket and day).
CREATE TRIGGER trg_Purchase_BI_DrinkLimit BEFORE INSERT ON Purchase
FOR EACH ROW FOLLOWS trg_Purchase_BI
BEGIN
    DECLARE v_alc  BOOL;
    DECLARE v_have INT;
    SELECT IsAlcoholic INTO v_alc FROM Item WHERE ItemID = NEW.ItemID;
    IF v_alc = 1 THEN
        SELECT COALESCE(SUM(p.Quantity), 0) INTO v_have
          FROM Purchase p JOIN Item i ON i.ItemID = p.ItemID
         WHERE p.TicketID = NEW.TicketID AND i.IsAlcoholic = 1
           AND DATE(p.PurchasedAt) = DATE(NEW.PurchasedAt);
        IF v_have + NEW.Quantity > 8 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Drink limit reached: at most 8 alcoholic drinks per ticket per day.';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_Purchase_BU_DrinkLimit BEFORE UPDATE ON Purchase
FOR EACH ROW FOLLOWS trg_Purchase_BU
BEGIN
    DECLARE v_alc  BOOL;
    DECLARE v_have INT;
    IF NOT (OLD.ItemID <=> NEW.ItemID AND OLD.TicketID <=> NEW.TicketID
            AND OLD.PurchasedAt <=> NEW.PurchasedAt AND OLD.Quantity <=> NEW.Quantity) THEN
        SELECT IsAlcoholic INTO v_alc FROM Item WHERE ItemID = NEW.ItemID;
        IF v_alc = 1 THEN
            SELECT COALESCE(SUM(p.Quantity), 0) INTO v_have
              FROM Purchase p JOIN Item i ON i.ItemID = p.ItemID
             WHERE p.TicketID = NEW.TicketID AND i.IsAlcoholic = 1
               AND DATE(p.PurchasedAt) = DATE(NEW.PurchasedAt) AND p.PurchaseID <> NEW.PurchaseID;
            IF v_have + NEW.Quantity > 8 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Drink limit reached: at most 8 alcoholic drinks per ticket per day.';
            END IF;
        END IF;
    END IF;
END$$

-- [RULE 5] A membership holder must be 18 or older (birth date lives in Customer; the limit moves with today's date).
-- Runs before trg_Membership_BI, so a child is refused before overlap and price are worked out.
CREATE TRIGGER trg_Membership_BI_Adult BEFORE INSERT ON Membership
FOR EACH ROW PRECEDES trg_Membership_BI
BEGIN
    DECLARE v_dob DATE;
    SELECT DOB INTO v_dob FROM Customer WHERE CustomerID = NEW.CustomerID;
    IF v_dob IS NOT NULL AND v_dob > CURDATE() - INTERVAL 18 YEAR THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A membership holder must be 18 or older.';
    END IF;
END$$

DELIMITER ;

-- Proof the new triggers are in place, and that existing data already follows the rules (the counts must be 0).
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE AS table_name, EVENT_MANIPULATION AS event
  FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME IN
       ('trg_Purchase_BI_Alcohol21','trg_Purchase_BU_Alcohol21','trg_Purchase_BI_DrinkLimit','trg_Purchase_BU_DrinkLimit','trg_Membership_BI_Adult')
 ORDER BY TRIGGER_NAME;
SELECT 'alcohol to under-21' AS check_name, COUNT(*) AS violations
  FROM Purchase p JOIN Item i ON i.ItemID = p.ItemID JOIN Ticket t ON t.TicketID = p.TicketID JOIN Customer c ON c.CustomerID = t.CustomerID
 WHERE i.IsAlcoholic = 1 AND c.DOB > DATE(p.PurchasedAt) - INTERVAL 21 YEAR
UNION ALL
SELECT 'memberships held by under-18', COUNT(*)
  FROM Membership m JOIN Customer c ON c.CustomerID = m.CustomerID
 WHERE c.DOB > CURDATE() - INTERVAL 18 YEAR;
