drop database if exists theme_park;
create database theme_park;
SET FOREIGN_KEY_CHECKS = 1;
USE theme_park;

create table Park(
ParkID int unsigned auto_increment primary key,
ParkName varchar(50) not null,
OpeningTIme time(0) not null,
ClosingTime time(0) null,
Address varchar(40) not null,
MaxOccupancy int unsigned not null,
constraint Park_Hrs_CHK check (ClosingTime > OpeningTIme)
);
#REVISED: no ticketsold, added new attributes
create table WeatherLog(
WeatherLogID int unsigned auto_increment primary key,
ParkID int unsigned not null,
StartDate datetime not null,
EndDate datetime not null,
TImeElapsed int not null,
WeatherType varchar(20) not null,
isParkWide boolean not null, #dont use defaults, even for booleans?
constraint FK_WeatherLog_Park
	foreign key(ParkID) references Park(ParkID)
    on delete cascade,
    check(EndDate is null or EndDate >= StartDate)
);
create table Zone(
ZoneID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneName varchar(20) not null,
 constraint FK_Zone_Park
        foreign Key (ParkID) REFERENCES Zone(ZoneID)
        ON DELETE CASCADE,
    CONSTRAINT UQ_Zone_Name UNIQUE (ParkID, ZoneName)
);
create table Games(
GameID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
GameType varchar(50),
TickePrice decimal(2,2) not null,	
EstimatedWaitTime smallint unsigned,
 CONSTRAINT FK_Game_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Game_Zone
        FOREIGN KEY (ZoneID) REFERENCES Zone(ZoneID)
        ON DELETE CASCADE
);
create table Restaurant (
RestaurantID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
ResturantName varchar(20) not null,
ResturantType varchar(20),
Estimated_WaitTime smallint unsigned,
CONSTRAINT FK_Resturant_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Resturant_Zone
        FOREIGN KEY (ZoneID) REFERENCES Zone(ZoneID)
        ON DELETE CASCADE	
);
CREATE TABLE MenuItem (
    MenuItemID    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    RestaurantID  INT UNSIGNED NOT NULL,
    ItemName      VARCHAR(100) NOT NULL,
    ItemCategory  VARCHAR(50),
    Price         DECIMAL(6,2) NOT NULL,
    IsAlcoholic   BOOLEAN      NOT NULL,
    CONSTRAINT fk_menuitem_restaurant
        FOREIGN KEY (RestaurantID) REFERENCES Restaurant(RestaurantID)
        ON DELETE CASCADE
);
create table GiftShop(
GIftShopID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
GiftShopName varchar(50) not null,
constraint fk_giftshop_park
	foreign key (ParkID) references Park(ParkID)
    on delete cascade,
constraint fk_giftshop_zone
	foreign key (ZoneID) references Zone(ZoneID)
    on delete cascade
);
create table ProductItem(
ProductID int unsigned auto_increment primary key,
GIftShopID int unsigned not null,
ItemName varchar(100) not null,
ItemType varchar(100) not null,
ItemPrice decimal (4,2) unsigned not null,
constraint fk_productitem_giftshop
	foreign key (GiftshopID) references GiftShop(GiftShopID)
    on delete cascade
);
create table Customer(
CustomerID int unsigned auto_increment primary key,
ParkID int unsigned not null,
FirstName varchar(50) not null,
LastName varchar(50) not null,
DOB date not null,
Age tinyint unsigned,
Height decimal(4,1)
);
#New Attribute: Membership, which is a subtype of Customer
create table Membership(
MembershipID int unsigned auto_increment primary key,
CustomerID int unsigned not null,
Tier varchar(20) not null,
StartDate date not null,
EndDate date not null,
Price Decimal(8,2) not null,
AutoRenew Boolean not null,
constraint FK_Membership_Customer
	foreign key (CustomerID) references Customer(CustomerID)
    on delete cascade,
check (EndDate <= StartDate)
);
create table Ride(
RideID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
RideName varchar(50) not null,
RideCapacity int unsigned not null,
RideType varchar(20) not null,
RideStatus ENUM('operational','under_maintenance','closed') NOT NULL,
MinimumHeightCm smallint unsigned, #it can be null if the ride in question is for all ages
DateOpened date,
WaitTIme smallint unsigned,
CONSTRAINT FK_Ride_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
CONSTRAINT FK_Ride_Zone
	FOREIGN KEY (ZoneID) REFERENCES Zone(ZoneID)
	ON DELETE CASCADE
);
#new table: Ride Maintainance
create table RideMaintainance(
MaintainanceID int unsigned auto_increment primary key,
RideID int unsigned not null,
EmployeeID int unsigned null,
Startdate datetime not null,
Enddate datetime null,
Reason varchar(100) not null,
MaintenanceStatus ENUM('open','completed') NOT NULL,
constraint FK_Maintainance_Ride
	foreign key (RideID) references Ride(RideID)
	on delete cascade,
constraint Date_CHK
	check (Enddate is Null or Enddate >= Startdate)
);
CREATE TABLE RideLog (
    RideLogID      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    RideID         INT UNSIGNED NOT NULL,
    CustomerID     INT UNSIGNED NULL,
    RideTimestamp  DATETIME     NOT NULL,
    CONSTRAINT fk_ridelog_ride
        FOREIGN KEY (RideID) REFERENCES Ride(RideID)
        ON DELETE CASCADE,
    CONSTRAINT fk_ridelog_customer
        FOREIGN KEY (CustomerID) REFERENCES Customer(CustomerID)
        ON DELETE SET NULL
);

