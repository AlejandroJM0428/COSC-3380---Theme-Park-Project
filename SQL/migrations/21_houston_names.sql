-- 21_houston_names.sql: renames the park, zones, rides, games, venues and a few menu items to the Houston street theme.
-- Names only: every row keeps its id, type, price and history, so nothing is reseeded and no logins change.
-- Safe to run twice. Run it once on the live database, then deploy the app code.
USE theme_park;
SET NAMES utf8mb4;

UPDATE Park SET ParkName = 'Beltway Park', Address = '1 Kirby Drive, Houston, TX 77054' WHERE ParkID = 1;

UPDATE Zone SET ZoneName = CASE ZoneID
  WHEN 1 THEN 'Main Street'
  WHEN 2 THEN 'The Loop'
  WHEN 3 THEN 'Buffalo Bayou'
  WHEN 4 THEN 'Montrose'
  WHEN 5 THEN 'Hermann Park' END
WHERE ZoneID BETWEEN 1 AND 5;

UPDATE Ride SET RideName = CASE RideID
  WHEN 1 THEN 'Main Street Streetcar'
  WHEN 2 THEN 'Market Square Carousel'
  WHEN 3 THEN 'Kirby Drive Launch'
  WHEN 4 THEN 'Beltway 8 Orbit'
  WHEN 5 THEN 'Allen Parkway Splashdown'
  WHEN 6 THEN 'Bayou Plunge'
  WHEN 7 THEN 'Gator Alley'
  WHEN 8 THEN 'Hurricane Simulator'
  WHEN 9 THEN 'Art Car Odyssey'
  WHEN 10 THEN 'Katy Flyer'
  WHEN 11 THEN 'Fannin Street Funhouse'
  WHEN 12 THEN 'Chimney Rock'
  WHEN 13 THEN 'Old Spanish Trail'
  WHEN 14 THEN 'Armadillo Dash'
  WHEN 15 THEN 'Zoo Carousel' END
WHERE RideID BETWEEN 1 AND 15;

UPDATE Game SET GameName = CASE GameID
  WHEN 1 THEN 'Rodeo Ring Toss'
  WHEN 2 THEN 'Hoops on Holcombe'
  WHEN 3 THEN 'Pop on Post Oak'
  WHEN 4 THEN 'Whack-a-Gator'
  WHEN 5 THEN 'Dunk on Dunlavy'
  WHEN 6 THEN 'Skee on Shepherd'
  WHEN 7 THEN 'Duck Pond on Dunlavy' END
WHERE GameID BETWEEN 1 AND 7;

UPDATE Venue SET VenueName = CASE VenueID
  WHEN 1 THEN 'Waugh Drive Diner'
  WHEN 2 THEN 'Richmond Strip BBQ'
  WHEN 3 THEN 'Crawfish Shack'
  WHEN 4 THEN 'Montrose Taco Stand'
  WHEN 5 THEN 'Almeda Snowball Cart'
  WHEN 6 THEN 'Westheimer Emporium'
  WHEN 7 THEN 'Bayou Trading Post'
  WHEN 8 THEN 'Post Oak Outfitters' END
WHERE VenueID BETWEEN 1 AND 8;

UPDATE Item SET ItemName = CASE ItemID
  WHEN 16 THEN 'Fried Catfish Basket'
  WHEN 17 THEN 'Crawfish Basket'
  WHEN 21 THEN 'Bean and Cheese Taco'
  WHEN 22 THEN 'Brisket Taco'
  WHEN 23 THEN 'Chips and Queso'
  WHEN 24 THEN 'Tres Leches Cup'
  WHEN 29 THEN 'Cream Snowball'
  WHEN 37 THEN 'Gator Hat'
  WHEN 38 THEN 'Toy Airboat'
  WHEN 39 THEN 'Praline Tin'
  WHEN 41 THEN 'Bayou Bead Necklace'
  WHEN 43 THEN 'Loop Hoodie' END
WHERE ItemID IN (16, 17, 21, 22, 23, 24, 29, 37, 38, 39, 41, 43);

-- check: expect 1 park, 5 zones, 15 rides, 7 games, 8 venues, and no old names left
SELECT (SELECT COUNT(*) FROM Zone) AS zones, (SELECT COUNT(*) FROM Ride) AS rides, (SELECT COUNT(*) FROM Game) AS games,
       (SELECT COUNT(*) FROM Venue) AS venues,
       (SELECT COUNT(*) FROM Zone WHERE ZoneName IN ('Thunder Canyon','Adventure Bay','Fantasy Forest','Kids Corner')) AS old_zone_names;
