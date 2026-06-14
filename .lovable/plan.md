## Goal

Create one intelligent linking layer that ties together the three data sets that already exist per station, and make the whole app navigable between them:

1. **BOI items** (`boi_master` / `station_boi_status`) — e.g. *Battery Container, PCS, 33/220 KV Power Transformer*
2. **MDL drawings** (`station_drawings`, category **BOI Engg**) — e.g. *BESS Container: GA, Datasheet… → 8004-…-B-032*
3. **L2 ordering tasks** (`l2_tasks` under WBS **1.6 Procurement & Manufacturing**) — e.g. *PO for Battery Modules*

## Approach: one shared mapping module (no DB change needed)

I'll build `src/lib/boi-links.ts` — a deterministic, keyword-based matcher that understands BESS terminology. Given a station's BOI items + drawings + L2 tasks, it returns for each BOI item:

- `drawings: { drg_ref, drg_desc, id }[]` — matched MDL **BOI Engg** drawings
- `poTask: L2Task | null` — matched L2 "PO for …" ordering task
- `orderStart / orderFinish` — the PO task's baseline start / finish

Computing this in code (rather than freezing it into the DB) means it auto-updates whenever you edit the BOI master, MDL, or L2 in the database — which fits the per-station/per-voltage masters you just set up. The same module is reused everywhere so every screen agrees.

### Mapping rules (BESS-aware keyword scoring)

Each BOI item name is tokenised and scored against drawing descriptions and PO-task names using synonym groups. Proposed groups:

```text
BOI item                         → L2 PO task                  → MDL BOI-Engg drawing(s)
Battery Container / BESS         → PO for Battery Modules        BESS Container GA…(B-032), BMS…(W-036), FAT…(W-033/34)
PCS                              → PO for PCS / Inverters        PCS/Inverter GA…(B-037), PCS Earthing(U-038)
33/220 KV Power Transformer      → PO for Transformers           TIE/Power Transformer…(B-065)
Transformers (PCS/Aux), IDT      → PO for Transformers           PCS/IDT Transformer(B-064), Aux Trafo(B-063)
HT/MV/LT Switchgear, HT Panel    → PO for HT / LT Switchgear     CRP & Metering Panel(B-076)…
SCADA/PPC, EMS                   → PO for SCADA / EMS            EMS/SCADA Logic(W-041), FAT(W-042/43), AGC(W-045)
Fire Protection, HVAC            → PO for Fire & HVAC Systems    (NIFPS refs in B-064/065)
HT/DC/AC/OFC/Control Cables      → PO for HT / LT Cables         EHV(B-066), HT(B-067), LT(B-068), DC(B-069)
220 KV Circuit Breakers          → PO for HT / LT Switchgear     220kV Breaker(B-046), Isolator(B-047)
UPS                              → PO for SCADA / EMS (aux)      UPS & Battery(B-039), SMPS charger(B-082)
```

Items with no confident match are simply left unlinked (your "wherever possible" requirement). Scoring is conservative — better to leave blank than mis-link.

## Wiring across the codebase

### A. BOI Status tab (`BoiStatusTab.tsx`)
- **Dwgs column**: render the matched `drg_ref`(s) as clickable chips → jump to MDL tab with that drawing highlighted. (Drawing count stays as a tooltip.)
- **Sched PO column**: show the linked L2 PO task's **finish date** (ordering date) as a clickable value → jump to L2 Gantt with that task highlighted. Falls back to existing `scheduled_po_date` if unlinked.
- Hover tooltip on the equipment name showing "L2: PO for … (start→finish)" and linked drawing refs.

### B. L2 Gantt task popup (`TaskDrawer` in the station route)
- When the opened task is an ordering task (or any task that maps to a BOI item), add a **"Linked BOI & Drawings"** panel showing: BOI item name + live status chip (Ordered/In Transit/Received…), the matched drawing ref(s), and **two buttons**: "Open BOI status" and "Open drawing" that navigate to the right tab and highlight the row.

### C. MDL / Drawings tab (`DrawingsTab.tsx`)
- For BOI-Engg drawings, show a small "BOI: <item>" badge that links back to the BOI tab row.

### D. Cross-tab navigation (station route)
- Convert the `Tabs` from uncontrolled `defaultValue` to **controlled via URL search params** (`?tab=boi&focus=<id>`), validated with `validateSearch`.
- Add a shared highlight+scroll behaviour: when `focus` is present, the target row in BOI/MDL/Gantt briefly highlights and scrolls into view.

### E. Portfolio / exports (optional, same module)
- Reuse `boi-links.ts` so the Weekly Brief / MIS exports can show the linked PO date and drawing ref consistently. (Can be a follow-up; core ask is the in-app linking.)

## Files

- **New**: `src/lib/boi-links.ts` (matcher + types + token/synonym tables)
- **Edit**: `src/components/BoiStatusTab.tsx` (Dwgs + Sched PO links, needs drawings+tasks data)
- **Edit**: `src/routes/_authenticated.stations.$stationId.tsx` (controlled tabs + search params, TaskDrawer linked panel, row highlight/scroll, pass tasks/drawings into BOI tab)
- **Edit**: `src/components/DrawingsTab.tsx` (BOI back-link badge)

## Technical notes

- No schema migration required; matching is computed client-side from data already fetched. If you later want the matches frozen/editable in the DB, that's an additive follow-up (a `boi_drawing_map` table) — I'll flag it but not build it unless you ask.
- "Sched PO date = L2 ordering finish date" is implemented as a derived display value; the stored `scheduled_po_date` remains the fallback so nothing breaks for unlinked items.
