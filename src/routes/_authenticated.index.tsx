import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Battery, AlertTriangle, FileSpreadsheet, FileWarning, FileText, TrendingUp, Calendar, Zap, CheckCircle2, FileStack, Camera, FileType } from "lucide-react";
import { toast } from "sonner";
import { buildStatusMap, stationProgress, computeRowState, statusLabel, type L2Task, type Status, type RowStatus } from "@/lib/gantt-utils";
import { StatusBadge } from "@/components/StatusBadge";
import { exportWeeklyMIS, exportExceptions } from "@/lib/mis-export";
import { exportWeeklyPDF, type WeeklyPdfExtras } from "@/lib/mis-pdf";
import { exportWeeklyDOCX } from "@/lib/mis-docx";
import { computePortfolioAnalytics } from "@/lib/mis-analytics";
import { generateMisNarrative, type MisNarrative, type MisNarrativeInput } from "@/lib/mis-narrative.functions";
import { bulkExport } from "@/lib/bulk-export";
import { UpcomingMeetings } from "@/components/UpcomingMeetings";
import { drawingCounts, type StationDrawing } from "@/lib/drawings";
import { fetchStatusesByStation, fetchTasksByStation } from "@/lib/task-data";
import { useMemo, useRef, useState } from "react";
import { format, addDays } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Package } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList, ReferenceLine } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, LineChart as LineChartIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — NTPC BESS L2 Monitor" }] }),
  component: Dashboard,
});

