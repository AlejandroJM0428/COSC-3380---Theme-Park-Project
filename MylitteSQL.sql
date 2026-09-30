set foreign key check = 1;

create table park(
ParkID int unsigned primary key,
OpeningTIme time(0) not null,
ClosingTime time(0) not null,
MaxOccupancy int(4) not null,
check (Closing_Time > Opening_time),
);
create table WeatherLog(
WeatherID int unsigned primary key,
ParkID int unsigned not null,
StartDate datetime not null,
EndDate datetime not null,
TImeElapsed int not null
constraint FK_WeatherLog
	foreign key(ParkID) references Park(ParkID)
    on delete cascade,
    check(EndDate is null or EndDate >= StartDate)
);
create table Games(
GameID int unsigned primary key,
ParkID int unsigned not null,
TickePrice decimal(2,2) not null default 0.00,
EstimatedWaitTime smallint unsigned default 0,
);
create table Resturant(
ResturantID int unsigned primary key,
ParkID int unsigned not null,
ResturantType varchar(20) not null,

);
create table Ticket(
TicketID int unsigned primary key,
ParkID int unsigned not null,
TicketPrice decimal(3,2) not null default 0.00,
IsMembership bool not null,
);
create table Ride(
RideID int unsigned primary key,
ParkID int unsigned not null,
RideCapacity int unsigned not null,
UnderMaintainance bool not null,
);

create table Employees(
EmployeeID int unsigned primary key,
ParkID int unsigned not null,
HourlyPay decimal(5,2) not null default 0.00,
FirstName varchar(50) not null,
LastNmae varchar(50) not null,
HoursPerWeek smallint not null
);
create table Customers(
CustomerID int unsigned primary key,
ParkID int unsigned not null,
FirstName varchar(50) not null,
LastName varchar(50) not null
);
create table Shift(
ShiftID int unsigned primary key,
ParkID int unsigned not null,
EmployeeID int unsigned not null,

)