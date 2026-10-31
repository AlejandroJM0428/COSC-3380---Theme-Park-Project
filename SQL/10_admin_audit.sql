-- 10_admin_audit.sql
-- AdminAudit: one row for every change made from the admin tools (row edits, SQL console writes, reset).
-- Safe to run more than once. Does not delete rows.
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/10_admin_audit.sql
USE theme_park;

-- [TABLE] AdminAudit: who changed what, and when. No foreign keys on purpose, so a row stays
--         even if the user or the record it describes is later removed.
CREATE TABLE IF NOT EXISTS AdminAudit (
    AuditID    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    AuditTime  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Username   VARCHAR(60)     NOT NULL,
    Action     VARCHAR(40)     NOT NULL,
    TableName  VARCHAR(64)     NULL,
    RowKey     VARCHAR(100)    NULL,
    Detail     VARCHAR(2000)   NULL,
    CONSTRAINT PK_AdminAudit PRIMARY KEY (AuditID),
    INDEX IX_AdminAudit_Time (AuditTime)
) ENGINE = InnoDB;