type Station = {
  id: string; name: string; lot: string; capacity_mwh: number; capacity_mw: number | null;
  agency: string | null; ntpc_eic: string | null; pm_coordinator: string | null; sort_order: number | null;
  mdl_total: number;
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
  const stations = stationsQ.data ?? [];
  const stationIds = useMemo(() => stations.map(s => s.id), [stations]);
  const stationKey = stationIds.join("|");
  const tasksQ = useQuery({
    queryKey: ["l2_tasks", "by-station", stationKey],
    queryFn: () => fetchTasksByStation(stationIds),
    enabled: stationIds.length > 0,
  });
  const statusQ = useQuery({
    queryKey: ["all_status", "by-station", stationKey],
    queryFn: () => fetchStatusesByStation(stationIds),
    enabled: stationIds.length > 0,
  });
  const drawingsQ = useQuery({
    queryKey: ["all_drawings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_drawings").select("*");
      if (error) throw error;
      return data as StationDrawing[];
    },
  });
  const boiMasterQ = useQuery({
    queryKey: ["boi_master"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boi_master").select("id,sl_no,name,scheduled_po_date").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const boiStatusQ = useQuery({
    queryKey: ["all_boi_status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_boi_status").select("station_id,boi_id,actual_po_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const meetingsQ = useQuery({
    queryKey: ["all_meetings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("meetings").select("station_id,meeting_type,meeting_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const plansQ = useQuery({
    queryKey: ["all_meeting_plans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("meeting_plans").select("station_id,meeting_type,planned_date,title").eq("status", "planned");
      if (error) throw error;
      return data ?? [];
    },
  });
  const snapshotsQ = useQuery({
    queryKey: ["progress_snapshots"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("weekly_progress_snapshots").select("snapshot_date,station_id,pct").order("snapshot_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const complMasterQ = useQuery({
    queryKey: ["compl_master_mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_master").select("id,category,name").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const complStatusQ = useQuery({
    queryKey: ["all_compliance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_compliance").select("station_id,compliance_id,status");
      if (error) throw error;
      return data ?? [];
    },
  });
  const delaysQ = useQuery({
    queryKey: ["all_delays_mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delay_register").select("station_id,title,root_cause,corrective_action");
      if (error) throw error;
      return data ?? [];
    },
  });
  const issuesQ = useQuery({
    queryKey: ["all_issues_mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("issues").select("station_id,title,severity,status");
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = stationsQ.isLoading || tasksQ.isLoading || statusQ.isLoading;
  const tasksByStation = tasksQ.data ?? {};
  const statusByStation = statusQ.data ?? {};
  const tasks = useMemo(() => Object.values(tasksByStation).flat(), [tasksByStation]);

  const computed = useMemo(() => {
    return stations.map(s => {
      const map = buildStatusMap(statusByStation[s.id]);
      const p = stationProgress(tasksByStation[s.id] ?? [], map);
      let health: "green" | "amber" | "red" = "green";
      if (p.delayed > 0) health = p.delayed >= 5 ? "red" : "amber";
      return { ...s, ...p, health };
    });
  }, [stations, tasksByStation, statusByStation]);

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
      for (const t of tasksByStation[s.id] ?? []) {
        if (t.is_section) continue;
        const st = map.get(t.id);
        const cs = computeRowState(t, st, today);
        if (cs.plannedEnd && cs.plannedEnd >= today && cs.plannedEnd <= in30 && cs.pct < 100) upcoming += 1;
        if (cs.status === "delayed" || cs.status === "blocked") exceptions += 1;
      }
    }
    return { total, green, amber, red, totalMWh, avgPct, upcoming, exceptions };
  }, [computed, stations, tasksByStation, statusByStation]);

  const exceptions = useMemo(() => {
    const today = new Date();
    const list: Array<{ station: string; stationId: string; wbs: string; task: string; slip: number; planFinish: string; status: RowStatus; owner: string }> = [];
    for (const s of stations) {
      const map = buildStatusMap(statusByStation[s.id]);
      for (const t of tasksByStation[s.id] ?? []) {
        if (t.is_section) continue;
        const st = map.get(t.id);
        const cs = computeRowState(t, st, today);
        if (cs.status === "delayed" || cs.status === "blocked") {
          list.push({
            station: s.name, stationId: s.id, wbs: t.wbs_code, task: t.name,
            slip: cs.slipDays,
            planFinish: t.baseline_finish ? format(new Date(t.baseline_finish), "dd MMM yy") : "—",
            status: cs.status as RowStatus, owner: st?.owner ?? "—",
          });
        }
      }
    }
    // Station-wise: group by station, worst-overdue first within each station, busiest stations on top.
    list.sort((a, b) =>
      a.station.localeCompare(b.station) || b.slip - a.slip);
    const byStation = new Map<string, number>();
    for (const e of list) byStation.set(e.station, (byStation.get(e.station) ?? 0) + 1);
    return list
      .sort((a, b) => (byStation.get(b.station)! - byStation.get(a.station)!) || a.station.localeCompare(b.station) || b.slip - a.slip)
      .slice(0, 14);
  }, [stations, tasksByStation, statusByStation]);

  // Per-agency (awarded contractor) performance roll-up
  const agencyData = useMemo(() => {
    const m = new Map<string, { agency: string; stations: typeof computed; pctSum: number; delayed: number; green: number; amber: number; red: number }>();
    for (const s of computed) {
      const key = cleanAgency(s.agency);
      let e = m.get(key);
      if (!e) { e = { agency: key, stations: [], pctSum: 0, delayed: 0, green: 0, amber: 0, red: 0 }; m.set(key, e); }
      e.stations.push(s);
      e.pctSum += s.pct;
      e.delayed += s.delayed;
      e[s.health] += 1;
    }
    return Array.from(m.values())
      .map((e) => ({
        agency: e.agency,
        count: e.stations.length,
        avgPct: e.stations.length ? Math.round(e.pctSum / e.stations.length) : 0,
        delayed: e.delayed,
        green: e.green, amber: e.amber, red: e.red,
        names: e.stations.map((s) => s.name).join(", "),
      }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [computed]);

  // Clickable status cards → filter the station list
  const [healthFilter, setHealthFilter] = useState<"green" | "amber" | "red" | null>(null);
  const stationsRef = useRef<HTMLElement>(null);
  const onStatusCardClick = (h: "green" | "amber" | "red") => {
    setHealthFilter((cur) => (cur === h ? null : h));
    requestAnimationFrame(() => stationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const visibleStations = useMemo(
    () => (healthFilter ? computed.filter((s) => s.health === healthFilter) : computed),
    [computed, healthFilter]);

  const [capturing, setCapturing] = useState(false);
  const captureSnapshot = async () => {
    setCapturing(true);
    try {
      const res = await fetch("/api/public/hooks/weekly-snapshot", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Snapshot failed");
      toast.success(`Snapshot captured for ${json.stations} stations`);
      snapshotsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCapturing(false);
    }
  };

  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);

  const buildExtras = (): WeeklyPdfExtras => ({
    drawings: drawingsQ.data ?? [],
    boiMaster: boiMasterQ.data ?? [],
    boiStatus: boiStatusQ.data ?? [],
    meetings: meetingsQ.data ?? [],
    plans: plansQ.data ?? [],
    snapshots: snapshotsQ.data ?? [],
    complianceMaster: complMasterQ.data ?? [],
    complianceStatus: complStatusQ.data ?? [],
  });

  const buildNarrativeInput = (): MisNarrativeInput => {
    const today = new Date();
    const a = computePortfolioAnalytics(stations, tasks, statusByStation, today);
    // drawings overdue
    const drawingsOverdue = (drawingsQ.data ?? []).filter((d) => {
      if (d.submitted_date || d.resubmitted_date || d.approved_date || !d.sch_date) return false;
      return new Date(d.sch_date) < today;
    }).length;
    // BOI overdue
    const boiStatusMap = new Map((boiStatusQ.data ?? []).map((s: any) => [`${s.station_id}::${s.boi_id}`, s]));
    let boiOverdue = 0;
    for (const s of stations) for (const b of (boiMasterQ.data ?? [])) {
      if (!b.scheduled_po_date) continue;
      const st: any = boiStatusMap.get(`${s.id}::${b.id}`);
      if (st?.actual_po_date) continue;
      if (new Date(b.scheduled_po_date) < today) boiOverdue += 1;
    }
    // compliance pending
    const complMap = new Map((complStatusQ.data ?? []).map((c: any) => [`${c.station_id}::${c.compliance_id}`, c.status]));
    let compliancePending = 0;
    for (const s of stations) for (const m of (complMasterQ.data ?? [])) {
      const st = complMap.get(`${s.id}::${m.id}`);
      if (st !== "approved" && st !== "not_applicable") compliancePending += 1;
    }
    // remarks from task status
    const sn = new Map(stations.map((s) => [s.id, s.name]));
    const remarks: string[] = [];
    for (const arr of Object.values(statusByStation)) {
      for (const st of arr as Status[]) {
        if (st.remarks && st.remarks.trim()) remarks.push(`${sn.get(st.station_id) ?? ""}: ${st.remarks.trim()}`);
      }
    }
    const delays = (delaysQ.data ?? []).map((d: any) => ({
      station: sn.get(d.station_id) ?? "—",
      title: d.title ?? "",
      rootCause: d.root_cause ?? "",
      corrective: d.corrective_action ?? "",
    })).slice(0, 40);
    const issues = (issuesQ.data ?? []).map((i: any) => ({
      station: sn.get(i.station_id) ?? "—",
      title: i.title ?? "",
      severity: i.severity ?? "",
      status: i.status ?? "",
    })).slice(0, 40);

    return {
      asOf: format(today, "dd MMM yyyy"),
      totals: { ...a.totals },
      stations: a.stations.map((s) => ({
        name: s.name, agency: s.agency, pct: s.pct, ideal: s.ideal,
        delayed: s.delayed, forecastOverrunDays: s.forecastOverrunDays, health: s.health,
      })),
      exceptions: { l2Overdue: kpis.exceptions, drawingsOverdue, boiOverdue, compliancePending },
      remarks: remarks.slice(0, 60),
      delays,
      issues,
    };
  };

  const runWeeklyExport = async (kind: "pdf" | "docx") => {
    setExporting(kind);
    try {
      const extras: WeeklyPdfExtras = buildExtras();
      if (kind === "pdf") exportWeeklyPDF(stations, tasks, statusByStation, extras);
      else await exportWeeklyDOCX(stations, tasks, statusByStation, extras);
      toast.success(`Weekly MIS (${kind.toUpperCase()}) downloaded`, { id: "mis-export" });
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`, { id: "mis-export" });
    } finally {
      setExporting(null);
    }
  };


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
          <Button variant="outline" size="sm" disabled={loading} onClick={() => exportWeeklyMIS(stations, tasks, statusByStation)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Weekly MIS (Excel)
          </Button>
          <Button variant="outline" size="sm" disabled={capturing} onClick={captureSnapshot}>
            <Camera className="mr-2 h-4 w-4" /> {capturing ? "Capturing…" : "Capture Snapshot"}
          </Button>
          <Button variant="outline" size="sm" disabled={loading || exporting !== null} onClick={() => runWeeklyExport("docx")}>
            <FileType className="mr-2 h-4 w-4" /> {exporting === "docx" ? "Building…" : "Weekly MIS (Word)"}
          </Button>
          <Button size="sm" disabled={loading || exporting !== null} onClick={() => runWeeklyExport("pdf")}>
            <FileText className="mr-2 h-4 w-4" /> {exporting === "pdf" ? "Building…" : "Weekly MIS (PDF)"}
          </Button>


        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Battery className="h-4 w-4" />} label="Total Capacity" value={`${kpis.totalMWh.toLocaleString()}`} unit="MWh" tone="primary" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Avg. Progress" value={`${kpis.avgPct}`} unit="%" tone="primary" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="On Track" value={`${kpis.green}`} unit={`/ ${kpis.total}`} tone="green" onClick={() => onStatusCardClick("green")} active={healthFilter === "green"} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="At Risk" value={`${kpis.amber}`} unit="stations" tone="amber" onClick={() => onStatusCardClick("amber")} active={healthFilter === "amber"} />
        <Kpi icon={<Zap className="h-4 w-4" />} label="Delayed" value={`${kpis.red}`} unit="stations" tone="red" onClick={() => onStatusCardClick("red")} active={healthFilter === "red"} />
        <Kpi icon={<Calendar className="h-4 w-4" />} label="Due in 30 days" value={`${kpis.upcoming}`} unit="tasks" tone="primary" />
      </section>

      <section>
        <SectionHeading title="Portfolio Progress vs Delays" sub="Weighted % complete per station with delayed-task overlay · portfolio average shown as reference line" />
        <Card className="p-4">
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <ComposedChart
                data={computed.map(s => ({ name: s.name, pct: s.pct, remaining: Math.max(0, 100 - s.pct), delayed: s.delayed, health: s.health }))}
                margin={{ top: 16, right: 24, left: 0, bottom: 70 }}
                barCategoryGap="22%"
              >
                <defs>
                  <linearGradient id="gradProgress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.18 195)" stopOpacity={1} />
                    <stop offset="100%" stopColor="oklch(0.55 0.16 220)" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="gradRemaining" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--muted)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--muted)" stopOpacity={0.18} />
                  </linearGradient>
                  <linearGradient id="gradDelay" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.22 28)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="oklch(0.55 0.20 28)" stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={70} />
                <YAxis yAxisId="left" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} domain={[0, 100]} unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "oklch(0.72 0.22 28)", fontSize: 10 }} allowDecimals={false} label={{ value: "Delayed tasks", angle: 90, position: "insideRight", fill: "oklch(0.72 0.22 28)", fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => {
                    if (name === "Remaining") return [`${value}%`, "Remaining"];
                    if (name === "% Complete") return [`${value}%`, "% Complete"];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <ReferenceLine yAxisId="left" y={kpis.avgPct} stroke="var(--primary)" strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: `Portfolio avg ${kpis.avgPct}%`, fill: "var(--primary)", fontSize: 10, position: "insideTopRight" }} />
                <Bar yAxisId="left" dataKey="pct" name="% Complete" stackId="prog" fill="url(#gradProgress)" radius={[0, 0, 0, 0]}>
                  <LabelList dataKey="pct" position="insideTop" fill="var(--background)" fontSize={9} formatter={(v: number) => v >= 8 ? `${v}%` : ""} />
                </Bar>
                <Bar yAxisId="left" dataKey="remaining" name="Remaining" stackId="prog" fill="url(#gradRemaining)" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="delayed" name="Delayed tasks" fill="url(#gradDelay)" radius={[4, 4, 0, 0]} maxBarSize={14}>
                  <LabelList dataKey="delayed" position="top" fill="oklch(0.72 0.22 28)" fontSize={10} formatter={(v: number) => v > 0 ? v : ""} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <LegendDot grad="linear-gradient(180deg,oklch(0.78 0.18 195),oklch(0.55 0.16 220))" label="Physical % complete (weighted by duration)" />
            <LegendDot grad="var(--muted)" label="Remaining to 100%" />
            <LegendDot grad="linear-gradient(180deg,oklch(0.72 0.22 28),oklch(0.55 0.20 28))" label="Delayed leaf tasks" />
            <LegendDot grad="var(--primary)" label={`Portfolio avg ${kpis.avgPct}%`} dashed />
          </div>
        </Card>
      </section>

      <AgencyPerformance data={agencyData} />

      <section className="grid gap-6 xl:grid-cols-3" ref={stationsRef}>
        <div className="xl:col-span-2">
          <SectionHeading
            title={healthFilter ? `Stations — ${healthLabel(healthFilter)}` : "Stations"}
            sub={healthFilter ? `Showing ${visibleStations.length} ${healthLabel(healthFilter).toLowerCase()} station(s) · click a card to open the L2 Gantt` : `${stations.length} sites · Click any card to open the L2 Gantt`}
          />
          {healthFilter && (
            <button onClick={() => setHealthFilter(null)} className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
              Clear filter · show all {computed.length}
            </button>
          )}
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : visibleStations.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No stations in this status.</Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleStations.map(s => <StationCard key={s.id} s={s} />)}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <div>
            <SectionHeading title="Upcoming Meetings" sub="Planned reviews across stations · highlighted important dates" />
            <UpcomingMeetings />
          </div>
          <div>
            <SectionHeading title="Station-wise Exceptions" sub="Delayed & blocked activities grouped by station · days overdue against planned finish" />
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
                    <div className="mt-1 text-[11px] text-muted-foreground">Due {e.planFinish} · Owner: {e.owner}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={e.status} />
                    <div className="font-mono text-xs text-[color:var(--status-red)]" title="Days overdue against planned finish">
                      {e.slip > 0 ? `overdue ${e.slip}d` : "due"}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </Card>
          </div>
        </div>
      </section>

      <DrawingsSummary stations={stations} drawings={drawingsQ.data ?? []} />

      <BulkMisPanel stations={stations} tasks={tasks} statusByStation={statusByStation} />
    </div>
  );
}

function DrawingsSummary({ stations, drawings }: { stations: Station[]; drawings: StationDrawing[] }) {
  const byStation = useMemo(() => {
    const m = new Map<string, StationDrawing[]>();
    for (const d of drawings) (m.get(d.station_id) ?? m.set(d.station_id, []).get(d.station_id)!).push(d);
    return m;
  }, [drawings]);

  const perStation = useMemo(() =>
    stations.map((s) => ({ s, c: drawingCounts(s.mdl_total, byStation.get(s.id) ?? []) })),
    [stations, byStation]);

  const totals = useMemo(() => {
    let total = 0, submitted = 0, approved = 0, overdue = 0, upcoming = 0;
    for (const { c } of perStation) {
      total += c.total; submitted += c.submitted; approved += c.approved;
      overdue += c.overdue; upcoming += c.upcoming;
    }
    const pending = Math.max(0, total - approved);
    return {
      total, submitted, approved, pending, overdue, upcoming,
      submittedPct: total ? Math.round((submitted / total) * 100) : 0,
      approvedPct: total ? Math.round((approved / total) * 100) : 0,
    };
  }, [perStation]);

  const attention = useMemo(
    () => perStation.filter((x) => x.c.overdue > 0 || x.c.upcoming > 0)
      .sort((a, b) => b.c.overdue - a.c.overdue || b.c.upcoming - a.c.upcoming),
    [perStation]);

  return (
    <section>
      <SectionHeading title="Drawings — MDL Status" sub="Portfolio submission & approval against the Master Drawing List · open the Drawings page for station & category detail" />
      <Card className="p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <MdlStat label="Total MDL" value={totals.total} tone="var(--primary)" />
            <MdlStat label="Submitted" value={totals.submitted} sub={`${totals.submittedPct}%`} tone="var(--status-blue)" />
            <MdlStat label="Approved" value={totals.approved} sub={`${totals.approvedPct}%`} tone="var(--status-green)" />
            <MdlStat label="Pending" value={totals.pending} tone="var(--status-amber)" />
            <MdlStat label="Due, not cleared" value={totals.overdue} tone="var(--status-red)" />
            <MdlStat label="Upcoming · 2 mo" value={totals.upcoming} tone="#8b5cf6" />
          </div>
          <Link to="/drawings" className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm transition-colors hover:border-primary/40 hover:text-primary">
            <FileStack className="h-4 w-4" /> View all drawings <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div style={{ width: `${totals.approvedPct}%`, background: "var(--status-green)" }} />
            <div style={{ width: `${Math.max(0, totals.submittedPct - totals.approvedPct)}%`, background: "var(--status-blue)" }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "var(--status-green)" }} /> Approved</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "var(--status-blue)" }} /> Submitted (awaiting approval)</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "var(--muted)" }} /> Pending</span>
          </div>
        </div>

        {attention.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Drawings needing attention — by station
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {attention.map(({ s, c }) => (
                <Link
                  key={s.id}
                  to="/stations/$stationId"
                  params={{ stationId: s.id }}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs transition-colors hover:border-primary/40"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="flex items-center gap-3 font-mono">
                    <span style={{ color: "var(--status-red)" }} title="Overdue, not cleared">{c.overdue} overdue</span>
                    <span style={{ color: "#8b5cf6" }} title="Due within next 2 months">{c.upcoming} due</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function MdlStat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: tone }}>{value.toLocaleString()}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </div>
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

function LegendDot({ grad, label, dashed }: { grad: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: grad, border: dashed ? "1px dashed var(--primary)" : undefined, backgroundImage: dashed ? "none" : undefined }} />
      <span>{label}</span>
    </span>
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

function cleanAgency(a: string | null): string {
  if (!a) return "Unassigned";
  return a.replace(/,\s*\d+\s*$/, "").trim() || "Unassigned";
}

function healthLabel(h: "green" | "amber" | "red"): string {
  return h === "green" ? "On Track" : h === "amber" ? "At Risk" : "Delayed";
}

type AgencyRow = { agency: string; count: number; avgPct: number; delayed: number; green: number; amber: number; red: number; names: string };

function AgencyPerformance({ data }: { data: AgencyRow[] }) {
  if (data.length === 0) return null;
  const avgAll = Math.round(data.reduce((a, d) => a + d.avgPct * d.count, 0) / Math.max(1, data.reduce((a, d) => a + d.count, 0)));
  return (
    <section>
      <SectionHeading title="Agency Performance" sub="Average physical progress by awarded EPC contractor · delayed-task load overlaid · portfolio average as reference" />
      <Card className="p-4">
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 80 }} barCategoryGap="28%">
              <defs>
                <linearGradient id="gradAgency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.18 195)" stopOpacity={1} />
                  <stop offset="100%" stopColor="oklch(0.55 0.16 220)" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="agency" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={80} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
              <Tooltip
                cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => name === "Avg progress" ? [`${value}%`, name] : [value, name]}
                labelFormatter={(label: string) => {
                  const row = data.find((d) => d.agency === label);
                  return row ? `${label} · ${row.count} station(s)\n${row.names}` : label;
                }}
              />
              <ReferenceLine y={avgAll} stroke="var(--primary)" strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: `avg ${avgAll}%`, fill: "var(--primary)", fontSize: 10, position: "insideTopRight" }} />
              <Bar dataKey="avgPct" name="Avg progress" fill="url(#gradAgency)" radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="avgPct" position="top" fill="var(--foreground)" fontSize={11} formatter={(v: number) => `${v}%`} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <div key={d.agency} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{d.agency}</div>
                <div className="truncate text-[10px] text-muted-foreground">{d.names}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 font-mono">
                <span style={{ color: "var(--primary)" }}>{d.avgPct}%</span>
                {d.delayed > 0 && <span style={{ color: "var(--status-red)" }} title="Delayed tasks">{d.delayed}⚠</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function Kpi({ icon, label, value, unit, tone, onClick, active }: { icon: React.ReactNode; label: string; value: string; unit?: string; tone: "primary" | "green" | "amber" | "red"; onClick?: () => void; active?: boolean }) {
  const colorVar = tone === "primary" ? "var(--primary)" : `var(--status-${tone})`;
  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden p-4 ${onClick ? "cursor-pointer transition-all hover:border-primary/40 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_25%,transparent)]" : ""}`}
      style={active ? { boxShadow: `0 0 0 1.5px ${colorVar}`, borderColor: colorVar } : undefined}
    >
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: colorVar }} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: colorVar }}>{icon}</span>{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: colorVar }}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {onClick && <div className="mt-1 text-[10px] text-muted-foreground">{active ? "Filtering ↓" : "Click to filter ↓"}</div>}
    </Card>
  );
}

function StationCard({ s }: { s: Station & ReturnType<typeof stationProgress> & { health: "green" | "amber" | "red" } }) {
  const tone = `var(--status-${s.health})`;
  return (
    <Link to="/stations/$stationId" params={{ stationId: s.id }}>
      <Card className="group relative overflow-hidden p-3.5 transition-all hover:border-primary/40 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_30%,transparent)]">
        <div className="absolute inset-y-0 left-0 w-1" style={{ background: tone }} />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold tracking-tight">{s.name}</h3>
              <Badge variant="outline" className="text-[10px] font-medium">{s.lot}</Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{Number(s.capacity_mwh).toLocaleString()} MWh</span>
              {s.capacity_mw && <span className="font-mono">{Number(s.capacity_mw)} MW</span>}
            </div>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <Progress value={s.pct} className="h-1.5" />
          <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: tone }}>{s.pct}%</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{s.completed}/{s.total} tasks</span>
          {s.delayed > 0 && <span className="rounded-full px-2 py-0.5" style={{ background: `color-mix(in oklab, var(--status-red) 18%, transparent)`, color: "var(--status-red)" }}>{s.delayed} delayed</span>}
        </div>
      </Card>
    </Link>
  );
}
