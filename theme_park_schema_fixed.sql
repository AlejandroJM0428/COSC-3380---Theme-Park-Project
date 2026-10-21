-- Theme Park schema. MySQL 8.0.16+
-- Tags: [TABLE] [VIEW] [CONSTRAINT] [RULE]
-- [RULE] Placeholder columns (ClosesOutdoorRides, UnitPrice, AmountPaid, TicketPrice, Membership.Price) are overwritten by triggers.
-- [RULE] Generated columns (IncludesExpress, AnyDayAccess, IsPlanned, WaitRideID, WaitAt) are left out of INSERTs.
-- [RULE] IsActive = 0 means retired; row and history stay.

DROP DATABASE IF EXISTS theme_park;
CREATE DATABASE theme_park CHARACTER SET utf8mb4;
USE theme_park;

-- STRUCTURE

-- [TABLE] Park: single park row; weather limits and ticket prices.
-- [RULE] Exceeding any one weather limit closes outdoor rides.
CREATE TABLE Park (
    ParkID            TINYINT UNSIGNED NOT NULL,
    ParkName          VARCHAR(100) NOT NULL,
    Address           VARCHAR(200) NOT NULL,
    OpeningTime       TIME(0)      NOT NULL,
    ClosingTime       TIME(0)      NOT NULL,
    MaxOccupancy      INT UNSIGNED NOT NULL,
    MaxWindMph        SMALLINT UNSIGNED NOT NULL,
    MinLightningMiles DECIMAL(4,1) NOT NULL,   -- closes at this distance or nearer
    MaxTempF          SMALLINT NOT NULL,   -- closes at this temperature or hotter
    MinTempF          SMALLINT NOT NULL,   -- closes at this temperature or colder
    DayPassPrice      DECIMAL(6,2) NOT NULL,
    ExpressAddOnPrice DECIMAL(6,2) NOT NULL,
    -- [CONSTRAINT] Only one park; hours, occupancy, temperature range, prices valid.
    CONSTRAINT PK_Park         PRIMARY KEY (ParkID),
    CONSTRAINT CHK_Park_Single CHECK (ParkID = 1),
    CONSTRAINT CHK_Park_Hours  CHECK (ClosingTime > OpeningTime),
    CONSTRAINT CHK_Park_Occ    CHECK (MaxOccupancy > 0),
    CONSTRAINT CHK_Park_Temp   CHECK (MinTempF < MaxTempF),
    CONSTRAINT CHK_Park_Prices CHECK (DayPassPrice >= 0 AND ExpressAddOnPrice >= 0)
) ENGINE = InnoDB;

-- [TABLE] Zone: named area of the park.
CREATE TABLE Zone (
    ZoneID   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ParkID   TINYINT UNSIGNED NOT NULL,
    ZoneName VARCHAR(50) NOT NULL,
    -- [CONSTRAINT] Zone names unique within the park.
    CONSTRAINT PK_Zone PRIMARY KEY (ZoneID),
    CONSTRAINT UQ_Zone_Name UNIQUE (ParkID, ZoneName),
    CONSTRAINT FK_Zone_Park FOREIGN KEY (ParkID) REFERENCES Park (ParkID)
) ENGINE = InnoDB;

-- WEATHER

-- [TABLE] WeatherLog: weather events; EndedAt is empty while ongoing.
-- [RULE] ClosesOutdoorRides is derived by trigger from readings vs Park limits.
-- [RULE] LightningMiles 99.9 = none detected.
CREATE TABLE WeatherLog (
    WeatherID          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ParkID             TINYINT UNSIGNED NOT NULL,
    WeatherType        ENUM('Clear','Cloudy','Rain','Storm','Heat','Cold') NOT NULL,
    StartedAt          DATETIME NOT NULL,
    EndedAt            DATETIME NULL,
    TemperatureF       SMALLINT NOT NULL,
    WindMph            SMALLINT UNSIGNED NOT NULL,
    LightningMiles     DECIMAL(4,1) NOT NULL,
    ClosesOutdoorRides BOOL NOT NULL,
    -- [CONSTRAINT] One event per start time; end not before start; lightning distance non-negative.
    CONSTRAINT PK_WeatherLog PRIMARY KEY (WeatherID),
    CONSTRAINT UQ_WeatherLog UNIQUE (ParkID, StartedAt),
    CONSTRAINT FK_Weather_Park FOREIGN KEY (ParkID) REFERENCES Park (ParkID),
    CONSTRAINT CHK_Weather_Times CHECK (EndedAt IS NULL OR EndedAt >= StartedAt),
    CONSTRAINT CHK_Weather_Read  CHECK (LightningMiles >= 0)
) ENGINE = InnoDB;

-- RIDES

-- [TABLE] Ride: attractions; MinHeightCm 0 = no requirement.
-- [RULE] Status is a trigger-maintained cache, re-synced every 15 minutes; boarding checks fn_UnderMaintenance().
CREATE TABLE Ride (
    RideID            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ZoneID            INT UNSIGNED NOT NULL,
    RideName          VARCHAR(100) NOT NULL,
    RideType          ENUM('Coaster','Dark Ride','Water Ride','Carousel','Train','Simulator','Walkthrough') NOT NULL,
    SeatCapacity      SMALLINT UNSIGNED NOT NULL,
    MinHeightCm       SMALLINT UNSIGNED NOT NULL,
    IsIndoor          BOOL NOT NULL,
    IsExpressEligible BOOL NOT NULL,
    Status            ENUM('Open','Maintenance') NOT NULL,
    IsActive          BOOL NOT NULL,
    -- [CONSTRAINT] Ride names unique per zone; seats positive.
    CONSTRAINT PK_Ride PRIMARY KEY (RideID),
    CONSTRAINT UQ_Ride_Name UNIQUE (ZoneID, RideName),
    CONSTRAINT FK_Ride_Zone FOREIGN KEY (ZoneID) REFERENCES Zone (ZoneID),
    CONSTRAINT CHK_Ride_Seats CHECK (SeatCapacity > 0)
) ENGINE = InnoDB;

-- GAMES

-- [TABLE] Game: midway games with a play price.
CREATE TABLE Game (
    GameID    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ZoneID    INT UNSIGNED NOT NULL,
    GameName  VARCHAR(100) NOT NULL,
    PlayPrice DECIMAL(6,2) NOT NULL,
    IsActive  BOOL NOT NULL,
    -- [CONSTRAINT] Game names unique per zone; price non-negative.
    CONSTRAINT PK_Game PRIMARY KEY (GameID),
    CONSTRAINT UQ_Game_Name UNIQUE (ZoneID, GameName),
    CONSTRAINT FK_Game_Zone FOREIGN KEY (ZoneID) REFERENCES Zone (ZoneID),
    CONSTRAINT CHK_Game_Price CHECK (PlayPrice >= 0)
) ENGINE = InnoDB;

-- FOOD AND SHOPS

