import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, TrendingDown, TrendingUp, Clock, Activity } from "lucide-react";
import { buildStatusMap, computeSCurve, type SCurveResult } from "@/lib/gantt-utils";
import { fetchStatusesByStation, fetchTasksByStation } from "@/lib/task-data";
import { format } from "date-fns";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, Area, ComposedChart } from "recharts";

export const Route = createFileRoute("/_authenticated/schedule-health")({
  head: () => ({ meta: [{ title: "Schedule Health — NTPC BESS L2 Monitor" }] }),
  component: ScheduleHealth,
});

type Station = { id: string; name: string; lot: string; sort_order: number | null };

function ScheduleHealth() {
  const stationsQ = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("id,name,lot,sort_order").order("sort_order").order("name");
      if (error) throw error;
      return data as Station[];
    },
  });
  const stations = stationsQ.data ?? [];
  const stationIds = useMemo(() => stations.map((s) => s.id), [stations]);
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

  const loading = stationsQ.isLoading || tasksQ.isLoading || statusQ.isLoading;
  const tasksByStation = tasksQ.data ?? {};
  const statusByStation = statusQ.data ?? {};

  const curves = useMemo(() => {
    const today = new Date();
    return stations.map((s) => {
      const map = buildStatusMap(statusByStation[s.id]);
      const curve = computeSCurve(tasksByStation[s.id] ?? [], map, today);
      return { station: s, curve };
    });
  }, [stations, tasksByStation, statusByStation]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = curves.find((c) => c.station.id === (selectedId ?? curves[0]?.station.id)) ?? curves[0];

  const kpis = useMemo(() => {
    const behind = curves.filter((c) => c.curve.daysBehind > 0);
    const worst = [...curves].sort((a, b) => b.curve.daysBehind - a.curve.daysBehind)[0];
    const avgBehind = behind.length ? Math.round(behind.reduce((a, c) => a + c.curve.daysBehind, 0) / behind.length) : 0;
    const onTrack = curves.filter((c) => c.curve.daysBehind <= 0).length;
    return { behindCount: behind.length, avgBehind, worst, onTrack, total: curves.length };
  }, [curves]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <section>
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Schedule Performance</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Time Deviation vs Ideal Timeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          S-curve of actual progress against the ideal baseline (critical-path) timeline per station. The horizontal gap between the
          curves is the schedule slippage in days · As of {format(new Date(), "dd MMM yyyy")}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<TrendingDown className="h-4 w-4" />} label="Behind Schedule" value={`${kpis.behindCount}`} unit={`/ ${kpis.total}`} tone="red" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="On / Ahead" value={`${kpis.onTrack}`} unit="stations" tone="green" />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Avg. Slippage" value={`${kpis.avgBehind}`} unit="days" tone="amber" />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Worst Slippage" value={kpis.worst ? `${Math.max(0, kpis.worst.curve.daysBehind)}` : "0"} unit={kpis.worst?.station.name ?? "—"} tone="red" />
      </section>

      {loading ? (
        <Skeleton className="h-[420px]" />
      ) : (
        <>
          <section>
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Station Detail S-Curve</h2>
                  <p className="text-xs text-muted-foreground">Ideal (baseline) vs actual cumulative % complete</p>
                </div>
                <div className="flex items-center gap-3">
                  {selected && <SlippageBadge curve={selected.curve} />}
                  <Select value={selected?.station.id} onValueChange={setSelectedId}>
                    <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select station" /></SelectTrigger>
                    <SelectContent>
                      {curves.map((c) => (
                        <SelectItem key={c.station.id} value={c.station.id}>{c.station.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selected && <BigSCurve curve={selected.curve} />}
              {selected && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                  <Metric label="Ideal % to date" value={`${selected.curve.plannedNow}%`} />
                  <Metric label="Actual % to date" value={`${selected.curve.actualNow}%`} tone={selected.curve.actualNow < selected.curve.plannedNow ? "red" : "green"} />
                  <Metric label="Schedule slippage" value={selected.curve.daysBehind > 0 ? `${selected.curve.daysBehind}d behind` : `${-selected.curve.daysBehind}d ahead`} tone={selected.curve.daysBehind > 0 ? "red" : "green"} />
                  <Metric label="Forecast finish overrun" value={selected.curve.finishForecastDays > 0 ? `+${selected.curve.finishForecastDays}d` : "On time"} tone={selected.curve.finishForecastDays > 0 ? "red" : "green"} />
                </div>
              )}
            </Card>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold tracking-tight">All Stations</h2>
              <p className="text-xs text-muted-foreground">Mini S-curves · click to open the station L2 Gantt</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {curves.map((c) => (
                <MiniSCurveCard key={c.station.id} name={c.station.name} lot={c.station.lot} curve={c.curve} stationId={c.station.id} onFocus={() => setSelectedId(c.station.id)} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function tone(daysBehind: number) {
  if (daysBehind > 30) return "var(--status-red)";
  if (daysBehind > 0) return "var(--status-amber)";
  return "var(--status-green)";
}

function SlippageBadge({ curve }: { curve: SCurveResult }) {
  const c = tone(curve.daysBehind);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: `color-mix(in oklab, ${c} 16%, transparent)`, color: c }}>
      {curve.daysBehind > 0 ? `${curve.daysBehind} days behind` : curve.daysBehind < 0 ? `${-curve.daysBehind} days ahead` : "On schedule"}
    </span>
  );
}

function BigSCurve({ curve }: { curve: SCurveResult }) {
  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <ComposedChart data={curve.points} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <defs>
            <linearGradient id="idealFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} unit="%" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number, n: string) => [v == null ? "—" : `${v}%`, n]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
          <ReferenceLine y={curve.actualNow} stroke="var(--status-amber)" strokeDasharray="3 3" strokeOpacity={0.5} />
          <Area type="monotone" dataKey="planned" name="Ideal (baseline)" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 4" fill="url(#idealFill)" dot={false} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke="oklch(0.72 0.22 28)" strokeWidth={2.5} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniSCurveCard({ name, lot, curve, stationId, onFocus }: { name: string; lot: string; curve: SCurveResult; stationId: string; onFocus: () => void }) {
  const c = tone(curve.daysBehind);
  return (
    <Card className="p-3">
      <div className="mb-1 flex items-start justify-between gap-2">
        <button onClick={onFocus} className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            <Badge variant="outline" className="text-[10px]">{lot}</Badge>
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: c }}>
            {curve.daysBehind > 0 ? `${curve.daysBehind}d behind` : curve.daysBehind < 0 ? `${-curve.daysBehind}d ahead` : "On schedule"}
            <span className="text-muted-foreground"> · {curve.actualNow}% / {curve.plannedNow}%</span>
          </div>
        </button>
        <Link to="/stations/$stationId" params={{ stationId }} className="text-muted-foreground hover:text-primary">
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div style={{ width: "100%", height: 130 }}>
        <ResponsiveContainer>
          <LineChart data={curve.points} margin={{ top: 6, right: 6, left: -28, bottom: 0 }}>
            <YAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 8 }} width={28} />
            <XAxis dataKey="date" hide />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number, n: string) => [v == null ? "—" : `${v}%`, n]}
            />
            <Line type="monotone" dataKey="planned" name="Ideal" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="oklch(0.72 0.22 28)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Kpi({ icon, label, value, unit, tone: t }: { icon: React.ReactNode; label: string; value: string; unit?: string; tone: "primary" | "green" | "amber" | "red" }) {
  const colorVar = t === "primary" ? "var(--primary)" : `var(--status-${t})`;
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: colorVar }} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: colorVar }}>{icon}</span>{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-bold tabular-nums" style={{ color: colorVar }}>{value}</span>
        {unit && <span className="truncate text-xs text-muted-foreground">{unit}</span>}
      </div>
    </Card>
  );
}

function Metric({ label, value, tone: t }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div className="rounded-md border border-border/60 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold" style={{ color: t ? `var(--status-${t})` : undefined }}>{value}</div>
    </div>
  );
}
