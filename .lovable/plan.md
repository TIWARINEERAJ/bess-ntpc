# Plan — NTPC BESS Portal: 8-part upgrade

## 1. Solapur split (16 packages / 15 stations)
- Rename existing **Solarpur/Solapur** → **Solapur-1**.
- Add **Solapur-2** as new station (same EIC/POI, separate package). Both will show in dashboard + have their own station detail pages.
- All BOI / compliance status rows initialised per the new station.

## 2. Per-station user accounts (station-scoped editor role)
- Add `station_id` column to `user_roles` (nullable). When set, that user can ONLY edit data for that one station.
- New role enum value `station_editor` (or reuse `editor` + station_id binding). Admin still has global edit. All authenticated users still read the full dashboard.
- New `has_station_access(user, station)` SQL function used in every write RLS policy (`station_task_status`, `station_boi_status`, `station_compliance`, `delay_register`/hindrance_register, `meetings`, `issues`, `boi_documents`, `compliance_documents`).
- Admin UI: **Users** page (admin only) — create station user (email + temp password via admin invite), assign station, edit/revoke. Generates a unique login per station (e.g. `solapur1@bess.local`) with a generated password shown once.
- Frontend: `canEdit` becomes `canEditStation(stationId)` — admin true everywhere, station_editor true only for their station.

## 3. L2 Gantt import from `L2_Schedules.xlsx`
Spreadsheet has 11 sheets: Ramagundam, Bongaigaon, Tanda, Simhadri, Mouda, Barh, Nabinagar_NPGC, Solapur_2, Solapur_1, Unchahar, Dadri. As instructed, **Simhadri sheet will be skipped**.
- Parse each sheet, normalize WBS/task/duration/baseline_start/baseline_finish into the existing `l2_tasks` schema.
- Tasks are currently shared across all stations (one master `l2_tasks` table). To support **different schedules per station** the schema needs to change: I'll move to `station_id` per task row (each station has its own L2 task list). This is the cleanest fit for per-station gantt edits.
- Migration backfills existing tasks to all stations that don't have an import.

## 4. Document uploads (BOI + Compliance, max 3 each)
- New Storage bucket `station-docs` (private). Path: `{station_id}/{type}/{record_id}/{filename}`.
- New tables `boi_documents(station_boi_status_id, file_path, file_name, uploaded_by, uploaded_at)` and `compliance_documents(station_compliance_id, ...)`. Hard cap of 3 enforced via trigger.
- UI: per-row upload control showing existing docs (download/delete), with "+ Add document" disabled at 3.

## 5. Hindrance Register (rename + activity dropdown)
- Rename label everywhere: "Delay Register" → "Hindrance Register" (table stays `delay_register` — just relabel).
- Form: add searchable dropdown of L2 activities (scoped to current station) for `task_id`. Already had task_id field, just upgrade to combobox.

## 6. Meetings overhaul (per uploaded formats)
- Update meeting types to match PMS Audit Report Format: **Daily Review, Weekly EIC Meeting, HOP Review w/ Vendors, Periodic HOP Review, Contract Review (CRM), RED/ED(OS) Review, PRT, Management Review**.
- Each meeting type uses a structured template (sections: Attendees, Brief Details, General Points table, BOI Status table, Action Items table) modelled on the uploaded weekly MoM.
- Seed each type with **one sample meeting** per station for reference.
- **PDF download** of MoM via `jspdf` + `jspdf-autotable` — generates formatted MoM matching uploaded sample (header, brief details table, items table, footer).

## 7. Home dashboard visualization
- New panel above the station grid: horizontal bar chart (Recharts) showing each station's % physical progress vs % schedule elapsed, colored by status (green on-track / amber slipping / red delayed).
- Second mini-chart: stacked bar of task counts (completed / in-progress / delayed / not-started) per station.

## 8. Existing-data side effects
- After Solapur rename + L2 import, the `gantt-utils` rollups and per-station progress auto-recompute.
- README updated with the new auth model and import flow.

## Technical notes (for reviewers)
- `l2_tasks` gains `station_id` (nullable for backward-compat baseline). Existing `station_task_status.task_id` keeps working.
- Storage bucket created via SQL migration with RLS allowing read by any authenticated user, write by users with station access.
- Password creation for station users uses Supabase Admin API inside a `requireSupabaseAuth` + admin-check server function; returned password shown to admin once.
- Recharts already in tree (`src/components/ui/chart.tsx`); jspdf will be added.

## Out of scope (will not touch this turn)
- Email invitations for station users (admin reads + shares the generated password).
- Editing the master L2 task list inside the app (still managed via import / admin tools).
- Bulk re-importing schedules later (one-shot for this turn).
- Mobile-optimized upload UI.

Approve this and I'll execute the migrations + code in one continuous batch.
