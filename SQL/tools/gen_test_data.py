#!/usr/bin/env python3
"""Generates SQL/00_clear_data.sql, SQL/01_park_and_reference.sql, SQL/02_test_data.sql and one file per dataset
in SQL/history/ (loaded in name order by SQL/tools/load_history.sh).
Deterministic for a given run date (fixed seed 3380). Every row is built to obey the schema's triggers.
Run: python3 SQL/tools/gen_test_data.py
All names and numbers are made up for the demo."""
import random
from bisect import bisect_right
from itertools import accumulate
from datetime import date, datetime, time, timedelta
from pathlib import Path
from collections import Counter

R = random.Random(3380)
OUT = Path(__file__).resolve().parent.parent
# ---- dates: history ends on the day the generator is run ----
TODAY = date.today()
LAST = TODAY - timedelta(days=1)          # last day with ride activity
START = date(2025, 4, 1)                  # park opening (used by the long-history stages 2 to 10)
# The current dataset blocks (stages 2 to 10 replace them one by one) are still the original 94-day block.
# They are written with their original Oct 2026 dates and moved so that they end on LAST: dd() does the move.
REF = date(2026, 10, 22)                  # the day the original block ended on
SHIFT_DAYS = TODAY - REF
FIRST = LAST - timedelta(days=93)         # first day of the 94-day block
def dd(y, m, d): return date(y, m, d) + SHIFT_DAYS
# one demo day in the future that is sold out at exactly MAX_OCC (a Saturday, at least 30 days away)
SOLD_OUT = TODAY + timedelta(days=30)
SOLD_OUT += timedelta(days=(5 - SOLD_OUT.weekday()) % 7)

# ---- capacity and price list (written into file 01, so history and today agree) ----
MAX_OCC = 440            # Park.MaxOccupancy (was 120). Set in stage 7 from the measured peak (331 tickets): the busiest ordinary day is about 75% of it.
DAY_PASS = 59.00
EXPRESS = 25.00
TIER_PRICE = {'Basic': 69.00, 'Plus': 89.00, 'Premier': 179.00}

# ---- volume and headcount targets (used from the stage named; see ROADMAP_BIG_DATA.md) ----
N_CUST = 3500            # customers who are not dependents and not demo customers (about 8% are inactive)
CUST_END = 6 + N_CUST    # customer ids 1 to 6 are the demo customers
TARGET_TICKETS = 25000   # stage 7
TARGET_PURCHASES = 60000 # stage 9
TARGET_RIDELOG = (100000, 150000)  # stage 8
HEADCOUNT = (80, 100)    # stage 5
assert N_CUST * 0.9 > MAX_OCC     # the sold-out day needs MAX_OCC different active customers
DEP_SHARE = 0.38        # share of adults aged 24 to 55 who have dependents
DEP_COUNTS = ([1, 2, 3, 4, 5, 6], [50, 32, 12, 4, 1.5, 0.5])   # how many dependents (6 is the limit per parent)

def q(s): return "'" + str(s).replace("'", "''") + "'"
def v(x):
    if x is None: return 'NULL'
    if isinstance(x, bool): return '1' if x else '0'
    if isinstance(x, (int, float)): return str(x)
    if isinstance(x, datetime): return q(x.strftime('%Y-%m-%d %H:%M:%S'))
    if isinstance(x, date): return q(x.isoformat())
    return q(x)
def insert(out, table, cols, rows, chunk=250):
    for i in range(0, len(rows), chunk):
        part = rows[i:i+chunk]
        out.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n" +
                   ",\n".join("  (" + ", ".join(v(x) for x in r) + ")" for r in part) + ";\n")
def dtm(d, h, m=0): return datetime.combine(d, time(h, m))

# ---------------- 01 park and reference ----------------
ZONES = [(1,'Main Street'),(2,'Thunder Canyon'),(3,'Adventure Bay'),(4,'Fantasy Forest'),(5,'Kids Corner')]
# id, zone, name, type, seats, minh, indoor, express, active
RIDES = [
 (1,1,'Heritage Railroad','Train',60,0,0,0,1),(2,1,'Grand Carousel','Carousel',40,0,0,0,1),
 (3,2,'Thunder Run','Coaster',28,122,0,1,1),(4,2,'Canyon Cyclone','Coaster',24,132,0,1,1),
 (5,2,'Rapids Rampage','Water Ride',16,107,0,1,1),(6,3,"Pirate's Plunge",'Water Ride',20,107,0,1,1),
 (7,3,"Kraken's Lair",'Dark Ride',30,102,1,1,1),(8,3,'Tidal Simulator','Simulator',24,117,1,1,1),
 (9,4,'Enchanted Journey','Dark Ride',36,0,1,0,1),(10,4,'Forest Express','Train',50,0,0,0,1),
 (11,4,"Wizard's Workshop",'Walkthrough',50,0,1,0,1),(12,4,"Dragon's Nest",'Coaster',20,107,0,1,1),
 (13,4,'Old Mill Ride','Dark Ride',20,0,1,0,0),(14,5,'Little Dino Dash','Coaster',16,91,0,0,1),
 (15,5,'Mini Carousel','Carousel',20,0,0,0,1)]
GAMES = [(1,1,'Ring Toss',3.00,1),(2,1,'Basketball Shot',5.00,1),(3,2,'Balloon Pop',4.00,1),
         (4,3,'Whack-a-Gator',3.00,1),(5,3,'Dunk Tank',4.50,1),(6,5,'Skee Ball',3.50,1),(7,5,'Duck Pond',2.50,0)]
VENUES = [(1,1,'Main Street Diner','Restaurant','Table Service'),(2,2,'Canyon Grill','Restaurant','Quick Service'),
          (3,3,'Bay Fish Shack','Restaurant','Quick Service'),(4,4,'Forest Pizza','Restaurant','Quick Service'),
          (5,5,'Sweet Treats Cart','Restaurant','Snack Cart'),(6,1,'Main Street Emporium','Gift Shop',None),
          (7,3,"Pirate's Trading Post",'Gift Shop',None),(8,2,'Canyon Outfitters','Gift Shop',None)]
ITEMS_RAW = {
 1:[('Classic Cheeseburger','Entree',12.99,0),('Chicken Tenders Basket','Entree',10.99,0),('Veggie Wrap','Entree',9.99,0),
    ('Fries','Side',4.99,0),('Apple Pie','Dessert',5.99,0),('Fountain Soda','Drink',3.99,0),('Craft Beer','Drink',8.50,1),('Lemonade','Drink',4.25,0)],
 2:[('BBQ Brisket Sandwich','Entree',13.49,0),('Smoked Sausage Plate','Entree',11.99,0),('Corn on the Cob','Side',4.50,0),
    ('Peach Cobbler','Dessert',5.50,0),('Iced Tea','Drink',3.50,0),('Margarita','Drink',9.50,1),('Bottled Water','Drink',2.99,0)],
 3:[('Fish and Chips','Entree',12.49,0),('Shrimp Basket','Entree',13.99,0),('Hush Puppies','Side',4.25,0),
    ('Key Lime Slice','Dessert',5.25,0),('Slushie','Drink',4.50,0)],
 4:[('Cheese Pizza Slice','Entree',5.99,0),('Pepperoni Slice','Entree',6.49,0),('Garlic Knots','Side',4.99,0),
    ('Chocolate Chip Cookie','Dessert',3.50,0),('Fountain Soda','Drink',3.99,0)],
 5:[('Cotton Candy','Snack',5.00,0),('Soft Pretzel','Snack',5.50,0),('Churro','Dessert',4.50,0),
    ('Ice Cream Cone','Dessert',4.75,0),('Frozen Lemonade','Drink',4.99,0)],
 6:[('Park T-Shirt','Apparel',24.99,0),('Park Cap','Apparel',18.99,0),('Souvenir Mug','Souvenir',12.99,0),
    ('Plush Mascot','Toy',19.99,0),('Fudge Box','Candy',9.99,0),('Sunglasses','Accessory',14.99,0)],
 7:[('Pirate Hat','Apparel',14.99,0),('Toy Cutlass','Toy',9.99,0),('Treasure Chest Candy','Candy',7.99,0),
    ('Souvenir Magnet','Souvenir',5.99,0),('Eye Patch Set','Accessory',4.99,0)],
 8:[('Bandana','Accessory',6.99,0),('Canyon Hoodie','Apparel',44.99,0),('Rock Candy','Candy',4.99,0),
    ('Postcard Set','Souvenir',6.49,0),('Toy Coaster Car','Toy',8.99,0)]}
ITEMS, iid = [], 1
for vid, lst in ITEMS_RAW.items():
    for n, c, p, a in lst:
        ITEMS.append((iid, vid, n, c, p, a, 1)); iid += 1

o1 = ["-- 01_park_and_reference.sql: Park row (final prices, MaxOccupancy 440), zones, rides, games, venues, items. Generated by tools/gen_test_data.py.\n",
      "USE theme_park;\nSET NAMES utf8mb4;\n"]
insert(o1, 'Park', ['ParkID','ParkName','Address','OpeningTime','ClosingTime','MaxOccupancy','MaxWindMph',
    'MinLightningMiles','MaxTempF','MinTempF','DayPassPrice','ExpressAddOnPrice'],
    [(1,'Thunder Valley Adventure Park','1 Adventure Way, Houston, TX 77004','09:00:00','22:00:00',MAX_OCC,35,8.0,100,32,DAY_PASS,EXPRESS)])
insert(o1, 'Zone', ['ZoneID','ParkID','ZoneName'], [(i,1,n) for i,n in ZONES])
insert(o1, 'Ride', ['RideID','ZoneID','RideName','RideType','SeatCapacity','MinHeightCm','IsIndoor','IsExpressEligible','Status','IsActive'],
    [(r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],'Open',r[8]) for r in RIDES])
insert(o1, 'Game', ['GameID','ZoneID','GameName','PlayPrice','IsActive'], GAMES)
insert(o1, 'Venue', ['VenueID','ZoneID','VenueName','VenueType','ServiceType','IsActive'], [vv + (1,) for vv in VENUES])
insert(o1, 'Item', ['ItemID','VenueID','ItemName','Category','Price','IsAlcoholic','IsActive'], ITEMS)
o1.append("-- Price list. File 15 sets the same values, so a database loaded from scratch has one price list from day one.\n")
o1.append("UPDATE MembershipTier SET AnnualPrice = CASE Tier " + " ".join(f"WHEN '{t}' THEN {p:.2f}" for t, p in TIER_PRICE.items()) +
          " END WHERE Tier IN ('Basic', 'Plus', 'Premier');\n")
(OUT/'01_park_and_reference.sql').write_text("".join(o1))

(OUT/'00_clear_data.sql').write_text("""-- 00_clear_data.sql: empties all data tables so 01 and the history files (02, or history/10 to 80) can be reloaded.
-- Keeps AppUser (logins), AdminAudit, MembershipTier (price list) and promo notices. Needs the full schema (files 14 and 16 add three of the tables it empties). Run only before re-loading 01 and the history.
-- AppUser.EmployeeID is not cleared: re-run server/scripts/seed-users.js afterwards so every login points at a real employee.
USE theme_park;
SET FOREIGN_KEY_CHECKS = 0;
""" + "".join(f"TRUNCATE TABLE {t};\n" for t in
  ['RideLog','GamePlay','Purchase','TicketRefund','Ticket','MembershipCancellationRequest','MemberPerk','Membership','DependentConsent','MaintenanceCrew','Maintenance','Shift',
   'RideCertification','EmployeeZone','Employee','Item','Venue','Game','Ride','WeatherLog','Zone','Customer','Park']) +
"SET FOREIGN_KEY_CHECKS = 1;\n-- Notices written by the triggers while the history loads (sold out, weather, maintenance) are rebuilt by the load. Promos are kept.\nDELETE FROM Notification WHERE Kind <> 'Promo';\n")

