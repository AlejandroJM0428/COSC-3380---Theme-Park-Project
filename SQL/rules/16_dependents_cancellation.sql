-- 16_dependents_cancellation.sql
-- Stage 1 of dependents and membership cancellation requests: tables and the rules on them.
--   Customer.ParentCustomerID        links a dependent (a child under 18) to the parent who added them.
--   sp_AssertDependent               the rules for a dependent, called by the two triggers below.
--   trg_Customer_BI_Dependent        BEFORE INSERT on Customer. Checks the parent link on a new dependent.
--   trg_Customer_BU_Dependent        BEFORE UPDATE on Customer. Checks it again only when the parent or birth date changes.
--   DependentConsent                 one row per dependent: which parent agreed, and when.
--   MembershipCancellationRequest    a member's request to cancel; a manager approves or rejects it.
--   fn_DependentDiscountPct          THE ONE PLACE for the discount percentages (change them there, nowhere else).
--   fn_DependentDiscount             the discount in dollars for one ticket.
--   trg_Ticket_BI, trg_Ticket_BU     REDEFINED here: same as before, plus the dependent discount on the price.
-- Dependent pricing: under 3 on the visit date = free day pass; otherwise 35% off when the parent has a membership
-- active on the visit date, else 20% off. It applies to the day pass only (the Express add-on is full price) and only
-- to a ticket with no membership of its own. The database sets the price, so the browser cannot change it.
-- trg_Ticket_BU is also defined in 11_restore_triggers.sql and trg_Ticket_BI in the schema file. If either of those
-- is run again on a live database, run this file again afterwards to put the discount back.
-- A dependent is an ordinary Customer row with no login, so ride height checks and headcount work with no change.
-- Collected for a dependent: first name, date of birth, height. Nothing else.
-- Safe to run more than once. Does not delete or change existing rows.
-- REQUIRES the schema, 04_staff_roles_and_costs.sql (AppUser) and 15_price_update.sql applied first.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/rules/16_dependents_cancellation.sql
-- Test on a copy of the database first.
USE theme_park;

-- [RULE] Customer.ParentCustomerID: NULL for a normal customer, the parent's CustomerID for a dependent.
-- [CONSTRAINT] The parent must exist (FK, no cascade). UQ_Customer_Parent exists so DependentConsent can point at the
-- exact (dependent, parent) pair. One ALTER adds the column, the key and the FK together; MySQL applies it as a unit.
SET @has_col = (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customer' AND COLUMN_NAME = 'ParentCustomerID');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE Customer
     ADD COLUMN ParentCustomerID INT UNSIGNED NULL,
     ADD CONSTRAINT UQ_Customer_Parent UNIQUE (CustomerID, ParentCustomerID),
     ADD CONSTRAINT FK_Customer_Parent FOREIGN KEY (ParentCustomerID) REFERENCES Customer (CustomerID)',
  'DO 0');
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

-- [TABLE] DependentConsent: the parent's consent for one dependent. Stores no personal data about the child.
-- [CONSTRAINT] One consent row per dependent. The FK names the (dependent, parent) pair, so a consent can only name
-- the dependent's real parent. Deleting the dependent's Customer row removes the consent.
CREATE TABLE IF NOT EXISTS DependentConsent (
    CustomerID       INT UNSIGNED NOT NULL,
    ParentCustomerID INT UNSIGNED NOT NULL,
    ConsentedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT PK_DependentConsent PRIMARY KEY (CustomerID),
    CONSTRAINT FK_DependentConsent_Link FOREIGN KEY (CustomerID, ParentCustomerID)
        REFERENCES Customer (CustomerID, ParentCustomerID) ON DELETE CASCADE
) ENGINE = InnoDB;

