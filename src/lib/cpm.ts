// ---------------------------------------------------------------------------
// CPM (Critical Path Method) engine — Primavera-grade scheduling analytics.
//
// Parses the Primavera P6 predecessor syntax stored on each L2 activity
// (e.g. "4SS+30 days", "7", "9SS+9 days,10SS+9 days") where the leading number
// is the activity number == station-local `sort_order`. It runs a forward +
// backward pass to derive early/late dates and total float (baseline critical
// path), then a data-date forward pass that injects actual progress to forecast
// the project finish, the schedule over-run, and the *driving* activities on the
// longest path that are responsible for the slip.
// ---------------------------------------------------------------------------
import { differenceInCalendarDays, addDays, min as dMin, max as dMax } from "date-fns";
import { parseD, type L2Task, type Status } from "./gantt-utils";

export type RelType = "FS" | "SS" | "FF" | "SF";
export type Relation = { act: number; type: RelType; lag: number };

/** Parse a P6 predecessor string into internal numeric relationships.
 * Cross-project references (e.g. "7M2-T85 SS + 10d") are ignored — they cannot
 * be resolved inside a single station network. */
export function parsePredecessors(raw: string | null | undefined): Relation[] {
  if (!raw) return [];
  const out: Relation[] = [];
  for (const partRaw of raw.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    // Match: <number><type?><lag?> e.g. 7 | 4SS | 4SS+4 days | 116FS+1 day
    const m = part.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*(?:days?|d)?\s*$/i);
    if (!m) continue; // skip cross-project "NMx-Tyy" style links
    const act = parseInt(m[1], 10);
    const type = ((m[2] ?? "FS").toUpperCase() as RelType);
    const lag = m[3] ? parseInt(m[3].replace(/\s+/g, ""), 10) : 0;
    if (Number.isFinite(act)) out.push({ act, type, lag });
  }
  return out;
}

type Node = {
  id: string;
  sort: number;
  wbs: string;
  name: string;
  isSection: boolean;
  isMilestone: boolean;
  dur: number; // calendar days
  bStart: number | null; // baseline start (day index)
  bFinish: number | null; // baseline finish (day index)
  preds: Relation[];
  // baseline pass
  es: number; ef: number; ls: number; lf: number; tf: number;
  // forecast pass
  fEs: number; fEf: number; fixed: boolean; bindPred: number | null;
};

export type CpmActivity = {
  id: string;
  wbs: string;
  name: string;
  isSection: boolean;
  totalFloat: number;
  isCritical: boolean;        // baseline critical path (tf <= tolerance)
  isForecastCritical: boolean; // on the forecast longest/driving path
  isDriver: boolean;          // driving activity responsible for the over-run
  baselineFinish: Date | null;
  forecastFinish: Date | null;
  slipDays: number;           // forecastFinish - baselineFinish
};

export type CpmDriver = {
  id: string;
  wbs: string;
  name: string;
  baselineFinish: Date | null;
  forecastFinish: Date | null;
  slipDays: number;
  cause: string;
  pct: number;
};

export type CpmResult = {
  hasNetwork: boolean;
  baselineFinish: Date | null;
  forecastFinish: Date | null;
  overrunDays: number;        // +ve = forecast later than baseline
  criticalCount: number;
  drivers: CpmDriver[];       // leaf activities on the driving path, by slip desc
  byId: Map<string, CpmActivity>;
};

const FLOAT_TOL = 1; // days — activities within 1 day of zero float are "critical"

