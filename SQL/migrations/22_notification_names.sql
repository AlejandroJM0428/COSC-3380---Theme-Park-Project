-- 22_notification_names.sql: fixes old ride, shop and land names inside notices that were already stored.
-- Notices keep the text they were created with, so a notice made before 21_houston_names.sql still says
-- "Grand Carousel". This rewrites those names. Only the Title and Message text changes: ids, kinds, severity,
-- dates and DedupeKey are untouched, so no notice is duplicated or brought back.
-- Safe to run twice (the second run changes nothing). Run it once on the live database after 21_houston_names.sql.
USE theme_park;
SET NAMES utf8mb4;

-- One UPDATE per old name keeps this easy to read and easy to extend.
UPDATE Notification SET Title = REPLACE(Title, 'Heritage Railroad', 'Main Street Streetcar'), Message = REPLACE(Message, 'Heritage Railroad', 'Main Street Streetcar')
 WHERE Title LIKE '%Heritage Railroad%' OR Message LIKE '%Heritage Railroad%';
UPDATE Notification SET Title = REPLACE(Title, 'Grand Carousel', 'Market Square Carousel'), Message = REPLACE(Message, 'Grand Carousel', 'Market Square Carousel')
 WHERE Title LIKE '%Grand Carousel%' OR Message LIKE '%Grand Carousel%';
UPDATE Notification SET Title = REPLACE(Title, 'Thunder Run', 'Kirby Drive Launch'), Message = REPLACE(Message, 'Thunder Run', 'Kirby Drive Launch')
 WHERE Title LIKE '%Thunder Run%' OR Message LIKE '%Thunder Run%';
UPDATE Notification SET Title = REPLACE(Title, 'Canyon Cyclone', 'Beltway 8 Orbit'), Message = REPLACE(Message, 'Canyon Cyclone', 'Beltway 8 Orbit')
 WHERE Title LIKE '%Canyon Cyclone%' OR Message LIKE '%Canyon Cyclone%';
UPDATE Notification SET Title = REPLACE(Title, 'Rapids Rampage', 'Allen Parkway Splashdown'), Message = REPLACE(Message, 'Rapids Rampage', 'Allen Parkway Splashdown')
 WHERE Title LIKE '%Rapids Rampage%' OR Message LIKE '%Rapids Rampage%';
UPDATE Notification SET Title = REPLACE(Title, 'Pirate''s Plunge', 'Bayou Plunge'), Message = REPLACE(Message, 'Pirate''s Plunge', 'Bayou Plunge')
 WHERE Title LIKE '%Pirate''s Plunge%' OR Message LIKE '%Pirate''s Plunge%';
UPDATE Notification SET Title = REPLACE(Title, 'Kraken''s Lair', 'Gator Alley'), Message = REPLACE(Message, 'Kraken''s Lair', 'Gator Alley')
 WHERE Title LIKE '%Kraken''s Lair%' OR Message LIKE '%Kraken''s Lair%';
UPDATE Notification SET Title = REPLACE(Title, 'Tidal Simulator', 'Hurricane Simulator'), Message = REPLACE(Message, 'Tidal Simulator', 'Hurricane Simulator')
 WHERE Title LIKE '%Tidal Simulator%' OR Message LIKE '%Tidal Simulator%';
UPDATE Notification SET Title = REPLACE(Title, 'Enchanted Journey', 'Art Car Odyssey'), Message = REPLACE(Message, 'Enchanted Journey', 'Art Car Odyssey')
 WHERE Title LIKE '%Enchanted Journey%' OR Message LIKE '%Enchanted Journey%';
UPDATE Notification SET Title = REPLACE(Title, 'Forest Express', 'Katy Flyer'), Message = REPLACE(Message, 'Forest Express', 'Katy Flyer')
 WHERE Title LIKE '%Forest Express%' OR Message LIKE '%Forest Express%';
UPDATE Notification SET Title = REPLACE(Title, 'Wizard''s Workshop', 'Fannin Street Funhouse'), Message = REPLACE(Message, 'Wizard''s Workshop', 'Fannin Street Funhouse')
 WHERE Title LIKE '%Wizard''s Workshop%' OR Message LIKE '%Wizard''s Workshop%';
UPDATE Notification SET Title = REPLACE(Title, 'Dragon''s Nest', 'Chimney Rock'), Message = REPLACE(Message, 'Dragon''s Nest', 'Chimney Rock')
 WHERE Title LIKE '%Dragon''s Nest%' OR Message LIKE '%Dragon''s Nest%';
