import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  type TooltipProps,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, Truck, PackageCheck, AlertTriangle } from "lucide-react";
import { boiMonthlySeries, type BoiLifecycleRow } from "@/lib/boi-lifecycle";

/* ------------------------------------------------------------------ */
/* Palette (semantic design tokens)                                    */
/* ------------------------------------------------------------------ */
const C = {
  due: "var(--status-grey)",
  ordered: "var(--status-blue)",
  delivered: "var(--status-amber)",
  received: "var(--status-green)",
  cumDue: "var(--muted-foreground)",
  cumOrd: "var(--primary)",
  slippage: "var(--status-red)",
};

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as ReturnType<typeof boiMonthlySeries>[number];
  const ordRate = row.due ? Math.round((row.ordered / row.due) * 100) : null;
  const items: { k: string; v: number; c: string }[] = [
    { k: "Due to order (sched PO)", v: row.due, c: C.due },
    { k: "PO placed (actual)", v: row.ordered, c: C.ordered },
    { k: "Delivered / dispatched", v: row.delivered, c: C.delivered },
    { k: "Received at site", v: row.received, c: C.received },
  ];
  return (
    <div className="rounded-lg border border-border bg-card/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur">
      <div className="mb-1.5 font-semibold tracking-tight">{label}</div>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.k} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: it.c }} /> {it.k}
            </span>
            <span className="font-mono font-semibold tabular-nums">{it.v}</span>
          </div>
        ))}
        <div className="my-1 border-t border-border/60" />
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Cumulative ordered</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: C.cumOrd }}>{row.cumOrdered}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Cumulative due</span>
          <span className="font-mono tabular-nums">{row.cumDue}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Slippage (backlog)</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: C.slippage }}>{row.slippage}</span>
        </div>
        {ordRate !== null && (
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">On-time ordering</span>
            <span className="font-mono tabular-nums">{ordRate}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function InsightStat({
  icon, label, value, sub, color,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-card/40 px-3 py-2.5">
      <span className="mt-0.5 shrink-0" style={{ color }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-mono text-lg font-bold leading-tight" style={{ color }}>{value}</div>
        {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

export function BoiLifecycleChart({
  rows,
  title = "BOI Status Lifecycle — Month-wise Flow",
  subtitle = "Scheduled vs actual PO placement, delivery, site receipt and cumulative slippage",
  height = 420,
}: {
  rows: BoiLifecycleRow[];
  title?: string;
  subtitle?: string;
  height?: number;
}) {
  const series = useMemo(() => boiMonthlySeries(rows), [rows]);

  const insight = useMemo(() => {
    if (series.length === 0) return null;
    const last = series[series.length - 1];
    const totalOrdered = last.cumOrdered;
    const totalDelivered = last.cumDelivered;
    const totalReceived = last.cumReceived;
    const ordRate = last.cumDue ? Math.round((totalOrdered / last.cumDue) * 100) : 0;
    const delRate = totalOrdered ? Math.round((totalDelivered / totalOrdered) * 100) : 0;
    const recRate = totalOrdered ? Math.round((totalReceived / totalOrdered) * 100) : 0;
    const peak = series.reduce((m, b) => (b.slippage > m.slippage ? b : m), series[0]);
    return { last, totalOrdered, totalDelivered, totalReceived, ordRate, delRate, recRate, peak };
  }, [series]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Activity className="h-4 w-4 text-primary" /> {title}
          </h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {insight && (
          <Badge variant="outline" className="text-[10px]">
            {series.length} months · {insight.last.cumDue} due · {insight.totalOrdered} ordered
          </Badge>
        )}
      </div>

      {series.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No dated BOI items yet to plot the lifecycle.
        </div>
      ) : (
        <>
          {insight && (
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
              <InsightStat icon={<TrendingUp className="h-4 w-4" />} label="Ordering rate" value={`${insight.ordRate}%`} sub={`${insight.totalOrdered} of ${insight.last.cumDue} due`} color={C.ordered} />
              <InsightStat icon={<Truck className="h-4 w-4" />} label="Delivery rate" value={`${insight.delRate}%`} sub={`${insight.totalDelivered} delivered`} color={C.delivered} />
              <InsightStat icon={<PackageCheck className="h-4 w-4" />} label="Site receipt" value={`${insight.recRate}%`} sub={`${insight.totalReceived} received`} color={C.received} />
              <InsightStat icon={<AlertTriangle className="h-4 w-4" />} label="Current slippage" value={`${insight.last.slippage}`} sub="cumulative backlog" color={C.slippage} />
              <InsightStat icon={<AlertTriangle className="h-4 w-4" />} label="Peak slippage" value={`${insight.peak.slippage}`} sub={`in ${insight.peak.label}`} color={C.slippage} />
            </div>
          )}

          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} barCategoryGap="18%">
                <defs>
                  <linearGradient id="boi-slip" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.slippage} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.slippage} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                <YAxis yAxisId="left" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} allowDecimals={false} tickLine={false} axisLine={false} label={{ value: "Per month", angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 10, dy: 30 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} allowDecimals={false} tickLine={false} axisLine={false} label={{ value: "Cumulative", angle: 90, position: "insideRight", fill: "var(--muted-foreground)", fontSize: 10, dy: -28 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "color-mix(in oklab, var(--primary) 7%, transparent)" }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />

                <Area yAxisId="right" type="monotone" dataKey="slippage" name="Slippage (backlog)" stroke={C.slippage} strokeWidth={1.5} fill="url(#boi-slip)" dot={false} activeDot={{ r: 3 }} />

                <Bar yAxisId="left" dataKey="due" name="Due to order" fill={C.due} radius={[3, 3, 0, 0]} maxBarSize={22} fillOpacity={0.55} />
                <Bar yAxisId="left" dataKey="ordered" name="PO placed (actual)" fill={C.ordered} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="left" dataKey="delivered" name="Delivered" fill={C.delivered} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="left" dataKey="received" name="Received at site" fill={C.received} radius={[3, 3, 0, 0]} maxBarSize={22} />

                <Line yAxisId="right" type="monotone" dataKey="cumDue" name="Cumulative due" stroke={C.cumDue} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="cumOrdered" name="Cumulative ordered" stroke={C.cumOrd} strokeWidth={2.5} dot={{ r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
