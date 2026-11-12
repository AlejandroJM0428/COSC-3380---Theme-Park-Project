-- 24_test_work_finished.sql: checks both new rules reject bad rows, then rolls back. Run with --force so both tests print their error:
--   docker compose exec -T mysql sh -c 'mysql --force -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/tests/24_test_work_finished.sql
-- Expect TWO errors, each ERROR 1644 (45000).

-- Test 1: expect "Only a crew member of this job can report it finished."
START TRANSACTION;
SELECT m.MaintenanceID, e.EmployeeID INTO @job, @outsider
  FROM Maintenance m JOIN Employee e ON e.JobTitle = 'Technician' AND e.IsActive = 1
 WHERE m.EndDate IS NULL
   AND NOT EXISTS (SELECT 1 FROM MaintenanceCrew c WHERE c.MaintenanceID = m.MaintenanceID AND c.EmployeeID = e.EmployeeID)
 ORDER BY m.MaintenanceID, e.EmployeeID LIMIT 1;
SELECT @job AS open_job, @outsider AS technician_not_on_crew;
INSERT INTO MaintenanceWorkReport (MaintenanceID, EmployeeID, ProposedOutcome) VALUES (@job, @outsider, 'Fixed');
ROLLBACK;

-- Test 2: expect "This job is already closed."
START TRANSACTION;
SELECT m.MaintenanceID, c.EmployeeID INTO @closed, @crew
  FROM Maintenance m JOIN MaintenanceCrew c ON c.MaintenanceID = m.MaintenanceID
 WHERE m.EndDate IS NOT NULL ORDER BY m.MaintenanceID LIMIT 1;
SELECT @closed AS closed_job, @crew AS crew_member;
INSERT INTO MaintenanceWorkReport (MaintenanceID, EmployeeID, ProposedOutcome) VALUES (@closed, @crew, 'Fixed');
ROLLBACK;
