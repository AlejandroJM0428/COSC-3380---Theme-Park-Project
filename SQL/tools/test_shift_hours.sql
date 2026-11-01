-- test_shift_hours.sql: boundary test for the 40-hour rule (SQL/17_shift_hours_cap.sql).
--   mysql theme_park < SQL/tools/test_shift_hours.sql
-- Uses the first active employee and a week in January 2030 that holds no data, inside a transaction that is rolled back.
-- Prints one row per case and a last row that says ALL PASS or FAIL. Changes nothing. Needs files 11 and 17 (the shift triggers).
USE theme_park;
DROP PROCEDURE IF EXISTS sp_Test_ShiftHours;
DELIMITER $$
CREATE PROCEDURE sp_Test_ShiftHours()
BEGIN
    DECLARE v_emp INT UNSIGNED;
    DECLARE v_msg TEXT DEFAULT NULL;
    DECLARE CONTINUE HANDLER FOR SQLSTATE '45000' GET DIAGNOSTICS CONDITION 1 v_msg = MESSAGE_TEXT;
    DROP TEMPORARY TABLE IF EXISTS t_result;
    CREATE TEMPORARY TABLE t_result (n INT AUTO_INCREMENT PRIMARY KEY, test VARCHAR(90), expected VARCHAR(10), got VARCHAR(10)) ENGINE = MEMORY;
    SELECT EmployeeID INTO v_emp FROM Employee WHERE IsActive = 1 ORDER BY EmployeeID LIMIT 1;
    START TRANSACTION;

    -- Monday to Friday, 8 hours each: the fifth one ends the week at exactly 40:00:00
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-07 08:00:00', '2030-01-07 16:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Mon 8h (8.00 h)', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-08 08:00:00', '2030-01-08 16:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Tue 8h (16.00 h)', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-09 08:00:00', '2030-01-09 16:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Wed 8h (24.00 h)', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-10 08:00:00', '2030-01-10 16:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Thu 8h (32.00 h)', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-11 08:00:00', '2030-01-11 16:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Fri 8h: week is exactly 40.00 h', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));

    -- over the line
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-12 08:00:00', '2030-01-12 08:00:36');
    INSERT INTO t_result (test, expected, got) VALUES ('Sat 36 s: week would be 40.01 h', 'refused', IF(v_msg IS NULL, 'allowed', IF(v_msg LIKE '%more than 40 hours%', 'refused', 'other')));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-12 08:00:00', '2030-01-12 08:00:01');
    INSERT INTO t_result (test, expected, got) VALUES ('Sat 1 s: week would be 40 h and 1 s', 'refused', IF(v_msg IS NULL, 'allowed', IF(v_msg LIKE '%more than 40 hours%', 'refused', 'other')));

    -- edits: lengthening is refused, shortening is fine and the shift does not count against itself
    SET v_msg = NULL; UPDATE Shift SET ClockOut = '2030-01-11 17:00:00' WHERE EmployeeID = v_emp AND ClockIn = '2030-01-11 08:00:00';
    INSERT INTO t_result (test, expected, got) VALUES ('Edit Fri to 9 h: would be 41.00 h', 'refused', IF(v_msg IS NULL, 'allowed', IF(v_msg LIKE '%more than 40 hours%', 'refused', 'other')));
    SET v_msg = NULL; UPDATE Shift SET ClockOut = '2030-01-07 15:00:00' WHERE EmployeeID = v_emp AND ClockIn = '2030-01-07 08:00:00';
    INSERT INTO t_result (test, expected, got) VALUES ('Edit Mon to 7 h (week 39.00 h)', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-12 08:00:00', '2030-01-12 09:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Sat 1 h: week is exactly 40.00 h again', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-12 10:00:00', '2030-01-12 10:00:36');
    INSERT INTO t_result (test, expected, got) VALUES ('Sat 36 s more: 40.01 h', 'refused', IF(v_msg IS NULL, 'allowed', IF(v_msg LIKE '%more than 40 hours%', 'refused', 'other')));

    -- a rating alone is always fine, and the Sunday before the Monday belongs to the previous week
    SET v_msg = NULL; UPDATE Shift SET ShiftRating = 4 WHERE EmployeeID = v_emp AND ClockIn = '2030-01-07 08:00:00';
    INSERT INTO t_result (test, expected, got) VALUES ('Rating only on a full week', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-06 08:00:00', '2030-01-06 16:00:00');
    INSERT INTO t_result (test, expected, got) VALUES ('Sunday before: previous week, starts from zero', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));

    -- an open shift that has not started yet counts as 0 (last, because an open shift overlaps everything after it)
    SET v_msg = NULL; INSERT INTO Shift (EmployeeID, ClockIn, ClockOut) VALUES (v_emp, '2030-01-13 12:00:00', NULL);
    INSERT INTO t_result (test, expected, got) VALUES ('Sun open shift in the future counts 0 (week stays 40.00 h)', 'allowed', IF(v_msg IS NULL, 'allowed', 'refused'));

    ROLLBACK;
END$$
DELIMITER ;
CALL sp_Test_ShiftHours();
SELECT n, test, expected, got, IF(expected = got, 'PASS', 'FAIL') AS result FROM t_result ORDER BY n;
SELECT IF(SUM(expected <> got) = 0, CONCAT('ALL PASS (', COUNT(*), ' cases)'), CONCAT('FAIL (', SUM(expected <> got), ' of ', COUNT(*), ')')) AS summary FROM t_result;
DROP TEMPORARY TABLE IF EXISTS t_result;
DROP PROCEDURE IF EXISTS sp_Test_ShiftHours;
