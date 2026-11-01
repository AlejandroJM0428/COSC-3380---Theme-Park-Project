import { route } from '../router.js';
import { pool } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';

// Employee portal (Maintenance Worker and Restaurant Worker).
// Everything is looked up with the EmployeeID stored in the logged-in session,
// never with an id from the request, so a worker can only see their own records.

route(
  'GET',
  '/api/me/work',
  requireRole('MaintenanceWorker', 'RestaurantWorker')(async (ctx) => {
    const employeeId = ctx.session.EmployeeID;
    if (!employeeId) return { linked: false };

    const [[employee]] = await pool.query(
      "SELECT EmployeeID, CONCAT(FirstName, ' ', LastName) AS Name, JobTitle, HireDate FROM Employee WHERE EmployeeID = ?",
      [employeeId],
    );
    if (!employee) return { linked: false };

    const [shifts] = await pool.query(
      `SELECT ShiftID, ClockIn, ClockOut, ShiftRating, ShiftNotes,
              ROUND(TIMESTAMPDIFF(MINUTE, ClockIn, ClockOut) / 60, 1) AS HoursWorked
         FROM Shift WHERE EmployeeID = ? ORDER BY ClockIn DESC LIMIT 15`,
      [employeeId],
    );

    const result = { linked: true, role: ctx.session.role, employee, shifts };

    if (ctx.session.role === 'MaintenanceWorker') {
      const [jobs] = await pool.query(
        `SELECT MaintenanceID, CrewRole, FacilityKind, FacilityName, MaintType,
                StartDate, EndDate, Outcome, RepairCost, HoursDown
           FROM v_EmployeeMaintenanceJobs WHERE EmployeeID = ? ORDER BY StartDate DESC LIMIT 25`,
        [employeeId],
      );
      result.jobs = jobs;
    } else {
      // Venues have no employee link in the schema, so restaurant workers see restaurant sales for the whole park.
      const [sales] = await pool.query(
        `SELECT VenueName, SaleYear, SaleMonth, Orders, Units, Revenue
           FROM v_RetailSalesByVenue WHERE VenueType = 'Restaurant'
          ORDER BY SaleYear DESC, SaleMonth DESC, Revenue DESC LIMIT 20`,
      );
      result.sales = sales;
    }
    return result;
  }),
);
