import type { L2Task } from "./gantt-utils";
import type { StationDrawing } from "./drawings";

/**
 * Intelligent linking layer for the Battery Energy Storage System (BESS) MIS.
 *
 * It ties together the three data sets that exist per station:
 *   1. BOI items        — the procured equipment (boi_master / station_boi_status)
 *   2. MDL drawings     — the engineering drawings (station_drawings, "BOI Engg")
 *   3. L2 ordering tasks — the schedule "PO for …" activities (l2_tasks, WBS 1.6)
 *
 * The mapping is computed deterministically from the data already loaded, using
 * BESS-domain keyword rules. Nothing is frozen into the DB, so the links stay
 * correct automatically when the per-station BOI / MDL / L2 data changes.
 */

export type BoiLite = { id: string; name: string };

export type LinkedDrawing = { id: string; drg_ref: string; drg_desc: string };

export type BoiLink = {
  boiId: string;
  concept: string | null;
  drawings: LinkedDrawing[];
  poTask: L2Task | null;
  /** baseline start of the linked PO ordering activity */
  orderStart: string | null;
  /** baseline finish of the linked PO ordering activity (= the ordering date) */
  orderFinish: string | null;
};

/**
 * Classify a BOI equipment name into a BESS concept. Order matters: more
 * specific rules come first so e.g. "Transformers (PCS duty and Auxiliary)"
 * resolves to a transformer, not to the bare PCS concept.
 */
export function classifyBoi(name: string): string | null {
  const n = name.toLowerCase();
  if (/battery|bess|\bcell\b/.test(n)) return "battery";
  if (/\bidt\b/.test(n)) return "pcs_transformer";
  if (/\bpcs\b/.test(n) && /transformer|trafo/.test(n)) return "pcs_transformer";
  if (/power transformer|tie transformer/.test(n)) return "power_transformer";
  if (/transformer|trafo/.test(n)) return "aux_transformer";
  if (/\bpcs\b|inverter/.test(n)) return "pcs";
  if (/\bups\b/.test(n)) return "ups";
  if (/circuit breaker|breaker|isolator/.test(n)) return "breaker";
  if (/scada|ppc|\bsas\b|numerical relay|\bems\b/.test(n)) return "scada_ems";
  if (/crp|metering|energy meter|\babt\b/.test(n)) return "metering";
  if (/switchgear|ht panel|lt panel|mv switch|busduct|spbd/.test(n)) return "switchgear";
  if (/ofc|fibre|fiber/.test(n)) return "ofc_cable";
  if (/dc cable|dc cables/.test(n)) return "dc_cable";
  if (/ht cable|ehv cable/.test(n)) return "ht_cable";
  if (/lt cable|ac cable/.test(n)) return "lt_cable";
  if (/cable|cabling/.test(n)) return "cable_generic";
  if (/fire/.test(n)) return "fire";
  if (/hvac/.test(n)) return "hvac";
  if (/cctv/.test(n)) return "cctv";
  if (/earth|lighting|illumination/.test(n)) return "earthing";
  if (/switchyard/.test(n)) return "switchyard";
  return null;
}

type ConceptDef = {
  /**
   * Ordered matchers for the L2 ordering task name. The FIRST regex that yields
   * a hit wins (most specific first), so e.g. an IDT links to
   * "Ordering-Inverter Duty Transformer" rather than "Ordering of POWER TRANSFORMER".
   */
  po: RegExp[];
  /** ordered drawing matchers; the FIRST regex that yields hits wins (most specific) */
  dwg: RegExp[];
};