-- [TABLE] Venue: restaurants and gift shops; ServiceType applies to restaurants only.
CREATE TABLE Venue (
    VenueID     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ZoneID      INT UNSIGNED NOT NULL,
    VenueName   VARCHAR(100) NOT NULL,
    VenueType   ENUM('Restaurant','Gift Shop') NOT NULL,
    ServiceType ENUM('Table Service','Quick Service','Snack Cart') NULL,
    IsActive    BOOL NOT NULL,
    -- [CONSTRAINT] Venue names unique per zone; ServiceType set only for restaurants.
    CONSTRAINT PK_Venue PRIMARY KEY (VenueID),
    CONSTRAINT UQ_Venue_Name UNIQUE (ZoneID, VenueName),
    CONSTRAINT FK_Venue_Zone FOREIGN KEY (ZoneID) REFERENCES Zone (ZoneID),
    CONSTRAINT CHK_Venue_Service CHECK ((VenueType = 'Restaurant') = (ServiceType IS NOT NULL))
) ENGINE = InnoDB;

-- [TABLE] Item: menu items and shop products; IsAlcoholic for drinks only.
CREATE TABLE Item (
    ItemID      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    VenueID     INT UNSIGNED NOT NULL,
    ItemName    VARCHAR(100) NOT NULL,
    Category    ENUM('Entree','Side','Dessert','Snack','Drink',
                     'Apparel','Toy','Souvenir','Candy','Accessory') NOT NULL,
    Price       DECIMAL(8,2) NOT NULL,
    IsAlcoholic BOOL NOT NULL,
    IsActive    BOOL NOT NULL,
    -- [CONSTRAINT] Item names unique per venue; price non-negative; alcohol only on drinks.
    CONSTRAINT PK_Item PRIMARY KEY (ItemID),
    CONSTRAINT UQ_Item UNIQUE (VenueID, ItemName),
    CONSTRAINT FK_Item_Venue FOREIGN KEY (VenueID) REFERENCES Venue (VenueID) ON DELETE CASCADE,
    CONSTRAINT CHK_Item_Price CHECK (Price >= 0),
    CONSTRAINT CHK_Item_Alc   CHECK (IsAlcoholic = 0 OR Category = 'Drink')
) ENGINE = InnoDB;

-- GUESTS, MEMBERSHIPS AND TICKETS

-- [TABLE] Customer: park guests.
CREATE TABLE Customer (
    CustomerID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    FirstName  VARCHAR(50) NOT NULL,
    LastName   VARCHAR(50) NOT NULL,
    DOB        DATE        NOT NULL,
    HeightCm   SMALLINT UNSIGNED NOT NULL,
    IsActive   BOOL NOT NULL,
    -- [CONSTRAINT] Height between 30 and 260 cm.
    CONSTRAINT PK_Customer PRIMARY KEY (CustomerID),
    CONSTRAINT CHK_Customer_Height CHECK (HeightCm BETWEEN 30 AND 260)
) ENGINE = InnoDB;

-- [TABLE] MembershipTier: what the park sells; one row per tier with its current annual price.
-- [RULE] IsForSale = 0 means the tier can no longer be bought; existing memberships stay valid.
CREATE TABLE MembershipTier (
    Tier        ENUM('Basic','Plus','Premier') NOT NULL,
    AnnualPrice DECIMAL(8,2) NOT NULL,
    IsForSale   BOOL NOT NULL,
    -- [CONSTRAINT] Price non-negative.
    CONSTRAINT PK_MembershipTier PRIMARY KEY (Tier),
    CONSTRAINT CHK_Tier_Price CHECK (AnnualPrice >= 0)
) ENGINE = InnoDB;

-- Tier prices
INSERT INTO MembershipTier (Tier, AnnualPrice, IsForSale) VALUES
    ('Basic',   99.00, 1),
    ('Plus',   149.00, 1),
    ('Premier', 249.00, 1);

-- [TABLE] Membership: annual memberships; EndDate is the last valid day, Price is what was paid.
-- [RULE] Benefits are generated from Tier: Basic = weekdays, no Express; Plus = any day, no Express; Premier = any day, Express.
CREATE TABLE Membership (
    MembershipID      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    CustomerID        INT UNSIGNED NOT NULL,
    Tier              ENUM('Basic','Plus','Premier') NOT NULL,
    IncludesExpress   BOOL GENERATED ALWAYS AS (Tier = 'Premier') STORED,
    AnyDayAccess      BOOL GENERATED ALWAYS AS (Tier <> 'Basic') STORED,
    StartDate         DATE NOT NULL,
    EndDate           DATE NOT NULL,
    Price             DECIMAL(8,2) NOT NULL,
    AutoRenew         BOOL NOT NULL,
    -- [CONSTRAINT] One membership per customer per start date.
    CONSTRAINT PK_Membership PRIMARY KEY (MembershipID),
    CONSTRAINT UQ_Membership UNIQUE (CustomerID, StartDate),
    CONSTRAINT FK_Membership_Customer FOREIGN KEY (CustomerID) REFERENCES Customer (CustomerID) ON DELETE CASCADE,
    CONSTRAINT FK_Membership_Tier     FOREIGN KEY (Tier) REFERENCES MembershipTier (Tier),
    -- [CONSTRAINT] Annual term: EndDate is the day before the one-year anniversary.
    CONSTRAINT CHK_Membership_Term  CHECK (EndDate = DATE_SUB(DATE_ADD(StartDate, INTERVAL 1 YEAR), INTERVAL 1 DAY)),
    CONSTRAINT CHK_Membership_Price CHECK (Price >= 0)
) ENGINE = InnoDB;

-- [TABLE] Ticket: one visit per ticket; MembershipID unset = no membership.
-- [RULE] HasExpress forced to 1 by trg_Ticket_BI when the tier includes Express.
CREATE TABLE Ticket (
    TicketID     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    CustomerID   INT UNSIGNED NOT NULL,
    MembershipID INT UNSIGNED NULL,
    VisitDate    DATE NOT NULL,
    HasExpress   BOOL NOT NULL,
    TicketPrice  DECIMAL(6,2) NOT NULL,
    PurchaseDate DATETIME NOT NULL,
    -- [CONSTRAINT] Price non-negative; bought on or before the visit date.
    CONSTRAINT PK_Ticket PRIMARY KEY (TicketID),
    CONSTRAINT FK_Ticket_Customer   FOREIGN KEY (CustomerID)   REFERENCES Customer (CustomerID),
    CONSTRAINT FK_Ticket_Membership FOREIGN KEY (MembershipID) REFERENCES Membership (MembershipID),
    CONSTRAINT CHK_Ticket_Price CHECK (TicketPrice >= 0),
    CONSTRAINT CHK_Ticket_Purchase CHECK (DATE(PurchaseDate) <= VisitDate)
) ENGINE = InnoDB;
CREATE INDEX IX_Ticket_VisitDate ON Ticket (VisitDate);

-- [TABLE] TicketRefund: a row means the ticket is refunded; WeatherID unset = not weather-related.
CREATE TABLE TicketRefund (
    TicketID     INT UNSIGNED NOT NULL,
    WeatherID    INT UNSIGNED NULL,
    RefundedAt   DATETIME NOT NULL,
    RefundReason VARCHAR(200) NOT NULL,
    -- [CONSTRAINT] One refund per ticket.
    CONSTRAINT PK_TicketRefund PRIMARY KEY (TicketID),
    CONSTRAINT FK_Refund_Ticket  FOREIGN KEY (TicketID)  REFERENCES Ticket (TicketID) ON DELETE CASCADE,
    CONSTRAINT FK_Refund_Weather FOREIGN KEY (WeatherID) REFERENCES WeatherLog (WeatherID)
) ENGINE = InnoDB;