create table Employee(
EmployeeID int unsigned auto_increment primary key,
ParkID int unsigned not null,
RideID int unsigned null,
RestaurantID int unsigned null,
GameID int unsigned null,
GiftShopID int unsigned null,
HourlyPay decimal(5,2) not null,
FirstName varchar(50) not null,
LastName varchar(50) not null,
DOB date not null,
Jobtitle varchar(50) not null,
Department varchar(50),
Hiredate datetime not null,
HoursPerWeek smallint not null,
CONSTRAINT FK_Employee_Park
	FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
	ON DELETE CASCADE,
CONSTRAINT FK_Employee_Ride
	FOREIGN KEY (RideID) REFERENCES Ride(RideID)
	ON DELETE SET NULL,
CONSTRAINT FK_Employee_Game
	FOREIGN KEY (GameID) REFERENCES Games(GameID)
	ON DELETE SET NULL,
CONSTRAINT FK_Employee_Restaurant
	FOREIGN KEY (RestaurantID) REFERENCES Restaurant(RestaurantID)
	ON DELETE SET NULL,
CONSTRAINT FK_Employee_GiftShop
	FOREIGN KEY (GiftshopID) references GiftShop(GiftShopID)
	ON DELETE SET NULL,
CONSTRAINT HoursPerWeek_CHK CHECK (HoursPerWeek <= 40)
);
create table Ticket(
TicketID int unsigned auto_increment primary key,
ParkID int unsigned not null,
CustomerID int unsigned not null,
WeatherLogID int unsigned not null,
TicketPrice decimal(3,2) not null default 0.00,
PurchaseDate datetime not null,
RefundStatus enum('none','requested','refunded') NOT NULL,
RefundReason varchar(255) null,
CONSTRAINT FK_Ticket_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
CONSTRAINT FK_Ticket_WeatherLog
        FOREIGN KEY (WeatherLogID) REFERENCES WeatherLog(WeatherLogID)
        ON DELETE CASCADE,
CONSTRAINT FK_Ticket_Customer
        FOREIGN KEY (CustomerID) REFERENCES Customer(CustomerID)
        ON DELETE CASCADE
);

create table Shift(
ShiftID int unsigned auto_increment primary key,	
EmployeeID INT UNSIGNED NOT NULL,
ClockIn   DATETIME     NOT NULL,                  #was missing
ClockOut  DATETIME     NULL, 
ShiftRating tinyint unsigned null,
CONSTRAINT FK_Shift_Employee
	FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
	ON DELETE CASCADE,
CONSTRAINT Shift_Time_CHK
	CHECK (ClockOut IS NULL OR ClockOut > ClockIn),
constraint ShiftRating_CHK
	Check (shiftRating IS NULL OR shiftRating BETWEEN 1 AND 5)
);