const CONCEPTS: Record<string, ConceptDef> = {
  battery: { po: [/battery/, /bess container/, /bess/], dwg: [/bess container/, /\bbms\b/, /battery/] },
  // PCS but NOT a PCS/inverter transformer (negative lookahead excludes "… transformer")
  pcs: { po: [/(pcs|inverter)(?!.*transformer)/], dwg: [/pcs\/inverter/, /pcs container/, /inverter/] },
  pcs_transformer: {
    po: [/inverter duty transformer/, /pcs ?\(inverter\) ?transformer/, /\bidt\b/, /inverter transformer/, /pcs.*transformer/, /transformers? ?\(pcs/, /pcs duty/],
    dwg: [/pcs\/idt transformer/, /inverter.*transformer/, /\bidt\b/],
  },
  power_transformer: { po: [/power transformer/], dwg: [/tie\/power transformer/, /power transformer/] },
  aux_transformer: { po: [/auxiliary transformer/, /aux\.? transformer/, /pcs duty and auxiliary/, /duty and auxiliary/], dwg: [/aux trafo/, /auxiliary/] },
  ups: { po: [/\bups\b/, /dc battery/, /battery charger/], dwg: [/\bups\b/, /smps/, /charger/] },
  breaker: { po: [/circuit breaker/, /isolator/, /switchgear/], dwg: [/breaker/, /isolator/] },
  scada_ems: { po: [/scada/, /\bems\b/, /\bsas\b/, /relay/], dwg: [/ems\/scada/, /scada/, /agc/] },
  metering: { po: [/metering/, /\babt\b/, /\bcrp\b/], dwg: [/metering/, /abt meter/, /\bcrp\b/] },
  switchgear: { po: [/switchgear/, /\blt panel\b/, /\bht panel\b/], dwg: [/crp & metering/, /switchgear/, /\bbom\b/] },
  ofc_cable: { po: [/fo cable/, /communication cable/, /ofc/], dwg: [/ofc/, /fibre|fiber/] },
  dc_cable: { po: [/dc cable/], dwg: [/dc cable/] },
  ht_cable: { po: [/ehv cable/, /ht cable/], dwg: [/ehv cable/, /ht cable/] },
  lt_cable: { po: [/lt cable/], dwg: [/lt cable/] },
  cable_generic: { po: [/cabling system/, /\bcable\b/], dwg: [/cabling system/, /cable/] },
  fire: { po: [/nifps/, /fire system/, /fire/], dwg: [/nifps/, /fire/] },
  hvac: { po: [/hvac/, /heating, ventilation/], dwg: [/hvac/] },
  cctv: { po: [/cctv/], dwg: [/cctv/] },
  earthing: { po: [/earthing/, /lightning protection/], dwg: [/earthing/, /illumination/, /lighting/] },
  switchyard: { po: [/switchyard/, /poi feeder/], dwg: [/switchyard/, /poi feeder/] },
};

function isBoiEngg(d: StationDrawing): boolean {
  return /boi/i.test(d.category);
}

/**
 * Collect the WBS codes of "Ordering" sections (e.g. "Ordering of BOIs").
 * Leaf tasks nested under such a section are procurement tasks even when their
 * own name is just the bare BOI name (e.g. "Power Transformer", "Switchgear",
 * "BESS") — as happens for Kudgi-style schedules.
 */
function orderingSectionCodes(tasks: L2Task[]): Set<string> {
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.is_section && t.wbs_code && /ordering/i.test(t.name)) set.add(t.wbs_code);
  }
  return set;
}

/**
 * An L2 procurement/ordering activity. Real data names these
 * "Ordering of …" / "Ordering-…" (not "PO for …"); some stations instead nest
 * bare BOI names directly under an "Ordering of BOIs" section, so a leaf whose
 * parent is an ordering section also counts.
 */
function isPoTask(t: L2Task, orderingSecs: Set<string>): boolean {
  if (t.is_section) return false;
  if (/\bordering\b|^ordering|po for|(^|\b)po\b/i.test(t.name)) return true;
  if (t.parent_wbs && orderingSecs.has(t.parent_wbs)) return true;
  return false;
}

function matchPoTask(def: ConceptDef, poTasks: L2Task[]): L2Task | null {
  for (const re of def.po) {
    const hit = poTasks.find((t) => re.test(t.name.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

function matchDrawings(def: ConceptDef, boiDwgs: StationDrawing[]): LinkedDrawing[] {
  for (const re of def.dwg) {
    const hits = boiDwgs.filter((d) => re.test(d.drg_desc.toLowerCase()));
    if (hits.length) return hits.map((d) => ({ id: d.id, drg_ref: d.drg_ref, drg_desc: d.drg_desc }));
  }
  return [];
}

/**
 * Build the BOI → {drawings, PO task} link map for one station.
 * Returns a Map keyed by BOI id.
 */
export function buildBoiLinks(
  bois: BoiLite[],
  drawings: StationDrawing[],
  tasks: L2Task[],
): Map<string, BoiLink> {
  const boiDwgs = drawings.filter(isBoiEngg);
  const poTasks = tasks.filter(isPoTask);
  const out = new Map<string, BoiLink>();
  for (const b of bois) {
    const concept = classifyBoi(b.name);
    let linkedDrawings: LinkedDrawing[] = [];
    let poTask: L2Task | null = null;
    if (concept) {
      const def = CONCEPTS[concept];
      if (def) {
        linkedDrawings = matchDrawings(def, boiDwgs);
        poTask = matchPoTask(def, poTasks);
      }
    }
    out.set(b.id, {
      boiId: b.id,
      concept,
      drawings: linkedDrawings,
      poTask,
      orderStart: poTask?.baseline_start ?? null,
      orderFinish: poTask?.baseline_finish ?? null,
    });
  }
  return out;
}

/** Reverse index: drawing id → the BOI items that link to it. */
export function drawingToBois(links: Map<string, BoiLink>, bois: BoiLite[]): Map<string, BoiLite[]> {
  const nameById = new Map(bois.map((b) => [b.id, b]));
  const rev = new Map<string, BoiLite[]>();
  for (const link of links.values()) {
    const boi = nameById.get(link.boiId);
    if (!boi) continue;
    for (const d of link.drawings) {
      const arr = rev.get(d.id) ?? [];
      arr.push(boi);
      rev.set(d.id, arr);
    }
  }
  return rev;
}

/** Reverse index: L2 task id → the BOI items whose ordering maps to it. */
export function taskToBois(links: Map<string, BoiLink>, bois: BoiLite[]): Map<string, BoiLite[]> {
  const nameById = new Map(bois.map((b) => [b.id, b]));
  const rev = new Map<string, BoiLite[]>();
  for (const link of links.values()) {
    if (!link.poTask) continue;
    const boi = nameById.get(link.boiId);
    if (!boi) continue;
    const arr = rev.get(link.poTask.id) ?? [];
    arr.push(boi);
    rev.set(link.poTask.id, arr);
  }
  return rev;
}