-- GUEST ACTIVITY

-- [TABLE] RideLog: boardings and posted wait readings, one row per event.
-- [RULE] Boarding has a ticket and no wait minutes; Wait Reading is the reverse.
-- [RULE] UsedExpress = 1 means Express line (boardings only).
-- [RULE] WaitRideID and WaitAt are generated for readings only, so boardings never collide in UQ_RideLog_Wait.
CREATE TABLE RideLog (
    RideLogID   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    RideID      INT UNSIGNED NOT NULL,
    EventType   ENUM('Boarding','Wait Reading') NOT NULL,
    TicketID    INT UNSIGNED NULL,
    WaitMinutes SMALLINT UNSIGNED NULL,
    UsedExpress BOOL NOT NULL,
    LoggedAt    DATETIME NOT NULL,
    WaitRideID  INT UNSIGNED GENERATED ALWAYS AS (IF(EventType = 'Wait Reading', RideID, NULL)) STORED,
    WaitAt      DATETIME GENERATED ALWAYS AS (IF(EventType = 'Wait Reading', LoggedAt, NULL)) STORED,
    -- [CONSTRAINT] Event shape by type; Express only on boardings; one reading per ride per moment.
    CONSTRAINT PK_RideLog PRIMARY KEY (RideLogID),
    CONSTRAINT FK_RideLog_Ride   FOREIGN KEY (RideID)   REFERENCES Ride (RideID),
    CONSTRAINT FK_RideLog_Ticket FOREIGN KEY (TicketID) REFERENCES Ticket (TicketID),
    CONSTRAINT CHK_RideLog_Kind CHECK (
        (EventType = 'Boarding'     AND TicketID IS NOT NULL AND WaitMinutes IS NULL) OR
        (EventType = 'Wait Reading' AND TicketID IS NULL     AND WaitMinutes IS NOT NULL)),
    CONSTRAINT CHK_RideLog_Express CHECK (EventType = 'Boarding' OR UsedExpress = 0),
    CONSTRAINT UQ_RideLog_Wait UNIQUE (WaitRideID, WaitAt)
) ENGINE = InnoDB;

-- [TABLE] GamePlay: game plays per ticket.
-- [RULE] AmountPaid is set from Game.PlayPrice by trigger.
CREATE TABLE GamePlay (
    GamePlayID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    GameID     INT UNSIGNED NOT NULL,
    TicketID   INT UNSIGNED NOT NULL,
    PlayedAt   DATETIME NOT NULL,
    AmountPaid DECIMAL(6,2) NOT NULL,
    CONSTRAINT PK_GamePlay PRIMARY KEY (GamePlayID),
    CONSTRAINT FK_GamePlay_Game   FOREIGN KEY (GameID)   REFERENCES Game (GameID),
    CONSTRAINT FK_GamePlay_Ticket FOREIGN KEY (TicketID) REFERENCES Ticket (TicketID)
) ENGINE = InnoDB;

-- [TABLE] Purchase: one row per item bought (food, drink, merchandise); venue reached through Item.
-- [RULE] UnitPrice is the price at time of sale, set by trigger.
CREATE TABLE Purchase (
    PurchaseID  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    TicketID    INT UNSIGNED NOT NULL,
    ItemID      INT UNSIGNED NOT NULL,
    Quantity    SMALLINT UNSIGNED NOT NULL,
    UnitPrice   DECIMAL(8,2) NOT NULL,
    PurchasedAt DATETIME NOT NULL,
    -- [CONSTRAINT] Quantity positive.
    CONSTRAINT PK_Purchase PRIMARY KEY (PurchaseID),
    CONSTRAINT FK_Purchase_Ticket FOREIGN KEY (TicketID) REFERENCES Ticket (TicketID),
    CONSTRAINT FK_Purchase_Item   FOREIGN KEY (ItemID)   REFERENCES Item (ItemID),
    CONSTRAINT CHK_Purchase_Qty CHECK (Quantity > 0)
) ENGINE = InnoDB;

-- STAFF

-- [TABLE] Employee: park staff.
CREATE TABLE Employee (
    EmployeeID   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    FirstName    VARCHAR(50) NOT NULL,
    LastName     VARCHAR(50) NOT NULL,
    DOB          DATE NOT NULL,
    JobTitle     ENUM('Ride Operator','Game Attendant','Cook','Server','Shop Associate',
                      'Performer','Technician','Manager') NOT NULL,
    HireDate     DATE NOT NULL,
    HourlyPay    DECIMAL(6,2) NOT NULL,
    HoursPerWeek TINYINT UNSIGNED NOT NULL,
    IsActive     BOOL NOT NULL,
    -- [CONSTRAINT] Pay positive; at most 40 hours per week.
    CONSTRAINT PK_Employee PRIMARY KEY (EmployeeID),
    CONSTRAINT CHK_Emp_Pay   CHECK (HourlyPay > 0),
    CONSTRAINT CHK_Emp_Hours CHECK (HoursPerWeek <= 40)
) ENGINE = InnoDB;

-- [TABLE] EmployeeZone: junction, Employee to Zone.
CREATE TABLE EmployeeZone (
    EmployeeID INT UNSIGNED NOT NULL,
    ZoneID     INT UNSIGNED NOT NULL,
    CONSTRAINT PK_EmployeeZone PRIMARY KEY (EmployeeID, ZoneID),
    CONSTRAINT FK_EmpZone_Employee FOREIGN KEY (EmployeeID) REFERENCES Employee (EmployeeID) ON DELETE CASCADE,
    CONSTRAINT FK_EmpZone_Zone     FOREIGN KEY (ZoneID)     REFERENCES Zone (ZoneID)
) ENGINE = InnoDB;

-- [TABLE] RideCertification: junction, Employee to Ride.
CREATE TABLE RideCertification (
    EmployeeID  INT UNSIGNED NOT NULL,
    RideID      INT UNSIGNED NOT NULL,
    CertifiedOn DATE NOT NULL,
    CONSTRAINT PK_RideCertification PRIMARY KEY (EmployeeID, RideID),
    CONSTRAINT FK_Cert_Employee FOREIGN KEY (EmployeeID) REFERENCES Employee (EmployeeID) ON DELETE CASCADE,
    CONSTRAINT FK_Cert_Ride     FOREIGN KEY (RideID)     REFERENCES Ride (RideID) ON DELETE CASCADE
) ENGINE = InnoDB;

