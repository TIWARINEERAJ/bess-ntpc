import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtD } from "@/lib/gantt-utils";
import type { CpmResult } from "@/lib/cpm";
import { Activity, CalendarClock, GitBranch, TriangleAlert } from "lucide-react";

/** Primavera-style critical-path & finish-forecast summary for one station's L2. */
export function CpmForecastPanel({
  cpm,
  showCritical,
  onToggleCritical,
  onFocusTask,
}: {
  cpm: CpmResult;
  showCritical: boolean;
  onToggleCritical: () => void;
  onFocusTask?: (taskId: string) => void;
}) {
  if (!cpm.hasNetwork) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No schedule logic (predecessors/baseline) available to compute the critical path.
      </Card>
    );
  }
  const late = cpm.overrunDays > 0;
  const tone = cpm.overrunDays > 14 ? "var(--status-red)" : cpm.overrunDays > 0 ? "var(--status-amber)" : "var(--status-green)";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-sidebar/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Critical Path & Finish Forecast (CPM)</span>
          <Badge variant="outline" className="text-[10px]">Primavera engine</Badge>
        </div>
        <Button size="sm" variant={showCritical ? "default" : "outline"} onClick={onToggleCritical}>
          <Activity className="mr-2 h-3.5 w-3.5" />
          {showCritical ? "Hide critical path" : "Highlight critical path"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        <Metric icon={<CalendarClock className="h-3.5 w-3.5" />} label="Baseline Finish" value={fmtD(cpm.baselineFinish)} />
        <Metric icon={<CalendarClock className="h-3.5 w-3.5" />} label="Forecast Finish" value={fmtD(cpm.forecastFinish)} color={tone} />
        <Metric
          icon={<TriangleAlert className="h-3.5 w-3.5" />}
          label="Schedule Variance"
          value={`${late ? "+" : ""}${cpm.overrunDays}d ${late ? "over" : cpm.overrunDays < 0 ? "ahead" : "on time"}`}
          color={tone}
        />
        <Metric icon={<GitBranch className="h-3.5 w-3.5" />} label="Critical Activities" value={`${cpm.criticalCount}`} />
      </div>

      <div className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Driving activities responsible for the slip
        </div>
        {cpm.drivers.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
            The L2 is forecast to finish on or ahead of the baseline — no critical-path slip.
          </div>
        ) : (
          <div className="space-y-1.5">
            {cpm.drivers.slice(0, 8).map((d) => (
              <button
                key={d.id}
                onClick={() => onFocusTask?.(d.id)}
                className="flex w-full items-center gap-3 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-left text-xs hover:border-primary/50 hover:bg-secondary/40"
              >
                <span className="font-mono text-[10px] text-muted-foreground">{d.wbs}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{d.cause}</span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{ background: "color-mix(in oklab, var(--status-red) 16%, transparent)", color: "var(--status-red)" }}
                >
                  +{d.slipDays}d
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: color ?? "var(--primary)" }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-bold" style={{ color: color ?? "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}
