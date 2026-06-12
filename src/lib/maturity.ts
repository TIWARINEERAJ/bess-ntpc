/**
 * NTPC BESS Project Maturity / Readiness model.
 *
 * Replaces the "everything looks near-zero" duration-weighted physical-% lens
 * with a single readiness number per station, scored across the real critical
 * path: Mobilization → Studies → Engineering → Vendor Approval → BOI Ordering
 * → Civil → Construction → Commissioning.
 *
 * The 8-parameter weighting (sums to 100) is the single source of truth used
 * by the app dashboards AND the Weekly Brief exports.
 */
import type { L2Task, Status } from "./gantt-utils";
import { drawingCounts, type StationDrawing } from "./drawings";

export type StageKey =
  | "mobilization"
  | "studies"
  | "engineering"
  | "vendor"
  | "boi"
  | "civil"
  | "construction"
  | "commissioning";

export type StageMeta = {
  key: StageKey;
  label: string;
  short: string;
  weight: number; // percentage points; all weights sum to 100
  exit: string;
};

/** 8-parameter readiness scheme (weights sum to 100). */
export const STAGE_META: StageMeta[] = [
  { key: "mobilization", label: "Mobilization", short: "Mob", weight: 10, exit: "Site office, PM & team, construction power/water, store established" },
  { key: "studies", label: "Studies", short: "Studies", weight: 5, exit: "Topo, geotech, ERT surveys & grid study complete" },
  { key: "engineering", label: "Engineering Approval", short: "Engg", weight: 20, exit: "Layout, SLD, sizing drawings approved (CAT-I/II)" },
  { key: "vendor", label: "Vendor Approval", short: "Vendor", weight: 15, exit: "BESS, PCS, Transformer & switchgear vendors finally approved" },
  { key: "boi", label: "BOI Ordering", short: "BOI", weight: 25, exit: "Long-lead items (Transformer, BESS, PCS, Switchgear) ordered & delivered" },
  { key: "civil", label: "Civil Readiness", short: "Civil", weight: 10, exit: "Foundations, trenches, roads, drainage & fencing complete" },
  { key: "construction", label: "Construction", short: "Constr", weight: 10, exit: "Equipment supplied & erected (DC + AC side)" },
  { key: "commissioning", label: "Commissioning", short: "Comm", weight: 5, exit: "Pre-comm tests, charging, grid sync & COD" },
];

export const STAGE_WEIGHTS: Record<StageKey, number> = Object.fromEntries(
  STAGE_META.map((s) => [s.key, s.weight]),
) as Record<StageKey, number>;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type BoiMasterRow = { id: string; station_id: string; name: string };
export type BoiStatusRow = {
  station_id: string;
  boi_id: string;
  actual_po_date: string | null;
  delivery_date: string | null;
  site_receipt_date: string | null;
};
export type VendorRow = {
  station_id: string;
  package: string;
  docs_submitted: string | null;
  engg_approved: string | null;
  cqa_approved: string | null;
  final_approved: string | null;
};

export type StationMaturityInput = {
  tasks: L2Task[];
  statusMap: Map<string, Status>;
  drawings: StationDrawing[];
  boiMaster: BoiMasterRow[];
  boiStatus: BoiStatusRow[];
  vendors: VendorRow[];
};

export type MaturityResult = {
  stages: Record<StageKey, number>; // each 0..100
  contributions: Record<StageKey, number>; // weighted points (stage * weight / 100)
  readiness: number; // 0..100
};

/* ------------------------------------------------------------------ */
/* L2 section → stage classification                                  */
/* ------------------------------------------------------------------ */

/**
 * Classify an L2 section by its NAME (robust across stations whose WBS
 * numbering differs). Returns the L2-derived stage, or null when the section
 * is handled by a dedicated data source (BOI ordering) or is the project root.
 */
function classifySection(name: string): StageKey | null {
  const n = name.toLowerCase();
  // Ordering sections are scored from BOI status, not L2 % complete.
  if (/\bordering\b|ordering of boi/.test(n)) return null;
  if (/commission|trial run|stabiliz|\btesting\b|readiness of equipment|completion of facilit/.test(n)) return "commissioning";
  if (/erection|installation/.test(n)) return "construction";
  if (/\bsupply\b/.test(n)) return "construction";
  if (/civil|fencing|drainage|\broad\b|foundation|control room/.test(n)) return "civil";
  if (/grid study|survey|geotech|investigation|site clearance|grading/.test(n)) return "studies";
  if (/engineering|\bmdl\b|drawing|\bsld\b|sizing/.test(n)) return "engineering";
  if (/mobiliz|office opening|preparatory/.test(n)) return "mobilization";
  return null;
}

