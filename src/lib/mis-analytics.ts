import {
  buildStatusMap,
  computeSCurve,
  stationProgress,
  type L2Task,
  type Status,
} from "./gantt-utils";

export type Health = "green" | "amber" | "red";

export function healthOf(delayed: number): Health {
  if (delayed >= 5) return "red";
  if (delayed > 0) return "amber";
  return "green";
}

export function cleanAgency(a: string | null | undefined): string {
  if (!a) return "Unassigned";
  return a.replace(/,\s*\d+\s*$/, "").trim() || "Unassigned";
}

export type StationAnalytics = {
  id: string;
  name: string;
  lot: string;
  agency: string;
  eic: string;
  capacity_mwh: number;
  pct: number;
  ideal: number;
  delayed: number;
  completed: number;
  total: number;
  daysBehind: number;
  forecastOverrunDays: number;
  health: Health;
};

export type SCurvePt = { label: string; planned: number; actual: number | null };

export type PortfolioAnalytics = {
  stations: StationAnalytics[];
  totals: {
    stations: number;
    totalMWh: number;
    avgProgress: number;
    idealProgress: number;
    daysBehind: number;
    forecastOverrunDays: number;
    onTrack: number;
    atRisk: number;
    delayed: number;
  };
  sCurve: SCurvePt[];
};

type StationLike = {
  id: string;
  name: string;
  lot: string;
  capacity_mwh: number;
  agency: string | null;
  ntpc_eic: string | null;
};

/** Compute portfolio + per-station progress, ideal (baseline) progress and forecast over-run. */
export function computePortfolioAnalytics(
  stations: StationLike[],
  tasks: L2Task[],
  statusByStation: Record<string, Status[]>,
  today: Date = new Date(),
): PortfolioAnalytics {
  const stationRows: StationAnalytics[] = stations.map((s) => {
    const sTasks = tasks.filter((t) => t.station_id === s.id);
    const map = buildStatusMap(statusByStation[s.id]);
    const p = stationProgress(sTasks, map);
    const sc = computeSCurve(sTasks, map, today);
    return {
      id: s.id,
      name: s.name,
      lot: s.lot,
      agency: cleanAgency(s.agency),
      eic: s.ntpc_eic ?? "—",
      capacity_mwh: Number(s.capacity_mwh) || 0,
      pct: p.pct,
      ideal: Math.round(sc.plannedNow),
      delayed: p.delayed,
      completed: p.completed,
      total: p.total,
      daysBehind: sc.daysBehind,
      forecastOverrunDays: sc.finishForecastDays,
      health: healthOf(p.delayed),
    };
  });

  // Portfolio S-curve across all tasks with a global status map (task ids are unique).
  const allStatuses: Status[] = Object.values(statusByStation).flat();
  const globalMap = buildStatusMap(allStatuses);
  const portfolioSc = computeSCurve(tasks, globalMap, today);

  const n = stationRows.length;
  const avgProgress = n ? Math.round(stationRows.reduce((a, r) => a + r.pct, 0) / n) : 0;

  return {
    stations: stationRows,
    totals: {
      stations: n,
      totalMWh: stationRows.reduce((a, r) => a + r.capacity_mwh, 0),
      avgProgress,
      idealProgress: Math.round(portfolioSc.plannedNow),
      daysBehind: portfolioSc.daysBehind,
      forecastOverrunDays: portfolioSc.finishForecastDays,
      onTrack: stationRows.filter((r) => r.health === "green").length,
      atRisk: stationRows.filter((r) => r.health === "amber").length,
      delayed: stationRows.filter((r) => r.health === "red").length,
    },
    sCurve: portfolioSc.points.map((pt) => ({ label: pt.date, planned: pt.planned, actual: pt.actual })),
  };
}