-- [TABLE] Shift: clock-in/out records; ClockOut empty = shift open; ShiftRating empty = unrated.
CREATE TABLE Shift (
    ShiftID     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    EmployeeID  INT UNSIGNED NOT NULL,
    ClockIn     DATETIME NOT NULL,
    ClockOut    DATETIME NULL,
    ShiftRating TINYINT UNSIGNED NULL,
    -- [CONSTRAINT] One shift per employee per clock-in; clock-out after clock-in; rating 1 to 5.
    CONSTRAINT PK_Shift PRIMARY KEY (ShiftID),
    CONSTRAINT UQ_Shift UNIQUE (EmployeeID, ClockIn),
    CONSTRAINT FK_Shift_Employee FOREIGN KEY (EmployeeID) REFERENCES Employee (EmployeeID) ON DELETE CASCADE,
    CONSTRAINT CHK_Shift_Time   CHECK (ClockOut IS NULL OR ClockOut > ClockIn),
    CONSTRAINT CHK_Shift_Rating CHECK (ShiftRating IS NULL OR ShiftRating BETWEEN 1 AND 5)
) ENGINE = InnoDB;

-- MAINTENANCE

-- [TABLE] Maintenance: jobs on a ride, game or venue.
-- [RULE] Exactly one target column is set.
-- [RULE] EndDate and Outcome are both empty while the job is ongoing.
-- [RULE] Outcome other than 'Fixed' keeps the facility closed until a later job is logged.
CREATE TABLE Maintenance (
    MaintenanceID INT UNSIGNED NOT NULL AUTO_INCREMENT,
    MaintType     ENUM('Routine Inspection','Preventive Service','Refurbishment',
                       'Emergency Repair','Safety Recall') NOT NULL,
    IsPlanned     BOOL GENERATED ALWAYS AS
                  (MaintType IN ('Routine Inspection','Preventive Service','Refurbishment')) STORED,
    RideID        INT UNSIGNED NULL,
    GameID        INT UNSIGNED NULL,
    VenueID       INT UNSIGNED NULL,
    StartDate     DATETIME NOT NULL,
    EndDate       DATETIME NULL,
    Outcome       ENUM('Fixed','Partially Fixed','Not Fixed') NULL,
    Reason        VARCHAR(100) NOT NULL,
    -- [CONSTRAINT] End not before start; Outcome and EndDate set together; exactly one target.
    CONSTRAINT PK_Maintenance PRIMARY KEY (MaintenanceID),
    CONSTRAINT FK_Maint_Ride  FOREIGN KEY (RideID)  REFERENCES Ride (RideID),
    CONSTRAINT FK_Maint_Game  FOREIGN KEY (GameID)  REFERENCES Game (GameID),
    CONSTRAINT FK_Maint_Venue FOREIGN KEY (VenueID) REFERENCES Venue (VenueID),
    CONSTRAINT CHK_Maint_Dates   CHECK (EndDate IS NULL OR EndDate >= StartDate),
    CONSTRAINT CHK_Maint_Outcome CHECK ((EndDate IS NULL) = (Outcome IS NULL)),
    CONSTRAINT CHK_Maint_Target  CHECK ((RideID IS NOT NULL) + (GameID IS NOT NULL)
                                      + (VenueID IS NOT NULL) = 1)
) ENGINE = InnoDB;

-- [TABLE] MaintenanceCrew: junction, Maintenance to Employee (technician crew).
CREATE TABLE MaintenanceCrew (
    MaintenanceID INT UNSIGNED NOT NULL,
    EmployeeID    INT UNSIGNED NOT NULL,
    CrewRole      ENUM('Lead','Assistant') NOT NULL,
    CONSTRAINT PK_MaintenanceCrew PRIMARY KEY (MaintenanceID, EmployeeID),
    CONSTRAINT FK_MC_Maint FOREIGN KEY (MaintenanceID) REFERENCES Maintenance (MaintenanceID) ON DELETE CASCADE,
    CONSTRAINT FK_MC_Emp   FOREIGN KEY (EmployeeID)    REFERENCES Employee (EmployeeID)
) ENGINE = InnoDB;

-- LOGIN

-- [TABLE] AppUser: web app accounts; PasswordHash is an app-made hash, never the password.
-- [RULE] EmployeeID unset = account not tied to staff; IsActive = 0 blocks login.
CREATE TABLE AppUser (
    UserID       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    Username     VARCHAR(50)  NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    Role         ENUM('Admin','Manager','Cashier') NOT NULL,
    EmployeeID   INT UNSIGNED NULL,
    IsActive     BOOL NOT NULL,
    -- [CONSTRAINT] Usernames unique.
    CONSTRAINT PK_AppUser PRIMARY KEY (UserID),
    CONSTRAINT UQ_AppUser_Name UNIQUE (Username),
    CONSTRAINT FK_AppUser_Employee FOREIGN KEY (EmployeeID) REFERENCES Employee (EmployeeID)
) ENGINE = InnoDB;

-- ROUTINES
DELIMITER $$

-- [RULE] fn_UnderMaintenance: true if a job is running at p_at, or the latest finished job's outcome is not 'Fixed'.
-- p_kind: 'Ride' | 'Game' | 'Venue'
CREATE FUNCTION fn_UnderMaintenance(p_kind VARCHAR(10), p_id INT UNSIGNED, p_at DATETIME)
RETURNS BOOL
READS SQL DATA
BEGIN
    DECLARE v_out VARCHAR(20);

    IF EXISTS (SELECT 1 FROM Maintenance m
                WHERE m.StartDate <= p_at
                  AND (m.EndDate IS NULL OR p_at < m.EndDate)
                  AND ((p_kind = 'Ride'  AND m.RideID  = p_id)
                    OR (p_kind = 'Game'  AND m.GameID  = p_id)
                    OR (p_kind = 'Venue' AND m.VenueID = p_id))) THEN
        RETURN TRUE;
    END IF;

    SELECT m.Outcome INTO v_out
      FROM Maintenance m
     WHERE m.EndDate IS NOT NULL
       AND m.EndDate <= p_at
       AND ((p_kind = 'Ride'  AND m.RideID  = p_id)
         OR (p_kind = 'Game'  AND m.GameID  = p_id)
         OR (p_kind = 'Venue' AND m.VenueID = p_id))
     ORDER BY m.EndDate DESC, m.StartDate DESC
     LIMIT 1;

    RETURN (v_out IS NOT NULL AND v_out <> 'Fixed');
END$$

-- [RULE] sp_RefreshRideStatus: sets Ride.Status from fn_UnderMaintenance at the current time.
CREATE PROCEDURE sp_RefreshRideStatus(IN p_ride INT UNSIGNED)
BEGIN
    IF p_ride IS NOT NULL THEN
        UPDATE Ride
           SET Status = IF(fn_UnderMaintenance('Ride', p_ride, NOW()), 'Maintenance', 'Open')
         WHERE RideID = p_ride;
    END IF;
END$$

-- [RULE] sp_AssertTicketValid: ticket must exist, match the date, be unrefunded, and be used during park hours.
CREATE PROCEDURE sp_AssertTicketValid(IN p_ticket INT UNSIGNED, IN p_at DATETIME)
BEGIN
    DECLARE v_visit DATE;
    DECLARE v_open  TIME;
    DECLARE v_close TIME;
    SELECT VisitDate INTO v_visit FROM Ticket WHERE TicketID = p_ticket;
    IF v_visit IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket does not exist';
    END IF;
    IF v_visit <> DATE(p_at) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket is not valid for this date';
    END IF;
    IF EXISTS (SELECT 1 FROM TicketRefund WHERE TicketID = p_ticket) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket has been refunded';
    END IF;
    SELECT OpeningTime, ClosingTime INTO v_open, v_close FROM Park WHERE ParkID = 1;
    IF TIME(p_at) < v_open OR TIME(p_at) >= v_close THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Park is closed at that time';
    END IF;
