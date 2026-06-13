# Plan: Drawing exceptions, editable Cat, weekly trend & world-class MIS report

## 1. MDL register — freeze Category, make "Cat" an editable dropdown
In `src/components/DrawingsTab.tsx`:
- Swap the two columns' behaviour. **Category** becomes a frozen read-only display (master, constant). **Cat** becomes an editable `Select` dropdown (options: `CAT-I`, `CAT-II`, `CAT-III`, `CATREL`, plus blank "—"), committing on change like the date fields.
- Keep all other fields (Drg Ref, Description, Sch. dates) frozen and submission/approval dates editable as today.

## 2. Drawing "submission-overdue" exception logic
In `src/lib/drawings.ts`:
- Add `isSubmissionOverdue(r)` → `true` when `sch_date` is in the past AND the drawing has no `submitted_date`/`resubmitted_date` AND is not approved.
- Extend `DrawingCounts` with `submissionOverdue` and surface it in `drawingCounts()`.

In `src/routes/_authenticated.drawings.tsx` (Drawings summary page):
- Add a KPI card "Submission Overdue" and a station-wise exceptions panel listing drawings whose scheduled submission date has passed without submission (station, ref, description, scheduled date, days overdue), sorted by days overdue.

## 3. Weekly progress snapshots (trend data) — stored in DB
New table `weekly_progress_snapshots` (migration):
- Columns: `snapshot_date` (date), `station_id`, `station_name`, `pct`, `delayed`, `completed`, `total`, `health`, plus standard id/created_at. Grant + RLS: authenticated read/insert; service_role all. One row per station per snapshot date (unique on `snapshot_date, station_id`).
- A public server route `src/routes/api/public/hooks/weekly-snapshot.ts` recomputes each station's progress/health from `l2_tasks` + `station_task_status` (using existing gantt-utils logic, server-side via `supabaseAdmin`) and upserts a snapshot row dated to the current weekend.
- Schedule it every Sunday via `pg_cron` + `pg_net` (insert tool, anon `apikey` header).
- Add a **"Capture snapshot now"** button on the dashboard header that calls the same endpoint, so a trend point can be recorded on demand. Trend uses **all** stored snapshots.

## 4. Rebuild the Weekly MIS PDF — `src/lib/mis-pdf.ts`
Make `exportWeeklyPDF` accept extra data (drawings, BOI master+status, meetings/plans, snapshots) and produce a denser, chart-led report. All charts drawn as crisp native vector shapes (jsPDF rects/lines) — no DOM dependency. Larger fonts throughout (body ~9.5→11, headings up accordingly).

Report structure:
1. **Header + KPI strip** (larger).
2. **Charts band (top of report):**
   - Station health distribution (On Track / At Risk / Delayed) as a column chart.
   - **Progress trend over weekends** — line/area chart of portfolio avg % from `weekly_progress_snapshots` (all weeks).
   - **Agency performance** as a full-width column chart (avg progress per agency) sized to use the whole page width.
3. **Station Status Summary** table (grouped by health).
4. **Drawings Exceptions** — drawings overdue from scheduled submission date (station, ref, scheduled sub date, days overdue).
5. **BOI Exceptions** — BOI items past `scheduled_po_date` with no `actual_po_date` (station, equipment, scheduled PO, days overdue).
6. **L2 Station-wise exceptions** (existing, retained).
7. **Meetings** — Upcoming planned meetings and Last concluded meetings (type, station, date).
8. Footer page numbers.

## 5. Wire data into the dashboard
In `src/routes/_authenticated.index.tsx`:
- Add queries for BOI master+status, meetings + meeting_plans, and weekly snapshots.
- Pass them to `exportWeeklyPDF(...)`.
- Add the "Capture snapshot now" button and optionally a small on-screen trend chart fed by snapshots.

## Technical notes
- Cat dropdown values come from existing data (`CAT-I/CAT-II/CAT-III/CATREL`).
- Snapshot server route uses `supabaseAdmin` and the existing `buildStatusMap`/`stationProgress` logic ported to run server-side.
- PDF charts are computed and drawn manually (bars, axis ticks, trend polyline) for reliability in the browser export.
- No change to BOI/meeting schemas; meetings reads from `meetings` (concluded) and `meeting_plans` (upcoming).
