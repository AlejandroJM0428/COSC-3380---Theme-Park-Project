-- 15_price_update.sql
-- Lowers the day pass and the three membership prices to sit in line with Six Flags.
--   Day pass   79 -> 59
--   Basic      99 -> 69
--   Plus      149 -> 89
--   Premier   249 -> 179
-- The Express add-on stays at 25.
-- Safe to run more than once. Only changes the price list: tickets and memberships that already exist keep the
-- price they were sold at (a membership copies its price from MembershipTier when it is created).
-- Docker init runs this only on an empty volume. On a database that already exists:
--   docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/15_price_update.sql
USE theme_park;

UPDATE Park SET DayPassPrice = 59.00 WHERE ParkID = 1;

UPDATE MembershipTier
   SET AnnualPrice = CASE Tier WHEN 'Basic' THEN 69.00 WHEN 'Plus' THEN 89.00 WHEN 'Premier' THEN 179.00 END
 WHERE Tier IN ('Basic', 'Plus', 'Premier');