END$$

-- [RULE] fn_WeatherCloses: exceeding any one Park limit closes outdoor rides.
CREATE FUNCTION fn_WeatherCloses(p_park TINYINT UNSIGNED, p_temp SMALLINT,
                                 p_wind SMALLINT UNSIGNED, p_light DECIMAL(4,1))
RETURNS BOOL
READS SQL DATA
BEGIN
    DECLARE v_wind  SMALLINT UNSIGNED;
    DECLARE v_light DECIMAL(4,1);
    DECLARE v_tmax  SMALLINT;
    DECLARE v_tmin  SMALLINT;
    SELECT MaxWindMph, MinLightningMiles, MaxTempF, MinTempF INTO v_wind, v_light, v_tmax, v_tmin
      FROM Park WHERE ParkID = p_park;
    IF v_wind IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown park';
    END IF;
    RETURN (p_wind >= v_wind OR p_light <= v_light OR p_temp >= v_tmax OR p_temp <= v_tmin);
END$$

-- [RULE] fn_TicketPrice: day pass price; members pay 0; Express add-on when wanted and not in the tier.
CREATE FUNCTION fn_TicketPrice(p_membership INT UNSIGNED, p_express BOOL)
RETURNS DECIMAL(6,2)
READS SQL DATA
BEGIN
    DECLARE v_day  DECIMAL(6,2);
    DECLARE v_add  DECIMAL(6,2);
    DECLARE v_incl BOOL;
    SELECT DayPassPrice, ExpressAddOnPrice INTO v_day, v_add FROM Park WHERE ParkID = 1;
    IF v_day IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Park is not set up';
    END IF;
    SET v_incl = 0;
    IF p_membership IS NOT NULL THEN
        SELECT COALESCE(IncludesExpress, 0) INTO v_incl FROM Membership WHERE MembershipID = p_membership;
    END IF;
    RETURN IF(p_membership IS NULL, v_day, 0) + IF(p_express = 1 AND v_incl = 0, v_add, 0);
END$$

-- [RULE] sp_AssertTicketRules: active customer, capacity, membership ownership, dates, weekday-only tiers.
-- p_self = ticket being edited (0 for new); p_express = 1 when the tier includes Express.
CREATE PROCEDURE sp_AssertTicketRules(IN p_customer INT UNSIGNED, IN p_membership INT UNSIGNED,
                                      IN p_visit DATE, IN p_self INT UNSIGNED, OUT p_express BOOL)
BEGIN
    DECLARE v_max   INT UNSIGNED;
    DECLARE v_sold  INT UNSIGNED;
    DECLARE v_cust  INT UNSIGNED;
    DECLARE v_start DATE;
    DECLARE v_end   DATE;
    DECLARE v_any   BOOL;
    SET p_express = 0;

    IF NOT EXISTS (SELECT 1 FROM Customer WHERE CustomerID = p_customer AND IsActive = 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer is inactive or does not exist';
    END IF;

    SELECT MaxOccupancy INTO v_max FROM Park WHERE ParkID = 1;
    IF v_max IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Park is not set up';
    END IF;
    SELECT COUNT(*) INTO v_sold FROM Ticket t
     WHERE t.VisitDate = p_visit AND t.TicketID <> p_self
       AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);
    IF v_sold >= v_max THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Park is at capacity for that date';
    END IF;

    IF p_membership IS NOT NULL THEN
        SELECT CustomerID, StartDate, EndDate, IncludesExpress, AnyDayAccess INTO v_cust, v_start, v_end, p_express, v_any
          FROM Membership WHERE MembershipID = p_membership;
        IF v_cust IS NULL OR v_cust <> p_customer THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Membership does not belong to this customer';
        END IF;
        IF p_visit < v_start OR p_visit > v_end THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Membership is not active on the visit date';
        END IF;
        IF v_any = 0 AND DAYOFWEEK(p_visit) IN (1, 7) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This membership tier is valid on weekdays only';
        END IF;
    END IF;
END$$

-- [RULE] sp_AssertNoMembershipOverlap: a customer holds at most one membership on any day.
-- p_self = membership being edited (0 for new).
CREATE PROCEDURE sp_AssertNoMembershipOverlap(IN p_self INT UNSIGNED, IN p_customer INT UNSIGNED,
                                              IN p_start DATE, IN p_end DATE)
BEGIN
    IF EXISTS (SELECT 1 FROM Membership m
                WHERE m.CustomerID = p_customer
                  AND m.MembershipID <> p_self
                  AND p_start <= m.EndDate
                  AND p_end   >= m.StartDate) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer already has a membership covering those dates';
    END IF;
END$$

-- [RULE] sp_AssertShift: no overlapping shifts for one employee; no clock-in before hire date.
-- p_self = shift being edited (0 for new); open shifts (ClockOut empty) run to the end of time.
CREATE PROCEDURE sp_AssertShift(IN p_self INT UNSIGNED, IN p_emp INT UNSIGNED,
                                IN p_in DATETIME, IN p_out DATETIME)
BEGIN
    DECLARE v_hired DATE;
    SELECT HireDate INTO v_hired FROM Employee WHERE EmployeeID = p_emp;
    IF DATE(p_in) < v_hired THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shift starts before the hire date';
    END IF;
    IF EXISTS (SELECT 1 FROM Shift s
                WHERE s.EmployeeID = p_emp
                  AND s.ShiftID <> p_self
                  AND p_in < COALESCE(s.ClockOut, '9999-12-31 23:59:59')
                  AND COALESCE(p_out, '9999-12-31 23:59:59') > s.ClockIn) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shift overlaps another shift for this employee';
    END IF;
END$$

-- TRIGGERS

-- [RULE] Weather insert: derive ClosesOutdoorRides.
CREATE TRIGGER trg_WeatherLog_BI BEFORE INSERT ON WeatherLog
FOR EACH ROW
BEGIN
    SET NEW.ClosesOutdoorRides = fn_WeatherCloses(NEW.ParkID, NEW.TemperatureF, NEW.WindMph, NEW.LightningMiles);
END$$

-- [RULE] Ticket insert: capacity, membership checks, Express benefit, price.
CREATE TRIGGER trg_Ticket_BI BEFORE INSERT ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_exp BOOL;
    CALL sp_AssertTicketRules(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate, 0, v_exp);
    IF v_exp THEN
        SET NEW.HasExpress = 1;
    END IF;
    SET NEW.TicketPrice = fn_TicketPrice(NEW.MembershipID, NEW.HasExpress);
END$$

