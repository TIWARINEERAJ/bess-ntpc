import { differenceInCalendarDays, parseISO, format, addDays, max as dMax, min as dMin } from "date-fns";

export type L2Task = {
  id: string;
  station_id: string;
  wbs_code: string;
  parent_wbs: string | null;
  name: string;
  is_section: boolean;
  duration_days: number;
  baseline_start: string | null;
  baseline_finish: string | null;
  predecessors: string | null;
  sort_order: number;
};

export type Status = {
  id?: string;
  station_id: string;
  task_id: string;
  actual_start: string | null;
  actual_finish: string | null;
  percent_complete: number;
  status: string;
  remarks: string | null;
  owner: string | null;
};

export type RowStatus = "not_started" | "in_progress" | "completed" | "delayed" | "blocked";

export function parseD(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { return typeof s === "string" ? parseISO(s) : s; } catch { return null; }
}

export function fmtD(d: Date | string | null | undefined): string {
  const dd = typeof d === "string" ? parseD(d) : d;
  if (!dd) return "—";
  return format(dd, "dd-MMM-yy");
}

export function computeRowState(task: L2Task, st: Status | undefined, today: Date = new Date()) {
  const plannedStart = parseD(task.baseline_start);
  const plannedEnd = parseD(task.baseline_finish);
  const actualStart = parseD(st?.actual_start ?? null);
  const actualEnd = parseD(st?.actual_finish ?? null);
  const pct = st?.percent_complete ?? 0;
  const status = (st?.status as RowStatus) ?? "not_started";

  let computed: RowStatus = status;
  let slipDays = 0;
  if (actualEnd && plannedEnd) slipDays = differenceInCalendarDays(actualEnd, plannedEnd);
  else if (!actualEnd && plannedEnd && today > plannedEnd && pct < 100) slipDays = differenceInCalendarDays(today, plannedEnd);

  if (pct >= 100 || status === "completed") computed = "completed";
  else if (slipDays > 0 && pct < 100) computed = "delayed";
  else if (actualStart || pct > 0) computed = "in_progress";

  return { plannedStart, plannedEnd, actualStart, actualEnd, pct, status: computed, slipDays };
}

export function statusColor(s: RowStatus): string {
  switch (s) {
    case "completed": return "var(--status-green)";
    case "in_progress": return "var(--status-blue)";
    case "delayed": return "var(--status-red)";
    case "blocked": return "var(--status-amber)";
    default: return "var(--status-grey)";
  }
}

export function statusLabel(s: RowStatus): string {
  return ({ not_started: "Not Started", in_progress: "In Progress", completed: "Completed", delayed: "Delayed", blocked: "Blocked" } as Record<string,string>)[s] ?? s;
}

/** Build status map keyed by task_id for a station */
export function buildStatusMap(rows: Status[] | undefined): Map<string, Status> {
  const m = new Map<string, Status>();
  rows?.forEach(r => m.set(r.task_id, r));
  return m;
}

/** Section roll-up for a parent WBS using its leaf descendants (weighted by duration) */
export function sectionRollup(tasks: L2Task[], statusMap: Map<string, Status>, sectionWbs: string) {
  const kids = tasks.filter(t => !t.is_section && (t.parent_wbs === sectionWbs || t.wbs_code.startsWith(sectionWbs + ".")));
  if (kids.length === 0) return { pct: 0, weighted: 0, totalDur: 0 };
  let totalDur = 0, weighted = 0;
  for (const k of kids) {
    const dur = Math.max(k.duration_days, 1);
    const st = statusMap.get(k.id);
    const pct = st?.percent_complete ?? 0;
    totalDur += dur;
    weighted += dur * pct;
  }
  return { pct: Math.round(weighted / totalDur), weighted, totalDur };
}

/** Full derived rollup for a section: pct (weighted avg), actual_start (earliest child start),
 * actual_finish (latest child finish — only when ALL leaf children have an actual_finish). */
export function sectionDerived(tasks: L2Task[], statusMap: Map<string, Status>, sectionWbs: string) {
  const kids = tasks.filter(t => !t.is_section && (t.parent_wbs === sectionWbs || t.wbs_code.startsWith(sectionWbs + ".")));
  let totalDur = 0, weighted = 0;
  const starts: Date[] = [];
  const finishes: Date[] = [];
  let allFinished = kids.length > 0;
  for (const k of kids) {
    const dur = Math.max(k.duration_days, 1);
    const st = statusMap.get(k.id);
    totalDur += dur;
    weighted += dur * (st?.percent_complete ?? 0);
    const aS = parseD(st?.actual_start ?? null);
    const aF = parseD(st?.actual_finish ?? null);
    if (aS) starts.push(aS);
    if (aF) finishes.push(aF); else allFinished = false;
  }
  return {
    pct: totalDur ? Math.round(weighted / totalDur) : 0,
    actual_start: starts.length ? dMin(starts) : null,
    actual_finish: allFinished && finishes.length ? dMax(finishes) : null,
    leafCount: kids.length,
  };
}

export function stationProgress(tasks: L2Task[], statusMap: Map<string, Status>): { pct: number; completed: number; total: number; delayed: number } {
  const leaves = tasks.filter(t => !t.is_section);
  let totalDur = 0, weighted = 0, completed = 0, delayed = 0;
  const today = new Date();
  for (const k of leaves) {
    const dur = Math.max(k.duration_days, 1);
    const st = statusMap.get(k.id);
    const pct = st?.percent_complete ?? 0;
    totalDur += dur;
    weighted += dur * pct;
    if (pct >= 100) completed += 1;
    const { status } = computeRowState(k, st, today);
    if (status === "delayed") delayed += 1;
  }
  return { pct: totalDur ? Math.round(weighted / totalDur) : 0, completed, total: leaves.length, delayed };
}

