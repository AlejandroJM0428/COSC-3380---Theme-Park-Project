-- 08_simplify_triggers.sql
-- Drops every trigger except the six INSERT triggers in theme-park-schema.sql.
-- Safe to run more than once. Does not delete rows.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/08_simplify_triggers.sql
--
-- Rules no longer enforced by a MySQL trigger, and where they live now:
--   Membership overlap and price on edit: the membership route calls sp_AssertNoMembershipOverlap
--     and copies AnnualPrice from MembershipTier.
--   Ticket edit after the ticket has activity, and the edited price: the ticket route calls
--     sp_AssertTicketRules and fn_TicketPrice. New tickets are still trg_Ticket_BI.
--   Weather edits recompute ClosesOutdoorRides with fn_WeatherCloses in the weather route.
--     New readings are still trg_WeatherLog_BI.
--   Shift overlap and hire date: the shift route calls sp_AssertShift, and rejects an inactive employee.
--   Maintenance crew: the maintenance route allows only an active technician.
--   Closing a job without a repair cost: the maintenance route rejects it. MySQL does not.
--   Ride.Status is no longer refreshed. Live state is fn_UnderMaintenance() and v_RideAvailability.
--     The Status column stays so existing rows and inserts remain valid.
--   RideLog, GamePlay, Purchase and TicketRefund have no edit route. A direct SQL UPDATE is no longer refused.
--   Ticket refunds dated before the purchase, and weather refunds for a storm that did not close rides,
--     are no longer refused by MySQL. The staff and visitor refund routes insert the current time and no weather id.
--   Ride certification (operators only, not before the hire date) is no longer checked. There is no edit page for it.
--   Sold-out, weather and maintenance-closed homepage notices are no longer posted by triggers.
--     Staff still add Promo rows on Promos & Notices.
USE theme_park;

DROP TRIGGER IF EXISTS trg_Membership_BU;
DROP TRIGGER IF EXISTS trg_Ticket_BU;
DROP TRIGGER IF EXISTS trg_Maint_AI;
DROP TRIGGER IF EXISTS trg_Maint_AU;
DROP TRIGGER IF EXISTS trg_MaintCrew_BI;
DROP TRIGGER IF EXISTS trg_RideCert_BI;
DROP TRIGGER IF EXISTS trg_Shift_BI;
DROP TRIGGER IF EXISTS trg_Shift_BU;
DROP TRIGGER IF EXISTS trg_TicketRefund_BI;
DROP TRIGGER IF EXISTS trg_WeatherLog_BU;
DROP TRIGGER IF EXISTS trg_RideLog_BU;
DROP TRIGGER IF EXISTS trg_GamePlay_BU;
DROP TRIGGER IF EXISTS trg_Purchase_BU;
DROP TRIGGER IF EXISTS trg_TicketRefund_BU;
DROP TRIGGER IF EXISTS trg_Ticket_AI_Notify;
DROP TRIGGER IF EXISTS trg_WeatherLog_AI_Notify;
DROP TRIGGER IF EXISTS trg_Maint_AU_Notify;
DROP TRIGGER IF EXISTS trg_Maint_BU_Cost;

DROP EVENT IF EXISTS ev_RefreshRideStatus;
DROP PROCEDURE IF EXISTS sp_RefreshRideStatus;

DROP PROCEDURE IF EXISTS sp_AssertTicketRules;

DELIMITER $$

CREATE PROCEDURE sp_AssertTicketRules(IN p_customer INT UNSIGNED, IN p_membership INT UNSIGNED,
                                      IN p_visit DATE, IN p_self INT UNSIGNED, OUT p_express BOOL)
BEGIN
    DECLARE v_max   INT UNSIGNED;
    DECLARE v_sold  INT UNSIGNED;
    DECLARE v_cust  INT UNSIGNED;
    DECLARE v_start DATE;
    DECLARE v_end   DATE;
    DECLARE v_any   BOOL;
    SET p_express = 0;

    IF NOT EXISTS (SELECT 1 FROM Customer WHERE CustomerID = p_customer AND IsActive = 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer is inactive or does not exist';
    END IF;

    SELECT MaxOccupancy INTO v_max FROM Park WHERE ParkID = 1 FOR UPDATE;
    IF v_max IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Park is not set up';
    END IF;
    SELECT COUNT(*) INTO v_sold FROM Ticket t
     WHERE t.VisitDate = p_visit AND t.TicketID <> p_self
       AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);
    IF v_sold >= v_max THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Park is at capacity for that date';
    END IF;

    IF p_membership IS NOT NULL THEN
        SELECT CustomerID, StartDate, EndDate, IncludesExpress, AnyDayAccess INTO v_cust, v_start, v_end, p_express, v_any
          FROM Membership WHERE MembershipID = p_membership;
        IF v_cust IS NULL OR v_cust <> p_customer THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Membership does not belong to this customer';
        END IF;
        IF p_visit < v_start OR p_visit > v_end THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Membership is not active on the visit date';
        END IF;
        IF v_any = 0 AND DAYOFWEEK(p_visit) IN (1, 7) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This membership tier is valid on weekdays only';
        END IF;
    END IF;
END$$

DELIMITER ;