-- [RULE] Membership insert: active customer, tier still for sale, no overlap, price from MembershipTier.
CREATE TRIGGER trg_Membership_BI BEFORE INSERT ON Membership
FOR EACH ROW
BEGIN
    DECLARE v_price DECIMAL(8,2);
    DECLARE v_sale  BOOL;
    IF NOT EXISTS (SELECT 1 FROM Customer WHERE CustomerID = NEW.CustomerID AND IsActive = 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer is inactive or does not exist';
    END IF;
    SELECT AnnualPrice, IsForSale INTO v_price, v_sale FROM MembershipTier WHERE Tier = NEW.Tier;
    IF v_sale = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This membership tier is no longer sold';
    END IF;
    CALL sp_AssertNoMembershipOverlap(0, NEW.CustomerID, NEW.StartDate, NEW.EndDate);
    SET NEW.Price = v_price;
END$$

-- [RULE] Membership update: no overlap; tier change re-prices from MembershipTier.
CREATE TRIGGER trg_Membership_BU BEFORE UPDATE ON Membership
FOR EACH ROW
BEGIN
    CALL sp_AssertNoMembershipOverlap(OLD.MembershipID, NEW.CustomerID, NEW.StartDate, NEW.EndDate);
    IF NOT (NEW.Tier <=> OLD.Tier) THEN
        SET NEW.Price = (SELECT AnnualPrice FROM MembershipTier WHERE Tier = NEW.Tier);
    END IF;
END$$

-- [RULE] Ride log insert: retired rides rejected; boardings fully checked, wait readings otherwise stored as-is.
CREATE TRIGGER trg_RideLog_BI BEFORE INSERT ON RideLog
FOR EACH ROW
BEGIN
    DECLARE v_indoor BOOL;
    DECLARE v_minh   SMALLINT UNSIGNED;
    DECLARE v_height SMALLINT UNSIGNED;
    DECLARE v_elig   BOOL;
    DECLARE v_tkexp  BOOL;
    DECLARE v_active BOOL;

    SELECT IsIndoor, MinHeightCm, IsExpressEligible, IsActive INTO v_indoor, v_minh, v_elig, v_active FROM Ride WHERE RideID = NEW.RideID;
    IF v_active = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride is no longer in service';
    END IF;

    IF NEW.EventType = 'Boarding' THEN
        CALL sp_AssertTicketValid(NEW.TicketID, NEW.LoggedAt);

        IF fn_UnderMaintenance('Ride', NEW.RideID, NEW.LoggedAt) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride was under maintenance';
        END IF;

        IF v_indoor = 0 AND EXISTS (SELECT 1 FROM WeatherLog w
                                     WHERE w.ClosesOutdoorRides = 1
                                       AND NEW.LoggedAt >= w.StartedAt
                                       AND (w.EndedAt IS NULL OR NEW.LoggedAt < w.EndedAt)) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Weather has closed outdoor rides';
        END IF;

        SELECT c.HeightCm INTO v_height
          FROM Ticket t JOIN Customer c ON c.CustomerID = t.CustomerID
         WHERE t.TicketID = NEW.TicketID;
        IF v_height < v_minh THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Guest is below the ride height requirement';
        END IF;

        IF NEW.UsedExpress = 1 THEN
            SELECT HasExpress INTO v_tkexp FROM Ticket WHERE TicketID = NEW.TicketID;
            IF v_tkexp = 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket does not include Express';
            END IF;
            IF v_elig = 0 THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride is not Express eligible';
            END IF;
        END IF;
    END IF;
END$$

-- [RULE] Game play insert: valid ticket, game in service, price snapshot.
CREATE TRIGGER trg_GamePlay_BI BEFORE INSERT ON GamePlay
FOR EACH ROW
BEGIN
    DECLARE v_price  DECIMAL(6,2);
    DECLARE v_active BOOL;
    CALL sp_AssertTicketValid(NEW.TicketID, NEW.PlayedAt);
    IF fn_UnderMaintenance('Game', NEW.GameID, NEW.PlayedAt) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game was under maintenance';
    END IF;
    SELECT PlayPrice, IsActive INTO v_price, v_active FROM Game WHERE GameID = NEW.GameID;
    IF v_active = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game is no longer in service';
    END IF;
    SET NEW.AmountPaid = v_price;
END$$

-- [RULE] Purchase insert: valid ticket, venue open, price snapshot.
CREATE TRIGGER trg_Purchase_BI BEFORE INSERT ON Purchase
FOR EACH ROW
BEGIN
    DECLARE v_venue INT UNSIGNED;
    DECLARE v_price DECIMAL(8,2);
    DECLARE v_active BOOL;
    CALL sp_AssertTicketValid(NEW.TicketID, NEW.PurchasedAt);
    SELECT i.VenueID, i.Price, (i.IsActive = 1 AND v.IsActive = 1) INTO v_venue, v_price, v_active
      FROM Item i JOIN Venue v ON v.VenueID = i.VenueID WHERE i.ItemID = NEW.ItemID;
    IF v_venue IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item does not exist';
    END IF;
    IF v_active = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item is no longer sold';
    END IF;
    IF fn_UnderMaintenance('Venue', v_venue, NEW.PurchasedAt) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Venue was under maintenance';
    END IF;
    SET NEW.UnitPrice = v_price;
END$$

-- [RULE] Refund insert: not before purchase; a weather refund needs an event that closed rides on the visit date.
CREATE TRIGGER trg_TicketRefund_BI BEFORE INSERT ON TicketRefund
FOR EACH ROW
BEGIN
    DECLARE v_visit  DATE;
    DECLARE v_bought DATETIME;
    SELECT VisitDate, PurchaseDate INTO v_visit, v_bought FROM Ticket WHERE TicketID = NEW.TicketID;
    IF NEW.RefundedAt < v_bought THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refund is dated before the ticket was bought';
    END IF;
    IF NEW.WeatherID IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM WeatherLog w
            WHERE w.WeatherID = NEW.WeatherID
              AND w.ClosesOutdoorRides = 1
              AND DATE(w.StartedAt) <= v_visit
              AND (w.EndedAt IS NULL OR DATE(w.EndedAt) >= v_visit)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Weather event did not close rides on the visit date';
    END IF;
END$$

-- [RULE] Maintenance crew: active technicians only.
CREATE TRIGGER trg_MaintCrew_BI BEFORE INSERT ON MaintenanceCrew
FOR EACH ROW
BEGIN
    DECLARE v_title  VARCHAR(30);
    DECLARE v_active BOOL;
    SELECT JobTitle, IsActive INTO v_title, v_active FROM Employee WHERE EmployeeID = NEW.EmployeeID;
    IF v_title <> 'Technician' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only technicians can be on a maintenance crew';
    END IF;
    IF v_active = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee is inactive';
    END IF;
END$$

-- [RULE] Maintenance insert: refresh Ride.Status.
CREATE TRIGGER trg_Maint_AI AFTER INSERT ON Maintenance
FOR EACH ROW
BEGIN
    CALL sp_RefreshRideStatus(NEW.RideID);
END$$

-- [RULE] Maintenance update: refresh Ride.Status.
CREATE TRIGGER trg_Maint_AU AFTER UPDATE ON Maintenance
FOR EACH ROW
BEGIN
    CALL sp_RefreshRideStatus(NEW.RideID);
END$$

-- [RULE] Ride certification: ride operators only, not before hire date.
CREATE TRIGGER trg_RideCert_BI BEFORE INSERT ON RideCertification
FOR EACH ROW
BEGIN
    DECLARE v_title VARCHAR(30);
    DECLARE v_hired DATE;
    SELECT JobTitle, HireDate INTO v_title, v_hired FROM Employee WHERE EmployeeID = NEW.EmployeeID;
    IF v_title <> 'Ride Operator' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only ride operators can be ride certified';
    END IF;
    IF NEW.CertifiedOn < v_hired THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Certification date is before the hire date';
    END IF;
END$$

-- [RULE] Shift insert: active employee, after hire date, no overlap.
CREATE TRIGGER trg_Shift_BI BEFORE INSERT ON Shift
FOR EACH ROW
BEGIN
    IF NOT EXISTS (SELECT 1 FROM Employee WHERE EmployeeID = NEW.EmployeeID AND IsActive = 1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Employee is inactive or does not exist';
    END IF;
    CALL sp_AssertShift(0, NEW.EmployeeID, NEW.ClockIn, NEW.ClockOut);
END$$

-- [RULE] Shift update (e.g. clock-out): after hire date, no overlap.
CREATE TRIGGER trg_Shift_BU BEFORE UPDATE ON Shift
FOR EACH ROW
BEGIN
    CALL sp_AssertShift(OLD.ShiftID, NEW.EmployeeID, NEW.ClockIn, NEW.ClockOut);
END$$

-- [RULE] Weather update: closure flag always recomputed.
CREATE TRIGGER trg_WeatherLog_BU BEFORE UPDATE ON WeatherLog
FOR EACH ROW
BEGIN
    SET NEW.ClosesOutdoorRides = fn_WeatherCloses(NEW.ParkID, NEW.TemperatureF, NEW.WindMph, NEW.LightningMiles);
END$$

-- [RULE] Ticket update: guest, membership and date locked once used; otherwise rechecked like a new ticket.
-- Price recomputed only when membership or Express changes.
CREATE TRIGGER trg_Ticket_BU BEFORE UPDATE ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_exp BOOL;
    IF NOT (NEW.CustomerID <=> OLD.CustomerID
        AND NEW.MembershipID <=> OLD.MembershipID
        AND NEW.VisitDate <=> OLD.VisitDate) THEN
        IF EXISTS (SELECT 1 FROM RideLog  WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM GamePlay WHERE TicketID = OLD.TicketID)
        OR EXISTS (SELECT 1 FROM Purchase WHERE TicketID = OLD.TicketID) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket has activity; guest, membership and date cannot change';
        END IF;
        CALL sp_AssertTicketRules(NEW.CustomerID, NEW.MembershipID, NEW.VisitDate, OLD.TicketID, v_exp);
        IF v_exp THEN
            SET NEW.HasExpress = 1;
        END IF;
    END IF;
    IF NOT (NEW.MembershipID <=> OLD.MembershipID AND NEW.HasExpress <=> OLD.HasExpress) THEN
        SET NEW.TicketPrice = fn_TicketPrice(NEW.MembershipID, NEW.HasExpress);
    END IF;
END$$

-- [RULE] Guest activity logs are permanent: no edits to RideLog, GamePlay, Purchase, TicketRefund.
CREATE TRIGGER trg_RideLog_BU BEFORE UPDATE ON RideLog
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride log entries cannot be edited'$$

CREATE TRIGGER trg_GamePlay_BU BEFORE UPDATE ON GamePlay
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game play entries cannot be edited'$$

CREATE TRIGGER trg_Purchase_BU BEFORE UPDATE ON Purchase
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Purchases cannot be edited'$$

CREATE TRIGGER trg_TicketRefund_BU BEFORE UPDATE ON TicketRefund
FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refunds cannot be edited'$$

DELIMITER ;

-- [RULE] Every 15 minutes, re-sync Ride.Status so jobs scheduled for the future flip it when they start.
-- Needs event_scheduler = ON (the MySQL 8 default).
CREATE EVENT ev_RefreshRideStatus
    ON SCHEDULE EVERY 15 MINUTE
    DO UPDATE Ride
          SET Status = IF(fn_UnderMaintenance('Ride', RideID, NOW()), 'Maintenance', 'Open');

-- REPORT VIEWS

-- [VIEW] v_CustomersPerMonth: distinct visiting customers per month; refunds excluded.
CREATE VIEW v_CustomersPerMonth AS
SELECT YEAR(t.VisitDate)  AS VisitYear,
       MONTH(t.VisitDate) AS VisitMonth,
       COUNT(DISTINCT t.CustomerID) AS Customers
  FROM Ticket t
 WHERE NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)
 GROUP BY YEAR(t.VisitDate), MONTH(t.VisitDate);

-- [VIEW] v_DailyAttendance: valid and refunded tickets, capacity percent, revenue per day.
CREATE VIEW v_DailyAttendance AS
SELECT t.VisitDate,
       SUM(rf.TicketID IS NULL)     AS ValidTickets,
       SUM(rf.TicketID IS NOT NULL) AS RefundedTickets,
       ROUND(100 * SUM(rf.TicketID IS NULL) /
             (SELECT MaxOccupancy FROM Park WHERE ParkID = 1), 1) AS PctOfCapacity,
       SUM(CASE WHEN rf.TicketID IS NULL THEN t.TicketPrice ELSE 0 END) AS TicketRevenue
  FROM Ticket t LEFT JOIN TicketRefund rf ON rf.TicketID = t.TicketID
 GROUP BY t.VisitDate;

-- [VIEW] v_RideAvailability: current ride state (retired, maintenance, weather, open).
CREATE VIEW v_RideAvailability AS
SELECT z.ZoneName, r.RideID, r.RideName,
       CASE WHEN r.IsActive = 0 THEN 'Closed - Retired'
            WHEN fn_UnderMaintenance('Ride', r.RideID, NOW()) THEN 'Closed - Maintenance'
            WHEN r.IsIndoor = 0 AND EXISTS (
                 SELECT 1 FROM WeatherLog w
                  WHERE w.ClosesOutdoorRides = 1 AND NOW() >= w.StartedAt
                    AND (w.EndedAt IS NULL OR NOW() < w.EndedAt)) THEN 'Closed - Weather'
            ELSE 'Open' END AS CurrentState
  FROM Ride r JOIN Zone z ON z.ZoneID = r.ZoneID;

-- [VIEW] v_ZoneRideTraffic: boardings per ride by zone.
CREATE VIEW v_ZoneRideTraffic AS
SELECT z.ZoneName, r.RideName, COUNT(l.RideLogID) AS Boardings
  FROM Zone z
  JOIN Ride r ON r.ZoneID = z.ZoneID
  LEFT JOIN RideLog l ON l.RideID = r.RideID AND l.EventType = 'Boarding'
 GROUP BY z.ZoneID, z.ZoneName, r.RideID, r.RideName;

-- [VIEW] v_VisitSpending: per-ticket spend on food, shop and games.
CREATE VIEW v_VisitSpending AS
SELECT t.TicketID, t.VisitDate, t.TicketPrice,
       COALESCE((SELECT SUM(p.Quantity * p.UnitPrice)
                   FROM Purchase p
                   JOIN Item i  ON i.ItemID  = p.ItemID
                   JOIN Venue v ON v.VenueID = i.VenueID
                  WHERE p.TicketID = t.TicketID AND v.VenueType = 'Restaurant'), 0) AS FoodTotal,
       COALESCE((SELECT SUM(p.Quantity * p.UnitPrice)
                   FROM Purchase p
                   JOIN Item i  ON i.ItemID  = p.ItemID
                   JOIN Venue v ON v.VenueID = i.VenueID
                  WHERE p.TicketID = t.TicketID AND v.VenueType = 'Gift Shop'), 0) AS ShopTotal,
       COALESCE((SELECT SUM(g.AmountPaid)
                   FROM GamePlay g WHERE g.TicketID = t.TicketID), 0) AS GameTotal
  FROM Ticket t
 WHERE NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID);

