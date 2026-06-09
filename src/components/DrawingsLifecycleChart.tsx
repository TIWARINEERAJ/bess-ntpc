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
import { Activity, TrendingUp, AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { drawingMonthlySeries, type StationDrawing } from "@/lib/drawings";

/* ------------------------------------------------------------------ */
/* Palette (semantic design tokens)                                    */
/* ------------------------------------------------------------------ */
const C = {
  due: "var(--status-grey)",
  submitted: "var(--status-blue)",
  approved: "var(--status-green)",
  catIII: "var(--status-red)",
  cumDue: "var(--muted-foreground)",
  cumSub: "var(--primary)",
  slippage: "var(--status-amber)",
};

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as ReturnType<typeof drawingMonthlySeries>[number];
  const subRate = row.due ? Math.round((row.submitted / row.due) * 100) : null;
  const items: { k: string; v: number; c: string }[] = [
    { k: "Due to submit", v: row.due, c: C.due },
    { k: "Submitted (actual)", v: row.submitted, c: C.submitted },
    { k: "Approved", v: row.approved, c: C.approved },
    { k: "CAT-III (re-submit)", v: row.catIII, c: C.catIII },
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
          <span className="text-muted-foreground">Cumulative submitted</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: C.cumSub }}>{row.cumSubmitted}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Cumulative due</span>
          <span className="font-mono tabular-nums">{row.cumDue}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Slippage (backlog)</span>
          <span className="font-mono font-semibold tabular-nums" style={{ color: C.slippage }}>{row.slippage}</span>
        </div>
        {subRate !== null && (
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">On-time submission</span>
            <span className="font-mono tabular-nums">{subRate}%</span>
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

export function DrawingsLifecycleChart({
  rows,
  title = "Drawings (MDL) Lifecycle — Month-wise Flow",
  subtitle = "Scheduled vs actual submissions, approvals, re-submissions and cumulative slippage",
  height = 420,
}: {
  rows: StationDrawing[];
  title?: string;
  subtitle?: string;
  height?: number;
}) {
  const series = useMemo(() => drawingMonthlySeries(rows), [rows]);

  const insight = useMemo(() => {
    if (series.length === 0) return null;
    const last = series[series.length - 1];
    const totalSubmitted = last.cumSubmitted;
    const totalApproved = last.cumApproved;
    const totalCatIII = series.reduce((a, b) => a + b.catIII, 0);
    const subRate = last.cumDue ? Math.round((totalSubmitted / last.cumDue) * 100) : 0;
    const apprRate = totalSubmitted ? Math.round((totalApproved / totalSubmitted) * 100) : 0;
    const rejRate = totalSubmitted ? Math.round((totalCatIII / totalSubmitted) * 100) : 0;
    // peak slippage month
    const peak = series.reduce((m, b) => (b.slippage > m.slippage ? b : m), series[0]);
    return { last, totalSubmitted, totalApproved, totalCatIII, subRate, apprRate, rejRate, peak };
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
            {series.length} months · {insight.last.cumDue} due · {insight.totalSubmitted} submitted
          </Badge>
        )}
      </div>

      {series.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No dated drawings yet to plot the lifecycle.
        </div>
      ) : (
        <>
          {insight && (
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
              <InsightStat icon={<TrendingUp className="h-4 w-4" />} label="Submission rate" value={`${insight.subRate}%`} sub={`${insight.totalSubmitted} of ${insight.last.cumDue} due`} color={C.submitted} />
              <InsightStat icon={<CheckCircle2 className="h-4 w-4" />} label="Approval rate" value={`${insight.apprRate}%`} sub={`${insight.totalApproved} approved (CAT I/II)`} color={C.approved} />
              <InsightStat icon={<RotateCcw className="h-4 w-4" />} label="Re-submission (CAT-III)" value={`${insight.rejRate}%`} sub={`${insight.totalCatIII} returned`} color={C.catIII} />
              <InsightStat icon={<AlertTriangle className="h-4 w-4" />} label="Current slippage" value={`${insight.last.slippage}`} sub="cumulative backlog" color={C.slippage} />
              <InsightStat icon={<AlertTriangle className="h-4 w-4" />} label="Peak slippage" value={`${insight.peak.slippage}`} sub={`in ${insight.peak.label}`} color={C.slippage} />
            </div>
          )}

          <div style={{ width: "100%", height }}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} barCategoryGap="18%">
                <defs>
                  <linearGradient id="dl-slip" x1="0" y1="0" x2="0" y2="1">
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

                {/* Slippage as a soft area on the cumulative axis */}
                <Area yAxisId="right" type="monotone" dataKey="slippage" name="Slippage (backlog)" stroke={C.slippage} strokeWidth={1.5} fill="url(#dl-slip)" dot={false} activeDot={{ r: 3 }} />

                {/* Monthly bars */}
                <Bar yAxisId="left" dataKey="due" name="Due to submit" fill={C.due} radius={[3, 3, 0, 0]} maxBarSize={22} fillOpacity={0.55} />
                <Bar yAxisId="left" dataKey="submitted" name="Submitted (actual)" fill={C.submitted} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="left" dataKey="approved" name="Approved" fill={C.approved} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="left" dataKey="catIII" name="CAT-III (re-submit)" fill={C.catIII} radius={[3, 3, 0, 0]} maxBarSize={22} />

                {/* Cumulative lines */}
                <Line yAxisId="right" type="monotone" dataKey="cumDue" name="Cumulative due" stroke={C.cumDue} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="cumSubmitted" name="Cumulative submitted" stroke={C.cumSub} strokeWidth={2.5} dot={{ r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