-- [TABLE] MembershipCancellationRequest: a request is kept as a record, never deleted. Status is Pending until a
-- manager decides. Approving it (done by the server in stage 4) turns off auto-renew; the membership still runs to its
-- end date and nothing is refunded.
-- [CONSTRAINT] A reason is required. A Pending request has no decision; a decided one has a time and a deciding user.
-- A membership can have only one Pending request at a time (PendingMembershipID is unique and is NULL once decided).
-- The membership FK has no cascade because a stored generated column is built on MembershipID, which MySQL does not
-- allow with CASCADE. A membership that has a request therefore cannot be deleted, which keeps the history.
CREATE TABLE IF NOT EXISTS MembershipCancellationRequest (
    RequestID          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    MembershipID       INT UNSIGNED NOT NULL,
    RequestedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Reason             VARCHAR(200) NOT NULL,
    Status             ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    DecidedAt          DATETIME NULL,
    DecidedByUserID    INT UNSIGNED NULL,
    DecisionNote       VARCHAR(200) NULL,
    PendingMembershipID INT UNSIGNED GENERATED ALWAYS AS (IF(Status = 'Pending', MembershipID, NULL)) STORED,
    CONSTRAINT PK_CancelRequest PRIMARY KEY (RequestID),
    CONSTRAINT UQ_CancelRequest_Pending UNIQUE (PendingMembershipID),
    CONSTRAINT FK_CancelRequest_Membership FOREIGN KEY (MembershipID) REFERENCES Membership (MembershipID),
    CONSTRAINT FK_CancelRequest_User FOREIGN KEY (DecidedByUserID) REFERENCES AppUser (UserID),
    CONSTRAINT CHK_CancelRequest_Reason CHECK (CHAR_LENGTH(TRIM(Reason)) > 0),
    CONSTRAINT CHK_CancelRequest_Decision CHECK (
        (Status = 'Pending' AND DecidedAt IS NULL AND DecidedByUserID IS NULL)
        OR (Status <> 'Pending' AND DecidedAt IS NOT NULL AND DecidedByUserID IS NOT NULL))
) ENGINE = InnoDB;

DROP TRIGGER IF EXISTS trg_Customer_BI_Dependent;
DROP TRIGGER IF EXISTS trg_Customer_BU_Dependent;
DROP PROCEDURE IF EXISTS sp_AssertDependent;

DELIMITER $$

-- [RULE] sp_AssertDependent: when p_parent is not NULL the customer is a dependent, and
--   the parent is not the customer, exists and is active, and is not a dependent;
--   a customer who already has dependents cannot become one;
--   the birth date is not in the future, and the dependent is under 18 (birth date after today minus 18 years);
--   the parent has fewer than 6 other active dependents (an anonymised, inactive dependent frees a place).
-- p_self is the customer being saved (0 for a new row). The Park row is locked first (the same way
-- sp_AssertTicketRules does) so two adds at the same moment are handled one after the other and cannot both pass the
-- count. The Customer row cannot be locked here: MySQL refuses a locking read of the table a trigger is running on.
CREATE PROCEDURE sp_AssertDependent(IN p_self INT UNSIGNED, IN p_parent INT UNSIGNED, IN p_dob DATE)
BEGIN
    DECLARE v_pactive BOOL;
    DECLARE v_pparent INT UNSIGNED;
    DECLARE v_count   INT UNSIGNED;
    DECLARE v_lock    INT UNSIGNED;
    IF p_parent IS NOT NULL THEN
        SELECT ParkID INTO v_lock FROM Park WHERE ParkID = 1 FOR UPDATE;
        IF p_parent = p_self THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A customer cannot be their own parent.';
        END IF;
        SELECT IsActive, ParentCustomerID INTO v_pactive, v_pparent
          FROM Customer WHERE CustomerID = p_parent;
        IF v_pactive IS NULL OR v_pactive = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The parent must be an active customer.';
        END IF;
        IF v_pparent IS NOT NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A dependent cannot have dependents of their own.';
        END IF;
        IF p_self > 0 AND EXISTS (SELECT 1 FROM Customer WHERE ParentCustomerID = p_self) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A customer who has dependents cannot become a dependent.';
        END IF;
        IF p_dob > CURDATE() THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The birth date cannot be in the future.';
        END IF;
        IF p_dob <= DATE_SUB(CURDATE(), INTERVAL 18 YEAR) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A dependent must be under 18.';
        END IF;
        SELECT COUNT(*) INTO v_count FROM Customer
         WHERE ParentCustomerID = p_parent AND IsActive = 1 AND CustomerID <> p_self;
        IF v_count >= 6 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A parent can have at most 6 dependents.';
        END IF;
    END IF;
END$$

-- [RULE] Customer insert: a new dependent must pass sp_AssertDependent. A normal customer (no parent) is untouched.
CREATE TRIGGER trg_Customer_BI_Dependent BEFORE INSERT ON Customer
FOR EACH ROW
BEGIN
    CALL sp_AssertDependent(NEW.CustomerID, NEW.ParentCustomerID, NEW.DOB);
END$$

-- [RULE] Customer edit: the dependent rules run again only when the parent or the birth date changes, so renaming or
-- anonymising a dependent who has since turned 18 still works.
CREATE TRIGGER trg_Customer_BU_Dependent BEFORE UPDATE ON Customer
FOR EACH ROW
BEGIN
    IF NOT (OLD.ParentCustomerID <=> NEW.ParentCustomerID AND OLD.DOB <=> NEW.DOB) THEN
        CALL sp_AssertDependent(NEW.CustomerID, NEW.ParentCustomerID, NEW.DOB);
    END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------------------------------------------------
