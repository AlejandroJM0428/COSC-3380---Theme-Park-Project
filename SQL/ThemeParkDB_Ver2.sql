drop database if exists theme_park;
create database theme_park;
SET FOREIGN_KEY_CHECKS = 1;
USE theme_park;

create table Park(
ParkID int unsigned auto_increment primary key,
ParkName varchar(50) not null,
OpeningTIme time(0) not null,
ClosingTime time(0) not null,
Address varchar(40) not null,
MaxOccupancy int unsigned not null,
constraint Park_Hrs_CHK check (ClosingTime > OpeningTIme)
);
#REVISED: no ticketsold, added new attributes
create table WeatherLog(
WeatherID int unsigned auto_increment primary key,
ParkID int unsigned not null,
StartDate datetime not null,
EndDate datetime not null,
TImeElapsed int not null,
WeatherType varchar(20) not null,
isParkWide boolean not null, #dont use defaults, even for booleans?
constraint FK_WeatherLog
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
TickePrice decimal(2,2) not null default 0.00,
EstimatedWaitTime smallint unsigned default 0,
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
ResturantType varchar(20) not null,
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
    IsAlcoholic   BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_menuitem_restaurant
        FOREIGN KEY (RestaurantID) REFERENCES Restaurant(RestaurantID)
        ON DELETE CASCADE
);
create table GiftShop(
GIftShopID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
GiftShopName varchar(50) not null
);
create table Ride(
RideID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
RideCapacity int unsigned not null,
RideType varchar(20) not null,
MinimumHeightCm smallint unsigned, #it can be null if the ride in question is for all ages
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
startdate datetime not null,
Enddate datetime null,
Reason varchar(100) not null,
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
create table Employees(
EmployeeID int unsigned auto_increment primary key,
ParkID int unsigned  null,
RideID int unsigned  null,
ResturantID int unsigned null,
GameID int unsigned not null,
HourlyPay decimal(5,2) not null default 0.00,
FirstName varchar(50) not null,
LastName varchar(50) not null,
DOB date not null,
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
CONSTRAINT FK_Employee_Resturant
	FOREIGN KEY (ResturantID) REFERENCES Resturant(ResturantID)
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
CONSTRAINT FK_Ticket_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Ticket_Customer
        FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID)
        ON DELETE CASCADE
);
create table Customers(
CustomerID int unsigned auto_increment primary key,
ParkID int unsigned not null,
FirstName varchar(50) not null,
LastName varchar(50) not null,
DOB date not null,
Height decimal(4,1),
CONSTRAINT FK_Customer_Park
	FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
	ON DELETE CASCADE
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
create table Shift(
ShiftID int unsigned auto_increment primary key,	
EmployeeID INT UNSIGNED NOT NULL,
ClockIn   DATETIME     NOT NULL,                  #was missing
ClockOut  DATETIME     NULL, 
ShiftRating tinyint unsigned null,
CONSTRAINT FK_Shift_Employee
	FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID)
	ON DELETE CASCADE,
CONSTRAINT Shift_Time_CHK
	CHECK (ClockOut IS NULL OR ClockOut > ClockIn),
constraint ShiftRating_CHK
	Check (shiftRating IS NULL OR shiftRating BETWEEN 1 AND 5)
);
#Queries for Reports
#Customers per month
SELECT Year(PurchaseDate), Month(PurchaseDate), COUNT(distinct CustomerID)
from ticket group by 1,2; 