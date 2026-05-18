
-- Clear and seed L2 tasks template (Dadri BESS L2 schedule baseline)
TRUNCATE public.station_task_status, public.l2_tasks RESTART IDENTITY CASCADE;

-- Project start: 2026-03-30 (T0). All dates derived as T0 + offset.
-- Format: (wbs_code, parent_wbs, name, is_section, duration_days, start_offset_days, predecessors)
WITH t(wbs, parent, name, is_section, dur, start_off, pred) AS (VALUES
 ('1','',                'PROJECT START — BESS at NTPC Station', true, 700, 0, NULL),

 ('1.1','1',             'NOA & Contract Award', true, 30, 0, NULL),
 ('1.1.1','1.1',         'Issue of NOA', false, 0, 0, NULL),
 ('1.1.2','1.1',         'Signing of Contract Agreement', false, 30, 0, '1.1.1'),
 ('1.1.3','1.1',         'Submission of Performance BG', false, 21, 0, '1.1.1'),

 ('1.2','1',             'Project Kick-off & Mobilization', true, 30, 14, '1.1'),
 ('1.2.1','1.2',         'Kick-off Meeting', false, 1, 14, '1.1.1'),
 ('1.2.2','1.2',         'Appointment of Project Manager (Vendor)', false, 7, 14, '1.1.1'),
 ('1.2.3','1.2',         'Site Office Mobilization', false, 21, 21, '1.2.1'),
 ('1.2.4','1.2',         'Submission of Project QA Plan', false, 30, 14, '1.2.1'),

 ('1.3','1',             'Site Survey & Geotech Investigation', true, 45, 30, '1.2'),
 ('1.3.1','1.3',         'Topographical Survey', false, 21, 30, '1.2.3'),
 ('1.3.2','1.3',         'Geotechnical Investigation', false, 30, 35, '1.2.3'),
 ('1.3.3','1.3',         'Soil Test Report Submission', false, 14, 60, '1.3.2'),
 ('1.3.4','1.3',         'Hydrological Study', false, 21, 45, '1.3.1'),

 ('1.4','1',             'Statutory Clearances & Permits', true, 90, 30, '1.2'),
 ('1.4.1','1.4',         'CEIG / Electrical Inspectorate Approval', false, 60, 60, '1.5'),
 ('1.4.2','1.4',         'Fire NOC', false, 60, 90, '1.5'),
 ('1.4.3','1.4',         'Pollution Control Board Consent', false, 75, 30, '1.3.3'),
 ('1.4.4','1.4',         'Forest / Local Body Clearance', false, 60, 30, NULL),
 ('1.4.5','1.4',         'CEA Application & Concurrence', false, 90, 30, '1.5'),

 ('1.5','1',             'Engineering & Design', true, 120, 30, '1.3'),
 ('1.5.1','1.5',         'Basic Engineering Package', false, 45, 30, '1.3.1'),
 ('1.5.2','1.5',         'Single Line Diagram (SLD) Approval', false, 30, 60, '1.5.1'),
 ('1.5.3','1.5',         'BESS Container GA Drawings', false, 45, 60, '1.5.1'),
 ('1.5.4','1.5',         'PCS & Transformer Specs Approval', false, 45, 75, '1.5.2'),
 ('1.5.5','1.5',         'Civil Foundation Drawings', false, 45, 75, '1.3.3'),
 ('1.5.6','1.5',         'Control & Protection Scheme', false, 60, 90, '1.5.2'),
 ('1.5.7','1.5',         'SCADA / EMS Architecture', false, 60, 90, '1.5.2'),
 ('1.5.8','1.5',         'Fire Detection & Suppression Design', false, 45, 105, '1.5.3'),
 ('1.5.9','1.5',         'HVAC Design', false, 45, 105, '1.5.3'),
 ('1.5.10','1.5',        'Cable Schedule & Routing', false, 45, 120, '1.5.6'),

 ('1.6','1',             'Procurement & Manufacturing', true, 270, 60, '1.5'),
 ('1.6.1','1.6',         'PO for Battery Modules', false, 30, 60, '1.5.1'),
 ('1.6.2','1.6',         'PO for PCS / Inverters', false, 30, 60, '1.5.4'),
 ('1.6.3','1.6',         'PO for Transformers', false, 30, 60, '1.5.4'),
 ('1.6.4','1.6',         'PO for HT / LT Switchgear', false, 30, 75, '1.5.2'),
 ('1.6.5','1.6',         'PO for SCADA / EMS', false, 30, 90, '1.5.7'),
 ('1.6.6','1.6',         'PO for Fire & HVAC Systems', false, 30, 105, '1.5.8'),
 ('1.6.7','1.6',         'PO for HT / LT Cables', false, 30, 120, '1.5.10'),
 ('1.6.8','1.6',         'PO for Structural Steel & Containers', false, 30, 90, '1.5.3'),
 ('1.6.9','1.6',         'Battery Cell Manufacturing', false, 180, 90, '1.6.1'),
 ('1.6.10','1.6',        'PCS Manufacturing & FAT', false, 150, 90, '1.6.2'),
 ('1.6.11','1.6',        'Transformer Manufacturing & FAT', false, 180, 90, '1.6.3'),
 ('1.6.12','1.6',        'Switchgear Manufacturing & FAT', false, 150, 105, '1.6.4'),
 ('1.6.13','1.6',        'BESS Container Fabrication', false, 150, 120, '1.6.8'),

 ('1.7','1',             'Logistics & Delivery to Site', true, 90, 240, '1.6'),
 ('1.7.1','1.7',         'Shipment Clearance / Customs', false, 30, 240, '1.6.9'),
 ('1.7.2','1.7',         'Delivery of Battery Containers at Site', false, 60, 270, '1.7.1'),
 ('1.7.3','1.7',         'Delivery of PCS & Transformers', false, 45, 240, '1.6.10'),
 ('1.7.4','1.7',         'Delivery of Switchgear & Panels', false, 45, 255, '1.6.12'),
 ('1.7.5','1.7',         'Delivery of Cables & BOS', false, 45, 270, '1.6.7'),

 ('1.8','1',             'Civil Works', true, 180, 90, '1.4'),
 ('1.8.1','1.8',         'Site Clearing & Grading', false, 30, 90, '1.3.1'),
 ('1.8.2','1.8',         'Boundary Wall & Internal Roads', false, 60, 105, '1.8.1'),
 ('1.8.3','1.8',         'Excavation for Foundations', false, 30, 120, '1.5.5'),
 ('1.8.4','1.8',         'PCC & RCC Foundations — BESS Containers', false, 60, 135, '1.8.3'),
 ('1.8.5','1.8',         'PCC & RCC Foundations — PCS / Transformer', false, 60, 135, '1.8.3'),
 ('1.8.6','1.8',         'Control Room Building', false, 90, 135, '1.8.2'),
 ('1.8.7','1.8',         'Cable Trenches & Manholes', false, 60, 165, '1.8.4'),
 ('1.8.8','1.8',         'Drainage & Storm Water System', false, 45, 180, '1.8.2'),
 ('1.8.9','1.8',         'Earthing Pit Excavation', false, 30, 180, '1.8.4'),
 ('1.8.10','1.8',        'Fire Water Tank & Pump House', false, 60, 165, '1.8.2'),

 ('1.9','1',             'Erection of Equipment', true, 150, 270, '1.7'),
 ('1.9.1','1.9',         'Erection of BESS Containers', false, 60, 270, '1.7.2'),
 ('1.9.2','1.9',         'Erection of PCS', false, 45, 285, '1.7.3'),
 ('1.9.3','1.9',         'Erection of Power Transformers', false, 45, 285, '1.7.3'),
 ('1.9.4','1.9',         'Erection of HT / LT Switchgear', false, 45, 300, '1.7.4'),
 ('1.9.5','1.9',         'Installation of Auxiliary Transformer', false, 30, 300, '1.7.3'),
 ('1.9.6','1.9',         'Installation of Battery Modules (Racking)', false, 60, 285, '1.9.1'),

 ('1.10','1',            'Electrical & Cabling', true, 120, 315, '1.9'),
 ('1.10.1','1.10',       'HT Cable Laying', false, 60, 315, '1.9.3'),
 ('1.10.2','1.10',       'LT & Control Cable Laying', false, 75, 315, '1.9.4'),
 ('1.10.3','1.10',       'Cable Termination — HT Side', false, 30, 360, '1.10.1'),
 ('1.10.4','1.10',       'Cable Termination — LT / Control Side', false, 45, 360, '1.10.2'),
 ('1.10.5','1.10',       'Earthing & Lightning Protection', false, 45, 330, '1.8.9'),
 ('1.10.6','1.10',       'DC Bus / Battery Interconnection', false, 30, 345, '1.9.6'),

 ('1.11','1',            'SCADA, EMS & Communication', true, 75, 360, '1.10'),
 ('1.11.1','1.11',       'EMS Hardware Installation', false, 30, 360, '1.7.4'),
 ('1.11.2','1.11',       'SCADA Configuration & Point Mapping', false, 45, 375, '1.11.1'),
 ('1.11.3','1.11',       'Communication Network (Fiber / OPGW)', false, 45, 375, '1.10.2'),
 ('1.11.4','1.11',       'Integration with Plant DCS', false, 30, 405, '1.11.2'),

 ('1.12','1',            'Fire Safety & HVAC', true, 75, 345, '1.10'),
 ('1.12.1','1.12',       'Fire Detection System Installation', false, 30, 345, '1.9.1'),
 ('1.12.2','1.12',       'Fire Suppression (Aerosol / NOVEC) Install', false, 30, 360, '1.12.1'),
 ('1.12.3','1.12',       'HVAC Unit Installation', false, 30, 345, '1.9.1'),
 ('1.12.4','1.12',       'Fire Hydrant & Sprinkler System', false, 45, 345, '1.8.10'),

 ('1.13','1',            'Pre-commissioning Inspections', true, 45, 420, '1.11'),
 ('1.13.1','1.13',       'Vendor / OEM Inspection', false, 15, 420, '1.10.4'),
 ('1.13.2','1.13',       'NTPC Quality Inspection', false, 15, 425, '1.13.1'),
 ('1.13.3','1.13',       'CEIG Statutory Inspection', false, 21, 435, '1.13.2'),
 ('1.13.4','1.13',       'Punch List Closure', false, 21, 435, '1.13.2'),

 ('1.14','1',            'Site Acceptance Testing (SAT)', true, 60, 450, '1.13'),
 ('1.14.1','1.14',       'Transformer Oil & Insulation Test', false, 14, 450, '1.13.4'),
 ('1.14.2','1.14',       'HT / LT Switchgear Testing', false, 21, 450, '1.13.4'),
 ('1.14.3','1.14',       'PCS Functional Testing', false, 21, 460, '1.14.2'),
 ('1.14.4','1.14',       'Battery Module Insulation & Capacity Test', false, 30, 460, '1.13.4'),
 ('1.14.5','1.14',       'SCADA / EMS Point-to-Point Test', false, 21, 470, '1.11.2'),
 ('1.14.6','1.14',       'Fire & HVAC Functional Test', false, 14, 470, '1.12.2'),

 ('1.15','1',            'Grid Synchronization & Energization', true, 30, 510, '1.14'),
 ('1.15.1','1.15',       'Application for Grid Charging', false, 14, 510, '1.4.1'),
 ('1.15.2','1.15',       'No-Load Charging of Transformer', false, 7, 525, '1.15.1'),
 ('1.15.3','1.15',       'Pre-charging of DC Bus', false, 7, 530, '1.15.2'),
 ('1.15.4','1.15',       'Reverse Power Flow / First Sync', false, 7, 535, '1.15.3'),

 ('1.16','1',            'Performance Guarantee (PG) Tests', true, 45, 540, '1.15'),
 ('1.16.1','1.16',       'Round-Trip Efficiency Test', false, 14, 540, '1.15.4'),
 ('1.16.2','1.16',       'Rated Capacity Discharge Test', false, 14, 545, '1.16.1'),
 ('1.16.3','1.16',       'Response Time / Ramp Rate Test', false, 7, 555, '1.16.2'),
 ('1.16.4','1.16',       'Auxiliary Power Consumption Test', false, 7, 555, '1.16.2'),
 ('1.16.5','1.16',       'Availability Test (7 days)', false, 14, 560, '1.16.3'),

 ('1.17','1',            'Commercial Operation Declaration (COD)', true, 21, 585, '1.16'),
 ('1.17.1','1.17',       'PG Test Report Acceptance', false, 7, 585, '1.16.5'),
 ('1.17.2','1.17',       'Issuance of COD Certificate', false, 7, 595, '1.17.1'),
 ('1.17.3','1.17',       'Handover to O&M', false, 14, 600, '1.17.2'),

 ('1.18','1',            'Documentation & As-Built', true, 60, 540, '1.15'),
 ('1.18.1','1.18',       'As-Built Drawings Submission', false, 45, 540, '1.13.4'),
 ('1.18.2','1.18',       'O&M Manuals Submission', false, 30, 555, '1.13.4'),
 ('1.18.3','1.18',       'Spares List & Handover', false, 30, 570, '1.17.2'),
 ('1.18.4','1.18',       'Training to NTPC O&M Team', false, 21, 580, '1.17.2'),

 ('1.19','1',            'Safety & EHS Compliance', true, 600, 14, '1.2'),
 ('1.19.1','1.19',       'Submission of EHS Plan', false, 30, 14, '1.2.1'),
 ('1.19.2','1.19',       'Site Safety Induction Programme', false, 600, 30, '1.19.1'),
 ('1.19.3','1.19',       'Monthly Safety Audit', false, 600, 60, '1.19.2'),
 ('1.19.4','1.19',       'Incident Reporting & Closure', false, 600, 60, '1.19.2'),

 ('1.20','1',            'Completion of Facilities & Project Closeout', true, 30, 600, '1.17'),
 ('1.20.1','1.20',       'Final Inspection & Snag Closure', false, 14, 600, '1.17.3'),
 ('1.20.2','1.20',       'Demobilization', false, 14, 610, '1.20.1'),
 ('1.20.3','1.20',       'Final Bill & Project Closeout', false, 21, 615, '1.20.2')
)
INSERT INTO public.l2_tasks (wbs_code, parent_wbs, name, is_section, duration_days, baseline_start, baseline_finish, predecessors, sort_order)
SELECT
  wbs,
  NULLIF(parent, ''),
  name,
  is_section,
  dur,
  (DATE '2026-03-30' + start_off)::date AS baseline_start,
  (DATE '2026-03-30' + start_off + GREATEST(dur,0))::date AS baseline_finish,
  pred,
  ROW_NUMBER() OVER () AS sort_order
FROM t;
