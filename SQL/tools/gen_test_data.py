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
MAX_OCC = 600            # Park.MaxOccupancy (was 120). Stage 7 asserts the busiest ordinary day stays under 80% of it.
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

o1 = ["-- 01_park_and_reference.sql: Park row (final prices, MaxOccupancy 600), zones, rides, games, venues, items. Generated by tools/gen_test_data.py.\n",
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
-- Keeps AppUser (logins) and MembershipTier (price list). Run only before re-loading 01 and the history.
-- AppUser.EmployeeID is not cleared: re-run server/scripts/seed-users.js afterwards so every login points at a real employee.
USE theme_park;
SET FOREIGN_KEY_CHECKS = 0;
""" + "".join(f"TRUNCATE TABLE {t};\n" for t in
  ['RideLog','GamePlay','Purchase','TicketRefund','Ticket','Membership','MaintenanceCrew','Maintenance','Shift',
   'RideCertification','EmployeeZone','Employee','Item','Venue','Game','Ride','WeatherLog','Zone','Customer','Park']) +
"SET FOREIGN_KEY_CHECKS = 1;\n")

# ---------------- 02 test data ----------------
HIST = OUT / 'history'
HIST.mkdir(exist_ok=True)
for old in HIST.glob('*.sql'): old.unlink()
FILES = {'Employee': '10_people', 'EmployeeZone': '10_people', 'RideCertification': '10_people', 'Customer': '10_people', 'DependentCustomer': '12_dependents', 'DependentConsent': '12_dependents', 'Membership': '20_memberships', 'MemberPerk': '22_member_perks', 'MembershipCancellationRequest': '24_cancellations', 'WeatherLog': '30_weather', 'Maintenance': '40_maintenance', 'MaintenanceCrew': '40_maintenance', 'Ticket': '50_tickets', 'TicketRefund': '50_tickets', 'RideLog': '60_ride_log', 'GamePlay': '70_purchases_games', 'Purchase': '70_purchases_games', 'Shift': '80_shifts'}
# file name -> description, in load order. Each file loads on its own and is committed as one transaction.
DESC = {'10_people':'employees, zones, certifications, customers','12_dependents':'dependents and their consent (needs file 16)','20_memberships':'memberships','22_member_perks':'member perks (needs file 14)','24_cancellations':'cancellation requests (needs file 16 and a Manager or Admin login)','30_weather':'weather log',
        '40_maintenance':'maintenance jobs and crews','50_tickets':'tickets and refunds','60_ride_log':'ride boardings and wait readings',
        '70_purchases_games':'purchases and game plays','80_shifts':'shifts and ratings'}
parts = {k: [] for k in DESC}
def part(table): return parts[FILES[table]]

FN = "Ava Liam Noah Emma Mia Ethan Zoe Lucas Ella Mason Ivy Logan Nora Owen Ruby Jack Lily Leo Maya Eli Chloe Ben Hana Sam Tara Omar Lena Ravi Priya Mateo Sofia Diego Alma Chen Mei Kofi Amara Yusuf Layla Tomas Rosa Jin Aiko Felix Greta Hugo Isla Jonas Kira Marco Nina Oscar Paula Quinn Rhea Sven Tess Uma Vera Wade".split()
LN = "Garcia Nguyen Patel Smith Johnson Lee Martinez Brown Davis Lopez Wilson Anderson Thomas Taylor Moore Jackson Martin Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Ortiz".split()

# employees
titles = (['Ride Operator']*8 + ['Game Attendant']*4 + ['Cook']*4 + ['Server']*5 + ['Shop Associate']*4 +
          ['Performer']*2 + ['Technician']*5 + ['Manager']*4)
pay = {'Ride Operator':(14,19),'Game Attendant':(13,16),'Cook':(15,20),'Server':(12,16),'Shop Associate':(13,16),
       'Performer':(16,22),'Technician':(24,38),'Manager':(30,45)}
emps, hire = [], {}
for i, t in enumerate(titles, 1):
    h = date(2018,1,1) + timedelta(days=R.randint(0, (date(2026,6,1)-date(2018,1,1)).days))
    hire[i] = h
    emps.append((i, R.choice(FN), R.choice(LN), date(1965,1,1)+timedelta(days=R.randint(0,35*365)), t, h,
                 round(R.uniform(*pay[t]),2), R.choice([20,24,30,32,36,40]), 0 if i in (21,25) else 1))
TECHS = [i for i,t in enumerate(titles,1) if t=='Technician']
insert(part('Employee'), 'Employee', ['EmployeeID','FirstName','LastName','DOB','JobTitle','HireDate','HourlyPay','HoursPerWeek','IsActive'], emps)
ez = []
for i in range(1, len(titles)+1):
    z = {(i-1) % 5 + 1}
    if titles[i-1] in ('Technician','Manager','Performer') or R.random() < 0.25: z.add(R.randint(1,5))
    ez += [(i, zz) for zz in sorted(z)]
insert(part('EmployeeZone'), 'EmployeeZone', ['EmployeeID','ZoneID'], ez)
cert = []
for i, t in enumerate(titles, 1):
    if t == 'Ride Operator':
        for rid in R.sample([r[0] for r in RIDES if r[8]], 3):
            cert.append((i, rid, hire[i] + timedelta(days=R.randint(7,120))))
insert(part('RideCertification'), 'RideCertification', ['EmployeeID','RideID','CertifiedOn'], cert)

# customers. signup / dob_of are kept so later stages never put a visit before sign-up or birth.
# Sign-ups follow the park's year: an opening rush, then the seasons, tapering a little after the first summer.
cust, height, dob_of, signup, inactive = [], {}, {}, {}, {6}
demo = [(1,'Dana','Demo',date(1990,4,12),172,1),(2,'Kit','Demo',date(2022,6,20),95,1),(3,'Bailey','Basic',date(1988,9,3),168,1),
        (4,'Pat','Plus',date(1985,1,27),180,1),(5,'Eve','Expired',date(1979,11,8),165,1),(6,'Ian','Inactive',date(1992,2,14),178,0)]
for c in demo: cust.append(c); height[c[0]] = c[4]; dob_of[c[0]] = c[3]; signup[c[0]] = START
adult = {3,4,5}
SEASON = {1:.5,2:.6,3:1.0,4:1.2,5:1.1,6:1.4,7:1.4,8:1.1,9:.7,10:.9,11:.6,12:.6}
month_starts, mw = [], []
m0 = date(START.year, START.month, 1)
while m0 <= LAST:
    k = len(month_starts)
    month_starts.append(m0); mw.append(SEASON[m0.month] * (2.2 if k < 2 else 1.3 if k < 6 else 1.0))
    m0 = date(m0.year + (m0.month == 12), m0.month % 12 + 1, 1)
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
def weather_closed(at):
    return any(e['closes'] and at >= e['start'] and (e['end'] is None or at < e['end']) for e in wev)

# maintenance
J = [  # id, kind, target, type, start, end, outcome, reason
 (1,'Ride',3,'Routine Inspection',dtm(dd(2026,7,22),6),dtm(dd(2026,7,22),9),'Fixed','Monthly safety inspection'),
 (2,'Ride',1,'Preventive Service',dtm(dd(2026,7,30),5),dtm(dd(2026,7,30),11),'Fixed','Track and wheel service'),
 (3,'Ride',4,'Preventive Service',dtm(dd(2026,8,12),7),dtm(dd(2026,8,13),13),'Fixed','Brake system service'),
 (4,'Game',3,'Emergency Repair',dtm(dd(2026,8,25),12),dtm(dd(2026,8,26),10),'Fixed','Pop mechanism jammed'),
 (5,'Ride',6,'Routine Inspection',dtm(dd(2026,8,18),6),dtm(dd(2026,8,18),10,30),'Fixed','Water pump check'),
 (6,'Venue',1,'Routine Inspection',dtm(dd(2026,8,5),6),dtm(dd(2026,8,5),8),'Fixed','Kitchen equipment inspection'),
 (7,'Ride',3,'Emergency Repair',dtm(dd(2026,9,2),11),dtm(dd(2026,9,3),16),'Fixed','Lift hill chain fault'),
 (8,'Ride',5,'Refurbishment',dtm(dd(2026,9,7),6),dtm(dd(2026,9,12),20),'Fixed','Boat and flume refurbishment'),
 (9,'Game',1,'Routine Inspection',dtm(dd(2026,9,15),7),dtm(dd(2026,9,15),8,30),'Fixed','Monthly game check'),
 (10,'Ride',4,'Safety Recall',dtm(dd(2026,9,20),9),dtm(dd(2026,9,22),18),'Partially Fixed','Manufacturer harness recall'),
 (11,'Venue',2,'Refurbishment',dtm(dd(2026,9,28),6),dtm(dd(2026,10,2),18),'Fixed','Counter and fryer replacement'),
 (12,'Ride',8,'Routine Inspection',dtm(dd(2026,10,1),6),dtm(dd(2026,10,1),9),'Fixed','Motion base inspection'),
 (13,'Ride',4,'Preventive Service',dtm(dd(2026,10,5),8),dtm(dd(2026,10,6),12),'Fixed','Harness retrofit completed'),
 (14,'Ride',7,'Emergency Repair',dtm(dd(2026,10,8),10),dtm(dd(2026,10,10),15),'Fixed','Animatronic failure'),
 (15,'Ride',12,'Safety Recall',dtm(dd(2026,10,14),8),dtm(dd(2026,10,16),17),'Not Fixed','Restraint recall, parts on order'),
 (16,'Ride',2,'Preventive Service',dtm(TODAY,8),None,None,'Motor and gearbox service')]
insert(part('Maintenance'), 'Maintenance', ['MaintenanceID','MaintType','RideID','GameID','VenueID','StartDate','EndDate','Outcome','Reason'],
       [(j[0],j[3],j[2] if j[1]=='Ride' else None,j[2] if j[1]=='Game' else None,j[2] if j[1]=='Venue' else None,j[4],j[5],j[6],j[7]) for j in J])
crew = []
for j in J:
    team = R.sample(TECHS, R.randint(2,3))
    crew += [(j[0], t, 'Lead' if k == 0 else 'Assistant') for k, t in enumerate(team)]
insert(part('MaintenanceCrew'), 'MaintenanceCrew', ['MaintenanceID','EmployeeID','CrewRole'], crew)
def under_maint(kind, tid, at):
    mine = [j for j in J if j[1]==kind and j[2]==tid]
    if any(j[4] <= at and (j[5] is None or at < j[5]) for j in mine): return True
    fin = [j for j in mine if j[5] is not None and j[5] <= at]
    if not fin: return False
    last = max(fin, key=lambda j: (j[5], j[4]))
    return last[6] != 'Fixed'

# tickets
closing = {e['start'].date(): e for e in wev if e['closes']}
weights = {c: (4 if c in members else 1) for c in range(1, CUST_END+1) if c not in (1,2,5,6) and c not in inactive}
ids = sorted(weights, key=lambda c: (signup[c], c)); wts = [weights[c] for c in ids]
cum = list(accumulate(wts)); sign_sorted = [signup[c] for c in ids]
def pick_customer(d):          # weighted draw among active customers who had signed up by day d
    k = bisect_right(sign_sorted, d)
    return ids[bisect_right(cum, R.random() * cum[k-1], 0, k)]
tickets = []
def mk(cid, mem, d, exp, bought): tickets.append(dict(cust=cid, mem=mem, date=d, express=exp, bought=bought))
for d in days:
    wk = d.weekday() >= 5
    n = R.randint(18,30) if wk else R.randint(6,12)
    n = int(n * (1.15 if d.month in (7,8) else 0.9 if d.month == 9 else 0.8) * (0.7 if d in closing else 1))
    seen = set()
    assert bisect_right(sign_sorted, d) > n * 3, d
    while len(seen) < n:
        seen.add(pick_customer(d))
    for cid in sorted(seen):
        m = term_on(cid, d); use = None
        if m and (m['tier'] != 'Basic' or not wk) and R.random() < 0.8: use = m
        exp = True if (use and use['tier'] == 'Premier') else R.random() < 0.22
        mk(cid, use['id'] if use else None, d, exp, dtm(max(d - timedelta(days=R.randint(0,12)), signup[cid]), R.randint(6,19), R.randint(0,59)))
for cid in R.sample([c for c in range(7, CUST_END+1) if c not in inactive], MAX_OCC):
    mk(cid, None, SOLD_OUT, R.random() < 0.2, dtm(max(dd(2026,10,R.randint(1,21)), signup[cid]), R.randint(6,19), R.randint(0,59)))
bd = dtm(dd(2026,10,20), 10)
mk(1,None,TODAY,False,bd); mk(2,None,TODAY,False,bd); mk(1,None,dd(2026,10,23),True,bd); mk(2,None,dd(2026,10,23),False,bd)
tickets.sort(key=lambda t: (t['date'], t['cust']))
for i, t in enumerate(tickets, 1): t['id'] = i
assert max(Counter(t['date'] for t in tickets).values()) <= MAX_OCC
insert(part('Ticket'), 'Ticket', ['TicketID','CustomerID','MembershipID','VisitDate','HasExpress','TicketPrice','PurchaseDate'],
       [(t['id'],t['cust'],t['mem'],t['date'],t['express'],0,t['bought']) for t in tickets])
by_mem = {t_['id']: t_ for t_ in terms}
for t in tickets:   # self-check the membership rules
    if t['mem']:
        m = by_mem[t['mem']]; assert m['start'] <= t['date'] <= m['end']
        assert m['tier'] != 'Basic' or t['date'].weekday() < 5

# refunds (decided before activity; refunded tickets get no activity)
refunds, refunded = [], set()
for t in tickets:
    if t['date'] > LAST: continue
    e = closing.get(t['date'])
    if e and R.random() < 0.30:
        when = max(e['start'] + timedelta(minutes=20), t['bought'] + timedelta(hours=1))
        refunds.append((t['id'], e['id'], when, 'Weather closure')); refunded.add(t['id'])
    elif R.random() < 0.012:
        refunds.append((t['id'], None, t['bought'] + timedelta(hours=R.randint(2,48)),
                        R.choice(['Customer request','Illness','Duplicate purchase','Schedule change']))); refunded.add(t['id'])

# activity
active_rides = [r for r in RIDES if r[8]]
active_games = [g for g in GAMES if g[4]]
rl, gp, pu = [], [], []
def pick_time(a, b):
    return a + timedelta(minutes=R.randint(0, max(1, int((b-a).total_seconds()//60))))
for t in tickets:
    if t['date'] > LAST or t['id'] in refunded: continue
    d, h = t['date'], height[t['cust']]
    arr = dtm(d, 9, 30) + timedelta(minutes=R.randint(0, 210))
    end = min(arr + timedelta(hours=R.randint(4,8)), dtm(d, 21, 30))
    now = arr
    for _ in range(R.randint(2, 6)):
        if now > dtm(d, 21, 30): break
        ride = None
        for _a in range(8):
            c = R.choice(active_rides)
            if c[5] > h or under_maint('Ride', c[0], now) or (not c[6] and weather_closed(now)): continue
            ride = c; break
        if ride:
            rl.append((ride[0], 'Boarding', t['id'], None, bool(t['express'] and ride[7] and R.random() < 0.75), now))
        now += timedelta(minutes=R.randint(25, 75))
    for _ in range(R.choices([0,1,2,3], [40,30,20,10])[0]):
        at = pick_time(arr, end); g = R.choice(active_games)
        if not under_maint('Game', g[0], at): gp.append((g[0], t['id'], at, 0))
    for _ in range(R.randint(1, 4)):
        at = pick_time(arr, end); it = R.choice(ITEMS)
        if not under_maint('Venue', it[1], at):
            pu.append((t['id'], it[0], R.choices([1,2,3],[6,3,1])[0], 0, at))
base = {'Coaster':35,'Water Ride':28,'Simulator':22,'Dark Ride':18,'Train':8,'Carousel':6,'Walkthrough':10}
for d in days:
    for r in active_rides:
        for hh in (12, 16):
            at = dtm(d, hh)
            if under_maint('Ride', r[0], at) or (not r[6] and weather_closed(at)): continue
            b = 20 if r[0] == 14 else base[r[3]]
            w = max(2, round(b * (1.4 if d.weekday() >= 5 else 1) * (1.1 if hh == 16 else 1) * R.uniform(0.7, 1.3)))
            rl.append((r[0], 'Wait Reading', None, w, False, at))
rl.sort(key=lambda x: (x[5], x[1]))
gp.sort(key=lambda x: x[2]); pu.sort(key=lambda x: x[4])
insert(part('RideLog'), 'RideLog', ['RideID','EventType','TicketID','WaitMinutes','UsedExpress','LoggedAt'], rl)
insert(part('GamePlay'), 'GamePlay', ['GameID','TicketID','PlayedAt','AmountPaid'], gp)
insert(part('Purchase'), 'Purchase', ['TicketID','ItemID','Quantity','UnitPrice','PurchasedAt'], pu)
refunds.sort(key=lambda x: x[0])
insert(part('TicketRefund'), 'TicketRefund', ['TicketID','WeatherID','RefundedAt','RefundReason'], refunds)

# shifts
shifts = []
for e in emps:
    if not e[8]: continue
    wk = FIRST
    while wk <= LAST:
        for off in R.sample(range(7), R.randint(2,4)):
            d = wk + timedelta(days=off)
            if FIRST <= d <= LAST and d >= hire[e[0]]:
                cin = dtm(d, 8 + R.choice([0,1,2]))
                cout = cin + timedelta(hours=R.choice([6,7,8,9]))
                shifts.append((e[0], cin, cout, R.choices([5,4,3,2,1],[30,35,20,8,2])[0] if R.random() < 0.6 else None))
        wk += timedelta(days=7)
shifts.sort(key=lambda s: (s[1], s[0]))
for emp in (1, 13, 17, 28, 33): shifts.append((emp, dtm(TODAY, 8, 30), None, None))   # open shifts (clocked in now)
insert(part('Shift'), 'Shift', ['EmployeeID','ClockIn','ClockOut','ShiftRating'], shifts)

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
LATE = {'12_dependents', '22_member_perks', '24_cancellations'}      # need columns or tables from files after 02 (docker init loads 02 before 16)
(HIST/'99_row_counts.sql').write_text("USE theme_park;\n" + COUNTS.replace("UNION ALL SELECT 'Shift', COUNT(*) FROM Shift;",
    "UNION ALL SELECT 'Shift', COUNT(*) FROM Shift UNION ALL SELECT 'Dependent', COUNT(*) FROM Customer WHERE ParentCustomerID IS NOT NULL\n"
    "UNION ALL SELECT 'DependentConsent', COUNT(*) FROM DependentConsent UNION ALL SELECT 'MemberPerk', COUNT(*) FROM MemberPerk\n"
    "UNION ALL SELECT 'CancellationRequest', COUNT(*) FROM MembershipCancellationRequest;"))
# 02_test_data.sql is the same data in one file, for the docker init order (00 schema, 01, 02 ...).
(OUT/'02_test_data.sql').write_text(
    "-- 02_test_data.sql: the whole dataset in one file (the same rows as history/10 to 80, without the files that need later schema: dependents). Load after 01_park_and_reference.sql.\n"
    f"-- Dates: the original 94-day block moved to end on {LAST}; one sold-out day ({SOLD_OUT}); demo tickets for {TODAY} and {TODAY + timedelta(days=1)}.\n"
    "-- Generated by tools/gen_test_data.py. Every row obeys the triggers. Made-up data.\n" + HEAD +
    "".join("".join(body) + "COMMIT;\n" for name, body in parts.items() if name not in LATE) + COUNTS)

demo_ids = {(t['cust'], t['date']): t['id'] for t in tickets if t['cust'] in (1,2) and t['date'] >= TODAY and t['date'] < SOLD_OUT}
print('tickets', len(tickets), 'boardings', sum(1 for r in rl if r[1]=='Boarding'), 'readings', sum(1 for r in rl if r[1]!='Boarding'),
      'games', len(gp), 'purchases', len(pu), 'refunds', len(refunds), 'shifts', len(shifts), 'weather', len(wev))
print('demo tickets', demo_ids)
print('closing days', sorted(closing))
print('customers', len(cust), 'inactive', len(inactive), 'dependents', len(deps), 'parents with dependents', len({d[6] for d in deps}))
print('sign-ups per month', {m.strftime('%Y-%m'): sum(1 for c in range(7, CUST_END+1) if signup[c].year == m.year and signup[c].month == m.month) for m in month_starts})
print('closing weather per month', dict(sorted(Counter(e['start'].strftime('%Y-%m') for e in wev if e['closes']).items())))
