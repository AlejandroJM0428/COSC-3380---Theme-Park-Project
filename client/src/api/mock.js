// Fake data shaped like the real database views, so pages can be built before any backend exists.
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))

const USERS = {
  admin: { username: 'admin', role: 'Admin' },
  manager: { username: 'manager', role: 'Manager' },
  cashier: { username: 'cashier', role: 'Cashier' },
  customer: { username: 'customer', role: 'Customer' },
  
}

export async function login(username, password) {
  await delay()
  const user = USERS[String(username).trim().toLowerCase()]
  if (!user || password !== 'password') throw new Error('Invalid username or password')
  return user
}

export async function register({ username }) {
  await delay()
  const key = String(username).trim().toLowerCase()
  if (USERS[key]) throw new Error('That username is already taken')
  USERS[key] = { username: String(username).trim(), role: 'Customer' }
  return USERS[key]
}

const reports = {
  'customers-per-month': [
    { VisitYear: 2026, VisitMonth: 4, Customers: 640 },
    { VisitYear: 2026, VisitMonth: 5, Customers: 812 },
    { VisitYear: 2026, VisitMonth: 6, Customers: 958 },
    { VisitYear: 2026, VisitMonth: 7, Customers: 1291 },
    { VisitYear: 2026, VisitMonth: 8, Customers: 1167 },
    { VisitYear: 2026, VisitMonth: 9, Customers: 674 },
  ],
  'daily-attendance': [
    { VisitDate: '2026-07-01', ValidTickets: 42, RefundedTickets: 1, PctOfCapacity: 2.1, TicketRevenue: 3779.58 },
    { VisitDate: '2026-07-02', ValidTickets: 38, RefundedTickets: 0, PctOfCapacity: 1.9, TicketRevenue: 3419.62 },
    { VisitDate: '2026-07-03', ValidTickets: 61, RefundedTickets: 2, PctOfCapacity: 3.1, TicketRevenue: 5489.39 },
    { VisitDate: '2026-07-04', ValidTickets: 187, RefundedTickets: 4, PctOfCapacity: 9.4, TicketRevenue: 16828.13 },
    { VisitDate: '2026-07-05', ValidTickets: 94, RefundedTickets: 3, PctOfCapacity: 4.7, TicketRevenue: 8459.06 },
    { VisitDate: '2026-07-06', ValidTickets: 40, RefundedTickets: 1, PctOfCapacity: 2.0, TicketRevenue: 3599.6 },
  ],
  'ride-availability': [
    { ZoneName: 'Adventure', RideID: 1, RideName: 'Thunder Ridge', CurrentState: 'Open' },
    { ZoneName: 'Adventure', RideID: 3, RideName: 'Cyclone Drop', CurrentState: 'Closed - Weather' },
    { ZoneName: 'Future', RideID: 9, RideName: 'Galaxy Rush', CurrentState: 'Closed - Maintenance' },
    { ZoneName: 'Fantasy', RideID: 6, RideName: 'Carousel of Dreams', CurrentState: 'Open' },
    { ZoneName: 'Midway', RideID: 12, RideName: 'Haunted Manor', CurrentState: 'Closed - Retired' },
  ],
  'zone-ride-traffic': [
    { ZoneName: 'Adventure', RideName: 'Thunder Ridge', Boardings: 3134 },
    { ZoneName: 'Future', RideName: 'Galaxy Rush', Boardings: 2827 },
    { ZoneName: 'Waterfront', RideName: 'Splash Canyon', Boardings: 2442 },
    { ZoneName: 'Fantasy', RideName: 'Dragon Flyer', Boardings: 1980 },
    { ZoneName: 'Midway', RideName: 'Haunted Manor', Boardings: 1510 },
  ],
  'ride-traffic-by-month': [
    { Month: '2026-07', RideName: 'Thunder Ridge', Boardings: 420 },
    { Month: '2026-07', RideName: 'Galaxy Rush', Boardings: 388 },
    { Month: '2026-07', RideName: 'Splash Canyon', Boardings: 341 },
  ],
  'wait-time-by-ride': [
    { ZoneName: 'Adventure', RideID: 1, RideName: 'Thunder Ridge', Readings: 120, AvgWaitMinutes: 48.2, MaxWaitMinutes: 95, LastReadingAt: '2026-09-30 17:45:00' },
    { ZoneName: 'Future', RideID: 9, RideName: 'Galaxy Rush', Readings: 118, AvgWaitMinutes: 41.7, MaxWaitMinutes: 80, LastReadingAt: '2026-09-30 17:45:00' },
    { ZoneName: 'Fantasy', RideID: 6, RideName: 'Carousel of Dreams', Readings: 110, AvgWaitMinutes: 9.3, MaxWaitMinutes: 20, LastReadingAt: '2026-09-30 17:45:00' },
  ],
  'visit-spending': [
    { TicketID: 101, VisitDate: '2026-07-04', TicketPrice: 89.99, FoodTotal: 31.45, ShopTotal: 24.0, GameTotal: 10.0 },
    { TicketID: 102, VisitDate: '2026-07-04', TicketPrice: 89.99, FoodTotal: 0, ShopTotal: 0, GameTotal: 4.5 },
    { TicketID: 103, VisitDate: '2026-07-05', TicketPrice: 0, FoodTotal: 18.5, ShopTotal: 12.0, GameTotal: 0 },
  ],
  'weather-impact': [
    { WeatherID: 1, WeatherType: 'Storm', StartedAt: '2026-05-12 14:10:00', EndedAt: '2026-05-12 16:00:00', TemperatureF: 78, WindMph: 32, LightningMiles: 3.0, ClosesOutdoorRides: 1, WeatherRefunds: 14, RefundedAmount: 1259.86 },
    { WeatherID: 2, WeatherType: 'Rain', StartedAt: '2026-05-20 11:00:00', EndedAt: '2026-05-20 13:00:00', TemperatureF: 70, WindMph: 12, LightningMiles: 99.9, ClosesOutdoorRides: 0, WeatherRefunds: 0, RefundedAmount: 0 },
    { WeatherID: 3, WeatherType: 'Storm', StartedAt: '2026-06-03 15:30:00', EndedAt: '2026-06-03 17:30:00', TemperatureF: 84, WindMph: 41, LightningMiles: 2.0, ClosesOutdoorRides: 1, WeatherRefunds: 22, RefundedAmount: 1979.78 },
    { WeatherID: 4, WeatherType: 'Heat', StartedAt: '2026-07-18 12:00:00', EndedAt: '2026-07-18 18:00:00', TemperatureF: 106, WindMph: 5, LightningMiles: 99.9, ClosesOutdoorRides: 1, WeatherRefunds: 3, RefundedAmount: 269.97 },
    { WeatherID: 5, WeatherType: 'Rain', StartedAt: '2026-07-22 10:30:00', EndedAt: '2026-07-22 12:30:00', TemperatureF: 75, WindMph: 38, LightningMiles: 99.9, ClosesOutdoorRides: 1, WeatherRefunds: 9, RefundedAmount: 809.91 },
  ],
  'maintenance-history': [
    { MaintenanceID: 1, FacilityKind: 'Ride', FacilityName: 'Thunder Ridge', MaintType: 'Routine Inspection', IsPlanned: 1, StartDate: '2026-05-03 06:30:00', EndDate: '2026-05-03 09:00:00', Outcome: 'Fixed', CrewSize: 2, HoursDown: 2 },
    { MaintenanceID: 2, FacilityKind: 'Ride', FacilityName: 'Galaxy Rush', MaintType: 'Emergency Repair', IsPlanned: 0, StartDate: '2026-05-19 13:10:00', EndDate: '2026-05-20 10:00:00', Outcome: 'Fixed', CrewSize: 3, HoursDown: 20 },
    { MaintenanceID: 3, FacilityKind: 'Game', FacilityName: 'Skee-Ball', MaintType: 'Preventive Service', IsPlanned: 1, StartDate: '2026-06-08 07:00:00', EndDate: '2026-06-08 08:30:00', Outcome: 'Fixed', CrewSize: 1, HoursDown: 1 },
    { MaintenanceID: 4, FacilityKind: 'Ride', FacilityName: 'Cyclone Drop', MaintType: 'Safety Recall', IsPlanned: 0, StartDate: '2026-06-21 09:00:00', EndDate: '2026-06-24 17:00:00', Outcome: 'Partially Fixed', CrewSize: 4, HoursDown: 80 },
    { MaintenanceID: 5, FacilityKind: 'Ride', FacilityName: 'Galaxy Rush', MaintType: 'Emergency Repair', IsPlanned: 0, StartDate: '2026-07-14 15:00:00', EndDate: null, Outcome: null, CrewSize: 2, HoursDown: 66 },
  ],
  'membership-summary': [
    { Tier: 'Basic', Memberships: 60, ActiveNow: 41, ExpiringIn30Days: 6, MembershipRevenue: 5999.4, Visits: 540, VisitsPerMembership: 9.0 },
    { Tier: 'Plus', Memberships: 45, ActiveNow: 33, ExpiringIn30Days: 4, MembershipRevenue: 8999.55, Visits: 610, VisitsPerMembership: 13.56 },
    { Tier: 'Premier', Memberships: 25, ActiveNow: 19, ExpiringIn30Days: 2, MembershipRevenue: 9999.75, Visits: 480, VisitsPerMembership: 19.2 },
  ],
  'revenue-by-source': [
    { RevenueDate: '2026-07-04', Source: 'Tickets', Revenue: 16828.13 },
    { RevenueDate: '2026-07-04', Source: 'Food', Revenue: 5240.5 },
    { RevenueDate: '2026-07-04', Source: 'Shop', Revenue: 1980.0 },
    { RevenueDate: '2026-07-04', Source: 'Games', Revenue: 905.5 },
    { RevenueDate: '2026-07-04', Source: 'Memberships', Revenue: 1249.9 },
  ],
  'staff-by-zone': [
    { ZoneName: 'Adventure', JobTitle: 'Ride Operator', Staff: 6, ClockedInNow: 4 },
    { ZoneName: 'Fantasy', JobTitle: 'Server', Staff: 3, ClockedInNow: 2 },
    { ZoneName: 'Future', JobTitle: 'Technician', Staff: 2, ClockedInNow: 1 },
    { ZoneName: 'Midway', JobTitle: 'Game Attendant', Staff: 4, ClockedInNow: 3 },
  ],
}

export async function getReport(endpoint) {
  await delay()
  const rows = reports[endpoint]
  if (!rows) throw new Error(`No mock data for report "${endpoint}"`)
  return rows.map((r) => ({ ...r })) // copy so pages can't mutate the originals
}