# ---------------- 02 test data ----------------
HIST = OUT / 'history'
HIST.mkdir(exist_ok=True)
for old in HIST.glob('*.sql'): old.unlink()
FILES = {'Employee': '10_people', 'EmployeeZone': '10_people', 'RideCertification': '10_people', 'Customer': '10_people', 'DependentCustomer': '12_dependents', 'DependentConsent': '12_dependents', 'Membership': '20_memberships', 'MemberPerk': '22_member_perks', 'MembershipCancellationRequest': '24_cancellations', 'WeatherLog': '30_weather', 'Maintenance': '40_maintenance', 'MaintenanceCrew': '40_maintenance', 'Ticket': '50_tickets', 'TicketRefund': '50_tickets', 'RideLog': '60_ride_log', 'GamePlay': '70_purchases_games', 'Purchase': '70_purchases_games', 'Shift': '80_shifts'}
# file name -> description, in load order. Each file loads on its own and is committed as one transaction.
DESC = {'10_people':'employees, zones, certifications, customers','12_dependents':'dependents and their consent (needs file 16)','20_memberships':'memberships','22_member_perks':'member perks (needs file 14)','24_cancellations':'cancellation requests (needs file 16 and a Manager or Admin login)','30_weather':'weather log',
        '40_maintenance':'maintenance jobs and crews (needs file 04 for RepairCost)','50_tickets':'tickets and refunds','52_dependent_tickets':'tickets and refunds of dependents (needs file 16 and history/12)',
        '60_ride_log':'ride boardings and wait readings','62_ride_log_dependents':'boardings of dependents (needs history/52)',
        '70_purchases_games':'purchases and game plays','72_purchases_games_dependents':'purchases and game plays of dependents (needs history/52)','80_shifts':'shifts and ratings'}
parts = {k: [] for k in DESC}
def part(table): return parts[FILES[table]]

FN = "Ava Liam Noah Emma Mia Ethan Zoe Lucas Ella Mason Ivy Logan Nora Owen Ruby Jack Lily Leo Maya Eli Chloe Ben Hana Sam Tara Omar Lena Ravi Priya Mateo Sofia Diego Alma Chen Mei Kofi Amara Yusuf Layla Tomas Rosa Jin Aiko Felix Greta Hugo Isla Jonas Kira Marco Nina Oscar Paula Quinn Rhea Sven Tess Uma Vera Wade".split()
LN = "Garcia Nguyen Patel Smith Johnson Lee Martinez Brown Davis Lopez Wilson Anderson Thomas Taylor Moore Jackson Martin Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Ortiz".split()

# park-year seasonality and the month list (used by hiring below and by customer sign-ups)
SEASON = {1:.5,2:.6,3:1.0,4:1.2,5:1.1,6:1.4,7:1.4,8:1.1,9:.7,10:.9,11:.6,12:.6}
month_starts, mw = [], []
m0 = date(START.year, START.month, 1)
while m0 <= LAST:
    k = len(month_starts)
    month_starts.append(m0); mw.append(SEASON[m0.month] * (2.2 if k < 2 else 1.3 if k < 6 else 1.0))
    m0 = date(m0.year + (m0.month == 12), m0.month % 12 + 1, 1)

# ---- employees (stage 5) ----
# Ids 1 to 36 are the founding crew. They keep the ids, job titles, names, birth dates and zones the demo and the logins
# rely on (first active Cook is #13, first active Technician is #28, open shifts use 1, 13, 17, 28, 33). The legacy draws below
# are still made on R, in the original order, so every later draw (customers, memberships, weather, ...) comes out the same.
# Ids 37 and up are hired as attendance grows; they draw from their own generator RE, which touches nothing else.
RE = random.Random(3380 + 5)
legacy_titles = (['Ride Operator']*8 + ['Game Attendant']*4 + ['Cook']*4 + ['Server']*5 + ['Shop Associate']*4 +
                 ['Performer']*2 + ['Technician']*5 + ['Manager']*4)
# extra hires by title: 54 more, 90 in all (inside HEADCOUNT)
EXTRA = {'Ride Operator':22,'Game Attendant':6,'Cook':6,'Server':8,'Shop Associate':5,'Performer':2,'Technician':3,'Manager':2}
titles = list(legacy_titles) + [t for t, n in EXTRA.items() for _ in range(n)]
assert HEADCOUNT[0] <= len(titles) <= HEADCOUNT[1]
pay = {'Ride Operator':(14,19),'Game Attendant':(13,16),'Cook':(15,20),'Server':(12,16),'Shop Associate':(13,16),
       'Performer':(16,22),'Technician':(24,38),'Manager':(30,45)}
# scheduled hours per week: part-time heavy, technicians and managers close to full time (CHK_Emp_Hours: 40 or less)
HOURS_PT = ([12,16,20,24,28,32,36,40], [8,14,24,22,14,10,5,3])
HOURS_FT = ([36,38,40], [20,20,60])
leg = []                                         # legacy draws for ids 1 to 36: (first, last, dob, extra zone or None, 3 certs)
for i, t in enumerate(legacy_titles, 1):
    R.randint(0, (date(2026,6,1)-date(2018,1,1)).days)    # was the hire date (same draw, so the stream is unchanged); hire dates are set below
    fn, ln = R.choice(FN), R.choice(LN)
    dob = date(1965,1,1)+timedelta(days=R.randint(0,35*365))
    R.uniform(*pay[t]); R.choice([20,24,30,32,36,40])    # was pay and hours; both are set below
    leg.append([fn, ln, dob])
leg_zone = {}
for i in range(1, len(legacy_titles)+1):
    leg_zone[i] = {(i-1) % 5 + 1}
    if legacy_titles[i-1] in ('Technician','Manager','Performer') or R.random() < 0.25: leg_zone[i].add(R.randint(1,5))
for i, t in enumerate(legacy_titles, 1):
    if t == 'Ride Operator':
        R.sample([r[0] for r in RIDES if r[8]], 3)                       # was the certifications; set below
        for _ in range(3): R.randint(7,120)

# hire dates. Founders are hired in the first 3 weeks after the opening (nobody before the park existed); later hires follow the
# park's seasons (spring and early summer hiring), none in the last 3 weeks so the newest have a little history.
HIRE_LAST = TODAY - timedelta(days=21)
hmonths = [m for m in month_starts if m + timedelta(days=27) < HIRE_LAST]
hw = [SEASON[m.month] * (1.6 if m.year == START.year + 1 and m.month in (3, 4, 5) else 1.0) for m in hmonths]
hire = {}
for i in range(1, len(titles)+1):
    if i <= len(legacy_titles):
        hire[i] = START + timedelta(days=RE.randint(0, 21))
    else:
        ms = RE.choices(hmonths, hw)[0]
        hire[i] = min(HIRE_LAST, ms + timedelta(days=RE.randint(0, 27)))
# a few people left. Cooks #13, the first Technician (#28) and the open-shift staff stay; Technicians and Managers do not leave.
DEMO_STAY = {1, 13, 17, 28, 33}
left_on = {21: None, 25: None}                   # legacy leavers (inactive in the first version of this seed)
cand = [i for i, t in enumerate(titles, 1) if t in ('Ride Operator','Game Attendant','Server','Shop Associate','Cook','Performer')
        and i not in DEMO_STAY and i not in left_on and hire[i] <= TODAY - timedelta(days=150)]
for i in RE.sample(cand, 8): left_on[i] = None
for i in left_on:
    lo = hire[i] + timedelta(days=60)
    left_on[i] = RE.choice([lo + timedelta(days=k) for k in range(0, max(1, (TODAY - timedelta(days=40) - lo).days))])
emps, used = [], set()
for i, t in enumerate(titles, 1):
    if i <= len(legacy_titles): fn, ln, dob = leg[i-1]
    else:
        while True:
            fn, ln = RE.choice(FN), RE.choice(LN)
            if (fn, ln) not in used: break
        dob = date(1965,1,1) + timedelta(days=RE.randint(0, 38*365))
    if t in ('Ride Operator','Game Attendant','Shop Associate','Server','Performer') and RE.random() < 0.55:
        dob = date(1996,1,1) + timedelta(days=RE.randint(0, 9*365))          # a young seasonal workforce
    used.add((fn, ln))
    yrs = (TODAY - hire[i]).days / 365
    rate = round(RE.uniform(*pay[t]) * (1 + 0.04 * min(yrs, 1.5)), 2)         # a small raise for tenure
    hrs = RE.choices(*(HOURS_FT if t in ('Technician','Manager') else HOURS_PT))[0]
    emps.append((i, fn, ln, dob, t, hire[i], rate, hrs, 1))                   # everyone is inserted active; leavers are switched off after their shifts
assert all(e[7] <= 40 for e in emps)
avg_hours = sum(e[7] for e in emps) / len(emps)
assert 22 <= avg_hours <= 26, avg_hours
TECHS = [i for i, t in enumerate(legacy_titles, 1) if t == 'Technician']     # founding technicians (the old maintenance block)
TECHS_ALL = [i for i, t in enumerate(titles, 1) if t == 'Technician']        # every technician (stage 6)
insert(part('Employee'), 'Employee', ['EmployeeID','FirstName','LastName','DOB','JobTitle','HireDate','HourlyPay','HoursPerWeek','IsActive'], emps)
ez = []
for i in range(1, len(titles)+1):
    if i <= len(legacy_titles): z = set(leg_zone[i])
    else:
        z = {(i-1) % 5 + 1}
        if titles[i-1] in ('Technician','Manager','Performer') or RE.random() < 0.25: z.add(RE.randint(1,5))
    ez += [(i, zz) for zz in sorted(z)]
insert(part('EmployeeZone'), 'EmployeeZone', ['EmployeeID','ZoneID'], ez)
# ride certifications: ride operators only, never before the hire date or in the future; 3 to 5 active rides each
cert = []
active_rides = [r[0] for r in RIDES if r[8]]
for i, t in enumerate(titles, 1):
    if t == 'Ride Operator':
        for rid in sorted(RE.sample(active_rides, RE.choice([3, 3, 4, 4, 5]))):
            cert.append((i, rid, min(TODAY, hire[i] + timedelta(days=RE.randint(7, 120)))))
insert(part('RideCertification'), 'RideCertification', ['EmployeeID','RideID','CertifiedOn'], cert)

# customers. signup / dob_of are kept so later stages never put a visit before sign-up or birth.
# Sign-ups follow the park's year: an opening rush, then the seasons, tapering a little after the first summer.
cust, height, dob_of, signup, inactive = [], {}, {}, {}, {6}
demo = [(1,'Dana','Demo',date(1990,4,12),172,1),(2,'Kit','Demo',date(2022,6,20),95,1),(3,'Bailey','Basic',date(1988,9,3),168,1),
        (4,'Pat','Plus',date(1985,1,27),180,1),(5,'Eve','Expired',date(1979,11,8),165,1),(6,'Ian','Inactive',date(1992,2,14),178,0)]
