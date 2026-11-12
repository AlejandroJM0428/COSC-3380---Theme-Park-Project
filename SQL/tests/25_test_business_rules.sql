-- 25_test_business_rules.sql: checks both rules reject a bad row, then rolls back. Run with --force so both print:
--   docker compose exec -T mysql sh -c 'mysql --force -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/tests/25_test_business_rules.sql
-- Expect TWO errors, each ERROR 1644 (45000).
USE theme_park;

-- Test 1: expect "Tickets can be bought at most 180 days before the visit."
START TRANSACTION;
SELECT CustomerID INTO @c FROM Customer WHERE IsActive = 1 ORDER BY CustomerID LIMIT 1;
SELECT @c AS customer, CURDATE() + INTERVAL 365 DAY AS visit_one_year_out;
INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
VALUES (@c, NULL, CURDATE() + INTERVAL 365 DAY, 0, 0, NOW());
ROLLBACK;

-- Test 2: expect "Refunds need at least 2 days notice before the visit."
START TRANSACTION;
SELECT c.CustomerID INTO @c2 FROM Customer c
 WHERE c.IsActive = 1
   AND NOT EXISTS (SELECT 1 FROM Ticket t WHERE t.CustomerID = c.CustomerID AND t.VisitDate = CURDATE() + INTERVAL 1 DAY)
 ORDER BY c.CustomerID LIMIT 1;
INSERT INTO Ticket (CustomerID, MembershipID, VisitDate, HasExpress, TicketPrice, PurchaseDate)
VALUES (@c2, NULL, CURDATE() + INTERVAL 1 DAY, 0, 0, NOW());
SET @t = LAST_INSERT_ID();
SELECT @t AS ticket_for_tomorrow;
INSERT INTO TicketRefund (TicketID, WeatherID, RefundedAt, RefundReason) VALUES (@t, NULL, NOW(), 'Test: too late to refund');
ROLLBACK;
