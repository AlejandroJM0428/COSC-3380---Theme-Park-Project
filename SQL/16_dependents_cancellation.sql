-- 16_dependents_cancellation.sql
-- Stage 1 of dependents and membership cancellation requests: tables and the rules on them.
--   Customer.ParentCustomerID        links a dependent (a child under 18) to the parent who added them.
--   sp_AssertDependent               the rules for a dependent, called by the two triggers below.
--   trg_Customer_BI_Dependent        BEFORE INSERT on Customer. Checks the parent link on a new dependent.
--   trg_Customer_BU_Dependent        BEFORE UPDATE on Customer. Checks it again only when the parent or birth date changes.
--   DependentConsent                 one row per dependent: which parent agreed, and when.
--   MembershipCancellationRequest    a member's request to cancel; a manager approves or rejects it.
-- The dependent discount (stage 2) is added to this same file later.
-- A dependent is an ordinary Customer row with no login, so ride height checks and headcount work with no change.
-- Collected for a dependent: first name, date of birth, height. Nothing else.
-- Safe to run more than once. Does not delete or change existing rows.
-- REQUIRES the schema, 04_staff_roles_and_costs.sql (AppUser) and 15_price_update.sql applied first.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/16_dependents_cancellation.sql
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
--   the dependent is under 18 (birth date after today minus 18 years);
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
