# NTPC BESS Portal — Phase 2 Features

Adding 7 modules on top of the existing Home Dashboard + per-station L2 Gantt.

## 1. BOI Equipment Ordering Status (per-station tab)
New tab on `/stations/$stationId` called **"BOI Status"** mirroring the uploaded Simhadri sheet:
- Columns: SL, Specific Name of BOI, No. of Drawings, Scheduled PO Date (L2), Actual/Anticipatory PO Date, Sub-Vendor Category (Approved/DR), Sub-Vendor Details, Inspection Category (I/II/III), Remarks.
- Pre-seeded with the 31-row BOI master list from the Simhadri sheet (Power Transformer → MISC-CIVIL).
- Inline edit (editor/admin) for actual PO date, sub-vendor, inspection, remarks.
- Status chip: Ordered / Pending / Delayed (auto from scheduled vs actual).
- Plus a **Delivery & Mobilization** sub-section (delivery date, site receipt date, mobilization status) per BOI item.

## 2. Weekly Review Planner
New top-level route `/weekly-planner`:
- Calendar grid (Mon–Sun) for any selected week.
- Each weekday slot holds up to 3 station review assignments (covers your "3 stations/day" rule).
- Drag-or-dropdown to assign stations; auto-pulls latest progress %, open exceptions, top 3 delayed tasks for the agenda.
- "Generate Agenda PDF" button per day; "Export Weekly Plan" for the whole week.
- Persists in new `weekly_review_plan` table.

## 3. Delay Analysis Register
New tab on `/stations/$stationId` called **"Delay Register"**:
- Auto-populated from tasks where Actual Finish > Planned Finish OR Planned Finish passed with <100%.
- Editable fields per row: Reason category (Vendor / Clearance / Site / Design / Force Majeure / Other), Root cause, Responsibility (NTPC / Vendor / Statutory), Corrective action, Recovery plan, Recovery date, Status (Open / Mitigated / Closed).
- Vendors (editor role) can update reason + corrective action; admin can close.
- Exportable as Excel (per-station and consolidated).
- New `delay_register` table.

## 4. Due-Date Notifications
- Bell icon in `AppHeader` with unread count.
- Generated client-side on data load from: L2 tasks due within 7 days with no actual start, BOI POs due within 7 days, open issues with target_date within 3 days, delay register items with recovery_date within 3 days.
- Click → deep-link to the relevant station/tab.
- Per-user dismiss tracked in `notification_dismissals` table.

## 5. Edit Audit Trail
- New `audit_log` table (id, user_id, user_email, station_id, entity_type, entity_id, field, old_value, new_value, action, created_at).
- DB triggers on `station_task_status`, `issues`, `delay_register`, BOI tables → write to audit_log on INSERT/UPDATE/DELETE.
- New tab on station page **"Audit Trail"** with filter by user / entity / date. Admin-only full view; editors see their own.
- Exportable as Excel.

## 6. Bulk MIS Export
New section on Home Dashboard **"Bulk MIS"**:
- Multi-select stations (or "All 15"), multi-select report types (Weekly MIS, Exceptions, BOI Status, Delay Register, Audit Trail, Compliances).
- Single click → generates one .zip containing all selected reports as separate .xlsx files, named by station.
- Server function using `jszip` + existing `xlsx` exporters.
- Also: scheduled "Top Management Pack" — one consolidated workbook with executive summary, all station summaries, top 20 delays, top 10 risks.

## 7. Status of Compliances
New tab on `/stations/$stationId` called **"Compliances"**:
- Categories: Statutory (MoEF, CEA, CTE, CTO, Forest, NOC), Safety (HIRA, JSA, PTW, Safety Audit), Quality (QAP, FQP, MQP), Insurance (CAR, WC), Local (PCB, Fire).
- Per item: Authority, Application date, Approval/expiry date, Status (Not applied / Applied / Under review / Approved / Rejected / Expired), Document ref, Owner, Remarks.
- Auto-flag items expiring within 30 days → feed notifications.
- Pre-seeded master list of ~25 standard NTPC BESS compliance items per station.
- New `compliance_items` table.
- Cross-station rollup tile on Home Dashboard ("X of Y compliances cleared portfolio-wide").

## Data model additions
```text
boi_master           id, sl_no, name, drawings_count, scheduled_po_date, inspection_category, sort_order
                     -- shared template, seeded from Simhadri sheet (31 rows)

station_boi_status   id, station_id, boi_id, actual_po_date, sub_vendor_category,
                     sub_vendor_details, delivery_date, site_receipt_date,
                     mobilization_status, remarks, updated_by, updated_at
                     -- unique (station_id, boi_id)

weekly_review_plan   id, week_start_date, day_of_week, slot, station_id,
                     agenda_notes, created_by, created_at

delay_register       id, station_id, task_id (nullable), title, reason_category,
                     root_cause, responsibility, corrective_action, recovery_plan,
                     recovery_date, status, created_at, updated_at, updated_by

audit_log            id, user_id, user_email, station_id, entity_type, entity_id,
                     field, old_value, new_value, action, created_at

notification_dismissals  id, user_id, notification_key, dismissed_at

compliance_master    id, category, name, authority, sort_order
                     -- shared template (~25 items)

station_compliance   id, station_id, compliance_id, application_date,
                     approval_date, expiry_date, status, document_ref,
                     owner, remarks, updated_by, updated_at
                     -- unique (station_id, compliance_id)
```

All new tables get RLS: read = any authenticated, write = admin/editor (same model as existing tables). Audit log triggers run as `SECURITY DEFINER`.

## UI/UX
- Station page restructured with shadcn Tabs: **L2 Gantt | BOI Status | Compliances | Delay Register | Issues | Audit Trail**.
- AppHeader gets: notification bell, weekly-planner nav link.
- Home Dashboard adds: Bulk MIS panel, Compliance rollup tile, "Today's review stations" strip (from weekly planner).
- Reuse existing dark navy ops-control theme + status chips.

## Out of scope (this phase)
- Email/SMS push for notifications (in-app bell only).
- Auto-routing of weekly plan to Outlook/Teams calendars.
- Photo upload for BOI delivery / compliance docs (just text refs).
- Document vault.

Approve and I'll run the migration (7 new tables + audit triggers + seeds), then build the UI in one pass.