-- [VIEW] v_WeatherImpact: weather events with weather-related refund counts and amounts.
CREATE VIEW v_WeatherImpact AS
SELECT w.WeatherID, w.WeatherType, w.StartedAt, w.EndedAt,
       w.TemperatureF, w.WindMph, w.LightningMiles,
       w.ClosesOutdoorRides,
       COUNT(rf.TicketID)              AS WeatherRefunds,
       COALESCE(SUM(t.TicketPrice), 0) AS RefundedAmount
  FROM WeatherLog w
  LEFT JOIN TicketRefund rf ON rf.WeatherID = w.WeatherID
  LEFT JOIN Ticket t        ON t.TicketID   = rf.TicketID
 GROUP BY w.WeatherID;

-- [VIEW] v_MaintenanceHistory: every job with type, crew size, downtime, outcome.
CREATE VIEW v_MaintenanceHistory AS
SELECT m.MaintenanceID,
       CASE WHEN m.RideID IS NOT NULL THEN 'Ride'
            WHEN m.GameID IS NOT NULL THEN 'Game'
            ELSE v.VenueType END AS FacilityKind,
       COALESCE(r.RideName, g.GameName, v.VenueName) AS FacilityName,
       m.MaintType, m.IsPlanned, m.StartDate, m.EndDate, m.Outcome,
       (SELECT COUNT(*) FROM MaintenanceCrew c WHERE c.MaintenanceID = m.MaintenanceID) AS CrewSize,
       TIMESTAMPDIFF(HOUR, m.StartDate, COALESCE(m.EndDate, NOW())) AS HoursDown
  FROM Maintenance m
  LEFT JOIN Ride r  ON r.RideID  = m.RideID
  LEFT JOIN Game g  ON g.GameID  = m.GameID
  LEFT JOIN Venue v ON v.VenueID = m.VenueID;

