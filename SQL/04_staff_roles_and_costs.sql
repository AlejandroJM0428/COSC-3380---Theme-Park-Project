-- 04_staff_roles_and_costs.sql
-- Staff roles for AppUser, repair cost on Maintenance, notes on Shift.
-- REQUIRES SQL/03_Customer_view.sql (AJ's AppUser change) to be applied first.
-- NOT idempotent: run it once. Test on a copy of the database first.
USE theme_park;

-- 1. Roles ------------------------------------------------------------------
-- Replace AJ's account-type check, which only allows Admin/Manager/Cashier for staff.
ALTER TABLE AppUser DROP CHECK CHK_AppUser_AccountType;

ALTER TABLE AppUser
    MODIFY COLUMN Role
        ENUM('Admin', 'Manager', 'Cashier',
             'RetailManager', 'HRManager', 'MaintenanceManager',
             'MaintenanceWorker', 'RestaurantWorker',
             'Customer') NOT NULL;

-- [RULE] A Customer account has a CustomerID and no EmployeeID.
-- [RULE] Every other role has no CustomerID. EmployeeID is optional (for example the TA account).
ALTER TABLE AppUser
    ADD CONSTRAINT CHK_AppUser_AccountType CHECK (
        (Role = 'Customer' AND CustomerID IS NOT NULL AND EmployeeID IS NULL)
        OR
        (Role <> 'Customer' AND CustomerID IS NULL)
    );

-- 2. Repair cost on Maintenance ---------------------------------------------
-- EndDate is the closed timestamp. RepairCost is the cost to repair.
ALTER TABLE Maintenance
    ADD COLUMN RepairCost DECIMAL(10,2) NULL AFTER Reason,
    ADD CONSTRAINT CHK_Maint_Cost CHECK (RepairCost IS NULL OR RepairCost >= 0);

-- DEMO DATA: give every closed seed job a plausible cost so the cost reports are not empty.
-- These numbers are generated, not real. Say so in the presentation.
UPDATE Maintenance
   SET RepairCost = (CASE MaintType
                        WHEN 'Routine Inspection' THEN 150
                        WHEN 'Preventive Service' THEN 600
                        WHEN 'Refurbishment'      THEN 5500
                        WHEN 'Emergency Repair'   THEN 2800
                        WHEN 'Safety Recall'      THEN 3500
                     END) + ((MaintenanceID * 137) MOD 400)
 WHERE EndDate IS NOT NULL AND RepairCost IS NULL;

-- 3. Performance notes on Shift ---------------------------------------------
-- Employee performance uses the existing Shift.ShiftRating (1 to 5).
ALTER TABLE Shift
    ADD COLUMN ShiftNotes VARCHAR(255) NULL AFTER ShiftRating;
