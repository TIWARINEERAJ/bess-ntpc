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
