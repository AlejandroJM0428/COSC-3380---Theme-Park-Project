-- 07_extra_maintenance_data.sql
-- DEMO DATA: 24 more maintenance jobs (IDs 17 to 40) with crews, so the repair-cost and downtime reports have enough to show.
-- All repair costs and job details here are generated for the demo. Say so in the presentation.
-- REQUIRES 04_staff_roles_and_costs.sql (RepairCost). Run once, after 06. Load AFTER the seed data.
-- Every job sits outside park hours (the park is open 09:00 to 22:00), so it never overlaps the seeded boardings.
-- Every "Partially Fixed" job has a later "Fixed" job on the same ride, so no ride is left closed.
USE theme_park;

INSERT INTO Maintenance (MaintenanceID, MaintType, RideID, GameID, VenueID, StartDate, EndDate, Outcome, Reason, RepairCost) VALUES
  (17, 'Routine Inspection', 1,    NULL, NULL, '2026-07-28 05:00:00', '2026-07-28 07:30:00', 'Fixed',           'Monthly safety inspection',                 180.00),
  (18, 'Routine Inspection', 4,    NULL, NULL, '2026-07-29 05:00:00', '2026-07-29 08:00:00', 'Fixed',           'Coaster track inspection',                  320.00),
  (19, 'Preventive Service', 5,    NULL, NULL, '2026-08-03 05:00:00', '2026-08-03 08:30:00', 'Fixed',           'Water pump and filter service',             880.00),
  (20, 'Emergency Repair',   6,    NULL, NULL, '2026-08-09 22:30:00', '2026-08-10 07:30:00', 'Fixed',           'Flume gate sensor failure',                3150.00),
  (21, 'Routine Inspection', 9,    NULL, NULL, '2026-08-11 05:30:00', '2026-08-11 08:00:00', 'Fixed',           'Dark ride show control check',              210.00),
  (22, 'Preventive Service', 3,    NULL, NULL, '2026-08-17 05:00:00', '2026-08-17 08:30:00', 'Fixed',           'Lift hill chain lubrication',              1240.00),
  (23, 'Emergency Repair',   NULL, 2,    NULL, '2026-08-19 22:30:00', '2026-08-20 06:30:00', 'Fixed',           'Coin mechanism jam',                        640.00),
  (24, 'Routine Inspection', NULL, NULL, 1,    '2026-08-24 06:00:00', '2026-08-24 08:00:00', 'Fixed',           'Fire suppression check',                    260.00),
  (25, 'Safety Recall',      8,    NULL, NULL, '2026-08-26 22:30:00', '2026-08-27 07:30:00', 'Partially Fixed', 'Motion base actuator recall',              3380.00),
  (26, 'Refurbishment',      14,   NULL, NULL, '2026-09-01 22:30:00', '2026-09-02 08:30:00', 'Fixed',           'Seat and restraint refurbishment',         4300.00),
  (27, 'Preventive Service', 7,    NULL, NULL, '2026-09-05 05:00:00', '2026-09-05 08:30:00', 'Fixed',           'Animatronic servo service',                 960.00),
  (28, 'Preventive Service', 8,    NULL, NULL, '2026-09-08 05:00:00', '2026-09-08 08:30:00', 'Fixed',           'Actuator replacement follow-up',           1420.00),
  (29, 'Routine Inspection', 10,   NULL, NULL, '2026-09-09 05:30:00', '2026-09-09 08:00:00', 'Fixed',           'Track and signal check',                    190.00),
  (30, 'Emergency Repair',   3,    NULL, NULL, '2026-09-13 22:30:00', '2026-09-14 07:30:00', 'Fixed',           'Launch brake fault',                       5120.00),
  (31, 'Routine Inspection', NULL, 5,    NULL, '2026-09-16 06:00:00', '2026-09-16 07:30:00', 'Fixed',           'Monthly game check',                        120.00),
  (32, 'Preventive Service', 4,    NULL, NULL, '2026-09-21 05:00:00', '2026-09-21 08:30:00', 'Fixed',           'Wheel assembly service',                   1180.00),
  (33, 'Emergency Repair',   NULL, NULL, 2,    '2026-09-23 22:30:00', '2026-09-24 06:30:00', 'Fixed',           'Walk-in cooler compressor failure',        2260.00),
  (34, 'Routine Inspection', 6,    NULL, NULL, '2026-09-30 05:00:00', '2026-09-30 08:00:00', 'Fixed',           'Pirate ship hull and pump inspection',      410.00),
  (35, 'Preventive Service', 9,    NULL, NULL, '2026-10-03 05:00:00', '2026-10-03 08:30:00', 'Partially Fixed', 'Ghost effects projector replacement',      780.00),
  (36, 'Preventive Service', 9,    NULL, NULL, '2026-10-07 05:00:00', '2026-10-07 08:00:00', 'Fixed',           'Projector alignment follow-up',             320.00),
  (37, 'Emergency Repair',   5,    NULL, NULL, '2026-10-12 22:30:00', '2026-10-13 08:00:00', 'Fixed',           'Rapids pump motor burnout',                6340.00),
  (38, 'Routine Inspection', 15,   NULL, NULL, '2026-10-15 06:00:00', '2026-10-15 08:00:00', 'Fixed',           'Carousel gear and platform check',          150.00),
  (39, 'Refurbishment',      1,    NULL, NULL, '2026-10-17 22:30:00', '2026-10-18 08:30:00', 'Fixed',           'Locomotive boiler refurbishment',          5200.00),
  (40, 'Emergency Repair',   NULL, 4,    NULL, '2026-10-19 22:30:00', '2026-10-20 06:30:00', 'Fixed',           'Target motor failure',                      540.00);

-- Crews: technicians only (Employee IDs 28 to 32). One lead per job.
INSERT INTO MaintenanceCrew (MaintenanceID, EmployeeID, CrewRole) VALUES
  (17, 28, 'Lead'),
  (18, 29, 'Lead'),      (18, 30, 'Assistant'),
  (19, 31, 'Lead'),      (19, 28, 'Assistant'),
  (20, 32, 'Lead'),      (20, 29, 'Assistant'),   (20, 30, 'Assistant'),
  (21, 30, 'Lead'),
  (22, 31, 'Lead'),      (22, 32, 'Assistant'),
  (23, 28, 'Lead'),
  (24, 29, 'Lead'),
  (25, 32, 'Lead'),      (25, 31, 'Assistant'),   (25, 28, 'Assistant'),
  (26, 30, 'Lead'),      (26, 29, 'Assistant'),   (26, 28, 'Assistant'),
  (27, 31, 'Lead'),      (27, 30, 'Assistant'),
  (28, 32, 'Lead'),      (28, 31, 'Assistant'),
  (29, 28, 'Lead'),
  (30, 29, 'Lead'),      (30, 32, 'Assistant'),   (30, 30, 'Assistant'),
  (31, 30, 'Lead'),
  (32, 31, 'Lead'),      (32, 28, 'Assistant'),
  (33, 32, 'Lead'),      (33, 29, 'Assistant'),
  (34, 28, 'Lead'),      (34, 30, 'Assistant'),
  (35, 29, 'Lead'),      (35, 31, 'Assistant'),
  (36, 29, 'Lead'),
  (37, 31, 'Lead'),      (37, 32, 'Assistant'),   (37, 28, 'Assistant'),
  (38, 30, 'Lead'),
  (39, 32, 'Lead'),      (39, 29, 'Assistant'),   (39, 31, 'Assistant'),
  (40, 28, 'Lead'),      (40, 30, 'Assistant');