UPDATE Notification SET Title = REPLACE(Title, 'Old Mill Ride', 'Old Spanish Trail'), Message = REPLACE(Message, 'Old Mill Ride', 'Old Spanish Trail')
 WHERE Title LIKE '%Old Mill Ride%' OR Message LIKE '%Old Mill Ride%';
UPDATE Notification SET Title = REPLACE(Title, 'Little Dino Dash', 'Armadillo Dash'), Message = REPLACE(Message, 'Little Dino Dash', 'Armadillo Dash')
 WHERE Title LIKE '%Little Dino Dash%' OR Message LIKE '%Little Dino Dash%';
UPDATE Notification SET Title = REPLACE(Title, 'Mini Carousel', 'Zoo Carousel'), Message = REPLACE(Message, 'Mini Carousel', 'Zoo Carousel')
 WHERE Title LIKE '%Mini Carousel%' OR Message LIKE '%Mini Carousel%';
UPDATE Notification SET Title = REPLACE(Title, 'Main Street Diner', 'Waugh Drive Diner'), Message = REPLACE(Message, 'Main Street Diner', 'Waugh Drive Diner')
 WHERE Title LIKE '%Main Street Diner%' OR Message LIKE '%Main Street Diner%';
UPDATE Notification SET Title = REPLACE(Title, 'Main Street Emporium', 'Westheimer Emporium'), Message = REPLACE(Message, 'Main Street Emporium', 'Westheimer Emporium')
 WHERE Title LIKE '%Main Street Emporium%' OR Message LIKE '%Main Street Emporium%';
UPDATE Notification SET Title = REPLACE(Title, 'Canyon Grill', 'Richmond Strip BBQ'), Message = REPLACE(Message, 'Canyon Grill', 'Richmond Strip BBQ')
 WHERE Title LIKE '%Canyon Grill%' OR Message LIKE '%Canyon Grill%';
UPDATE Notification SET Title = REPLACE(Title, 'Canyon Outfitters', 'Post Oak Outfitters'), Message = REPLACE(Message, 'Canyon Outfitters', 'Post Oak Outfitters')
 WHERE Title LIKE '%Canyon Outfitters%' OR Message LIKE '%Canyon Outfitters%';
UPDATE Notification SET Title = REPLACE(Title, 'Bay Fish Shack', 'Crawfish Shack'), Message = REPLACE(Message, 'Bay Fish Shack', 'Crawfish Shack')
 WHERE Title LIKE '%Bay Fish Shack%' OR Message LIKE '%Bay Fish Shack%';
UPDATE Notification SET Title = REPLACE(Title, 'Pirate''s Trading Post', 'Bayou Trading Post'), Message = REPLACE(Message, 'Pirate''s Trading Post', 'Bayou Trading Post')
 WHERE Title LIKE '%Pirate''s Trading Post%' OR Message LIKE '%Pirate''s Trading Post%';
UPDATE Notification SET Title = REPLACE(Title, 'Forest Pizza', 'Montrose Taco Stand'), Message = REPLACE(Message, 'Forest Pizza', 'Montrose Taco Stand')
 WHERE Title LIKE '%Forest Pizza%' OR Message LIKE '%Forest Pizza%';
UPDATE Notification SET Title = REPLACE(Title, 'Sweet Treats Cart', 'Almeda Snowball Cart'), Message = REPLACE(Message, 'Sweet Treats Cart', 'Almeda Snowball Cart')
 WHERE Title LIKE '%Sweet Treats Cart%' OR Message LIKE '%Sweet Treats Cart%';
UPDATE Notification SET Title = REPLACE(Title, 'Thunder Canyon', 'The Loop'), Message = REPLACE(Message, 'Thunder Canyon', 'The Loop')
 WHERE Title LIKE '%Thunder Canyon%' OR Message LIKE '%Thunder Canyon%';
UPDATE Notification SET Title = REPLACE(Title, 'Adventure Bay', 'Buffalo Bayou'), Message = REPLACE(Message, 'Adventure Bay', 'Buffalo Bayou')
 WHERE Title LIKE '%Adventure Bay%' OR Message LIKE '%Adventure Bay%';
UPDATE Notification SET Title = REPLACE(Title, 'Fantasy Forest', 'Montrose'), Message = REPLACE(Message, 'Fantasy Forest', 'Montrose')
 WHERE Title LIKE '%Fantasy Forest%' OR Message LIKE '%Fantasy Forest%';
UPDATE Notification SET Title = REPLACE(Title, 'Kids Corner', 'Hermann Park'), Message = REPLACE(Message, 'Kids Corner', 'Hermann Park')
 WHERE Title LIKE '%Kids Corner%' OR Message LIKE '%Kids Corner%';
