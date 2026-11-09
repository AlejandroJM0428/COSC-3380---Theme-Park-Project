-- 20_employee_termination.sql: who left, when and why.
-- Adds Employee.TerminationDate and Employee.TerminationReason and the rule CHK_Emp_Left:
--   [CONSTRAINT] A person who has left (IsActive = 0) has a leave date and a reason, and left after the hire date.
--                An active person has neither.
-- A database built from 00_schema.sql already has all of this; this file brings an older database up to date.
-- Employees who were already inactive get a leave date and a reason so the rule holds for them too. Loading the generated
-- history (SQL/tools/load_history.sh) replaces those with real dates and reasons. Safe to run twice. No trigger is added.
USE theme_park;

SET @has_col = (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Employee' AND COLUMN_NAME = 'TerminationDate');
SET @sql = IF(@has_col = 0,
  'ALTER TABLE Employee
     ADD COLUMN TerminationDate DATE NULL,
     ADD COLUMN TerminationReason ENUM(''Quit'',''Fired'',''Seasonal end'',''Laid off'') NULL',
  'DO 0');
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @has_chk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Employee' AND CONSTRAINT_NAME = 'CHK_Emp_Left');
SET @sql = IF(@has_chk > 0, 'ALTER TABLE Employee DROP CHECK CHK_Emp_Left', 'DO 0');
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

UPDATE Employee e
   SET e.TerminationDate = GREATEST(
           DATE_ADD(e.HireDate, INTERVAL 1 DAY),
           COALESCE((SELECT DATE_ADD(DATE(MAX(s.ClockIn)), INTERVAL 1 DAY) FROM Shift s WHERE s.EmployeeID = e.EmployeeID), DATE_ADD(e.HireDate, INTERVAL 1 DAY))),
       e.TerminationReason = ELT(1 + MOD(e.EmployeeID, 4), 'Quit', 'Fired', 'Seasonal end', 'Laid off')
 WHERE e.IsActive = 0 AND (e.TerminationDate IS NULL OR e.TerminationReason IS NULL);

UPDATE Employee SET TerminationDate = NULL, TerminationReason = NULL
 WHERE IsActive = 1 AND (TerminationDate IS NOT NULL OR TerminationReason IS NOT NULL);

ALTER TABLE Employee
  ADD CONSTRAINT CHK_Emp_Left CHECK ((IsActive = 1 AND TerminationDate IS NULL AND TerminationReason IS NULL)
                                  OR (IsActive = 0 AND TerminationDate IS NOT NULL AND TerminationReason IS NOT NULL AND TerminationDate > HireDate));
