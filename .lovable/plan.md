# NTPC BESS Project Maturity & Readiness Model

## Goal
Replace the misleading "everything looks near-zero" physical-% lens with a **readiness model** that scores each package across the real critical path (Engineering → Vendor Approval → BOI Ordering → Civilization → Construction → Commissioning) into a single number, and exposes the true bottleneck (BESS/PCS provenness + power-transformer ordering) at the corporate level.

## The single readiness number (8-parameter scheme)
Each station gets 8 stage scores (0–100%), combined by these fixed weights:

```text
Mobilization        10%
Studies              5%
Engineering Approval 20%
Vendor Approval     15%
BOI Ordering        25%
Civil Readiness     10%
Construction        10%
Commissioning        5%
Readiness = Σ (stage_score × weight)
```

## How each stage is scored (from existing data + one new tracker)
A new scoring engine `src/lib/maturity.ts` derives stage scores per station:

| Stage | Source | Method |
|-------|--------|--------|
| Mobilization | L2 section `1.2` | duration-weighted % complete of leaf tasks |
| Studies | L2 sections `1.3` (geotech/topo/ERT/grading) + `1.5` Grid Study | duration-weighted % complete |
| Engineering Approval | `station_drawings` | approved ÷ due (falls back to L2 `1.6`+`1.8` if no drawings) |
| Vendor Approval | **new** `station_vendor_status` | avg of per-package stage (Docs 25 / Engg 50 / CQA 75 / Final 100) |
| BOI Ordering | `station_boi_status` | long-lead-weighted PO progress (PO placed=60, delivered=85, received=100; transformer/BESS/PCS/switchgear weighted higher) |
| Civil Readiness | L2 sections `1.4` + `1.13` | duration-weighted % complete |
| Construction | L2 sections `1.9/1.11/1.12/1.16/1.17` (supply+erection) | duration-weighted % complete |
| Commissioning | L2 sections `1.18` + `1.19` | duration-weighted % complete |

Section→stage mapping keys off WBS prefixes (already consistent across stations) with the section *name* as a fallback so it stays robust if a station's numbering differs.

## New tracker: Vendor / Provenness approval
This is the one genuine data gap and the documented bottleneck.

**DB migration** — new table `station_vendor_status`:
- `station_id`, `package` (e.g. *BESS OEM, PCS OEM, Power Transformer, 33 kV Switchgear, EHV/Switchyard*), `vendor_name`, `sort_order`
- four progress markers: `docs_submitted`, `engg_approved`, `cqa_approved`, `final_approved` (each a nullable date)
- `remarks`, standard `id/created_at/updated_at/updated_by`
- GRANTs (authenticated + service_role), RLS using existing `can_edit_station` for writes and `is_authenticated_user()` for reads, mirroring `station_boi_status`. `updated_at` trigger + audit trigger.
- Seed default package rows per station based on `connectivity_transformer` (e.g. 33 kV-only stations get no EHV switchyard package).

A new **Vendor Approval tab** on the station page (`src/components/VendorApprovalTab.tsx`) edits this matrix with the calendar-only `DatePicker`, matching the BOI tab UX.

## Corporate Readiness dashboard (new route)
`src/routes/_authenticated/readiness` (file `_authenticated.readiness.tsx`), linked from `AppHeader`:
- **5-layer pipeline strip**: Studies → Engineering → Vendor Approval → BOI Ordering → Site Execution — portfolio-average bars showing where the fleet is stuck.
- **Station readiness ranking**: each station as a row/card with its single readiness % and a stacked horizontal bar of the 8 weighted stage contributions; sortable; color-coded.
- **Bottleneck heatmap**: stations × 8 stages grid, red→green, so corporate sees at a glance that Vendor Approval + BOI Ordering columns are the fleet-wide red band.
- KPI tiles: fleet avg readiness, # stations engineering-frozen, # with transformer ordered, # with BESS/PCS vendor finalized.

## Per-station readiness breakdown
New **Readiness tab** on the station detail page (`src/components/ReadinessTab.tsx`): the 8 stage scores as labelled progress bars with weight badges, the composite readiness gauge, and the exit-criteria checklist per stage so editors see exactly what's blocking the next stage.

## Reports
Extend `src/lib/weekly-brief-data.ts` to compute and include each station's readiness number + 8 stage scores, and render a compact readiness row/mini-bar in both `weekly-brief.ts` (PDF) and `weekly-brief-docx.ts` (Word). The existing physical-% MIS stays unchanged.

## Technical notes
- Scoring is pure/derived in `src/lib/maturity.ts` (unit-testable), consuming the same query data already loaded on the dashboard (`tasks`, `statusByStation`, `drawings`, `boiMaster/boiStatus`) plus the new vendor query. No change to existing physical-% logic in `gantt-utils.ts`.
- Weights live as an exported constant in `maturity.ts` (single source of truth for app + reports). The 8-parameter scheme is hard-coded per your choice; trivially editable later.
- Only one schema change (the vendor table); everything else is additive UI + a derived library, so the current dashboard, Gantt, and exports keep working.

## Build order
1. Migration: `station_vendor_status` (+ grants, RLS, triggers, per-station seed).
2. `src/lib/maturity.ts` scoring engine + weights.
3. `VendorApprovalTab` + wire into station page tabs.
4. `ReadinessTab` + wire into station page tabs.
5. `_authenticated.readiness.tsx` corporate dashboard + header nav link.
6. Readiness in `weekly-brief-data.ts` and both Weekly Brief exporters.
