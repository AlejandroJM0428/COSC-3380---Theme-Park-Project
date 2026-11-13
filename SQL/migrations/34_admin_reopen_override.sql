-- 34_admin_reopen_override.sql: an Admin's "Reopen ride" overrides a maintenance closure.
-- Why: fn_UnderMaintenance keeps a ride closed while a job is running, and after a job ends unless its outcome was
-- 'Fixed'. With no way to say "an Admin checked it and it is fine", a ride could stay closed forever.
-- Ride.ReopenedAt is set by Reopen ride. For a ride, a job only counts when it started after ReopenedAt (still
-- running) or ended after ReopenedAt (finished, not Fixed). A new job started later closes the ride again.
-- Games and venues are unchanged. Safe to re-run.
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/migrations/34_admin_reopen_override.sql
USE theme_park;

DROP PROCEDURE IF EXISTS tmp_ReopenedAt;
DELIMITER $$
CREATE PROCEDURE tmp_ReopenedAt()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Ride' AND COLUMN_NAME = 'ReopenedAt') THEN
        ALTER TABLE Ride ADD COLUMN ReopenedAt DATETIME NULL;
    END IF;
END$$
DELIMITER ;
CALL tmp_ReopenedAt();
DROP PROCEDURE tmp_ReopenedAt;

DROP FUNCTION IF EXISTS fn_UnderMaintenance;
DELIMITER $$

-- [RULE] fn_UnderMaintenance: true if a job is running at p_at, or the latest finished job's outcome is not 'Fixed'.
-- For a ride, jobs from before an Admin's Reopen ride (Ride.ReopenedAt) are ignored.
CREATE FUNCTION fn_UnderMaintenance(p_kind VARCHAR(10), p_id INT UNSIGNED, p_at DATETIME)
RETURNS BOOL
READS SQL DATA
BEGIN
    DECLARE v_out    VARCHAR(20);
    DECLARE v_reopen DATETIME DEFAULT NULL;

    IF p_kind = 'Ride' THEN
        SELECT ReopenedAt INTO v_reopen FROM Ride WHERE RideID = p_id;
    END IF;

    IF EXISTS (SELECT 1 FROM Maintenance m
                WHERE m.StartDate <= p_at
                  AND (m.EndDate IS NULL OR p_at < m.EndDate)
                  AND (v_reopen IS NULL OR m.StartDate > v_reopen)
                  AND ((p_kind = 'Ride'  AND m.RideID  = p_id)
                    OR (p_kind = 'Game'  AND m.GameID  = p_id)
                    OR (p_kind = 'Venue' AND m.VenueID = p_id))) THEN
        RETURN TRUE;
    END IF;

    SELECT m.Outcome INTO v_out
      FROM Maintenance m
     WHERE m.EndDate IS NOT NULL
       AND m.EndDate <= p_at
       AND (v_reopen IS NULL OR m.EndDate > v_reopen)
       AND ((p_kind = 'Ride'  AND m.RideID  = p_id)
         OR (p_kind = 'Game'  AND m.GameID  = p_id)
         OR (p_kind = 'Venue' AND m.VenueID = p_id))
     ORDER BY m.EndDate DESC, m.StartDate DESC
     LIMIT 1;

    RETURN (v_out IS NOT NULL AND v_out <> 'Fixed');
END$$

DELIMITER ;