for c in demo: cust.append(c); height[c[0]] = c[4]; dob_of[c[0]] = c[3]; signup[c[0]] = START
adult = {3,4,5}
def signup_date():
    ms = R.choices(month_starts, mw)[0]
    return min(LAST, max(START, ms + timedelta(days=R.randint(0, 27))))
def child_height(age):
    if age < 3: return round(52 + 14*age + R.uniform(-4, 4))
    return max(88, min(185, round(76 + 5.6*age + R.uniform(-6, 6))))
for cid in range(7, CUST_END+1):
    age = min(75, int(R.triangular(18, 76, 36)))
    h = max(150, min(198, round(R.gauss(172, 9))))
    dob = TODAY - timedelta(days=age*365 + R.randint(0, 364))
    act = 0 if R.random() < 0.08 else 1
    height[cid] = h; dob_of[cid] = dob; signup[cid] = signup_date()
    if act: adult.add(cid)
    else: inactive.add(cid)
    cust.append((cid, R.choice(FN), R.choice(LN), dob, h, act))
insert(part('Customer'), 'Customer', ['CustomerID','FirstName','LastName','DOB','HeightCm','IsActive'], cust)

# dependents: ordinary Customer rows with ParentCustomerID, one DependentConsent each (SQL/16 rules, asserted below).
# Loaded from history/12_dependents.sql, which needs the Customer.ParentCustomerID column from file 16, so it is not in 02.
by_parent = {c[0]: c[2] for c in cust}
deps, consent, parent_of, next_id = [], [], {}, CUST_END + 1
for pid in sorted(adult):
    if pid <= 6: continue
    page = (TODAY - dob_of[pid]).days // 365
    if not (24 <= page <= 55) or R.random() >= DEP_SHARE: continue
    for _ in range(R.choices(*DEP_COUNTS)[0]):
        age = R.randint(0, min(17, page - 20))
        dob = TODAY - timedelta(days=max(2, age*365 + R.randint(0, 364)))
        assert TODAY - dob < timedelta(days=18*365)                                  # under 18 (sp_AssertDependent)
        added = min(LAST, max(signup[pid], dob) + timedelta(days=R.randint(0, 120)))
        act = 0 if R.random() < 0.03 else 1
        cid = next_id; next_id += 1
        height[cid] = child_height(age); dob_of[cid] = dob; signup[cid] = added; parent_of[cid] = pid
        if not act: inactive.add(cid)
        deps.append((cid, R.choice(FN), by_parent[pid], dob, height[cid], act, pid))   # last name copied from the parent
        consent.append((cid, pid, dtm(added, R.randint(8, 21), R.randint(0, 59))))
assert all(sum(1 for d in deps if d[6] == p and d[5]) <= 6 for p in {d[6] for d in deps})   # at most 6 active per parent
assert all(p in adult for p in parent_of.values()) and not set(parent_of) & set(parent_of.values())
insert(part('DependentCustomer'), 'Customer', ['CustomerID','FirstName','LastName','DOB','HeightCm','IsActive','ParentCustomerID'], deps)
insert(part('DependentConsent'), 'DependentConsent', ['CustomerID','ParentCustomerID','ConsentedAt'], consent)

# memberships (Price is overwritten by the trigger with the current tier price, so history carries today's prices).
# Each member has one or more yearly terms: some lapse for good, some renew straight away, some renew after a gap,
# and a few end in the next 40 days. A customer's terms never overlap (CHK_Membership_Term, sp_AssertNoMembershipOverlap).
def end_of(s):
    try: e = date(s.year+1, s.month, s.day)
    except ValueError: e = date(s.year+1, s.month, 28)
    return e - timedelta(days=1)
MEMBER_SHARE = 0.095         # share of active adults who ever hold a membership
TIER_MIX = (['Basic', 'Plus', 'Premier'], [40, 35, 25])
terms = []                   # dicts: cust, tier, start, end, auto
def add_term(cid, tier, start, auto=False):
    terms.append(dict(cust=cid, tier=tier, start=start, end=end_of(start), auto=auto))
    return terms[-1]
# demo members keep their ids 1 to 3: Bailey (Basic, current), Pat (Plus, current), Eve (expired, no renewal)
add_term(3,'Basic',dd(2026,3,1),True); add_term(4,'Plus',dd(2026,2,1),True); add_term(5,'Basic',START + timedelta(days=40))
assert terms[2]['end'] < TODAY
demo_terms = len(terms)
pool = [c for c in sorted(adult) if c > 6]
n_members = int(len(pool) * MEMBER_SHARE)
chosen = R.sample(pool, n_members)
soon = chosen[:10]           # these end 3 to 40 days from now
mstart_w = [(3.0 if k < 2 else 1.6 if k < 4 else 1.0) * SEASON[m.month] for k, m in enumerate(month_starts)]
for cid in chosen:
    tier = R.choices(*TIER_MIX)[0]
    if cid in soon:
        endt = TODAY + timedelta(days=R.randint(3, 40))
        st = date(endt.year-1, endt.month, endt.day) + timedelta(days=1)
        assert end_of(st) == endt, (st, endt)
    else:
        ms = R.choices(month_starts, mstart_w)[0]
        st = min(TODAY, max(START, ms + timedelta(days=R.randint(0, 27))))
    t = add_term(cid, tier, st)
    while t['end'] < TODAY:                      # the term is over: renew, renew after a gap, or lapse
        r = R.random()
        if r < 0.58:   nxt = t['end'] + timedelta(days=1)
        elif r < 0.70: nxt = t['end'] + timedelta(days=R.randint(16, 150))
        else:          break
        if nxt > TODAY: break
        t['auto'] = nxt == t['end'] + timedelta(days=1) and R.random() < 0.7
        nt = R.random()
        tier = tier if nt < 0.8 else {'Basic':'Plus','Plus':'Premier','Premier':'Plus'}[tier] if nt < 0.9 else {'Basic':'Basic','Plus':'Basic','Premier':'Plus'}[tier]
        t = add_term(cid, tier, nxt)
    if t['end'] >= TODAY: t['auto'] = R.random() < 0.65       # a current term: auto-renew on for about two thirds
terms[demo_terms:] = sorted(terms[demo_terms:], key=lambda t: (t['start'], t['cust']))
for i, t in enumerate(terms, 1): t['id'] = i
members = {}
for t in terms: members.setdefault(t['cust'], []).append(t)
for t in terms:      # self-check: terms never overlap, sit in the park's life, belong to active adults
    assert t['start'] <= TODAY and t['cust'] not in inactive and t['cust'] in adult
    assert t['cust'] <= 6 or t['start'] >= START
for lst in members.values():
    lst.sort(key=lambda t: t['start'])
    assert all(a['end'] < b['start'] for a, b in zip(lst, lst[1:]))
def term_on(cid, d):
    for t in members.get(cid, ()):
        if t['start'] <= d <= t['end']: return t
    return None
for cid_, lst in members.items():     # a member has signed up by the day the first term starts
    signup[cid_] = max(START, min(signup[cid_], lst[0]['start'] - timedelta(days=R.randint(0, 20))))

# cancellation requests (SQL/16 table). Pending: current terms still on auto-renew, asked in the last 12 days.
# Approved: auto-renew is off (the server does the same on approval). Rejected: auto-renew stays on.
REASONS = ['Moving out of the area','Not visiting enough','Too expensive','Switching to a different tier','Health reasons',
           'Found another park closer to home','Family circumstances changed','Cannot visit on weekdays']
REJECT_NOTES = ['Member chose to keep the membership after a call','Offered a tier change instead','Request made in error']
cur = [t for t in terms[demo_terms:] if t['start'] <= TODAY <= t['end']]
auto_cur = [t for t in cur if t['auto']]
R.shuffle(auto_cur)
reqs = []     # (term, requested_at, reason, status, decided_at, note)
def req_time(t, lo, hi):      # a moment between day lo and day hi after the term start, never in the future
    d = min(t['start'] + timedelta(days=R.randint(lo, hi)), LAST - timedelta(days=5))   # decided 1 to 3 days later, still in the past
    return dtm(max(d, t['start']), R.randint(8, 20), R.randint(0, 59))
for t in auto_cur[:7]:
    reqs.append((t, dtm(TODAY - timedelta(days=R.randint(1, 12)), R.randint(8, 20), R.randint(0, 59)), R.choice(REASONS), 'Pending', None, None))
for t in auto_cur[7:11]:
    at = req_time(t, 20, 300); reqs.append((t, at, R.choice(REASONS), 'Rejected', at + timedelta(days=R.randint(1, 3), hours=R.randint(0, 5)), R.choice(REJECT_NOTES)))
for t in auto_cur[11:19]:
    at = req_time(t, 20, 300); t['auto'] = False
    reqs.append((t, at, R.choice(REASONS), 'Approved', at + timedelta(days=R.randint(1, 3), hours=R.randint(0, 5)), None))
lapsed = [t for t in terms[demo_terms:] if t['end'] < TODAY and (t['end'] - TODAY).days > -240 and not t['auto']
          and not any(u['start'] > t['end'] for u in members[t['cust']])]
for t in lapsed:              # people who left in the last 8 months: about a third had asked to cancel
    if R.random() < 0.33:
        at = max(dtm(t['end'] - timedelta(days=R.randint(20, 120)), R.randint(8, 20), R.randint(0, 59)), dtm(t['start'] + timedelta(days=5), 9))
        reqs.append((t, at, R.choice(REASONS), 'Approved', at + timedelta(days=R.randint(1, 3)), None))
assert all(r[4] is None or r[4] <= dtm(TODAY, 0) for r in reqs) and len({r[0]['id'] for r in reqs if r[3] == 'Pending'}) == sum(1 for r in reqs if r[3] == 'Pending')
mrows = [(t['id'], t['cust'], t['tier'], t['start'], t['end'], 0, t['auto']) for t in terms]
insert(part('Membership'), 'Membership', ['MembershipID','CustomerID','Tier','StartDate','EndDate','Price','AutoRenew'], mrows)
# perks: the same three rules as trg_Membership_AI_Welcome, written for every term. The trigger may already have granted them
# (when this loads on a finished database), so INSERT IGNORE, then one UPDATE sets a believable GrantedAt either way.
GRANT = "TIMESTAMP(m.StartDate) + INTERVAL (540 + (m.MembershipID * 37) %% 600) MINUTE"
part('MemberPerk').append("-- Perks are granted on the day the term starts. UQ_MemberPerk makes this safe to repeat.\n")
for name, cond in (('Welcome pin', ''), ('Free parking day', " WHERE m.Tier IN ('Plus','Premier')"), ('VIP photo session', " WHERE m.Tier = 'Premier'")):
    part('MemberPerk').append(f"INSERT IGNORE INTO MemberPerk (MembershipID, PerkName, GrantedAt) SELECT m.MembershipID, '{name}', {GRANT} FROM Membership m{cond};\n" % ())
