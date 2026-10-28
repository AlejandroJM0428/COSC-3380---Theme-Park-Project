-- 05_notifications.sql
-- Notification table and the homepage view. Staff enter Promo rows by hand.
-- Sold-out, weather and maintenance notices are no longer created by triggers.
-- The INSERT below only fills sold-out dates that already exist in the seed data.
-- REQUIRES 04_staff_roles_and_costs.sql. Load AFTER the seed data (02_test_data.sql).
-- Safe to run more than once. Test on a copy of the database first.
USE theme_park;

-- [TABLE] Notification: messages shown on the homepage and staff dashboards.
-- [RULE] Promo rows are entered by staff. SoldOut rows below are a one-time seed fill, not a trigger.
-- [RULE] DedupeKey is unique, so the same event never creates two rows. Manual rows leave it empty.
-- [RULE] IsActive = 0 means dismissed; ExpiresAt empty means no expiry.
CREATE TABLE IF NOT EXISTS Notification (
    NotificationID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    Kind           ENUM('SoldOut','Weather','MaintenanceClosed','Promo') NOT NULL,
    Severity       ENUM('Info','Warning','Alert') NOT NULL,
    Title          VARCHAR(100) NOT NULL,
    Message        VARCHAR(255) NOT NULL,
    CreatedAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt      DATETIME NULL,
    IsActive       BOOL NOT NULL DEFAULT 1,
    DedupeKey      VARCHAR(60) NULL,
    CONSTRAINT PK_Notification PRIMARY KEY (NotificationID),
    CONSTRAINT UQ_Notification_Dedupe UNIQUE (DedupeKey)
) ENGINE = InnoDB;

CREATE INDEX IX_Notification_Active ON Notification (IsActive, CreatedAt);

-- [VIEW] v_ActiveNotifications: what the homepage shows, newest first.
CREATE OR REPLACE VIEW v_ActiveNotifications AS
SELECT NotificationID, Kind, Severity, Title, Message, CreatedAt, ExpiresAt
  FROM Notification
 WHERE IsActive = 1 AND (ExpiresAt IS NULL OR ExpiresAt > NOW())
 ORDER BY CreatedAt DESC;

-- Notifications for dates that are already sold out in the seed data (for example Sat Nov 28, 2026).
INSERT IGNORE INTO Notification (Kind, Severity, Title, Message, ExpiresAt, DedupeKey)
SELECT 'SoldOut', 'Warning', 'Sold out',
       CONCAT('Tickets for ', DATE_FORMAT(x.VisitDate, '%a %b %e, %Y'), ' are sold out.'),
       CAST(x.VisitDate AS DATETIME) + INTERVAL 1 DAY - INTERVAL 1 SECOND,
       CONCAT('SoldOut:', x.VisitDate)
  FROM (SELECT t.VisitDate
          FROM Ticket t
         WHERE t.VisitDate >= CURDATE()
           AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)
         GROUP BY t.VisitDate
        HAVING COUNT(*) >= (SELECT MaxOccupancy FROM Park WHERE ParkID = 1)) x;
