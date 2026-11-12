-- 17_shift_hours_cap.sql: the 40-hour rule on ACTUAL hours worked.
-- Until now the only 40-hour rule was CHK_Emp_Hours, on scheduled hours (Employee.HoursPerWeek). Clocked hours were unchecked,
-- so someone could clock 50 in a week. This adds the check to sp_AssertShift, which trg_Shift_BI, trg_Shift_BU, the shifts route
-- and the Row Editor already go through. No new trigger: the trigger count stays 32.
--
-- [RULE] A shift is refused when it would take the employee over 40 hours in its week.
--   - The week is Monday 00:00 to Sunday 23:59:59 and a shift belongs to the week it CLOCKS IN (a Sunday-night shift counts in
--     the week it started). This is the same week as YEARWEEK(ClockIn, 1) in SQL/tools/verify_history.sql and in the generator.
--   - Hours are summed in seconds, so exactly 40:00:00 is allowed and 40 hours and 1 second is refused.
--   - An open shift (no ClockOut) counts up to now. A shift that starts in the future counts as 0 until it has started.
--   - When a shift is edited, its old row is left out of the sum (p_self), so shortening a shift or changing only its end is fine.
--   - There is no overtime pay and no labour cost anywhere: this rule only refuses.
--   - Two people saving at the same moment can both pass the check (no lock is taken). Acceptable at this project's scale.
-- The overlap and hire-date checks are unchanged. Safe to run twice. Run it AGAIN after anyone re-runs the schema file: that puts
-- the old sp_AssertShift back and the 40-hour rule disappears.
USE theme_park;

DROP PROCEDURE IF EXISTS sp_AssertShift;

DELIMITER $$

CREATE PROCEDURE sp_AssertShift(IN p_self INT UNSIGNED, IN p_emp INT UNSIGNED,
                                IN p_in DATETIME, IN p_out DATETIME)
BEGIN
    DECLARE v_hired DATE;
    DECLARE v_week_start DATETIME;
    DECLARE v_other_sec BIGINT DEFAULT 0;
    DECLARE v_this_sec BIGINT DEFAULT 0;
    SELECT HireDate INTO v_hired FROM Employee WHERE EmployeeID = p_emp;
    IF DATE(p_in) < v_hired THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shift starts before the hire date';
    END IF;
    IF EXISTS (SELECT 1 FROM Shift s
                WHERE s.EmployeeID = p_emp
                  AND s.ShiftID <> p_self
                  AND p_in < COALESCE(s.ClockOut, '9999-12-31 23:59:59')
                  AND COALESCE(p_out, '9999-12-31 23:59:59') > s.ClockIn) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shift overlaps another shift for this employee';
    END IF;
    -- 40-hour rule on clocked hours, Monday to Sunday, by the week of the clock-in.
    SET v_week_start = DATE_SUB(DATE(p_in), INTERVAL WEEKDAY(p_in) DAY);
    SELECT COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(SECOND, s.ClockIn, COALESCE(s.ClockOut, NOW())))), 0) INTO v_other_sec
      FROM Shift s
     WHERE s.EmployeeID = p_emp
       AND s.ShiftID <> p_self
       AND s.ClockIn >= v_week_start
       AND s.ClockIn <  DATE_ADD(v_week_start, INTERVAL 7 DAY);
    SET v_this_sec = GREATEST(0, TIMESTAMPDIFF(SECOND, p_in, COALESCE(p_out, NOW())));
    IF v_other_sec + v_this_sec > 144000 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee would work more than 40 hours this week (Monday to Sunday)';
    END IF;
END$$

DELIMITER ;