part('MemberPerk').append(f"UPDATE MemberPerk p JOIN Membership m ON m.MembershipID = p.MembershipID SET p.GrantedAt = {GRANT};\n" % ())
# decided requests need a reviewing user (AppUser is kept across loads). Without one they are skipped, not faked.
REVIEWER = "(SELECT UserID FROM AppUser WHERE Role IN ('Manager','Admin') ORDER BY (Role = 'Manager') DESC, UserID LIMIT 1)"
part('MembershipCancellationRequest').append("-- Decided requests are written by the Manager login (or Admin). If AppUser has neither, they are skipped.\n")
for t, at, reason, status, dec, note in sorted(reqs, key=lambda r: r[1]):
    if status == 'Pending':
        part('MembershipCancellationRequest').append("INSERT INTO MembershipCancellationRequest (MembershipID, RequestedAt, Reason, Status) VALUES (%d, %s, %s, 'Pending');\n" % (t['id'], v(at), v(reason)))
    else:
        part('MembershipCancellationRequest').append(
            "INSERT INTO MembershipCancellationRequest (MembershipID, RequestedAt, Reason, Status, DecidedAt, DecidedByUserID, DecisionNote)\n"
            "  SELECT %d, %s, %s, %s, %s, u.UserID, %s FROM (SELECT %s AS UserID) u WHERE u.UserID IS NOT NULL;\n" % (t['id'], v(at), v(reason), v(status), v(dec), v(note), REVIEWER))

# weather: the whole history (START to LAST), Houston seasons. Closing events are the ones that cross a Park limit
# (wind 35+, lightning 8 miles or less, 100F or more, 32F or less). Every month gets at least one, so Rain-outs per Month has a spread.
wev = []
def wadd(typ, s, e, temp, wind, light): wev.append(dict(type=typ, start=s, end=e, temp=temp, wind=wind, light=light))
HIST_DAYS = [START + timedelta(days=i) for i in range((LAST - START).days + 1)]
MONTH_HIGH = {1:62, 2:66, 3:72, 4:79, 5:85, 6:91, 7:94, 8:94, 9:90, 10:82, 11:72, 12:64}   # typical Houston highs, F
STORMS = {1:0, 2:0, 3:2, 4:3, 5:3, 6:4, 7:3, 8:4, 9:4, 10:2, 11:1, 12:0}                   # closing storms per month
HEAT   = {6:1, 7:3, 8:3, 9:1}                                                                # closing heat days (100F+)
FREEZE = {1:1, 2:1, 12:1}                                                                    # closing hard-freeze mornings (32F or less)
FILLER = 7                                                                                   # non-closing readings per month
wused = set()
def wpick(pool):
    free = [d for d in pool if d not in wused]
    d = R.choice(free); wused.add(d); return d
months = sorted({(d.year, d.month) for d in HIST_DAYS})
for (y, m) in months:
    pool = [d for d in HIST_DAYS if (d.year, d.month) == (y, m)]
    hi = MONTH_HIGH[m]
    for _ in range(STORMS.get(m, 0)):
        d = wpick(pool); s = dtm(d, R.randint(13, 18), R.choice([0, 15, 30, 45]))
        wadd('Storm', s, s + timedelta(minutes=R.randint(90, 210)), R.randint(hi - 12, hi - 2), R.randint(36, 52), round(R.uniform(2.0, 7.8), 1))
    for _ in range(HEAT.get(m, 0)):
        d = wpick(pool)
        wadd('Heat', dtm(d, 12), dtm(d, 18), R.randint(100, 105), R.randint(6, 12), 99.9)
    for _ in range(FREEZE.get(m, 0)):
        d = wpick(pool)
        wadd('Cold', dtm(d, 6), dtm(d, 11), R.randint(25, 32), R.randint(5, 14), 99.9)
    for _ in range(FILLER):
        d = wpick(pool)
        typ = R.choice(['Rain', 'Cloudy', 'Clear', 'Clear'] if m not in (12, 1, 2) else ['Cold', 'Cloudy', 'Clear', 'Rain'])
        s = dtm(d, R.randint(9, 18), R.choice([0, 30])); dur = timedelta(minutes=R.randint(60, 180))
        t = min(98, R.randint(hi - 8, hi + 4)) if typ != 'Cold' else R.randint(38, 52)
        if typ == 'Rain': wadd(typ, s, s + dur, min(t, 86), R.randint(8, 24), round(R.uniform(12, 40), 1))
        else:             wadd(typ, s, s + dur, t, R.randint(4, 18), 99.9)
wadd('Cloudy', dtm(TODAY,7), None, 72, 10, 99.9)   # ongoing, does not close rides
days = [FIRST + timedelta(days=i) for i in range((LAST - FIRST).days + 1)]   # the 94-day block that stages 7 to 10 still replace
wev.sort(key=lambda e: e['start'])
for i, e in enumerate(wev, 1):
    e['id'] = i
    e['closes'] = e['wind'] >= 35 or e['light'] <= 8.0 or e['temp'] >= 100 or e['temp'] <= 32
insert(part('WeatherLog'), 'WeatherLog', ['WeatherID','ParkID','WeatherType','StartedAt','EndedAt','TemperatureF','WindMph','LightningMiles','ClosesOutdoorRides'],
       [(e['id'],1,e['type'],e['start'],e['end'],e['temp'],e['wind'],e['light'],0) for e in wev])
_closing_by_day = {}
for e in wev:
    if e['closes']: _closing_by_day.setdefault(e['start'].date(), []).append(e)
def weather_closed(at):
    """An event that closes outdoor rides is running at `at` (looked up by day: an event is never longer than a day or two)."""
    d = at.date()
    for day in (d, d - timedelta(days=1)):
        for e in _closing_by_day.get(day, ()):
            if at >= e['start'] and (e['end'] is None or at < e['end']): return True
    return False

# maintenance (stage 6): a believable service history from the first weeks after opening to yesterday, plus the demo state for today.
# Own generator RM; the 16 old crew draws are still burned on R so the old 94-day block that follows is unchanged.
for _ in range(16): R.sample(TECHS, R.randint(2,3))
RM = random.Random(3380 + 6)
RIDE_TYPE = {r[0]: r[3] for r in RIDES}
RIDE_NAME = {r[0]: r[2] for r in RIDES}
GAME_NAME = {g[0]: g[2] for g in GAMES}
VENUE_NAME = {x[0]: x[2] for x in VENUES}
VENUE_KIND = {x[0]: x[3] for x in VENUES}
A_RIDES = [r[0] for r in RIDES if r[8]]; A_GAMES = [g[0] for g in GAMES if g[4]]; A_VENUES = [x[0] for x in VENUES]
# repair cost band per type: the same base file 04 uses, plus 0 to 395 (file 04 adds (id * 137) mod 400)
COST_BASE = {'Routine Inspection':150, 'Preventive Service':600, 'Refurbishment':5500, 'Emergency Repair':2800, 'Safety Recall':3500}
def cost(t): return float(COST_BASE[t] + RM.randrange(0, 400, 5))
M_SEASON = {1:.6,2:.6,3:.9,4:1.0,5:1.1,6:1.3,7:1.4,8:1.4,9:1.2,10:1.0,11:.8,12:.7}   # heat and crowds wear things out
# crews start when two technicians are on the payroll
_th = sorted(hire[i] for i in TECHS_ALL)
MAINT_START = max(START + timedelta(days=14), _th[1] + timedelta(days=1))
END_DAY = LAST                                  # closed jobs end before today 00:00; only the demo job is open
NOW0 = dtm(TODAY, 0)
OPEN_AT = dtm(TODAY, 8)
busy = {}                                       # (kind, id) -> list of (start, end) already taken, so a target never has two jobs at once
def tkey(kind, tid): return (kind, tid)
def is_free(key, s, e, margin=timedelta(hours=1)):
    return all(e + margin <= bs or s >= be + margin for bs, be in busy.get(key, []))
jobs = []
morning = Counter()                             # planned jobs starting before 09:00, per day (the crew can only be in so many places)
def put(kind, tid, typ, s, e, outcome, reason, block_to=None, c=None):
    if s.hour < 9: morning[s.date()] += 1
    jobs.append(dict(kind=kind, tid=tid, type=typ, start=s, end=e, outcome=outcome, reason=reason,
                     cost=(None if e is None else (cost(typ) if c is None else c))))
    busy.setdefault(tkey(kind, tid), []).append((s, block_to if block_to else (e if e else datetime(9999,1,1))))

# --- demo state for today (kept from the first seed): a carousel service open today, and Dragon's Nest closed after a recall ---
put('Ride', 2, 'Preventive Service', OPEN_AT, None, None, 'Motor and gearbox service')
put('Ride', 12, 'Safety Recall', dtm(TODAY - timedelta(days=8), 8), dtm(TODAY - timedelta(days=6), 17), 'Not Fixed', 'Restraint recall, parts on order',
    block_to=datetime(9999,1,1))

REASON = {
  'Routine Inspection': {'Coaster':['Track and structure inspection','Monthly safety inspection','Lift hill and brake check'],
        'Water Ride':['Pump, flume and filter inspection','Monthly safety inspection','Water quality and gate check'],
        'Dark Ride':['Show control and sensor check','Monthly safety inspection','Vehicle and track check'],
        'Train':['Track and signal check','Monthly safety inspection','Locomotive walk-around'],
        'Carousel':['Platform and pole inspection','Monthly safety inspection','Motor and bearing check'],
        'Simulator':['Motion base inspection','Monthly safety inspection','Hydraulics check'],
        'Walkthrough':['Floor, lighting and exit check','Monthly safety inspection']},
  'Preventive Service': {'Coaster':['Wheel assembly service','Lift hill chain lubrication','Brake system service'],
        'Water Ride':['Water pump and filter service','Boat and flume service','Gate sensor service'],
        'Dark Ride':['Animatronic servo service','Show lighting service','Track and wheel service'],
        'Train':['Track and wheel service','Locomotive service','Brake and coupling service'],
        'Carousel':['Motor and gearbox service','Bearing and lubrication service','Platform service'],
        'Simulator':['Actuator service','Projector and motion service','Hydraulics service'],
        'Walkthrough':['Lighting and effects service','Floor and handrail service']},
  'Emergency Repair': {'Coaster':['Launch brake fault','Restraint sensor fault','Lift chain fault','Wheel bearing failure'],
        'Water Ride':['Rapids pump motor burnout','Flume gate sensor failure','Boat hull leak','Filter pump failure'],
        'Dark Ride':['Animatronic failure','Show control fault','Vehicle drive fault'],
        'Train':['Signal fault','Locomotive drive fault','Track switch fault'],
        'Carousel':['Drive motor fault','Platform bearing noise','Lighting circuit fault'],
        'Simulator':['Motion base fault','Projector failure','Hydraulic leak'],
        'Walkthrough':['Effects control fault','Door sensor fault']},
  'Safety Recall': {'Coaster':['Manufacturer harness recall','Restraint recall','Wheel assembly recall'],
        'Water Ride':['Manufacturer pump recall','Gate actuator recall'],
        'Dark Ride':['Vehicle coupling recall','Control unit recall'],
        'Train':['Coupling recall'], 'Carousel':['Drive unit recall'], 'Simulator':['Motion base actuator recall'], 'Walkthrough':['Door actuator recall']},
  'Refurbishment': {'Coaster':['Seat and restraint refurbishment'],'Water Ride':['Boat and flume refurbishment'],'Dark Ride':['Scenery and effects refurbishment'],
        'Train':['Carriage refurbishment'],'Carousel':['Horses, paint and lighting refurbishment'],'Simulator':['Cabin refurbishment'],'Walkthrough':['Scenery refurbishment']},
}
GAME_R = {'Routine Inspection':['Monthly game check','Mechanism and payout check'], 'Preventive Service':['Mechanism service','Lighting and display service'],
          'Emergency Repair':['Coin mechanism jam','Target mechanism jammed','Scoring sensor fault','Display failure']}
