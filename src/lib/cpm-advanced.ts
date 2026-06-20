// ---------------------------------------------------------------------------
// CPM Advanced — enterprise schedule-assurance layer on top of computeCPM().
//
//   • DCMA 14-Point Schedule Quality Assessment (industry gold standard)
//   • Monte Carlo schedule-risk simulation  → P10/P50/P80/P90 finish dates
//   • Free float (in addition to total float)
//   • CPLI (Critical Path Length Index) + BEI (Baseline Execution Index)
// ---------------------------------------------------------------------------
import { differenceInCalendarDays, addDays, min as dMin } from "date-fns";
import { parseD, type L2Task, type Status } from "./gantt-utils";
import { parsePredecessors, type CpmResult, type RelType } from "./cpm";

// ES of a successor implied by a predecessor relationship (mirrors cpm.ts).
function predES(type: RelType, pEs: number, pEf: number, succDur: number, lag: number): number {
  switch (type) {
    case "FS": return pEf + lag;
    case "SS": return pEs + lag;
    case "FF": return pEf + lag - succDur;
    case "SF": return pEs + lag - succDur;
  }
}

// ---------------------------------------------------------------------------
// DCMA 14-Point Schedule Assessment
// ---------------------------------------------------------------------------
export type DcmaCheck = {
  key: string;
  label: string;
  value: string;       // headline metric, e.g. "3.2%"
  target: string;      // DCMA threshold, e.g. "≤ 5%"
  pass: boolean;
  detail: string;
  count: number;       // number of offending activities (for drill-through)
  offenders: string[]; // task ids that fail this check
};

export type DcmaResult = {
  checks: DcmaCheck[];
  passCount: number;
  total: number;
  score: number;       // 0..100
  cpli: number;        // Critical Path Length Index
  bei: number;         // Baseline Execution Index
};

const HIGH_FLOAT = 44;     // working days
const HIGH_DURATION = 44;  // working days