/** 2-segment WBS prefix that identifies the top-level section, e.g. "1.3.1" → "1.3". */
function topSectionKey(wbs: string): string {
  return wbs.split(".").slice(0, 2).join(".");
}

/** Duration-weighted % complete of leaf tasks grouped into each L2-derived stage. */
function l2StageScores(tasks: L2Task[], statusMap: Map<string, Status>) {
  const sectionName = new Map<string, string>();
  for (const t of tasks) if (t.is_section) sectionName.set(t.wbs_code, t.name);

  const acc: Partial<Record<StageKey, { dur: number; weighted: number }>> = {};
  for (const t of tasks) {
    if (t.is_section) continue;
    const secName = sectionName.get(topSectionKey(t.wbs_code)) ?? t.name;
    const stage = classifySection(secName);
    if (!stage) continue;
    const dur = Math.max(t.duration_days, 1);
    const pct = statusMap.get(t.id)?.percent_complete ?? 0;
    const e = (acc[stage] ??= { dur: 0, weighted: 0 });
    e.dur += dur;
    e.weighted += dur * pct;
  }
  const out: Partial<Record<StageKey, number>> = {};
  for (const k of Object.keys(acc) as StageKey[]) {
    const e = acc[k]!;
    out[k] = e.dur ? Math.round(e.weighted / e.dur) : 0;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Vendor / BOI scoring                                               */
/* ------------------------------------------------------------------ */

function vendorScore(vendors: VendorRow[]): number {
  if (vendors.length === 0) return 0;
  let sum = 0;
  for (const v of vendors) {
    if (v.final_approved) sum += 100;
    else if (v.cqa_approved) sum += 75;
    else if (v.engg_approved) sum += 50;
    else if (v.docs_submitted) sum += 25;
  }
  return Math.round(sum / vendors.length);
}

const LONG_LEAD = /transformer|battery|\bbess\b|\bpcs\b|switchgear|circuit breaker|switchyard|\bgis\b/i;

function boiScore(master: BoiMasterRow[], status: BoiStatusRow[]): number {
  if (master.length === 0) return 0;
  const byId = new Map(status.map((s) => [s.boi_id, s]));
  let wsum = 0;
  let wmax = 0;
  for (const b of master) {
    const weight = LONG_LEAD.test(b.name) ? 3 : 1;
    const s = byId.get(b.id);
    let p = 0;
    if (s?.site_receipt_date) p = 100;
    else if (s?.delivery_date) p = 85;
    else if (s?.actual_po_date) p = 60;
    wsum += weight * p;
    wmax += weight * 100;
  }
  return wmax ? Math.round((wsum / wmax) * 100) : 0;
}

/* ------------------------------------------------------------------ */
/* Compose                                                            */
/* ------------------------------------------------------------------ */

export function computeStationMaturity(input: StationMaturityInput): MaturityResult {
  const l2 = l2StageScores(input.tasks, input.statusMap);
  const eng = drawingCounts(input.drawings);

  const stages: Record<StageKey, number> = {
    mobilization: l2.mobilization ?? 0,
    studies: l2.studies ?? 0,
    // Engineering: drawing approval ratio; fall back to L2 engineering sections.
    engineering: input.drawings.length > 0 ? eng.approvedPct : l2.engineering ?? 0,
    vendor: vendorScore(input.vendors),
    boi: boiScore(input.boiMaster, input.boiStatus),
    civil: l2.civil ?? 0,
    construction: l2.construction ?? 0,
    commissioning: l2.commissioning ?? 0,
  };

  const contributions = {} as Record<StageKey, number>;
  let readiness = 0;
  for (const meta of STAGE_META) {
    const c = (stages[meta.key] * meta.weight) / 100;
    contributions[meta.key] = c;
    readiness += c;
  }

  return { stages, contributions, readiness: Math.round(readiness) };
}

/** Color band for a readiness / stage score. Returns a CSS var token. */
export function maturityColor(pct: number): string {
  if (pct >= 67) return "var(--status-green)";
  if (pct >= 34) return "var(--status-amber)";
  if (pct > 0) return "var(--status-red)";
  return "var(--status-grey)";
}

/** Fetch every station's vendor rows, grouped by station_id (browser client). */
export type VendorRowFull = VendorRow & {
  id: string;
  vendor_name: string | null;
  sort_order: number;
  remarks: string | null;
};