VENUE_R = {'Routine Inspection':{'Restaurant':['Kitchen equipment inspection','Fire suppression check','Food safety inspection'],'Gift Shop':['Fire and stockroom inspection','Till and display check']},
           'Preventive Service':{'Restaurant':['Fryer and grill service','Refrigeration service','Ventilation service'],'Gift Shop':['Lighting and shelving service','Air conditioning service']},
           'Emergency Repair':{'Restaurant':['Walk-in cooler compressor failure','Fryer failure','Dishwasher failure','Ice machine failure'],'Gift Shop':['Air conditioning failure','Till system failure']},
           'Refurbishment':{'Restaurant':['Counter and fryer replacement','Dining area refurbishment'],'Gift Shop':['Counter and display refurbishment']}}
def reason(kind, tid, typ):
    if kind == 'Ride': return RM.choice(REASON[typ][RIDE_TYPE[tid]])
    if kind == 'Game': return RM.choice(GAME_R.get(typ, GAME_R['Routine Inspection']))
    return RM.choice(VENUE_R[typ][VENUE_KIND[tid] if VENUE_KIND[tid] == 'Gift Shop' else 'Restaurant'])
def hm(base, lo_min, hi_min): return base + timedelta(minutes=RM.randrange(lo_min, hi_min + 1, 15))
def try_place(kind, tid, typ, day, s_fn, outcome='Fixed', chain=None, shifts=14):
    """Place a job near `day` (shifting a day at a time if the target is busy). chain=(type, gap_days_lo, gap_days_hi) adds a
    follow-up that ends Fixed; the target stays closed from the first job's start to the follow-up's end."""
    for k in range(shifts):
        d = day + timedelta(days=k)
        s, e = s_fn(d)
        if e >= NOW0 - timedelta(hours=6) or d < MAINT_START: return False
        if s.hour < 9 and morning[s.date()] >= (1 if sum(1 for t in TECHS_ALL if hire[t] <= s.date()) <= 5 else 2): continue   # crews are limited
        if chain:
            ftyp, glo, ghi = chain
            fs = dtm(e.date() + timedelta(days=RM.randint(glo, ghi)), 5) + timedelta(minutes=RM.randrange(0, 90, 15))
            fe = fs + timedelta(hours=RM.randint(2, 5) if ftyp != 'Emergency Repair' else RM.randint(3, 9))
            if fe >= NOW0 - timedelta(hours=6): continue
            if not is_free(tkey(kind, tid), s, fe): continue
            put(kind, tid, typ, s, e, outcome, reason(kind, tid, typ), block_to=fs)
            put(kind, tid, ftyp, fs, fe, 'Fixed', reason(kind, tid, ftyp))
            return True
        if is_free(tkey(kind, tid), s, e):
            put(kind, tid, typ, s, e, outcome, reason(kind, tid, typ)); return True
    return False

def planned_window(typ, kind):
    def f(d):                        # planned work is done before the park opens at 09:00: it never blocks a boarding
        if typ == 'Routine Inspection':
            s = hm(dtm(d, 5), 0, 60); e = s + timedelta(minutes=RM.randrange(90, 211, 15))
        else:
            s = hm(dtm(d, 5), 0, 45); e = s + timedelta(minutes=RM.randrange(150, 211, 15))
        return s, min(e, dtm(d, 8, 45))
    return f
def day_window(d):                    # a preventive service that keeps the facility closed for most of the day
    s = dtm(d, 7) + timedelta(minutes=RM.randrange(0, 61, 15)); return s, s + timedelta(hours=RM.randint(5, 10))
def emergency_window(d):
    if RM.random() < 0.6:             # something fails while the park is open and is fixed during the evening or overnight
        s = dtm(d, RM.randint(10, 19)) + timedelta(minutes=RM.randrange(0, 60, 15)); return s, s + timedelta(hours=RM.randint(3, 22))
    s = dtm(d, 22, 30); return s, dtm(d + timedelta(days=1), RM.randint(5, 8)) + timedelta(minutes=RM.randrange(0, 60, 15))

# --- refurbishments (off-season, one to two weeks for a ride): the ride is out of the Most Ridden list for those weeks ---
for kind, tid, d0, ndays in (('Ride', 14, date(2025,11,17), 9), ('Venue', 1, date(2025,12,8), 4), ('Ride', 5, date(2025,12,1), 10),
                            ('Ride', 2, date(2026,1,12), 7), ('Venue', 2, date(2026,1,19), 5), ('Ride', 6, date(2026,1,26), 12),
                            ('Ride', 10, date(2026,2,9), 8), ('Ride', 15, date(2026,2,23), 7), ('Ride', 3, date(2026,9,14), 11)):
    s = dtm(d0, 6); e = dtm(d0 + timedelta(days=ndays), 18, 30)
    assert is_free(tkey(kind, tid), s, e) and e < NOW0
    put(kind, tid, 'Refurbishment', s, e, 'Fixed', reason(kind, tid, 'Refurbishment'))

SPAN = [MAINT_START + timedelta(days=i) for i in range((END_DAY - MAINT_START).days)]
# --- safety recalls: 7 on coasters, water rides, dark rides and the train; 4 of them end short of a full fix and are followed up ---
rec_targets = [3, 4, 5, 6, 8, 10, 9]
rec_days = RM.sample(SPAN[10:-12], len(rec_targets))
for n, (tid, d) in enumerate(zip(rec_targets, sorted(rec_days))):
    def rw(dd, n=n):
        s = dtm(dd, 8) + timedelta(minutes=RM.randrange(0, 61, 15)); return s, s + timedelta(hours=RM.randint(26, 55))
    chain = (RM.choice(['Preventive Service', 'Emergency Repair']), 2, 8) if n % 2 == 0 else None
    try_place('Ride', tid, 'Safety Recall', d, rw, outcome=RM.choice(['Partially Fixed', 'Not Fixed']) if chain else 'Fixed', chain=chain, shifts=30)
# --- emergency repairs: about 4 a month, heavier in summer, mostly on rides (coasters and water rides break most) ---
W_RIDE = {'Coaster': 3, 'Water Ride': 3, 'Dark Ride': 2, 'Simulator': 2, 'Train': 1, 'Carousel': 1, 'Walkthrough': 1}
epool = [('Ride', r, W_RIDE[RIDE_TYPE[r]]) for r in A_RIDES] + [('Game', g, 0.6) for g in A_GAMES] + [('Venue', x, 0.6) for x in A_VENUES]
day_w = [M_SEASON[d.month] for d in SPAN]
N_EMERG = round(4 * len(SPAN) / 30.4)
for d in sorted(RM.choices(SPAN, day_w, k=N_EMERG)):
    kind, tid, _w = RM.choices(epool, [p[2] for p in epool])[0]
    chain = ('Preventive Service', 1, 4) if RM.random() < 0.12 else None
    try_place(kind, tid, 'Emergency Repair', d, emergency_window, outcome=RM.choice(['Partially Fixed', 'Not Fixed', 'Partially Fixed']) if chain else 'Fixed', chain=chain)
# --- preventive services: rides each quarter (about 1 in 6 closes the ride for most of the day), games and restaurants every 4 months ---
def stepper(kind, tid, typ, lo, hi, window):
    d = MAINT_START + timedelta(days=RM.randint(0, hi))
    while d < END_DAY - timedelta(days=2):
        try_place(kind, tid, typ, d, window)
        d += timedelta(days=RM.randint(lo, hi))
for r in A_RIDES:
    d = MAINT_START + timedelta(days=RM.randint(0, 91))
    while d < END_DAY - timedelta(days=2):
        try_place('Ride', r, 'Preventive Service', d, day_window if RM.random() < 0.17 else planned_window('Preventive Service', 'Ride'))
        d += timedelta(days=RM.randint(84, 98))
for g in A_GAMES: stepper('Game', g, 'Preventive Service', 110, 130, planned_window('Preventive Service', 'Game'))
for x in A_VENUES:
    if VENUE_KIND[x] != 'Gift Shop': stepper('Venue', x, 'Preventive Service', 110, 130, planned_window('Preventive Service', 'Venue'))
# --- routine inspections: rides and restaurants monthly, games every two months, shops each quarter ---
for r in A_RIDES: stepper('Ride', r, 'Routine Inspection', 27, 34, planned_window('Routine Inspection', 'Ride'))
for g in A_GAMES: stepper('Game', g, 'Routine Inspection', 54, 68, planned_window('Routine Inspection', 'Game'))
for x in A_VENUES:
    lo, hi = (27, 34) if VENUE_KIND[x] != 'Gift Shop' else (84, 98)
    stepper('Venue', x, 'Routine Inspection', lo, hi, planned_window('Routine Inspection', 'Venue'))

jobs.sort(key=lambda j: (j['start'], j['kind'], j['tid']))
J = []                      # id, kind, target, type, start, end, outcome, reason, cost  (same layout the ride log code reads)
for n, j in enumerate(jobs, 1): J.append((n, j['kind'], j['tid'], j['type'], j['start'], j['end'], j['outcome'], j['reason'], j['cost']))
# self-checks: one target never has two jobs at once; every unfinished fix has a later Fixed job (except the 2 demo cases)
by_t = {}
for j in J: by_t.setdefault((j[1], j[2]), []).append(j)
for k, lst in by_t.items():
    lst.sort(key=lambda j: j[4])
    for a, b in zip(lst, lst[1:]):
        assert a[5] is not None and a[5] <= b[4], ('overlap', k, a, b)
    for i, a in enumerate(lst):
        if a[6] in ('Partially Fixed', 'Not Fixed'):
            later = [b for b in lst[i+1:] if b[6] == 'Fixed']
            assert later or (k, a[0]) == (('Ride', 12), a[0]), ('never fixed', a)
assert sum(1 for j in J if j[5] is None) == 1 and all((j[5] is None) == (j[8] is None) == (j[6] is None) for j in J)
assert all(j[5] is None or j[5] < NOW0 for j in J)
# crews: 2 or 3 technicians who had been hired by the start of the job; a technician is not on two short jobs at once when avoidable
tech_busy = {t: [] for t in TECHS_ALL}
crew, double = [], 0
for j in J:
    s, e = j[4], j[5] or j[4] + timedelta(hours=8)
    k = 3 if j[3] in ('Refurbishment', 'Safety Recall') or RM.random() < 0.3 else 2
    able = [t for t in TECHS_ALL if hire[t] <= s.date()]
    on_site = (s, min(e, s + timedelta(hours=6)))          # the crew is hands-on for the first hours; a long repair does not tie them up all day
    short = (e - s) <= timedelta(hours=26)
    free = [t for t in able if not short or all(on_site[1] <= bs or on_site[0] >= be for bs, be in tech_busy[t])]
    if len(free) < 2: double += 1; free = able
    team = RM.sample(free, min(k, len(free)))
    team.sort(key=lambda t: (hire[t], t))                  # the longest-serving technician leads
    for i, t in enumerate(team):
        crew.append((j[0], t, 'Lead' if i == 0 else 'Assistant'))
        if short: tech_busy[t].append(on_site)
