import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Battery, AlertTriangle, FileSpreadsheet, FileWarning, TrendingUp, Calendar, Zap, CheckCircle2 } from "lucide-react";
import { buildStatusMap, stationProgress, computeRowState, statusLabel, type L2Task, type Status, type RowStatus } from "@/lib/gantt-utils";
import { StatusBadge } from "@/components/StatusBadge";
import { exportWeeklyMIS, exportExceptions } from "@/lib/mis-export";
import { bulkExport } from "@/lib/bulk-export";
import { useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Package } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — NTPC BESS L2 Monitor" }] }),
  component: Dashboard,
});

type Station = {
  id: string; name: string; lot: string; capacity_mwh: number; capacity_mw: number | null;
  agency: string | null; ntpc_eic: string | null; pm_coordinator: string | null; sort_order: number | null;
};

function Dashboard() {
  const stationsQ = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*").order("sort_order").order("name");
      if (error) throw error;
      return data as Station[];
    },
  });
  const tasksQ = useQuery({
    queryKey: ["l2_tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("l2_tasks").select("*").order("sort_order");
      if (error) throw error;
      return data as L2Task[];
    },
  });
  const statusQ = useQuery({
    queryKey: ["all_status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_task_status").select("*");
      if (error) throw error;
      return data as Status[];
    },
  });

  const loading = stationsQ.isLoading || tasksQ.isLoading || statusQ.isLoading;
  const stations = stationsQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const allStatus = statusQ.data ?? [];

  const statusByStation = useMemo(() => {
    const o: Record<string, Status[]> = {};
    for (const s of stations) o[s.id] = [];
    for (const r of allStatus) (o[r.station_id] ??= []).push(r);
    return o;
  }, [stations, allStatus]);

  const computed = useMemo(() => {
    return stations.map(s => {
      const map = buildStatusMap(statusByStation[s.id]);
      const p = stationProgress(tasks, map);
      let health: "green" | "amber" | "red" = "green";
      if (p.delayed > 0) health = p.delayed >= 5 ? "red" : "amber";
      return { ...s, ...p, health };
    });
  }, [stations, tasks, statusByStation]);

  const kpis = useMemo(() => {
    const total = computed.length;
    const green = computed.filter(s => s.health === "green").length;
    const amber = computed.filter(s => s.health === "amber").length;
    const red = computed.filter(s => s.health === "red").length;
    const totalMWh = stations.reduce((a, s) => a + Number(s.capacity_mwh), 0);
    const avgPct = total ? Math.round(computed.reduce((a, s) => a + s.pct, 0) / total) : 0;

    const today = new Date();
    const in30 = addDays(today, 30);
    let upcoming = 0, exceptions = 0;
    for (const s of stations) {
      const map = buildStatusMap(statusByStation[s.id]);
      for (const t of tasks) {
        if (t.is_section) continue;
        const st = map.get(t.id);
        const cs = computeRowState(t, st, today);
        if (cs.plannedEnd && cs.plannedEnd >= today && cs.plannedEnd <= in30 && cs.pct < 100) upcoming += 1;
        if (cs.status === "delayed" || cs.status === "blocked") exceptions += 1;
      }
    }
    return { total, green, amber, red, totalMWh, avgPct, upcoming, exceptions };
  }, [computed, stations, tasks, statusByStation]);

  const exceptions = useMemo(() => {
    const today = new Date();
    const list: Array<{ station: string; stationId: string; wbs: string; task: string; slip: number; status: RowStatus; owner: string }> = [];
    for (const s of stations) {
      const map = buildStatusMap(statusByStation[s.id]);
      for (const t of tasks) {
        if (t.is_section) continue;
        const st = map.get(t.id);
        const cs = computeRowState(t, st, today);
        if (cs.status === "delayed" || cs.status === "blocked") {
          list.push({ station: s.name, stationId: s.id, wbs: t.wbs_code, task: t.name, slip: cs.slipDays, status: cs.status as RowStatus, owner: st?.owner ?? "—" });
        }
      }
    }
    return list.sort((a, b) => b.slip - a.slip).slice(0, 12);
  }, [stations, tasks, statusByStation]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Executive Dashboard</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">BESS Portfolio Progress</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live status across all 15 NTPC thermal co-located storage projects · As of {format(new Date(), "dd MMM yyyy, HH:mm")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => exportExceptions(stations, tasks, statusByStation)}>
            <FileWarning className="mr-2 h-4 w-4" /> Exception Report
          </Button>
          <Button size="sm" disabled={loading} onClick={() => exportWeeklyMIS(stations, tasks, statusByStation)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Weekly MIS
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Battery className="h-4 w-4" />} label="Total Capacity" value={`${kpis.totalMWh.toLocaleString()}`} unit="MWh" tone="primary" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Avg. Progress" value={`${kpis.avgPct}`} unit="%" tone="primary" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="On Track" value={`${kpis.green}`} unit={`/ ${kpis.total}`} tone="green" />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="At Risk" value={`${kpis.amber}`} unit="stations" tone="amber" />
        <Kpi icon={<Zap className="h-4 w-4" />} label="Delayed" value={`${kpis.red}`} unit="stations" tone="red" />
        <Kpi icon={<Calendar className="h-4 w-4" />} label="Due in 30 days" value={`${kpis.upcoming}`} unit="tasks" tone="primary" />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionHeading title="Stations" sub={`${stations.length} sites · Click any card to open the L2 Gantt`} />
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {computed.map(s => <StationCard key={s.id} s={s} />)}
            </div>
          )}
        </div>
        <div>
          <SectionHeading title="Top Exceptions" sub="Delayed & blocked leaf tasks (sorted by slip days)" />
          <Card className="divide-y divide-border/60 p-0">
            {exceptions.length === 0 && !loading && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[color:var(--status-green)]" />
                No exceptions. All tasks on schedule.
              </div>
            )}
            {exceptions.map((e, i) => (
              <Link key={i} to="/stations/$stationId" params={{ stationId: e.stationId }} className="block p-3 transition-colors hover:bg-secondary/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{e.station} · <span className="font-mono text-xs text-muted-foreground">{e.wbs}</span></div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{e.task}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Owner: {e.owner}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={e.status} />
                    <div className="font-mono text-xs text-[color:var(--status-red)]">+{e.slip}d</div>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
        </div>
      </section>

      <BulkMisPanel stations={stations} tasks={tasks} statusByStation={statusByStation} />
    </div>
  );
}

function BulkMisPanel({ stations, tasks, statusByStation }: { stations: Station[]; tasks: L2Task[]; statusByStation: Record<string, Status[]> }) {
  const REPORTS = [
    { id: "weekly", label: "Weekly MIS" }, { id: "exceptions", label: "Exceptions" },
    { id: "boi", label: "BOI Status" }, { id: "delays", label: "Delay Register" },
    { id: "compliance", label: "Compliances" }, { id: "audit", label: "Audit Trail" },
  ] as const;
  const [selStations, setSelStations] = useState<Set<string>>(new Set(stations.map(s => s.id)));
  const [selReports, setSelReports] = useState<Set<string>>(new Set(["weekly", "exceptions", "boi", "delays", "compliance"]));
  const [busy, setBusy] = useState(false);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setSet(n);
  };

  const run = async () => {
    setBusy(true);
    try {
      await bulkExport({ stations, tasks, statusByStation, reports: Array.from(selReports) as ("weekly"|"exceptions"|"boi"|"delays"|"compliance"|"audit")[], selectedStationIds: Array.from(selStations) });
    } finally { setBusy(false); }
  };

  return (
    <section>
      <SectionHeading title="Bulk MIS Export" sub="Generate a single .zip pack with all selected reports for top-management review" />
      <Card className="p-4">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stations ({selStations.size}/{stations.length})</div>
              <div className="flex gap-2">
                <button className="text-[10px] text-primary hover:underline" onClick={() => setSelStations(new Set(stations.map(s => s.id)))}>All</button>
                <button className="text-[10px] text-muted-foreground hover:underline" onClick={() => setSelStations(new Set())}>None</button>
              </div>
            </div>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-auto rounded-md border border-border/60 p-2 text-xs">
              {stations.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-secondary/60">
                  <Checkbox checked={selStations.has(s.id)} onCheckedChange={() => toggle(selStations, setSelStations, s.id)} />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Reports ({selReports.size}/{REPORTS.length})</div>
            <div className="grid gap-1 rounded-md border border-border/60 p-2 text-xs">
              {REPORTS.map(r => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-secondary/60">
                  <Checkbox checked={selReports.has(r.id)} onCheckedChange={() => toggle(selReports, setSelReports, r.id)} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <Button disabled={busy || selStations.size === 0 || selReports.size === 0} onClick={run} className="w-full lg:w-auto">
              <Package className="mr-2 h-4 w-4" /> {busy ? "Generating…" : "Generate MIS Pack (.zip)"}
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, unit, tone }: { icon: React.ReactNode; label: string; value: string; unit?: string; tone: "primary" | "green" | "amber" | "red" }) {
  const colorVar = tone === "primary" ? "var(--primary)" : `var(--status-${tone})`;
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: colorVar }} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: colorVar }}>{icon}</span>{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: colorVar }}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </Card>
  );
}

function StationCard({ s }: { s: Station & ReturnType<typeof stationProgress> & { health: "green" | "amber" | "red" } }) {
  const tone = `var(--status-${s.health})`;
  return (
    <Link to="/stations/$stationId" params={{ stationId: s.id }}>
      <Card className="group relative overflow-hidden p-4 transition-all hover:border-primary/40 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent)]">
        <div className="absolute inset-y-0 left-0 w-1" style={{ background: tone }} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold">{s.name}</h3>
              <Badge variant="outline" className="text-[10px]">{s.lot}</Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{Number(s.capacity_mwh).toLocaleString()} MWh</span>
              {s.capacity_mw && <span className="font-mono">{Number(s.capacity_mw)} MW</span>}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="text-foreground/80">Agency:</span> {s.agency ?? "—"} · <span className="text-foreground/80">EIC:</span> {s.ntpc_eic ?? "—"}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress value={s.pct} className="h-2" />
          <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: tone }}>{s.pct}%</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{s.completed}/{s.total} tasks done</span>
          {s.delayed > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: `color-mix(in oklab, var(--status-red) 18%, transparent)`, color: "var(--status-red)" }}>{s.delayed} delayed</span>}
        </div>
      </Card>
    </Link>
  );
}