-- Dependent discount
-- ---------------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_Ticket_BI;
DROP TRIGGER IF EXISTS trg_Ticket_BU;
DROP FUNCTION IF EXISTS fn_DependentDiscount;
DROP FUNCTION IF EXISTS fn_DependentDiscountPct;

DELIMITER $$

-- [RULE] fn_DependentDiscountPct: percent off the day pass for this customer on this visit date.
-- 0 for anyone who is not a dependent. For a dependent: 100 when under 3 on the visit date, otherwise 35 when the
-- parent has a membership active on the visit date, otherwise 20.
-- CHANGE THE PERCENTAGES HERE: the three DECLARE lines are the only place they are written.
CREATE FUNCTION fn_DependentDiscountPct(p_customer INT UNSIGNED, p_visit DATE)
RETURNS DECIMAL(5,2)
READS SQL DATA
BEGIN
    DECLARE c_under3  DECIMAL(5,2) DEFAULT 100.00;
    DECLARE c_member  DECIMAL(5,2) DEFAULT 35.00;
    DECLARE c_regular DECIMAL(5,2) DEFAULT 20.00;
    DECLARE v_parent INT UNSIGNED;
    DECLARE v_dob    DATE;
    SELECT ParentCustomerID, DOB INTO v_parent, v_dob FROM Customer WHERE CustomerID = p_customer;
    IF v_parent IS NULL THEN
        RETURN 0;
    END IF;
    IF TIMESTAMPDIFF(YEAR, v_dob, p_visit) < 3 THEN
        RETURN c_under3;
    END IF;
    IF EXISTS (SELECT 1 FROM Membership WHERE CustomerID = v_parent AND p_visit BETWEEN StartDate AND EndDate) THEN
        RETURN c_member;
    END IF;
    RETURN c_regular;
END$$

-- [RULE] fn_DependentDiscount: the discount in dollars: the percent above applied to the day pass price, rounded to
-- cents. 0 when the ticket has a membership of its own (that ticket is already free) or the customer is not a dependent.
CREATE FUNCTION fn_DependentDiscount(p_customer INT UNSIGNED, p_membership INT UNSIGNED, p_visit DATE)
RETURNS DECIMAL(6,2)
READS SQL DATA
BEGIN
    DECLARE v_day DECIMAL(6,2);
    IF p_membership IS NOT NULL THEN
        RETURN 0;
    END IF;
    SELECT DayPassPrice INTO v_day FROM Park WHERE ParkID = 1;
    RETURN IFNULL(ROUND(v_day * fn_DependentDiscountPct(p_customer, p_visit) / 100, 2), 0);
END$$

-- [RULE] Ticket insert: capacity, membership checks, Express benefit, price (this was trg_Ticket_BI; the only change
-- is the discount taken off the price). trg_Ticket_BI_Guard still runs first.
CREATE TRIGGER trg_Ticket_BI BEFORE INSERT ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_exp BOOL;
    CALL sp_AssertTicketRules(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate, 0, v_exp);
    IF v_exp THEN
        SET NEW.HasExpress = 1;
    END IF;
    SET NEW.TicketPrice = GREATEST(0, fn_TicketPrice(NEW.MembershipID, NEW.HasExpress)
                                      - fn_DependentDiscount(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate));
END$$

-- [RULE] Ticket edit: a ticket with activity is frozen; otherwise the same checks and price as a new ticket (this was
-- trg_Ticket_BU from 11_restore_triggers.sql; the only change is the discount taken off the price).
CREATE TRIGGER trg_Ticket_BU BEFORE UPDATE ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_exp BOOL;
    IF NOT (OLD.CustomerID <=> NEW.CustomerID AND OLD.MembershipID <=> NEW.MembershipID
            AND OLD.VisitDate <=> NEW.VisitDate AND OLD.HasExpress <=> NEW.HasExpress) THEN
        IF EXISTS (SELECT 1 FROM RideLog  WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM GamePlay WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM Purchase WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM TicketRefund WHERE TicketID = OLD.TicketID) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket already has activity and cannot be changed';
        END IF;
        CALL sp_AssertTicketRules(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate, OLD.TicketID, v_exp);
        IF v_exp THEN
            SET NEW.HasExpress = 1;
        END IF;
    END IF;
    SET NEW.TicketPrice = GREATEST(0, fn_TicketPrice(NEW.MembershipID, NEW.HasExpress)
                                      - fn_DependentDiscount(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate));
END$$

DELIMITER ;