assert all(2 <= sum(1 for c in crew if c[0] == j[0]) <= 3 for j in J)
insert(part('Maintenance'), 'Maintenance', ['MaintenanceID','MaintType','RideID','GameID','VenueID','StartDate','EndDate','Outcome','Reason','RepairCost'],
       [(j[0],j[3],j[2] if j[1]=='Ride' else None,j[2] if j[1]=='Game' else None,j[2] if j[1]=='Venue' else None,j[4],j[5],j[6],j[7],j[8]) for j in J])
insert(part('MaintenanceCrew'), 'MaintenanceCrew', ['MaintenanceID','EmployeeID','CrewRole'], crew)
_mt, _ms = {}, {}
for j in J: _mt.setdefault((j[1], j[2]), []).append(j)
for k in _mt: _mt[k].sort(key=lambda j: j[4]); _ms[k] = [j[4] for j in _mt[k]]
def under_maint(kind, tid, at):
    """Same rule as fn_UnderMaintenance: a job is running at `at`, or the latest finished job did not end Fixed."""
    lst = _mt.get((kind, tid))
    if not lst: return False
    i = bisect_right(_ms[(kind, tid)], at) - 1          # jobs on one target never overlap, so the last job started by `at` decides
    if i < 0: return False
    j = lst[i]
    return j[5] is None or at < j[5] or j[6] != 'Fixed'

# tickets (stage 7): a daily attendance calendar for the whole history, families that visit together, members who use their tier,
# weather refunds, and advance sales for the coming weeks. Own generator RT: nothing earlier changes.
RT = random.Random(3380 + 7)
closing = {e['start'].date(): e for e in wev if e['closes']}
WX_FACTOR = {'Storm': 0.55, 'Rain': 0.70, 'Heat': 0.90, 'Cold': 0.85}
wx_day = {}
for e in wev:
    f = WX_FACTOR.get(e['type'], 1.0)
    if e['closes']: f = min(f, 0.70)                    # rain and storm days, and anything that closed rides, run at 70% or less
    wx_day[e['start'].date()] = min(wx_day.get(e['start'].date(), 1.0), f)
DOW = {0: .55, 1: .5, 2: .55, 3: .6, 4: .95, 5: 2.0, 6: 1.5}
SEASON_V = {1: .5, 2: .6, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.5, 7: 1.7, 8: 1.3, 9: .65, 10: 1.0, 11: .85, 12: .9}
def D(y, m, d): return date(y, m, d)
EVENTS = [   # first day, last day, multiplier (the biggest one wins when two overlap)
  (D(2025,4,1), D(2025,4,1), 5.0), (D(2025,4,5), D(2025,4,6), 3.2),                      # opening day and opening weekend
  (D(2025,4,18), D(2025,4,20), 1.8), (D(2026,4,3), D(2026,4,5), 1.8),                    # Easter
  (D(2025,5,24), D(2025,5,26), 2.4), (D(2026,5,23), D(2026,5,25), 2.4),                  # Memorial Day weekend
  (D(2025,7,3), D(2025,7,6), 3.0), (D(2026,7,3), D(2026,7,5), 3.0),                      # July 4
  (D(2025,8,30), D(2025,9,1), 2.4), (D(2026,9,5), D(2026,9,7), 2.4),                     # Labor Day weekend
  (D(2025,10,24), D(2025,10,26), 1.7), (D(2025,10,31), D(2025,11,2), 2.0),               # Halloween events
  (D(2026,10,23), D(2026,10,25), 1.7), (D(2026,10,30), D(2026,11,1), 2.0),
  (D(2025,11,28), D(2025,11,30), 2.4),                                                   # Thanksgiving weekend
  (D(2025,12,20), D(2026,1,3), 2.6), (D(2025,12,25), D(2025,12,25), 0.7),                # Christmas and New Year holidays
  (D(2026,1,17), D(2026,1,19), 1.8), (D(2026,2,14), D(2026,2,16), 2.0),                  # MLK and Presidents' Day weekends
  (D(2026,3,16), D(2026,3,22), 2.2),                                                     # spring break
]
def event_mult(d):
    m = [x[2] for x in EVENTS if x[0] <= d <= x[1]]
    return max(m) if m else 1.0
def day_weight(d):
    w = DOW[d.weekday()] * SEASON_V[d.month]
    if D(d.year, 6, 1) <= d <= D(d.year, 8, 15):
        w *= 1.0 if d.weekday() >= 5 else 1.9                  # school is out: weekdays are nearly as busy as weekends
    elif D(d.year, 8, 16) <= d <= D(d.year, 8, 31): w *= 0.8
    return w * event_mult(d)
VISIT_DAYS = HIST_DAYS                                  # START .. LAST
ADV_FRAC = [0.9, .6, .5, .45, .4, .35, .35, .3, .27, .24, .21, .18, .16, .14, .12, .1, .09, .08, .07, .06, .05, .05]   # advance sales: today, tomorrow, ... (22 days)
ADV_DAYS = [TODAY + timedelta(days=i) for i in range(len(ADV_FRAC))]
noise = {d: RT.lognormvariate(0, 0.18) for d in VISIT_DAYS + ADV_DAYS}
W = {d: day_weight(d) * wx_day.get(d, 1.0) * noise[d] for d in VISIT_DAYS + ADV_DAYS}
CAP_ORD = int(MAX_OCC * 0.80)                           # the busiest ordinary day stays at 80% of capacity; only the demo sold-out day reaches MAX_OCC
DEMO_TICKETS = 4

# people: every active customer who is not a demo account is a possible visitor. Weights: a few enthusiasts, members visit more,
# parents come with their children.
kids_of = {}
for c in deps:
    if c[5]: kids_of.setdefault(c[6], []).append(c[0])
consent_at = {c[0]: c[2] for c in consent}
weights = {}
for c in range(1, CUST_END+1):
    if c in (1, 2, 5, 6) or c in inactive: continue
    weights[c] = RT.lognormvariate(0, 0.8) * (3.0 if c in members else 1.0) * (1.3 if c in kids_of else 1.0)
ids = sorted(weights, key=lambda c: (signup[c], c)); wts = [weights[c] for c in ids]
cum = list(accumulate(wts)); sign_sorted = [signup[c] for c in ids]
kid_sign = sorted(signup[k] for ks in kids_of.values() for k in ks)
def pick_customer(d):          # weighted draw among active customers who had signed up by day d
    k = bisect_right(sign_sorted, d)
    return ids[bisect_right(cum, RT.random() * cum[k-1], 0, k)]
def pool_size(d): return bisect_right(sign_sorted, d) + bisect_right(kid_sign, d)
def n_for(k, d, frac=1.0):
    return max(0, min(CAP_ORD, int(0.55 * pool_size(d)), round(k * W[d] * frac)))
FIXED = MAX_OCC + DEMO_TICKETS
def total_for(k):
    return (sum(n_for(k, d) for d in VISIT_DAYS) + sum(max(0, n_for(k, d, f) - (2 if d in (TODAY, TODAY + timedelta(days=1)) else 0)) for d, f in zip(ADV_DAYS, ADV_FRAC)) + FIXED)
lo, hi_ = 0.0, 500.0
for _ in range(60):
    mid = (lo + hi_) / 2
    if total_for(mid) < TARGET_TICKETS: lo = mid
    else: hi_ = mid
K = (lo + hi_) / 2

