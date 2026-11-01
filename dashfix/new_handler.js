route('GET', '/api/visitor/dashboard', async (ctx) => {
  const [[park]] = await pool.query('SELECT DayPassPrice, ExpressAddOnPrice FROM Park WHERE ParkID = 1');
  const [rideRows] = await pool.query(RIDES_SQL);

  const out = {
    customer: null,
    membership: null,
    membershipHistory: [],
    waitsVisible: false,
    perks: [],
    tiers: [],
    prices: park ? { dayPass: Number(park.DayPassPrice), expressAddOn: Number(park.ExpressAddOnPrice) } : null,
    tickets: [],
    rides: [],
  };

  const session = getSession(ctx.req);
  if (session?.role === 'Customer' && session.CustomerID) {
    out.tiers = await loadTiers();
    const [[cust]] = await pool.query(
      'SELECT CustomerID, FirstName, LastName, DOB, HeightCm FROM Customer WHERE CustomerID = ? AND IsActive = 1',
      [session.CustomerID],
    );
    if (!cust) throw new HttpError(404, 'Your customer profile could not be found');
    out.customer = { customerId: cust.CustomerID, firstName: cust.FirstName, lastName: cust.LastName, dob: cust.DOB, heightCm: cust.HeightCm };

    const [[m]] = await pool.query(
      `SELECT MembershipID, Tier, StartDate, EndDate, Price, AutoRenew, IncludesExpress, AnyDayAccess
         FROM v_CustomerMemberships
        WHERE CustomerID = ? AND IsActiveNow = 1
        ORDER BY EndDate DESC LIMIT 1`,
      [cust.CustomerID],
    );

    if (m) {
      out.membership = {
        membershipId: m.MembershipID,
        tier: m.Tier,
        startDate: m.StartDate,
        endDate: m.EndDate,
        annualPrice: Number(m.Price),
        autoRenew: Boolean(m.AutoRenew),
        benefits: benefits(m),
      };
      out.perks = await loadPerks(m.MembershipID);
      out.waitsVisible = true;
    }

    const [membershipRows] = await pool.query(
      `SELECT MembershipID, Tier, StartDate, EndDate,
              Price, AutoRenew, IncludesExpress, AnyDayAccess
         FROM Membership
        WHERE CustomerID = ?
        ORDER BY StartDate DESC`,
      [cust.CustomerID],
    );
    out.membershipHistory = membershipRows.map((row) => ({
      membershipId: row.MembershipID,
      tier: row.Tier,
      startDate: row.StartDate,
      endDate: row.EndDate,
      annualPrice: Number(row.Price),
      autoRenew: Boolean(row.AutoRenew),
      includesExpress: Boolean(row.IncludesExpress),
      anyDayAccess: Boolean(row.AnyDayAccess),
    }));

    const [ticketRows] = await pool.query(`${TICKETS_SQL} ORDER BY t.VisitDate DESC, t.TicketID DESC LIMIT 200`, [cust.CustomerID]);
    out.tickets = ticketRows.map(ticketJson);
  }

  // Wait readings are read only when allowed.
  const waits = new Map();
  if (out.waitsVisible) {
    const [waitRows] = await pool.query(RIDE_WAITS_SQL);
    for (const w of waitRows) waits.set(w.RideID, w);
  }

  out.rides = rideRows.map((r) => {
    const w = waits.get(r.RideID);
    return {
      rideId: r.RideID,
      rideName: r.RideName,
      zoneName: r.ZoneName,
      currentState: r.CurrentState,
      waitMinutes: out.waitsVisible && r.CurrentState === 'Open' ? (w?.WaitMinutes ?? null) : null,
      updatedLabel: out.waitsVisible ? (w?.WaitAt ? `Reading at ${String(w.WaitAt).slice(11, 16)}` : 'No reading yet') : null,
    };
  });
  return out;
});