export function projectBounds(tasks: L2Task[]): { start: Date; end: Date } {
  const starts = tasks.map(t => parseD(t.baseline_start)).filter(Boolean) as Date[];
  const ends = tasks.map(t => parseD(t.baseline_finish)).filter(Boolean) as Date[];
  const start = starts.length ? dMin(starts) : new Date();
  const end = ends.length ? dMax(ends) : addDays(start, 365);
  return { start, end };
}

/* ---------------- Schedule S-curve (ideal/baseline vs actual) ---------------- */

export type SCurvePoint = { date: string; t: number; planned: number; actual: number | null };
export type SCurveResult = {
  points: SCurvePoint[];
  plannedNow: number;
  actualNow: number;
  daysBehind: number; // positive = behind ideal schedule
  start: Date | null;
  end: Date | null;
  finishForecastDays: number; // projected calendar-day overrun at completion
};

function leafSchedule(tasks: L2Task[]) {
  return tasks.filter(t => !t.is_section && t.baseline_start && t.baseline_finish).map(t => ({
    dur: Math.max(t.duration_days, 1),
    start: parseD(t.baseline_start)!,
    end: parseD(t.baseline_finish)!,
    isMilestone: t.duration_days === 0,
    id: t.id,
  }));
}

/** Planned (ideal/baseline) cumulative % complete at a given date. */
export function plannedPctAt(tasks: L2Task[], at: Date): number {
  const leaves = leafSchedule(tasks);
  let total = 0, done = 0;
  for (const l of leaves) {
    total += l.dur;
    let frac: number;
    if (l.isMilestone) frac = at >= l.start ? 1 : 0;
    else {
      const span = differenceInCalendarDays(l.end, l.start) || 1;
      frac = Math.min(1, Math.max(0, differenceInCalendarDays(at, l.start) / span));
    }
    done += l.dur * frac;
  }
  return total ? (done / total) * 100 : 0;
}

/** Actual cumulative % complete at a given date (only meaningful for at <= today). */
export function actualPctAt(tasks: L2Task[], statusMap: Map<string, Status>, at: Date, today: Date): number {
  const leaves = leafSchedule(tasks);
  let total = 0, done = 0;
  for (const l of leaves) {
    total += l.dur;
    const st = statusMap.get(l.id);
    const aStart = parseD(st?.actual_start ?? null);
    const aFinish = parseD(st?.actual_finish ?? null);
    const pct = (st?.percent_complete ?? 0) / 100;
    let frac = 0;
    if (aFinish && aFinish <= at) frac = 1;
    else if (aStart && aStart <= at) {
      const span = differenceInCalendarDays(today, aStart) || 1;
      const ramp = Math.min(1, Math.max(0, differenceInCalendarDays(at, aStart) / span));
      frac = pct * ramp;
    }
    done += l.dur * frac;
  }
  return total ? (done / total) * 100 : 0;
}

/** Build a monthly S-curve comparing ideal/baseline progress against actual progress. */
export function computeSCurve(tasks: L2Task[], statusMap: Map<string, Status>, today: Date = new Date()): SCurveResult {
  const leaves = leafSchedule(tasks);
  if (leaves.length === 0) {
    return { points: [], plannedNow: 0, actualNow: 0, daysBehind: 0, start: null, end: null, finishForecastDays: 0 };
  }
  const start = dMin(leaves.map(l => l.start));
  const baselineEnd = dMax(leaves.map(l => l.end));
  const horizon = today > baselineEnd ? today : baselineEnd;

  const points: SCurvePoint[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(horizon.getFullYear(), horizon.getMonth(), 1);
  while (cursor <= last) {
    const planned = Math.round(plannedPctAt(tasks, cursor) * 10) / 10;
    const isPastOrNow = cursor <= today;
    const actual = isPastOrNow ? Math.round(actualPctAt(tasks, statusMap, cursor, today) * 10) / 10 : null;
    points.push({ date: format(cursor, "MMM yy"), t: cursor.getTime(), planned, actual });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  // ensure a final "today" point so curves meet at the present
  const plannedNow = Math.round(plannedPctAt(tasks, today) * 10) / 10;
  const actualNow = Math.round(actualPctAt(tasks, statusMap, today, today) * 10) / 10;
  points.push({ date: "Now", t: today.getTime(), planned: plannedNow, actual: actualNow });

  // daysBehind: how many days ago the ideal curve already reached today's actual %
  let daysBehind = 0;
  if (actualNow < plannedNow) {
    let d = new Date(start);
    while (d <= today) {
      if (plannedPctAt(tasks, d) >= actualNow) break;
      d = addDays(d, 1);
    }
    daysBehind = differenceInCalendarDays(today, d);
  } else {
    // ahead of or on schedule: negative = days ahead
    let d = new Date(today);
    const cap = addDays(today, 1000);
    while (d <= cap) {
      if (plannedPctAt(tasks, d) >= actualNow) break;
      d = addDays(d, 1);
    }
    daysBehind = -differenceInCalendarDays(d, today);
  }

  // Forecast finish overrun: scale remaining ideal duration by current performance index.
  const totalSpan = differenceInCalendarDays(baselineEnd, start) || 1;
  const spi = plannedNow > 0 ? actualNow / plannedNow : 1; // schedule performance index
  let finishForecastDays = 0;
  if (spi > 0 && spi < 1) {
    const forecastSpan = totalSpan / spi;
    finishForecastDays = Math.round(forecastSpan - totalSpan);
  }

  return { points, plannedNow, actualNow, daysBehind, start, end: baselineEnd, finishForecastDays };
}