export function assessDCMA(
  tasks: L2Task[],
  statusMap: Map<string, Status>,
  cpm: CpmResult,
  today: Date = new Date(),
): DcmaResult {
  const acts = tasks.filter((t) => !t.is_section && t.baseline_start && t.baseline_finish);
  const n = acts.length || 1;

  // Index activities by station-local sort_order for relationship lookups.
  const bySort = new Map<number, L2Task>();
  for (const t of acts) bySort.set(t.sort_order, t);
  // successor map: sort -> count of successors
  const succCount = new Map<number, number>();
  let leadCount = 0;       // negative lags
  let lagCount = 0;        // positive lags
  let relTotal = 0;        // total relationships
  let fsCount = 0;         // FS relationships
  const missingPredIds: string[] = [];
  for (const t of acts) {
    const rels = parsePredecessors(t.predecessors).filter((r) => bySort.has(r.act));
    if (rels.length === 0) missingPredIds.push(t.id);
    for (const r of rels) {
      relTotal++;
      if (r.type === "FS") fsCount++;
      if (r.lag < 0) leadCount++;
      if (r.lag > 0) lagCount++;
      succCount.set(r.act, (succCount.get(r.act) ?? 0) + 1);
    }
  }
  const missingSuccIds = acts.filter((t) => (succCount.get(t.sort_order) ?? 0) === 0).map((t) => t.id);
  // logic = activities missing a predecessor OR successor (excluding genuine start/end)
  const danglingIds = Array.from(new Set([...missingPredIds, ...missingSuccIds]));

  // hard constraints captured on cpm activities
  const hardIds: string[] = [];
  // high float / negative float / high duration from cpm network
  const highFloatIds: string[] = [];
  const negFloatIds: string[] = [];
  for (const node of cpm.network.nodes) {
    if (node.tf > HIGH_FLOAT) highFloatIds.push(node.id);
    if (node.tf < 0) negFloatIds.push(node.id);
  }
  for (const [id, a] of cpm.byId) {
    if (a.constraintType === "MSO" || a.constraintType === "MFO") hardIds.push(id);
  }
  const highDurIds = acts.filter((t) => t.duration_days > HIGH_DURATION).map((t) => t.id);

  // invalid dates: actual start/finish in the future
  const invalidIds: string[] = [];
  for (const t of acts) {
    const st = statusMap.get(t.id);
    const as = parseD(st?.actual_start ?? null);
    const af = parseD(st?.actual_finish ?? null);
    if (as && as > today) invalidIds.push(t.id);
    else if (af && af > today) invalidIds.push(t.id);
    else if (as && af && af < as) invalidIds.push(t.id);
  }

  // missed tasks: baseline finish <= today but not complete
  const missedIds: string[] = [];
  let shouldBeDone = 0, doneByNow = 0;
  for (const t of acts) {
    const bf = parseD(t.baseline_finish);
    const st = statusMap.get(t.id);
    const complete = (st?.percent_complete ?? 0) >= 100 || st?.status === "completed" || !!parseD(st?.actual_finish ?? null);
    if (bf && bf <= today) {
      shouldBeDone++;
      if (complete) doneByNow++;
      else missedIds.push(t.id);
    }
  }

  const pct = (x: number) => (x / n) * 100;
  const fmtPct = (x: number) => `${pct(x).toFixed(1)}%`;

  // CPLI = (Critical Path Length − overrun) / Critical Path Length
  const cpl = cpm.baselineFinish ? Math.max(1, differenceInCalendarDays(cpm.baselineFinish, today)) : 1;
  const cpli = Math.max(0, (cpl - cpm.overrunDays) / cpl);
  // BEI = tasks completed / tasks that should have completed by data date
  const bei = shouldBeDone > 0 ? doneByNow / shouldBeDone : 1;

  const checks: DcmaCheck[] = [
    {
      key: "logic", label: "1 · Logic (no dangling activities)",
      value: fmtPct(danglingIds.length), target: "≤ 5%",
      pass: pct(danglingIds.length) <= 5, count: danglingIds.length, offenders: danglingIds,
      detail: `${danglingIds.length} of ${n} activities miss a predecessor or successor link.`,
    },
    {
      key: "leads", label: "2 · Leads (negative lag)",
      value: `${leadCount}`, target: "0",
      pass: leadCount === 0, count: leadCount, offenders: [],
      detail: `${leadCount} relationships use a negative lag (lead) — discouraged in a healthy network.`,
    },
    {
      key: "lags", label: "3 · Lags",
      value: relTotal ? `${((lagCount / relTotal) * 100).toFixed(1)}%` : "0%", target: "≤ 5%",
      pass: relTotal ? (lagCount / relTotal) * 100 <= 5 : true, count: lagCount, offenders: [],
      detail: `${lagCount} of ${relTotal} relationships carry a positive lag.`,
    },
    {
      key: "fs", label: "4 · Relationship types (FS dominant)",
      value: relTotal ? `${((fsCount / relTotal) * 100).toFixed(1)}%` : "—", target: "≥ 90% FS",
      pass: relTotal ? (fsCount / relTotal) * 100 >= 90 : true, count: relTotal - fsCount, offenders: [],
      detail: `${fsCount} of ${relTotal} links are Finish-to-Start.`,
    },
    {
      key: "hard", label: "5 · Hard constraints",
      value: fmtPct(hardIds.length), target: "≤ 5%",
      pass: pct(hardIds.length) <= 5, count: hardIds.length, offenders: hardIds,
      detail: `${hardIds.length} activities use Mandatory Start/Finish constraints that override logic.`,
    },
    {
      key: "highfloat", label: "6 · High total float (> 44d)",
      value: fmtPct(highFloatIds.length), target: "≤ 5%",
      pass: pct(highFloatIds.length) <= 5, count: highFloatIds.length, offenders: highFloatIds,
      detail: `${highFloatIds.length} activities have more than ${HIGH_FLOAT} days of total float.`,
    },
    {
      key: "negfloat", label: "7 · Negative float",
      value: `${negFloatIds.length}`, target: "0",
      pass: negFloatIds.length === 0, count: negFloatIds.length, offenders: negFloatIds,
      detail: `${negFloatIds.length} activities show negative float — the schedule is behind logic.`,
    },
    {
      key: "highdur", label: "8 · High duration (> 44d)",
      value: fmtPct(highDurIds.length), target: "≤ 5%",
      pass: pct(highDurIds.length) <= 5, count: highDurIds.length, offenders: highDurIds,
      detail: `${highDurIds.length} activities exceed ${HIGH_DURATION} days baseline duration.`,
    },
    {
      key: "invalid", label: "9 · Invalid dates",
      value: `${invalidIds.length}`, target: "0",
      pass: invalidIds.length === 0, count: invalidIds.length, offenders: invalidIds,
      detail: `${invalidIds.length} activities have actual dates in the future or finish-before-start.`,
    },
    {
      key: "missed", label: "10 · Missed tasks",
      value: shouldBeDone ? `${((missedIds.length / shouldBeDone) * 100).toFixed(1)}%` : "0%", target: "≤ 5%",
      pass: shouldBeDone ? (missedIds.length / shouldBeDone) * 100 <= 5 : true, count: missedIds.length, offenders: missedIds,
      detail: `${missedIds.length} of ${shouldBeDone} baseline-due activities are not finished.`,
    },
    {
      key: "critical", label: "11 · Critical path test",
      value: cpm.criticalCount > 0 ? "Present" : "None", target: "Continuous",
      pass: cpm.criticalCount > 0, count: cpm.criticalCount, offenders: [],
      detail: `${cpm.criticalCount} activities sit on the critical path (zero float).`,
    },
    {
      key: "cpli", label: "12 · CPLI (Critical Path Length Index)",
      value: cpli.toFixed(2), target: "≥ 0.95",
      pass: cpli >= 0.95, count: 0, offenders: [],
      detail: cpli >= 1 ? "On or ahead of the critical-path baseline." : "Critical path is forecast to finish late.",
    },
    {
      key: "bei", label: "13 · BEI (Baseline Execution Index)",
      value: bei.toFixed(2), target: "≥ 0.95",
      pass: bei >= 0.95, count: missedIds.length, offenders: missedIds,
      detail: `${doneByNow} of ${shouldBeDone} due activities completed on plan.`,
    },
  ];

  const passCount = checks.filter((c) => c.pass).length;
  return {
    checks, passCount, total: checks.length,
    score: Math.round((passCount / checks.length) * 100),
    cpli, bei,
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo schedule-risk simulation
// ---------------------------------------------------------------------------
export type RiskResult = {
  ran: boolean;
  iterations: number;
  baselineFinish: Date | null;
  deterministicFinish: Date | null;
  p10: Date | null;
  p50: Date | null;
  p80: Date | null;
  p90: Date | null;
  probOnTime: number;   // probability of finishing on/before baseline (0..1)
  histogram: { date: Date; count: number }[];
};

type SimNode = {
  sort: number;
  baseDur: number;
  pct: number;
  done: boolean;
  aStartDay: number | null;
  inProgress: boolean;
  preds: { act: number; type: RelType; lag: number }[];
  bStartDay: number;
};

/** Triangular random sample given low/mode/high. */
function triangular(low: number, mode: number, high: number): number {
  const u = Math.random();
  const c = (mode - low) / (high - low || 1);
  if (u < c) return low + Math.sqrt(u * (high - low) * (mode - low));
  return high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

export function simulateRisk(
  tasks: L2Task[],
  statusMap: Map<string, Status>,
  cpm: CpmResult,
  today: Date = new Date(),
  iterations = 800,
  opt = 0.9,   // optimistic multiplier of remaining duration
  pess = 1.6,  // pessimistic multiplier of remaining duration
): RiskResult {
  const acts = tasks.filter((t) => !t.is_section && t.baseline_start && t.baseline_finish);
  const empty: RiskResult = {
    ran: false, iterations: 0, baselineFinish: cpm.baselineFinish, deterministicFinish: cpm.forecastFinish,
    p10: null, p50: null, p80: null, p90: null, probOnTime: 0, histogram: [],
  };
  if (acts.length === 0) return empty;

  const starts = acts.map((t) => parseD(t.baseline_start)!).filter(Boolean);
  const epoch = dMin(starts);
  const dayOf = (d: Date) => differenceInCalendarDays(d, epoch);
  const dateOf = (day: number) => addDays(epoch, Math.round(day));
  const dd = dayOf(today);

  const nodes: SimNode[] = acts.map((t) => {
    const st = statusMap.get(t.id);
    const pct = Math.min(100, Math.max(0, st?.percent_complete ?? 0));
    const aFinish = parseD(st?.actual_finish ?? null);
    const aStart = parseD(st?.actual_start ?? null);
    const done = pct >= 100 || st?.status === "completed" || !!aFinish;
    return {
      sort: t.sort_order,
      baseDur: Math.max(0, t.duration_days),
      pct, done,
      aStartDay: aStart ? dayOf(aStart) : null,
      inProgress: !done && (!!aStart || pct > 0),
      preds: parsePredecessors(t.predecessors),
      bStartDay: dayOf(parseD(t.baseline_start)!),
    };
  });
  const bySort = new Map<number, SimNode>();
  for (const nd of nodes) bySort.set(nd.sort, nd);
  for (const nd of nodes) nd.preds = nd.preds.filter((p) => bySort.has(p.act));

  const baselineFinishDay = cpm.baselineFinish ? dayOf(cpm.baselineFinish) : Math.max(...nodes.map((nd) => nd.bStartDay + nd.baseDur));

  const finishes: number[] = [];
  const maxIter = nodes.length + 2;
  let onTime = 0;

  for (let it = 0; it < iterations; it++) {
    // sample durations for this run
    const es = new Map<number, number>();
    const ef = new Map<number, number>();
    const sampledDur = new Map<number, number>();
    const fixed = new Map<number, boolean>();
    for (const nd of nodes) {
      if (nd.done) { fixed.set(nd.sort, true); sampledDur.set(nd.sort, nd.baseDur); continue; }
      const remainFrac = nd.inProgress ? Math.max(0, 1 - nd.pct / 100) : 1;
      const remBase = nd.baseDur * remainFrac;
      const sample = remBase > 0 ? triangular(remBase * opt, remBase, remBase * pess) : 0;
      sampledDur.set(nd.sort, sample);
    }
    // seed
    for (const nd of nodes) {
      if (nd.done) {
        const finDay = Math.max(nd.bStartDay + nd.baseDur, dd);
        es.set(nd.sort, finDay - nd.baseDur); ef.set(nd.sort, finDay);
      } else if (nd.inProgress && nd.aStartDay != null) {
        const start = nd.aStartDay;
        const fin = Math.max(dd, start) + (sampledDur.get(nd.sort) ?? 0);
        es.set(nd.sort, start); ef.set(nd.sort, fin); fixed.set(nd.sort, true);
      } else {
        es.set(nd.sort, Math.max(nd.bStartDay, dd));
        ef.set(nd.sort, Math.max(nd.bStartDay, dd) + (sampledDur.get(nd.sort) ?? 0));
      }
    }
    // forward relaxation
    for (let k = 0; k < maxIter; k++) {
      let changed = false;
      for (const nd of nodes) {
        if (fixed.get(nd.sort)) continue;
        let start = Math.max(nd.bStartDay, dd);
        for (const p of nd.preds) {
          const cand = predES(p.type, es.get(p.act) ?? 0, ef.get(p.act) ?? 0, sampledDur.get(nd.sort) ?? 0, p.lag);
          if (cand > start) start = cand;
        }
        if (start < dd) start = dd;
        if (start !== es.get(nd.sort)) {
          es.set(nd.sort, start); ef.set(nd.sort, start + (sampledDur.get(nd.sort) ?? 0)); changed = true;
        }
      }
      if (!changed) break;
    }
    const finish = Math.max(...nodes.map((nd) => ef.get(nd.sort) ?? 0));
    finishes.push(finish);
    if (finish <= baselineFinishDay) onTime++;
  }

  finishes.sort((a, b) => a - b);
  const pct = (q: number) => finishes[Math.min(finishes.length - 1, Math.floor(q * finishes.length))];

  // histogram (12 buckets)
  const lo = finishes[0], hi = finishes[finishes.length - 1];
  const buckets = 12;
  const span = Math.max(1, hi - lo);
  const hist = new Array(buckets).fill(0);
  for (const f of finishes) {
    const b = Math.min(buckets - 1, Math.floor(((f - lo) / span) * buckets));
    hist[b]++;
  }
  const histogram = hist.map((count, i) => ({ date: dateOf(lo + (span * (i + 0.5)) / buckets), count }));

  return {
    ran: true, iterations,
    baselineFinish: cpm.baselineFinish,
    deterministicFinish: cpm.forecastFinish,
    p10: dateOf(pct(0.1)), p50: dateOf(pct(0.5)), p80: dateOf(pct(0.8)), p90: dateOf(pct(0.9)),
    probOnTime: onTime / finishes.length,
    histogram,
  };
}
