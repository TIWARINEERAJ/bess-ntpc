# NTPC BESS Project Monitoring Portal — Plan

A world-class monitoring site for the 15 NTPC BESS stations (5,004 MWh across Lot-1 + Lot-2). One executive home dashboard for cross-station progress and MIS, and one Gantt-chart tracking page per station that mirrors the Dadri L2 network exactly. Actual dates are user-editable; planned dates come from the L2 baseline.

## What we'll build

### 1. Home Dashboard (`/`)
- **KPI strip**: Total capacity (5,004 MWh), stations on-track / delayed / at-risk, weighted % physical progress, upcoming milestones (next 7 / 30 days), open exceptions.
- **Station grid**: card per station with Lot, MW/MWh, agency, EIC, % progress, current phase, days ahead/behind, status chip (Green / Amber / Red). Click → station page.
- **Cross-station summary Gantt**: 15 stations × 20 L2 sections, planned vs actual bars, today line.
- **Exceptions panel**: tasks where Actual > Planned, or planned start passed with no actual — owner + days slipped.
- **MIS toolbar**:
  - Download Weekly MIS (.xlsx) — all stations, all sections, planned/actual/variance/% progress.
  - Download Exception Report (.xlsx) — only slipped / at-risk tasks.
  - Download Executive Summary (.pdf) — KPIs + station status table + top risks.
  - Filters: Lot, Agency, Status, Date range — apply to exports.

### 2. Station Gantt Page (`/stations/$stationId`)
Mirrors the Dadri L2 network exactly. Header shows station meta (capacity, agency, EIC, PM coordinator, contacts). Below it:

- **Editable Gantt + WBS table** combined:
  - Left pane: WBS tree (1.1 NOA → 1.20 Completion of facilities) with ~127 sub-tasks, durations, predecessors. Collapsible by section.
  - Right pane: timeline (zoom: week / month / quarter). Two bars per row — **planned (grey)** from L2 baseline, **actual (blue → green when complete, red when delayed)**. Today line. Milestones (0-day tasks like NOA) as diamonds.
- **Inline edit**: click any task row → side drawer with Actual Start, Actual Finish, % Complete, Status (Not started / In progress / Completed / Delayed / Blocked), Remarks, Owner. Saves immediately.
- **Section rollups** auto-computed: section % complete = duration-weighted average of children; section actual dates = min start / max finish of children.
- **Critical-path highlight** based on L2 predecessors.
- **Per-station export**: download this station's Gantt as .xlsx and PDF snapshot.

### 3. Issues tab on each station page
Vendor / safety / clearance issues with owner, target date, status. Open issues surface in home-dashboard exceptions.

## Data model (Lovable Cloud / Postgres)

```text
stations             id, name, lot, capacity_mwh, capacity_mw, poi, agency,
                     agency_contacts (jsonb), ntpc_eic, eic_contact, eic_email,
                     pm_coordinator, project_start_date

l2_tasks             id, wbs_code (e.g. "1.8.5"), parent_wbs, name, is_section,
                     duration_days, baseline_start, baseline_finish,
                     predecessors, sort_order
                     -- single shared L2 template seeded from Dadri PDF

station_task_status  id, station_id, task_id, actual_start, actual_finish,
                     percent_complete, status, remarks, owner, updated_by,
                     updated_at
                     -- unique (station_id, task_id)

issues               id, station_id, title, description, severity, owner,
                     target_date, status, created_at, resolved_at

user_roles           id, user_id, role  (admin | editor | viewer)
```

Baselines are shared (Dadri L2 is the common template — same Gantt for every station, as requested). Per-station deviations live in `station_task_status`. A future revision can clone the template per station if dates diverge.

## Auth (Lovable Cloud)
Email/password sign-in. Roles via separate `user_roles` table (with `has_role` security-definer function, RLS scoped accordingly):
- **admin** — edit any station, manage users, seed/reset baselines.
- **editor** — update actuals + issues on assigned stations.
- **viewer** — read-only + can download MIS.

## Tech approach
- TanStack Start routes: `/` (home), `/login`, `/_authenticated/stations/$stationId`, `/_authenticated/issues`, `/_authenticated/admin`.
- Gantt: custom SVG renderer — lightweight, fully controllable, prints cleanly, virtualised for 127 tasks × 15 stations.
- Exports: `xlsx` for spreadsheets and `@react-pdf/renderer` for PDFs, generated inside `createServerFn` and streamed to the browser.
- Data: TanStack Query + server functions with optimistic updates on actual-date edits.
- Design: ops-control aesthetic — dark navy + cyan accent, mono numerals, status chips, dense info. Built for big-screen review rooms.

## Seeding (first run)
- 15 stations + Lot / MWh / agency / contacts / EIC from your uploaded sheets.
- 1 L2 template = 20 sections + ~127 tasks from `Dadri_L2.pdf` (WBS, duration, baseline start/finish, predecessors).
- Empty `station_task_status` (all rows start "Not started", actuals blank).

## Out of scope for v1
- Auto-rotating "3 stations/day" weekly review scheduler.
- Dedicated equipment PO / dispatch / delivery tracker.
- Photo upload per task; document vault.
- Email / Teams notifications on slippage.

Approve and I'll enable Lovable Cloud, seed the L2 template + stations, and build the dashboard, Gantt page, and MIS exports.
