
SET FOREIGN_KEY_CHECKS = 1;
USE theme_park;

create table Park(
ParkID int unsigned auto_increment primary key,
OpeningTIme time(0) not null,
ClosingTime time(0) not null,
MaxOccupancy int unsigned not null,
constraint Park_Hrs_CHK check (ClosingTime > OpeningTIme)
);
create table WeatherLog(
WeatherID int unsigned auto_increment primary key,
ParkID int unsigned not null,
StartDate datetime not null,
EndDate datetime not null,
TImeElapsed int not null,
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
TickePrice decimal(2,2) not null default 0.00,
EstimatedWaitTime smallint unsigned default 0,
 CONSTRAINT FK_Game_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Game_Zone
        FOREIGN KEY (ZoneID) REFERENCES Zone(ZoneID)
        ON DELETE CASCADE
);
create table Resturant(
ResturantID int unsigned auto_increment primary key,
ParkID int unsigned not null,
ZoneID int unsigned not null,
ResturantType varchar(20) not null,
CONSTRAINT FK_Resturant_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Resturant_Zone
        FOREIGN KEY (ZoneID) REFERENCES Zone(ZoneID)
        ON DELETE CASCADE	
);
create table Ticket(
TicketID int unsigned auto_increment primary key,
ParkID int unsigned not null,
TicketPrice decimal(3,2) not null default 0.00,
IsMembership bool not null

);
create table Ride(
RideID int unsigned auto_increment primary key,
ParkID int unsigned not null,
RideCapacity int unsigned not null,
UnderMaintainance bool not null default false,
CONSTRAINT FK_Ride_Park
        FOREIGN KEY (ParkID) REFERENCES Park(ParkID)
        ON DELETE CASCADE,
    CONSTRAINT FK_Ride_Zone
        FOREIGN KEY (ZoneID) REFERENCES Zone(ZoneID)
        ON DELETE CASCADE
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
create table Customers(
CustomerID int unsigned auto_increment primary key,
ParkID int unsigned not null,
FirstName varchar(50) not null,
LastName varchar(50) not null,
DOB date not null
);
create table Shift(
ShiftID int unsigned auto_increment primary key,
ParkID int unsigned not null,
EmployeeID int unsigned not null
)