export function computeCPM(
  tasksIn: L2Task[],
  statusMap: Map<string, Status>,
  today: Date = new Date(),
): CpmResult {
  const tasks = tasksIn.filter((t) => t.baseline_start && t.baseline_finish);
  const empty: CpmResult = {
    hasNetwork: false, baselineFinish: null, forecastFinish: null, overrunDays: 0,
    criticalCount: 0, drivers: [], byId: new Map(),
  };
  if (tasks.length === 0) return empty;

  // Epoch = earliest baseline start across the station.
  const starts = tasks.map((t) => parseD(t.baseline_start)!).filter(Boolean);
  const epoch = dMin(starts);
  const dayOf = (d: Date) => differenceInCalendarDays(d, epoch);
  const dateOf = (day: number) => addDays(epoch, Math.round(day));

  const nodes: Node[] = tasks.map((t) => {
    const bs = parseD(t.baseline_start);
    const bf = parseD(t.baseline_finish);
    return {
      id: t.id, sort: t.sort_order, wbs: t.wbs_code, name: t.name,
      isSection: t.is_section, isMilestone: t.duration_days === 0,
      dur: Math.max(0, t.duration_days),
      bStart: bs ? dayOf(bs) : null,
      bFinish: bf ? dayOf(bf) : null,
      preds: parsePredecessors(t.predecessors),
      es: 0, ef: 0, ls: 0, lf: 0, tf: 0,
      fEs: 0, fEf: 0, fixed: false, bindPred: null,
    };
  });
  const bySort = new Map<number, Node>();
  for (const n of nodes) bySort.set(n.sort, n);

  // Only keep resolvable internal predecessors.
  for (const n of nodes) n.preds = n.preds.filter((p) => bySort.has(p.act));

  const maxIter = nodes.length + 2;

  // ---- Baseline forward pass (anchored to baseline starts; honours logic) ----
  for (const n of nodes) n.es = n.bStart ?? 0;
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    for (const n of nodes) {
      let es = n.bStart ?? 0; // baseline floor keeps external constraints intact
      for (const p of n.preds) {
        const pn = bySort.get(p.act)!;
        const cand = predConstraint(p.type, pn.es, pn.ef, n.dur, p.lag);
        if (cand > es) es = cand;
      }
      if (es !== n.es) { n.es = es; changed = true; }
      n.ef = n.es + n.dur;
    }
    if (!changed) break;
  }
  const projEnd = Math.max(...nodes.map((n) => n.ef));

  // ---- Baseline backward pass (late dates + total float) ----
  for (const n of nodes) n.lf = projEnd;
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    for (const n of nodes) {
      let lf = projEnd;
      let first = true;
      // a node's LF is constrained by its successors
      for (const s of nodes) {
        for (const p of s.preds) {
          if (p.act !== n.sort) continue;
          const cand = succConstraint(p.type, s.ls, s.lf, n.dur, p.lag);
          if (first || cand < lf) { lf = cand; first = false; }
        }
      }
      if (lf !== n.lf) { n.lf = lf; changed = true; }
      n.ls = n.lf - n.dur;
    }
    if (!changed) break;
  }
  for (const n of nodes) n.tf = n.ls - n.es;

  // ---- Forecast (data-date) forward pass with actual progress injected ----
  const dd = dayOf(today);
  for (const n of nodes) {
    const st = statusMap.get(n.id);
    const aStart = parseD(st?.actual_start ?? null);
    const aFinish = parseD(st?.actual_finish ?? null);
    const pct = Math.min(100, Math.max(0, st?.percent_complete ?? 0));
    const done = pct >= 100 || st?.status === "completed" || !!aFinish;
    if (done) {
      const ef = aFinish ? dayOf(aFinish) : Math.max(n.ef, dd);
      const es = aStart ? dayOf(aStart) : ef - n.dur;
      n.fEs = es; n.fEf = ef; n.fixed = true;
    } else if (aStart) {
      const remDur = Math.ceil(n.dur * (1 - pct / 100));
      n.fEs = dayOf(aStart);
      n.fEf = Math.max(dd, n.fEs) + remDur;
      n.fixed = true; // its own finish is progress-driven, not pred-driven
    } else {
      n.fEs = n.bStart ?? 0; n.fEf = n.fEs + n.dur; n.fixed = false;
    }
  }
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    for (const n of nodes) {
      if (n.fixed) continue;
      const floor = n.preds.length ? -Infinity : (n.bStart ?? 0);
      let es = floor;
      let bind: number | null = null;
      for (const p of n.preds) {
        const pn = bySort.get(p.act)!;
        const cand = predConstraint(p.type, pn.fEs, pn.fEf, n.dur, p.lag);
        if (cand > es) { es = cand; bind = p.act; }
      }
      // a not-yet-started activity cannot start before the data date
      if (es < dd) es = Math.max(es, dd);
      if (!Number.isFinite(es)) es = dd;
      if (es !== n.fEs || bind !== n.bindPred) { n.fEs = es; n.bindPred = bind; changed = true; }
      n.fEf = n.fEs + n.dur;
    }
    if (!changed) break;
  }

  const leaves = nodes.filter((n) => !n.isSection);
  const baseFinishDay = Math.max(...leaves.map((n) => n.bFinish ?? n.ef));
  const foreFinishDay = Math.max(...leaves.map((n) => n.fEf));
  const overrunDays = Math.round(foreFinishDay - baseFinishDay);

  // ---- Trace the driving path back from the finishing activity ----
  const driverIds = new Set<string>();
  let cur = leaves.reduce((a, b) => (b.fEf > a.fEf ? b : a), leaves[0]);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    driverIds.add(cur.id);
    if (cur.fixed && cur.bindPred == null) {
      // an in-progress / completed driver: continue via its strongest pred
      const best = pickBindingPred(cur, bySort);
      if (best == null) break;
      cur = bySort.get(best)!;
      continue;
    }
    if (cur.bindPred == null) break;
    cur = bySort.get(cur.bindPred)!;
  }

  const byId = new Map<string, CpmActivity>();
  for (const n of nodes) {
    const bf = n.bFinish != null ? dateOf(n.bFinish) : null;
    const ff = dateOf(n.fEf);
    const slip = n.bFinish != null ? Math.round(n.fEf - n.bFinish) : 0;
    byId.set(n.id, {
      id: n.id, wbs: n.wbs, name: n.name, isSection: n.isSection,
      totalFloat: Math.round(n.tf),
      isCritical: n.tf <= FLOAT_TOL,
      isForecastCritical: driverIds.has(n.id),
      isDriver: driverIds.has(n.id) && slip > 0 && !n.isSection,
      baselineFinish: bf, forecastFinish: ff, slipDays: slip,
    });
  }

  const drivers: CpmDriver[] = nodes
    .filter((n) => driverIds.has(n.id) && !n.isSection && (n.fEf - (n.bFinish ?? n.fEf)) > 0)
    .map((n) => {
      const st = statusMap.get(n.id);
      const pct = Math.min(100, Math.max(0, st?.percent_complete ?? 0));
      const aStart = parseD(st?.actual_start ?? null);
      const aFinish = parseD(st?.actual_finish ?? null);
      const slip = Math.round(n.fEf - (n.bFinish ?? n.fEf));
      let cause: string;
      if (aFinish) cause = "Finished late";
      else if (aStart) cause = `In progress ${pct}% — running over remaining duration`;
      else if (n.bStart != null && dd > n.bStart) cause = `Not started — baseline start ${fmtShort(dateOf(n.bStart))} missed`;
      else cause = "Driven by upstream slip";
      return {
        id: n.id, wbs: n.wbs, name: n.name,
        baselineFinish: n.bFinish != null ? dateOf(n.bFinish) : null,
        forecastFinish: dateOf(n.fEf), slipDays: slip, cause, pct,
      };
    })
    .sort((a, b) => b.slipDays - a.slipDays);

  return {
    hasNetwork: true,
    baselineFinish: dateOf(baseFinishDay),
    forecastFinish: dateOf(foreFinishDay),
    overrunDays,
    criticalCount: nodes.filter((n) => !n.isSection && n.tf <= FLOAT_TOL).length,
    drivers,
    byId,
  };
}

// ES of a successor implied by a predecessor relationship.
function predConstraint(type: RelType, pEs: number, pEf: number, succDur: number, lag: number): number {
  switch (type) {
    case "FS": return pEf + lag;
    case "SS": return pEs + lag;
    case "FF": return pEf + lag - succDur;
    case "SF": return pEs + lag - succDur;
  }
}

// LF of a predecessor implied by a successor relationship.
function succConstraint(type: RelType, sLs: number, sLf: number, predDur: number, lag: number): number {
  switch (type) {
    case "FS": return sLs - lag;
    case "SS": return sLs - lag + predDur;
    case "FF": return sLf - lag;
    case "SF": return sLf - lag + predDur;
  }
}

function pickBindingPred(n: Node, bySort: Map<number, Node>): number | null {
  let best: number | null = null;
  let bestEf = -Infinity;
  for (const p of n.preds) {
    const pn = bySort.get(p.act);
    if (!pn) continue;
    if (pn.fEf > bestEf) { bestEf = pn.fEf; best = p.act; }
  }
  return best;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

// Avoid unused import warning while keeping dMax available for future use.
void dMax;
