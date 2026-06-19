import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtD } from "@/lib/gantt-utils";
import type { L2Task, Status } from "@/lib/gantt-utils";
import {
  computeCPM, driverChain, CONSTRAINT_LABELS, WEEKDAY_LABELS, DEFAULT_CALENDAR,
  type CpmResult, type WorkCalendar, type ActivityConstraint, type ConstraintType, type WhatIf,
} from "@/lib/cpm";
import {
  Activity, CalendarClock, GitBranch, TriangleAlert, ChevronRight, FlaskConical,
  CalendarDays, Lock, RotateCcw, Clipboard, Check,
} from "lucide-react";

type Props = {
  tasks: L2Task[];
  statusMap: Map<string, Status>;
  stationName?: string;
  showCritical: boolean;
  onToggleCritical: () => void;
  onFocusTask?: (taskId: string) => void;
};

/** Primavera-grade scheduling workbench: exceptions, baseline vs actual,
 *  what-if scenarios, driver drill-down, and constraints/calendars. */
export function SchedulePrimaveraPanel({
  tasks, statusMap, stationName, showCritical, onToggleCritical, onFocusTask,
}: Props) {
  const [calendar, setCalendar] = useState<WorkCalendar>(DEFAULT_CALENDAR);
  const [constraints, setConstraints] = useState<Record<string, ActivityConstraint>>({});
  const [whatIf, setWhatIf] = useState<WhatIf>({ durDelta: {}, startSet: {} });

  const today = useMemo(() => new Date(), []);

  // Baseline reference forecast (no scenario tweaks) and the live scenario.
  const baseCpm = useMemo(() => computeCPM(tasks, statusMap, today), [tasks, statusMap, today]);
  const scenarioActive = useMemo(
    () => calendar.enabled || Object.keys(constraints).length > 0
      || Object.keys(whatIf.durDelta).length > 0 || Object.keys(whatIf.startSet).length > 0,
    [calendar, constraints, whatIf],
  );
  const cpm = useMemo(
    () => computeCPM(tasks, statusMap, today, { calendar, constraints, whatIf }),
    [tasks, statusMap, today, calendar, constraints, whatIf],
  );

  if (!baseCpm.hasNetwork) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No schedule logic (predecessors/baseline) available to compute the critical path.
      </Card>
    );
  }

  const late = cpm.overrunDays > 0;
  const tone = cpm.overrunDays > 14 ? "var(--status-red)" : cpm.overrunDays > 0 ? "var(--status-amber)" : "var(--status-green)";
  const scenarioDelta = cpm.overrunDays - baseCpm.overrunDays;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-sidebar/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Schedule Analytics — Critical Path & Forecast</span>
          <Badge variant="outline" className="text-[10px]">Primavera engine</Badge>
          {scenarioActive && <Badge className="text-[10px]" style={{ background: "var(--status-amber)", color: "#000" }}>What-if active</Badge>}
        </div>
        <Button size="sm" variant={showCritical ? "default" : "outline"} onClick={onToggleCritical}>
          <Activity className="mr-2 h-3.5 w-3.5" />
          {showCritical ? "Hide critical path" : "Highlight critical path"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-5">
        <Metric icon={<CalendarClock className="h-3.5 w-3.5" />} label="Baseline Finish" value={fmtD(cpm.baselineFinish)} />
        <Metric icon={<CalendarClock className="h-3.5 w-3.5" />} label="Forecast Finish" value={fmtD(cpm.forecastFinish)} color={tone} />
        <Metric
          icon={<TriangleAlert className="h-3.5 w-3.5" />}
          label="Schedule Variance"
          value={`${late ? "+" : ""}${cpm.overrunDays}d ${late ? "over" : cpm.overrunDays < 0 ? "ahead" : "on time"}`}
          color={tone}
        />
        <Metric icon={<GitBranch className="h-3.5 w-3.5" />} label="Critical Activities" value={`${cpm.criticalCount}`} />
        <Metric
          icon={<FlaskConical className="h-3.5 w-3.5" />}
          label="Scenario Δ"
          value={scenarioActive ? `${scenarioDelta > 0 ? "+" : ""}${scenarioDelta}d` : "—"}
          color={scenarioDelta > 0 ? "var(--status-red)" : scenarioDelta < 0 ? "var(--status-green)" : undefined}
        />
      </div>

      <Tabs defaultValue="exceptions" className="p-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="exceptions">MIS Exceptions</TabsTrigger>
          <TabsTrigger value="baseline">Baseline vs Actual</TabsTrigger>
          <TabsTrigger value="drivers">Driver Drill-down</TabsTrigger>
          <TabsTrigger value="whatif">What-if Scenario</TabsTrigger>
          <TabsTrigger value="calendar">Constraints & Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="exceptions" className="mt-3">
          <ExceptionsView cpm={cpm} stationName={stationName} onFocusTask={onFocusTask} />
        </TabsContent>
        <TabsContent value="baseline" className="mt-3">
          <BaselineActualView cpm={cpm} onFocusTask={onFocusTask} />
        </TabsContent>
        <TabsContent value="drivers" className="mt-3">
          <DriverDrillView cpm={cpm} onFocusTask={onFocusTask} />
        </TabsContent>
        <TabsContent value="whatif" className="mt-3">
          <WhatIfView
            cpm={cpm} baseCpm={baseCpm} whatIf={whatIf} setWhatIf={setWhatIf}
            scenarioDelta={scenarioDelta}
          />
        </TabsContent>
        <TabsContent value="calendar" className="mt-3">
          <CalendarConstraintsView
            cpm={cpm} calendar={calendar} setCalendar={setCalendar}
            constraints={constraints} setConstraints={setConstraints}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

/* ----------------------------- MIS Exceptions ----------------------------- */
function ExceptionsView({ cpm, stationName, onFocusTask }: { cpm: CpmResult; stationName?: string; onFocusTask?: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const exceptionText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`MIS Schedule Exception — ${stationName ?? "Station"}`);
    lines.push(`Baseline finish: ${fmtD(cpm.baselineFinish)} | Forecast finish: ${fmtD(cpm.forecastFinish)} | Overrun: ${cpm.overrunDays > 0 ? "+" : ""}${cpm.overrunDays}d`);
    lines.push("Top critical-path components driving the slip:");
    cpm.drivers.slice(0, 8).forEach((d, i) => lines.push(`  ${i + 1}. [${d.wbs}] ${d.name} — +${d.slipDays}d (${d.cause})`));
    if (cpm.violations.length) {
      lines.push("Constraint violations:");
      cpm.violations.slice(0, 8).forEach((v) => lines.push(`  • [${v.wbs}] ${v.name} — ${CONSTRAINT_LABELS[v.type]} breached by ${v.lateDays}d`));
    }
    return lines.join("\n");
  }, [cpm, stationName]);

  const copy = () => {
    navigator.clipboard?.writeText(exceptionText).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Top schedule overrun & responsible critical-path components
        </div>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Clipboard className="mr-2 h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy MIS note"}
        </Button>
      </div>

      {cpm.drivers.length === 0 ? (
        <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
          The L2 is forecast to finish on or ahead of the baseline — no critical-path slip.
        </div>
      ) : (
        <div className="space-y-1.5">
          {cpm.drivers.slice(0, 10).map((d, i) => (
            <button
              key={d.id}
              onClick={() => onFocusTask?.(d.id)}
              className="flex w-full items-center gap-3 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-left text-xs hover:border-primary/50 hover:bg-secondary/40"
            >
              <span className="w-4 shrink-0 text-center font-mono text-[10px] text-muted-foreground">{i + 1}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{d.wbs}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
              <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{d.cause}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold"
                style={{ background: "color-mix(in oklab, var(--status-red) 16%, transparent)", color: "var(--status-red)" }}
              >+{d.slipDays}d</span>
            </button>
          ))}
        </div>
      )}

      {cpm.violations.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Constraint violations</div>
          <div className="space-y-1.5">
            {cpm.violations.slice(0, 8).map((v) => (
              <button key={v.id} onClick={() => onFocusTask?.(v.id)} className="flex w-full items-center gap-3 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-left text-xs hover:border-primary/50">
                <Lock className="h-3 w-3 shrink-0" style={{ color: "var(--status-amber)" }} />
                <span className="font-mono text-[10px] text-muted-foreground">{v.wbs}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{v.name}</span>
                <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{CONSTRAINT_LABELS[v.type]} · due {fmtD(v.constraintDate)}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold" style={{ background: "color-mix(in oklab, var(--status-amber) 18%, transparent)", color: "var(--status-amber)" }}>+{v.lateDays}d</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Baseline vs Actual --------------------------- */
function BaselineActualView({ cpm, onFocusTask }: { cpm: CpmResult; onFocusTask?: (id: string) => void }) {
  const [onlyVariance, setOnlyVariance] = useState(true);
  const rows = useMemo(() => {
    let list = [...cpm.byId.values()].filter((a) => !a.isSection);
    if (onlyVariance) list = list.filter((a) => a.slipDays !== 0);
    return list.sort((a, b) => b.slipDays - a.slipDays);
  }, [cpm, onlyVariance]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Baseline vs Actual / Forecast</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={onlyVariance} onCheckedChange={setOnlyVariance} /> Variance only
        </label>
      </div>
      <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 360 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sidebar/70 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">WBS</th>
              <th className="px-2 py-1.5 text-left">Activity</th>
              <th className="px-2 py-1.5 text-left">Base Start</th>
              <th className="px-2 py-1.5 text-left">Base Finish</th>
              <th className="px-2 py-1.5 text-left">Act/Fcst Start</th>
              <th className="px-2 py-1.5 text-left">Forecast Finish</th>
              <th className="px-2 py-1.5 text-right">Var</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">No variance against baseline.</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} onClick={() => onFocusTask?.(a.id)} className="cursor-pointer border-t border-border/40 hover:bg-secondary/40">
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{a.wbs}</td>
                <td className="px-2 py-1.5">
                  <span className="line-clamp-1">{a.name}</span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{fmtD(a.baselineStart)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{fmtD(a.baselineFinish)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{fmtD(a.actualStart ?? a.forecastStart)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]" style={{ color: a.slipDays > 0 ? "var(--status-red)" : "var(--status-green)" }}>{fmtD(a.actualFinish ?? a.forecastFinish)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-[10px] font-semibold" style={{ color: a.slipDays > 0 ? "var(--status-red)" : a.slipDays < 0 ? "var(--status-green)" : "var(--muted-foreground)" }}>
                  {a.slipDays > 0 ? `+${a.slipDays}d` : `${a.slipDays}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------- Driver drill-down --------------------------- */
function DriverDrillView({ cpm, onFocusTask }: { cpm: CpmResult; onFocusTask?: (id: string) => void }) {
  const drivers = cpm.drivers;
  const [sel, setSel] = useState<string | null>(drivers[0]?.id ?? null);
  const chain = useMemo(() => (sel ? driverChain(cpm.byId, sel) : []), [cpm, sel]);

  if (drivers.length === 0) {
    return <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">No driving activities — forecast meets baseline.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-[260px_1fr]">
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Driving activities</div>
        {drivers.slice(0, 12).map((d) => (
          <button key={d.id} onClick={() => setSel(d.id)}
            className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${sel === d.id ? "border-primary bg-primary/10" : "border-border/60 hover:bg-secondary/40"}`}>
            <span className="font-mono text-[10px] text-muted-foreground">{d.wbs}</span>
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="shrink-0 font-mono text-[10px] font-semibold" style={{ color: "var(--status-red)" }}>+{d.slipDays}d</span>
          </button>
        ))}
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Driving predecessor chain (root cause path)
        </div>
        <div className="space-y-1">
          {chain.map((a, i) => (
            <div key={a.id} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <button onClick={() => onFocusTask?.(a.id)}
                className="flex flex-1 items-center gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-left text-xs hover:border-primary/50">
                <span className="font-mono text-[10px] text-muted-foreground">{a.wbs}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{a.pct}%</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmtD(a.forecastFinish)}</span>
                <span className="shrink-0 font-mono text-[10px] font-semibold" style={{ color: a.slipDays > 0 ? "var(--status-red)" : "var(--status-green)" }}>
                  {a.slipDays > 0 ? `+${a.slipDays}d` : `${a.slipDays}d`}
                </span>
              </button>
            </div>
          ))}
          {chain.length === 0 && <div className="text-xs text-muted-foreground">Select a driving activity to trace its chain.</div>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- What-if ---------------------------------- */
function WhatIfView({
  cpm, baseCpm, whatIf, setWhatIf, scenarioDelta,
}: {
  cpm: CpmResult; baseCpm: CpmResult; whatIf: WhatIf; setWhatIf: (w: WhatIf) => void; scenarioDelta: number;
}) {
  const activities = useMemo(
    () => [...baseCpm.byId.values()].filter((a) => !a.isSection)
      .sort((a, b) => b.slipDays - a.slipDays),
    [baseCpm],
  );
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const tweaked = activities.filter((a) => whatIf.durDelta[a.id] != null || whatIf.startSet[a.id] != null);
    const base = q ? activities.filter((a) => a.name.toLowerCase().includes(q) || a.wbs.includes(q)) : activities.slice(0, 14);
    return Array.from(new Map([...tweaked, ...base].map((a) => [a.id, a])).values());
  }, [activities, query, whatIf]);

  const setDur = (id: string, v: string) => {
    const d = { ...whatIf.durDelta };
    if (v === "" || v === "0") delete d[id]; else d[id] = parseInt(v, 10) || 0;
    setWhatIf({ ...whatIf, durDelta: d });
  };
  const setStart = (id: string, v: string) => {
    const s = { ...whatIf.startSet };
    if (!v) delete s[id]; else s[id] = v;
    setWhatIf({ ...whatIf, startSet: s });
  };
  const reset = () => setWhatIf({ durDelta: {}, startSet: {} });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Adjust activity durations / starts and see the live finish impact
        </div>
        <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-3.5 w-3.5" />Reset scenario</Button>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-center">
        <div className="bg-card px-3 py-2"><div className="text-[10px] uppercase text-muted-foreground">Baseline forecast</div><div className="font-mono text-sm font-bold">{fmtD(baseCpm.forecastFinish)}</div></div>
        <div className="bg-card px-3 py-2"><div className="text-[10px] uppercase text-muted-foreground">Scenario forecast</div><div className="font-mono text-sm font-bold" style={{ color: scenarioDelta > 0 ? "var(--status-red)" : scenarioDelta < 0 ? "var(--status-green)" : undefined }}>{fmtD(cpm.forecastFinish)}</div></div>
        <div className="bg-card px-3 py-2"><div className="text-[10px] uppercase text-muted-foreground">Impact</div><div className="font-mono text-sm font-bold" style={{ color: scenarioDelta > 0 ? "var(--status-red)" : scenarioDelta < 0 ? "var(--status-green)" : undefined }}>{scenarioDelta > 0 ? `+${scenarioDelta}d` : `${scenarioDelta}d`}</div></div>
      </div>

      <Input placeholder="Search activities to adjust…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 text-xs" />

      <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 300 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sidebar/70 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">WBS</th>
              <th className="px-2 py-1.5 text-left">Activity</th>
              <th className="px-2 py-1.5 text-left">Δ Duration (d)</th>
              <th className="px-2 py-1.5 text-left">Force Start</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="border-t border-border/40">
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{a.wbs}</td>
                <td className="px-2 py-1.5"><span className="line-clamp-1">{a.name}</span></td>
                <td className="px-2 py-1.5">
                  <Input type="number" value={whatIf.durDelta[a.id] ?? ""} onChange={(e) => setDur(a.id, e.target.value)} placeholder="0" className="h-7 w-20 text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="date" value={whatIf.startSet[a.id] ?? ""} onChange={(e) => setStart(a.id, e.target.value)} className="h-7 w-36 text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------- Constraints & calendar --------------------------- */
function CalendarConstraintsView({
  cpm, calendar, setCalendar, constraints, setConstraints,
}: {
  cpm: CpmResult;
  calendar: WorkCalendar; setCalendar: (c: WorkCalendar) => void;
  constraints: Record<string, ActivityConstraint>; setConstraints: (c: Record<string, ActivityConstraint>) => void;
}) {
  const activities = useMemo(() => [...cpm.byId.values()].filter((a) => !a.isSection), [cpm]);
  const [query, setQuery] = useState("");
  const [holInput, setHolInput] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const set = activities.filter((a) => constraints[a.id]);
    const base = q ? activities.filter((a) => a.name.toLowerCase().includes(q) || a.wbs.includes(q)) : activities.slice(0, 12);
    return Array.from(new Map([...set, ...base].map((a) => [a.id, a])).values());
  }, [activities, query, constraints]);

  const toggleWorkday = (i: number) => {
    const wd = [...calendar.workdays]; wd[i] = !wd[i];
    setCalendar({ ...calendar, workdays: wd });
  };
  const addHoliday = () => {
    if (!holInput || calendar.holidays.includes(holInput)) return;
    setCalendar({ ...calendar, holidays: [...calendar.holidays, holInput].sort() });
    setHolInput("");
  };
  const removeHoliday = (h: string) => setCalendar({ ...calendar, holidays: calendar.holidays.filter((x) => x !== h) });

  const setConstraintType = (id: string, raw: string) => {
    const type = (raw === "none" ? "" : raw) as ConstraintType;
    const c = { ...constraints };
    if (type === "") delete c[id]; else c[id] = { type, date: c[id]?.date ?? null };
    setConstraints(c);
  };
  const setConstraintDate = (id: string, date: string) => {
    const c = { ...constraints };
    c[id] = { type: c[id]?.type ?? "SNET", date: date || null };
    setConstraints(c);
  };

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Work calendar
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={calendar.enabled} onCheckedChange={(v) => setCalendar({ ...calendar, enabled: v })} />
            {calendar.enabled ? "Working-day mode" : "Calendar-day mode"}
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((d, i) => (
            <button key={d} disabled={!calendar.enabled} onClick={() => toggleWorkday(i)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${calendar.workdays[i] ? "border-primary bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Holidays</div>
          <div className="flex items-center gap-2">
            <Input type="date" value={holInput} onChange={(e) => setHolInput(e.target.value)} disabled={!calendar.enabled} className="h-7 w-40 text-xs" />
            <Button size="sm" variant="outline" disabled={!calendar.enabled} onClick={addHoliday}>Add</Button>
          </div>
          {calendar.holidays.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {calendar.holidays.map((h) => (
                <button key={h} onClick={() => removeHoliday(h)} className="rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[10px] hover:border-status-red">
                  {fmtD(h)} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Constraints */}
      <div className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Activity constraints
        </div>
        <Input placeholder="Search activities to constrain…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-2 h-8 text-xs" />
        <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 280 }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-sidebar/70 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">WBS</th>
                <th className="px-2 py-1.5 text-left">Activity</th>
                <th className="px-2 py-1.5 text-left">Constraint</th>
                <th className="px-2 py-1.5 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const c = constraints[a.id];
                return (
                  <tr key={a.id} className="border-t border-border/40">
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{a.wbs}</td>
                    <td className="px-2 py-1.5"><span className="line-clamp-1">{a.name}</span></td>
                    <td className="px-2 py-1.5">
                      <Select value={c?.type ?? ""} onValueChange={(v) => setConstraintType(a.id, v as ConstraintType)}>
                        <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(CONSTRAINT_LABELS) as ConstraintType[]).map((t) => (
                            <SelectItem key={t || "none"} value={t || "none-x"} disabled={t === ""}>{CONSTRAINT_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="date" value={c?.date ?? ""} onChange={(e) => setConstraintDate(a.id, e.target.value)} disabled={!c} className="h-7 w-36 text-xs" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
