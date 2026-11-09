-- 24_maintenance_work_finished.sql
-- A crew member can report "work finished" on an open job they are on. The maintenance manager sees the report
-- and closes the job (the repair cost is entered only by the manager, so workers never see or set cost).
-- Not the Notification table: that one is public (homepage). This report is only for the maintenance desk.
-- Safe to re-run. Existing rows are not touched.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/24_maintenance_work_finished.sql
USE theme_park;

-- [TABLE] MaintenanceWorkReport: at most one report per job. The worker can change or undo it while the job is open.
CREATE TABLE IF NOT EXISTS MaintenanceWorkReport (
    MaintenanceID   INT UNSIGNED NOT NULL,
    EmployeeID      INT UNSIGNED NOT NULL,
    ProposedOutcome ENUM('Fixed','Partially Fixed','Not Fixed') NOT NULL,
    Note            VARCHAR(200) NULL,
    ReportedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT PK_MaintWorkReport PRIMARY KEY (MaintenanceID),
    CONSTRAINT FK_MWR_Maint FOREIGN KEY (MaintenanceID) REFERENCES Maintenance (MaintenanceID) ON DELETE CASCADE,
    CONSTRAINT FK_MWR_Emp   FOREIGN KEY (EmployeeID)    REFERENCES Employee (EmployeeID) ON UPDATE CASCADE
) ENGINE = InnoDB;

DROP TRIGGER IF EXISTS trg_MaintWorkReport_BI;
DROP TRIGGER IF EXISTS trg_MaintWorkReport_BU;

DELIMITER $$

-- [RULE] Only a crew member of the job can report it finished, and only while the job is still open.
-- Why a trigger: it looks in Maintenance (EndDate) and MaintenanceCrew, not just its own row.
CREATE TRIGGER trg_MaintWorkReport_BI BEFORE INSERT ON MaintenanceWorkReport
FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Maintenance WHERE MaintenanceID = NEW.MaintenanceID AND EndDate IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This job is already closed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM MaintenanceCrew WHERE MaintenanceID = NEW.MaintenanceID AND EmployeeID = NEW.EmployeeID) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only a crew member of this job can report it finished.';
    END IF;
END$$

-- [RULE] A report cannot be changed after the manager has closed the job.
CREATE TRIGGER trg_MaintWorkReport_BU BEFORE UPDATE ON MaintenanceWorkReport
FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Maintenance WHERE MaintenanceID = NEW.MaintenanceID AND EndDate IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This job is already closed.';
    END IF;
END$$

DELIMITER ;