-- [VIEW] v_MembershipSummary: per tier current price, sold, active, expiring, revenue, visits.
CREATE VIEW v_MembershipSummary AS
SELECT x.Tier, x.CurrentPrice, x.Memberships, x.ActiveNow, x.ExpiringIn30Days, x.MembershipRevenue, x.Visits,
       ROUND(x.Visits / NULLIF(x.Memberships, 0), 2) AS VisitsPerMembership
  FROM (SELECT tl.Tier,
               tl.AnnualPrice AS CurrentPrice,
               COUNT(m.MembershipID) AS Memberships,
               COALESCE(SUM(CURDATE() BETWEEN m.StartDate AND m.EndDate), 0) AS ActiveNow,
               COALESCE(SUM(m.EndDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)), 0) AS ExpiringIn30Days,
               COALESCE(SUM(m.Price), 0) AS MembershipRevenue,
               (SELECT COUNT(*) FROM Ticket t
                  JOIN Membership m2 ON m2.MembershipID = t.MembershipID
                 WHERE m2.Tier = tl.Tier
                   AND NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)) AS Visits
          FROM MembershipTier tl
          LEFT JOIN Membership m ON m.Tier = tl.Tier
         GROUP BY tl.Tier, tl.AnnualPrice) x;

-- [VIEW] v_WaitTimeByRide: wait readings count, average, max, last reading per ride.
CREATE VIEW v_WaitTimeByRide AS
SELECT z.ZoneName, r.RideID, r.RideName,
       COUNT(l.RideLogID)           AS Readings,
       ROUND(AVG(l.WaitMinutes), 1) AS AvgWaitMinutes,
       MAX(l.WaitMinutes)           AS MaxWaitMinutes,
       MAX(l.LoggedAt)              AS LastReadingAt
  FROM Ride r
  JOIN Zone z ON z.ZoneID = r.ZoneID
  LEFT JOIN RideLog l ON l.RideID = r.RideID AND l.EventType = 'Wait Reading'
 GROUP BY z.ZoneID, z.ZoneName, r.RideID, r.RideName;

-- [VIEW] v_RevenueBySource: daily revenue by source (Tickets, Memberships, Food, Shop, Games).
-- [RULE] Memberships counted whole on StartDate; refunded tickets excluded.
CREATE VIEW v_RevenueBySource AS
SELECT t.VisitDate AS RevenueDate, 'Tickets' AS Source, SUM(t.TicketPrice) AS Revenue
  FROM Ticket t
 WHERE NOT EXISTS (SELECT 1 FROM TicketRefund r WHERE r.TicketID = t.TicketID)
 GROUP BY t.VisitDate
UNION ALL
SELECT m.StartDate, 'Memberships', SUM(m.Price)
  FROM Membership m
 GROUP BY m.StartDate
UNION ALL
SELECT DATE(p.PurchasedAt),
       CASE v.VenueType WHEN 'Restaurant' THEN 'Food' ELSE 'Shop' END,
       SUM(p.Quantity * p.UnitPrice)
  FROM Purchase p
  JOIN Item i  ON i.ItemID  = p.ItemID
  JOIN Venue v ON v.VenueID = i.VenueID
 GROUP BY DATE(p.PurchasedAt), CASE v.VenueType WHEN 'Restaurant' THEN 'Food' ELSE 'Shop' END
UNION ALL
SELECT DATE(g.PlayedAt), 'Games', SUM(g.AmountPaid)
  FROM GamePlay g
 GROUP BY DATE(g.PlayedAt);

-- [VIEW] v_StaffByZone: staff per zone and job title, and how many are clocked in now.
-- [RULE] Empty zones show Staff = 0; multi-zone employees count in each zone.
CREATE VIEW v_StaffByZone AS
SELECT z.ZoneName, e.JobTitle,
       COUNT(e.EmployeeID) AS Staff,
       COALESCE(SUM(EXISTS (SELECT 1 FROM Shift s
                             WHERE s.EmployeeID = e.EmployeeID AND s.ClockOut IS NULL)), 0) AS ClockedInNow
  FROM Zone z
  LEFT JOIN EmployeeZone ez ON ez.ZoneID = z.ZoneID
  LEFT JOIN Employee e      ON e.EmployeeID = ez.EmployeeID
 GROUP BY z.ZoneID, z.ZoneName, e.JobTitle;