tickets, groups = [], []
def mk(cid, mem, d, exp, bought, grp=None): tickets.append(dict(cust=cid, mem=mem, date=d, express=exp, bought=bought, grp=grp))
def lead_days():
    return RT.choices([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [30, 17, 13, 10, 5, 5, 5, 3, 3, 3, 2, 2, 2])[0]
def buy_time(d, cid, mem_start=None):
    """When the ticket was bought: 0 to 12 days before the visit, never before sign-up or the membership start, never in the future."""
    day = d - timedelta(days=lead_days())
    day = min(day, LAST)
    floor_ = max(signup[cid], mem_start or START)
    day = max(day, floor_)
    h = RT.randint(7, 15) if day == d else RT.randint(6, 22)
    return dtm(day, h, RT.randint(0, 59))
def kid_age(k, d): return (d - dob_of[k]).days // 365
def draw_day(d, n, cap, advance=False):
    """Draw visitor groups until the day has n tickets (never more than cap)."""
    seen, total, tries = set(), 0, 0
    while total < n and tries < 40 * n + 200:
        tries += 1
        cid = pick_customer(d)
        if cid in seen: continue
        m = term_on(cid, d)
        if cid in members and not m and RT.random() < 0.5: continue        # a lapsed member comes less often
        use = None
        if m and (m['tier'] != 'Basic' or d.weekday() < 5) and RT.random() < 0.85: use = m
        elif m and RT.random() < 0.4: continue
        exp = True if (use and use['tier'] == 'Premier') else RT.random() < 0.2
        if advance: bought = dtm(max(LAST - int(abs(RT.gauss(0, 5))) * timedelta(days=1), signup[cid], use['start'] if use else START), RT.randint(6, 22), RT.randint(0, 59))
        else: bought = buy_time(d, cid, use['start'] if use else None)
        kids = []
        for k in kids_of.get(cid, ()):
            if signup[k] < d and RT.random() < (0.8 if kid_age(k, d) < 14 else 0.55): kids.append(k)
        room = cap - total
        if room < 1: break
        kids = kids[:room - 1]
        g = dict(date=d, members=[cid] + kids)
        groups.append(g); seen.add(cid)
        mk(cid, use['id'] if use else None, d, exp, bought, g)
        for k in kids:
            seen.add(k)
            mk(k, None, d, exp, max(bought, consent_at[k] + timedelta(hours=1)), g)
        total += 1 + len(kids)
    return total
for d in VISIT_DAYS:
    draw_day(d, n_for(K, d), CAP_ORD)
for d, f in zip(ADV_DAYS, ADV_FRAC):
    demo_here = 2 if d in (TODAY, TODAY + timedelta(days=1)) else 0
    draw_day(d, max(0, n_for(K, d, f) - demo_here), CAP_ORD - demo_here, advance=True)
# the demo sold-out day: exactly MAX_OCC individual guests, bought over the last five weeks
sold = set()
while len(sold) < MAX_OCC:
    cid = pick_customer(SOLD_OUT)
    if cid in sold: continue
    m = term_on(cid, SOLD_OUT); use = m if (m and m['tier'] != 'Basic' and RT.random() < 0.85) else None
    day = max(TODAY - timedelta(days=RT.randint(1, 35)), signup[cid], use['start'] if use else START)
    mk(cid, use['id'] if use else None, SOLD_OUT, True if (use and use['tier'] == 'Premier') else RT.random() < 0.2, dtm(day, RT.randint(6, 22), RT.randint(0, 59)))
    sold.add(cid)
bd = dtm(TODAY - timedelta(days=2), 10)
mk(1,None,TODAY,False,bd); mk(2,None,TODAY,False,bd); mk(1,None,TODAY + timedelta(days=1),True,bd); mk(2,None,TODAY + timedelta(days=1),False,bd)
tickets.sort(key=lambda t: (t['date'], t['cust']))
for i, t in enumerate(tickets, 1): t['id'] = i; t['dep'] = t['cust'] in parent_of
per_day = Counter(t['date'] for t in tickets)
assert max(c for d, c in per_day.items() if d != SOLD_OUT) <= CAP_ORD and per_day[SOLD_OUT] == MAX_OCC
assert len({(t['cust'], t['date']) for t in tickets}) == len(tickets)
assert all(t['bought'].date() <= t['date'] for t in tickets) and all(t['bought'] < dtm(TODAY, 0) or t['bought'] <= bd for t in tickets if t['date'] >= TODAY)
assert all(t['bought'].date() >= signup[t['cust']] for t in tickets if t['cust'] > 6)
insert(part('Ticket'), 'Ticket', ['TicketID','CustomerID','MembershipID','VisitDate','HasExpress','TicketPrice','PurchaseDate'],
       [(t['id'],t['cust'],t['mem'],t['date'],t['express'],0,t['bought']) for t in tickets if not t['dep']])
insert(parts['52_dependent_tickets'], 'Ticket', ['TicketID','CustomerID','MembershipID','VisitDate','HasExpress','TicketPrice','PurchaseDate'],
       [(t['id'],t['cust'],t['mem'],t['date'],t['express'],0,t['bought']) for t in tickets if t['dep']])
by_mem = {t_['id']: t_ for t_ in terms}
for t in tickets:   # self-check the membership rules
    if t['mem']:
        m = by_mem[t['mem']]; assert m['start'] <= t['date'] <= m['end'] and m['cust'] == t['cust']
        assert m['tier'] != 'Basic' or t['date'].weekday() < 5
        assert t['bought'].date() >= m['start']

# refunds (decided before activity; refunded tickets get no activity). A family is refunded together.
refunds, refunded = [], set()
tk_by_grp = {}
for t in tickets:
    if t['grp'] is not None: tk_by_grp.setdefault(id(t['grp']), []).append(t)
    else: tk_by_grp[('solo', t['id'])] = [t]
for ts in tk_by_grp.values():
    d = ts[0]['date']
    if d > LAST: continue
    e = closing.get(d)
    if e and RT.random() < 0.30:
        for t in ts:
            refunds.append((t['id'], e['id'], max(e['start'] + timedelta(minutes=20), t['bought'] + timedelta(hours=1)), 'Weather closure')); refunded.add(t['id'])
    elif RT.random() < 0.012:
        why = RT.choice(['Customer request','Illness','Duplicate purchase','Schedule change'])
        for t in ts:
            window = max(2, min(48, int((dtm(d, 9) - t['bought']).total_seconds() // 3600)))
            refunds.append((t['id'], None, t['bought'] + timedelta(hours=RT.randint(2, window), minutes=RT.randint(0, 59)), why)); refunded.add(t['id'])

# activity
active_rides = [r for r in RIDES if r[8]]
active_games = [g for g in GAMES if g[4]]
rl, gp, pu = [], [], []
def pick_time(a, b):
    return a + timedelta(minutes=R.randint(0, max(1, int((b-a).total_seconds()//60))))

def pick_time_p(a, b):
    return a + timedelta(minutes=RP.randint(0, max(1, int((b-a).total_seconds()//60))))

# purchases and game plays (stage 9): own generator RP. Food follows the meal times, drinks and ice cream the heat, shops the end of the visit,
# alcohol only goes to guests aged 21 or over on the visit date, and nothing is sold at a venue (or played on a game) that is under maintenance.
RP = random.Random(3380 + 9)
HOT_MONTHS = {5, 6, 7, 8, 9}
GAME_POP = {1: 6, 2: 9, 3: 6, 4: 5, 5: 6, 6: 10}                 # Skee Ball and Basketball Shot are the favourites; the inactive Duck Pond has no row
def item_weight(it, hour, hot, adult, kid):
    cat = it[3]
    if it[5] and not adult: return 0.0                          # no alcohol for guests under 21
    if cat in ('Entree', 'Side'): w = 3.0 if (11 <= hour < 14 or 17 <= hour < 20) else 0.4
    elif cat == 'Drink': w = 2.2 if hot else 1.0
    elif cat in ('Snack', 'Dessert'): w = 1.8 if hot else 1.2
    else:
        w = 1.8 if hour >= 17 else 0.8                          # souvenirs on the way out
        if kid and cat in ('Toy', 'Candy'): w *= 1.6
    return w * (0.7 if it[5] else 1.0)
def spend(t, arr, end):
    d = t['date']; age = (d - dob_of[t['cust']]).days // 365
    adult, kid, hot = age >= 21, age < 13, d.month in HOT_MONTHS
    for _ in range(RP.choices([0, 1, 2, 3], [30, 30, 25, 15] if kid else [40, 30, 20, 10])[0]):
        at = pick_time_p(arr, end)
        open_g = [g for g in active_games if not under_maint('Game', g[0], at)]
        if open_g: gp.append((RP.choices(open_g, [GAME_POP[g[0]] * (1.3 if kid else 1.0) for g in open_g])[0][0], t['id'], at, 0))
    for _ in range(RP.choices([1, 2, 3, 4], [40, 32, 20, 8] if kid else [18, 30, 30, 22])[0]):
        at = pick_time_p(arr, end)
        shut = {v[0] for v in VENUES if under_maint('Venue', v[0], at)}
        cand = [(it, item_weight(it, at.hour, hot, adult, kid)) for it in ITEMS if it[1] not in shut]
        cand = [c for c in cand if c[1] > 0]
        if cand:
            it = RP.choices([c[0] for c in cand], [c[1] for c in cand])[0]
            pu.append((t['id'], it[0], RP.choices([1, 2, 3], [8, 3, 1] if kid else [6, 3, 1])[0], 0, at))

# ride log (stage 8): 4 to 6 boardings per ticket, popular rides drawn more often, and the order of the rides changes from month to month.
# Own generator RL, so the rides never disturb the games, purchases and shifts that share R.
RL = random.Random(3380 + 8)
POP = {1:3.0, 2:3.2, 3:10.0, 4:8.5, 5:7.5, 6:7.5, 7:6.0, 8:4.5, 9:4.0, 10:2.8, 11:3.0, 12:6.5, 14:4.5, 15:2.5}   # base pull of each active ride
WATER_M = {1:.35, 2:.4, 3:.6, 4:.9, 5:1.3, 6:1.9, 7:2.1, 8:2.0, 9:1.4, 10:.9, 11:.5, 12:.35}                    # water rides: busy in the heat
INDOOR_M = {1:1.3, 2:1.3, 3:1.1, 4:1.0, 5:1.0, 6:.95, 7:.95, 8:.95, 9:1.0, 10:1.05, 11:1.2, 12:1.3}              # indoor rides: busy in the cold
DRIFT = {(r[0], y, m): RL.lognormvariate(0, 0.25) for r in active_rides for y in (2025, 2026) for m in range(1, 13)}   # taste changes by month
WX_TYPE = {}
for e in wev: WX_TYPE.setdefault(e['start'].date(), e['type'])
_day_w = {}
def ride_weights(d):
    if d not in _day_w:
        wet = WX_TYPE.get(d) in ('Rain', 'Storm', 'Cold', 'Heat')       # on bad-weather days guests head indoors
        _day_w[d] = {r[0]: POP[r[0]] * DRIFT[(r[0], d.year, d.month)]
                           * (WATER_M[d.month] if r[3] == 'Water Ride' else 1.0)
                           * (INDOOR_M[d.month] * (1.6 if wet else 1.0) if r[6] else 1.0) for r in active_rides}
    return _day_w[d]
def board(t, arr, h):
    """The boardings for one ticket. Every rule of trg_RideLog_BI is checked here: ride in service, not under maintenance,
    outdoor rides closed during a weather event, height, Express only with the benefit on an eligible ride, park hours, ticket not refunded."""
    d = t['date']; rw = ride_weights(d)
    n = RL.choices([4, 5, 6], [30, 45, 25])[0]
    now, used, out, tries = arr, set(), [], 0
    while len(out) < n and now <= dtm(d, 21, 30) and tries < 40:
        tries += 1
        wc = weather_closed(now)
        cand = [r for r in active_rides if r[5] <= h and (r[6] or not wc) and not under_maint('Ride', r[0], now)]
        fresh = [r for r in cand if r[0] not in used] or cand            # a guest rides something new before repeating
        if not fresh:
            now += timedelta(minutes=20); continue
        ride = RL.choices(fresh, [rw[r[0]] * (2.0 if h < 120 and r[5] <= 107 else 1.0) for r in fresh])[0]   # small guests favour the gentle rides
        used.add(ride[0])
        out.append((ride[0], 'Boarding', t['id'], None, bool(t['express'] and ride[7] and RL.random() < 0.75), now))
        now += timedelta(minutes=RL.randint(20, 55))
    return out
for t in tickets:
    if t['date'] > LAST or t['id'] in refunded: continue
    d, h = t['date'], height[t['cust']]
    arr = dtm(d, 9, 30) + timedelta(minutes=R.randint(0, 210))
    end = min(arr + timedelta(hours=R.randint(4,8)), dtm(d, 21, 30))
    rl.extend(board(t, arr, h))
    spend(t, arr, end)
base = {'Coaster':35,'Water Ride':28,'Simulator':22,'Dark Ride':18,'Train':8,'Carousel':6,'Walkthrough':10}
att_ref = sorted(per_day[d] for d in HIST_DAYS)[len(HIST_DAYS) // 2]      # a typical day's tickets; busy days queue longer, quiet days shorter
for d in HIST_DAYS:
    load = min(2.0, max(0.35, (per_day[d] / att_ref) ** 0.6))
    for r in active_rides:
        for hh in (12, 16):
            at = dtm(d, hh)
            if under_maint('Ride', r[0], at) or (not r[6] and weather_closed(at)): continue
            b = 20 if r[0] == 14 else base[r[3]]
            w = max(2, min(150, round(b * load * (POP[r[0]] / 5) ** 0.35 * (1.1 if hh == 16 else 1) * RL.uniform(0.8, 1.2))))
            rl.append((r[0], 'Wait Reading', None, w, False, at))
rl.sort(key=lambda x: (x[5], x[1]))
gp.sort(key=lambda x: x[2]); pu.sort(key=lambda x: x[4])
dep_ids = {t['id'] for t in tickets if t['dep']}       # dependents' rows go in their own files, which load after file 16
def split_rows(rows, i): return [r for r in rows if r[i] not in dep_ids], [r for r in rows if r[i] in dep_ids]
a_rl, d_rl = split_rows(rl, 2); a_gp, d_gp = split_rows(gp, 1); a_pu, d_pu = split_rows(pu, 0)
RL_COLS = ['RideID','EventType','TicketID','WaitMinutes','UsedExpress','LoggedAt']; GP_COLS = ['GameID','TicketID','PlayedAt','AmountPaid']; PU_COLS = ['TicketID','ItemID','Quantity','UnitPrice','PurchasedAt']
insert(part('RideLog'), 'RideLog', RL_COLS, a_rl); insert(parts['62_ride_log_dependents'], 'RideLog', RL_COLS, d_rl)
insert(part('GamePlay'), 'GamePlay', GP_COLS, a_gp); insert(parts['72_purchases_games_dependents'], 'GamePlay', GP_COLS, d_gp)
insert(part('Purchase'), 'Purchase', PU_COLS, a_pu); insert(parts['72_purchases_games_dependents'], 'Purchase', PU_COLS, d_pu)
refunds.sort(key=lambda x: x[0])
RF_COLS = ['TicketID','WeatherID','RefundedAt','RefundReason']
insert(part('TicketRefund'), 'TicketRefund', RF_COLS, [r for r in refunds if r[0] not in dep_ids])
insert(parts['52_dependent_tickets'], 'TicketRefund', RF_COLS, [r for r in refunds if r[0] in dep_ids])

# shifts (stage 10): every employee works from their hire date to yesterday (or to the day before they left), week by week.
# Own generator RS: nothing earlier changes. A week holds as many 6 to 9 hour shifts as fit inside the person's scheduled
# HoursPerWeek (so no week is over 40 by construction; it is asserted below), fewer in the slow months, now and then a week off.
# Ratings follow a quality per person, so a few are clearly weak and a few clearly strong; the newest shifts are still unrated.
RS = random.Random(3380 + 10)
OPEN_SHIFT_STAFF = (1, 13, 17, 28, 33)                  # clocked in today (the demo relies on these)
OPEN_HOURS = 16                                         # an open shift counts as 16 hours in its week: SQL/17 counts it up to NOW(), and it clocked in at 08:30
DAY_W_OPS = [1.0, 1.0, 1.0, 1.0, 1.4, 1.8, 1.5]         # Monday to Sunday: ride, game, food and shop crews work the weekends
DAY_W_DAY = [1.0, 1.0, 1.0, 1.0, 1.0, 0.4, 0.2]         # technicians and managers work weekdays
slots = {}                                              # (employee, Monday) -> hours, for the 40-hour self-check
quality = {}                                            # employee -> mean rating
tenured = [e[0] for e in emps if e[0] not in DEMO_STAY and e[5] <= TODAY - timedelta(days=150) and e[4] not in ('Manager',)]
weak = set(RS.sample(tenured, 4)); strong = set(RS.sample([i for i in tenured if i not in weak], 5))
for e in emps:
    quality[e[0]] = 2.4 if e[0] in weak else 4.8 if e[0] in strong else min(4.5, max(3.2, RS.gauss(3.9, 0.3)))
def rate(emp, d):
    newest = (LAST - d).days <= 2 or (d - hire[emp]).days <= 14
    if RS.random() < (0.55 if newest else 0.06): return None
    return max(1, min(5, round(RS.gauss(quality[emp], 0.7))))
shifts = []
wk = START - timedelta(days=START.weekday())
while wk <= LAST:
    f_slow = max(0.75, min(1.0, 0.65 + 0.35 * SEASON[(wk + timedelta(days=3)).month]))
    for e in emps:
        emp, title, hrs = e[0], e[4], e[7]
        end_work = min(left_on[emp] - timedelta(days=1), LAST) if emp in left_on else LAST
        days = [wk + timedelta(days=k) for k in range(7) if hire[emp] <= wk + timedelta(days=k) <= end_work]
        if not days or RS.random() < 0.05: continue                        # not employed this week, or a week off
        full = title in ('Technician', 'Manager')
        budget = int(hrs * (1.0 if full else f_slow))
        if emp in OPEN_SHIFT_STAFF and wk <= TODAY < wk + timedelta(days=7): budget -= OPEN_HOURS
        lens, total = [], 0
        while len(lens) < min(6, len(days)):
            L = RS.choice([6, 7, 8, 8, 9])
            if total + L > budget: L = 6
            if total + L > budget: break
            lens.append(L); total += L
        wts = DAY_W_DAY if full else DAY_W_OPS
        pool, picked = list(days), []
        for _ in lens:
            d = RS.choices(pool, [wts[x.weekday()] for x in pool])[0]
            pool.remove(d); picked.append(d)
        for d, L in zip(sorted(picked), lens):
            cin = dtm(d, 8 + RS.choice([0, 1, 2]))
            shifts.append((emp, cin, cin + timedelta(hours=L), rate(emp, d)))
        slots[(emp, wk)] = total + (OPEN_HOURS if emp in OPEN_SHIFT_STAFF and wk <= TODAY < wk + timedelta(days=7) else 0)
    wk += timedelta(days=7)
shifts.sort(key=lambda s: (s[1], s[0]))
for emp in OPEN_SHIFT_STAFF: shifts.append((emp, dtm(TODAY, 8, 30), None, None))   # open shifts (clocked in now)
sched = {e[0]: e[7] for e in emps}
assert all(h <= 40 and h <= sched[k[0]] for k, h in slots.items()), 'a week is over the scheduled hours'
# 40 hours on ACTUAL hours (SQL/17_shift_hours_cap.sql), recomputed from the rows themselves and not from the plan above: Monday to Sunday by the week
# of the clock-in, seconds, an open shift at OPEN_HOURS (the database counts it up to now, so it is never more than that on the day of the load).
_wk = {}
for s in shifts:
    key = (s[0], (s[1].date() - timedelta(days=s[1].weekday())))
    _wk[key] = _wk.get(key, 0) + ((s[2] - s[1]).total_seconds() if s[2] is not None else OPEN_HOURS * 3600)
_over = sorted((k, v / 3600) for k, v in _wk.items() if v > 40 * 3600)
assert not _over, ('a week is over 40 clocked hours (SQL/17 would refuse it)', _over[:3])
assert len({(s[0], s[1]) for s in shifts}) == len(shifts), 'duplicate clock-in'
_by = {}
for s in shifts:
    if s[2] is not None: _by.setdefault(s[0], []).append((s[1], s[2]))
assert all(a[1] <= b[0] for v in _by.values() for a, b in zip(sorted(v), sorted(v)[1:])), 'overlapping shifts'
assert all(s[1] >= datetime.combine(hire[s[0]], time(0)) for s in shifts), 'shift before hire date'
assert not any(s[0] in left_on and s[1].date() >= left_on[s[0]] for s in shifts), 'shift after leaving'
insert(part('Shift'), 'Shift', ['EmployeeID','ClockIn','ClockOut','ShiftRating'], shifts)
# leavers are switched off only now: trg_Shift_BI refuses a shift for an inactive employee, so their shifts go in first
part('Shift').append("-- people who have left the park (their shifts are above; they have none after the leave date)\n" +
    "".join(f"UPDATE Employee SET IsActive = 0 WHERE EmployeeID = {i};  -- left {d}\n" for i, d in sorted(left_on.items())))

COUNTS = ("""
-- Row counts after loading
SELECT 'Employee' t, COUNT(*) n FROM Employee UNION ALL SELECT 'Customer', COUNT(*) FROM Customer
UNION ALL SELECT 'Membership', COUNT(*) FROM Membership UNION ALL SELECT 'WeatherLog', COUNT(*) FROM WeatherLog
UNION ALL SELECT 'Maintenance', COUNT(*) FROM Maintenance UNION ALL SELECT 'Ticket', COUNT(*) FROM Ticket
UNION ALL SELECT 'RideLog', COUNT(*) FROM RideLog UNION ALL SELECT 'GamePlay', COUNT(*) FROM GamePlay
UNION ALL SELECT 'Purchase', COUNT(*) FROM Purchase UNION ALL SELECT 'TicketRefund', COUNT(*) FROM TicketRefund
UNION ALL SELECT 'Shift', COUNT(*) FROM Shift;
""")
HEAD = "USE theme_park;\nSET NAMES utf8mb4;\nSET autocommit = 0;\n"
for name, body in parts.items():
    (HIST/f'{name}.sql').write_text(f"-- history/{name}.sql: {DESC[name]}. Generated by tools/gen_test_data.py (made-up data).\n" + HEAD + "".join(body) + "COMMIT;\n")
LATE = {'12_dependents', '22_member_perks', '24_cancellations', '40_maintenance', '52_dependent_tickets', '62_ride_log_dependents', '72_purchases_games_dependents'}      # need columns or tables from files after 02 (docker init loads 02 before 16)
(HIST/'99_row_counts.sql').write_text("USE theme_park;\n" + COUNTS.replace("UNION ALL SELECT 'Shift', COUNT(*) FROM Shift;",
    "UNION ALL SELECT 'Shift', COUNT(*) FROM Shift UNION ALL SELECT 'Dependent', COUNT(*) FROM Customer WHERE ParentCustomerID IS NOT NULL\n"
    "UNION ALL SELECT 'DependentConsent', COUNT(*) FROM DependentConsent UNION ALL SELECT 'MemberPerk', COUNT(*) FROM MemberPerk\n"
    "UNION ALL SELECT 'CancellationRequest', COUNT(*) FROM MembershipCancellationRequest;"))
# 02_test_data.sql is the same data in one file, for the docker init order (00 schema, 01, 02 ...).
(OUT/'02_test_data.sql').write_text(
    "-- 02_test_data.sql: the whole dataset in one file (the same rows as history/10 to 80, without the files that need later schema: dependents, perks, cancellations, maintenance). Load after 01_park_and_reference.sql.\n"
    f"-- Dates: the original 94-day block moved to end on {LAST}; one sold-out day ({SOLD_OUT}); demo tickets for {TODAY} and {TODAY + timedelta(days=1)}.\n"
    "-- Generated by tools/gen_test_data.py. Every row obeys the triggers. Made-up data.\n" + HEAD +
    "".join("".join(body) + "COMMIT;\n" for name, body in parts.items() if name not in LATE) + COUNTS)

# 07_extra_maintenance_data.sql is the maintenance history for the docker init order: it loads after file 04 (RepairCost), which 02 cannot.
(OUT/'07_extra_maintenance_data.sql').write_text(
    "-- 07_extra_maintenance_data.sql: the maintenance history (jobs and crews), the same rows as history/40_maintenance.sql.\n"
    "-- REQUIRES 04_staff_roles_and_costs.sql (RepairCost) and the employees from 02. Generated by tools/gen_test_data.py: do not edit by hand.\n"
    "-- Made-up data: job details and repair costs are generated for the demo. Say so in the presentation.\n" + HEAD + "".join(parts['40_maintenance']) + "COMMIT;\n")

demo_ids = {(t['cust'], t['date']): t['id'] for t in tickets if t['cust'] in (1,2) and t['date'] >= TODAY and t['date'] < SOLD_OUT}
print('tickets', len(tickets), 'boardings', sum(1 for r in rl if r[1]=='Boarding'), 'readings', sum(1 for r in rl if r[1]!='Boarding'),
      'games', len(gp), 'purchases', len(pu), 'refunds', len(refunds), 'shifts', len(shifts), 'weather', len(wev))
print('demo tickets', demo_ids)
print('closing days', sorted(closing))
print('maintenance', len(J), 'by type', dict(Counter(j[3] for j in J)), 'unfinished fixes followed up', sum(1 for j in J if j[6] in ('Partially Fixed','Not Fixed')), 'crew double-bookings', double)
print('employees', len(emps), 'left', len(left_on), 'avg hours/wk', round(avg_hours,1), 'certs', len(cert),
      'by title', {t: titles.count(t) for t in pay})
print('customers', len(cust), 'inactive', len(inactive), 'dependents', len(deps), 'parents with dependents', len({d[6] for d in deps}))
print('sign-ups per month', {m.strftime('%Y-%m'): sum(1 for c in range(7, CUST_END+1) if signup[c].year == m.year and signup[c].month == m.month) for m in month_starts})
print('closing weather per month', dict(sorted(Counter(e['start'].strftime('%Y-%m') for e in wev if e['closes']).items())))
rated = [x[3] for x in shifts if x[3] is not None]
print('shifts', len(shifts), 'open', sum(1 for x in shifts if x[2] is None), 'rated', len(rated), 'avg rating', round(sum(rated)/len(rated), 2), 'max week hours', max(slots.values()), 'avg week hours', round(sum(slots.values())/len(slots), 1))
