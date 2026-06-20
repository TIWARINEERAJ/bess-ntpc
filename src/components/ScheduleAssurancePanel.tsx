import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtD } from "@/lib/gantt-utils";
import type { L2Task, Status } from "@/lib/gantt-utils";
import type { CpmResult } from "@/lib/cpm";
import { assessDCMA, simulateRisk, type RiskResult } from "@/lib/cpm-advanced";
import { ShieldCheck, Dice5, Check, X, Activity, Gauge } from "lucide-react";

type Props = {
  tasks: L2Task[];
  statusMap: Map<string, Status>;
  cpm: CpmResult;
  onFocusTask?: (taskId: string) => void;
};

/** Enterprise schedule assurance: DCMA 14-point quality check + Monte Carlo risk. */
export function ScheduleAssurancePanel({ tasks, statusMap, cpm, onFocusTask }: Props) {
  const today = useMemo(() => new Date(), []);
  const dcma = useMemo(() => assessDCMA(tasks, statusMap, cpm, today), [tasks, statusMap, cpm, today]);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [running, setRunning] = useState(false);

  if (!cpm.hasNetwork) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No schedule logic available for assurance checks.
      </Card>
    );
  }

  const runRisk = () => {
    setRunning(true);
    // defer so the spinner can paint before the synchronous simulation
    setTimeout(() => {
      setRisk(simulateRisk(tasks, statusMap, cpm, today, 1000));
      setRunning(false);
    }, 30);
  };

  const scoreTone = dcma.score >= 90 ? "var(--status-green)" : dcma.score >= 70 ? "var(--status-amber)" : "var(--status-red)";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-sidebar/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Schedule Assurance — DCMA & Risk</span>
          <Badge variant="outline" className="text-[10px]">Enterprise</Badge>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="font-mono" style={{ color: scoreTone }}>DCMA {dcma.passCount}/{dcma.total} · {dcma.score}%</span>
        </div>
      </div>

      <Tabs defaultValue="dcma" className="p-3">
        <TabsList>
          <TabsTrigger value="dcma">DCMA 14-Point</TabsTrigger>
          <TabsTrigger value="risk">Monte Carlo Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="dcma" className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
            <Stat icon={<Gauge className="h-3.5 w-3.5" />} label="Quality Score" value={`${dcma.score}%`} color={scoreTone} />
            <Stat icon={<Activity className="h-3.5 w-3.5" />} label="CPLI" value={dcma.cpli.toFixed(2)} color={dcma.cpli >= 0.95 ? "var(--status-green)" : "var(--status-red)"} />
            <Stat icon={<Activity className="h-3.5 w-3.5" />} label="BEI" value={dcma.bei.toFixed(2)} color={dcma.bei >= 0.95 ? "var(--status-green)" : "var(--status-red)"} />
          </div>
          <div className="space-y-1.5">
            {dcma.checks.map((c) => (
              <div key={c.key} className="rounded-md border border-border/60 bg-card/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  {c.pass
                    ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--status-green)" }} />
                    : <X className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--status-red)" }} />}
                  <span className="flex-1 text-xs font-medium">{c.label}</span>
                  <span className="font-mono text-[11px]" style={{ color: c.pass ? "var(--foreground)" : "var(--status-red)" }}>{c.value}</span>
                  <Badge variant="outline" className="text-[9px]">{c.target}</Badge>
                </div>
                <div className="mt-0.5 pl-5 text-[11px] text-muted-foreground">{c.detail}</div>
                {!c.pass && c.offenders.length > 0 && onFocusTask && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-5">
                    {c.offenders.slice(0, 12).map((id) => {
                      const a = cpm.byId.get(id);
                      return (
                        <button key={id} onClick={() => onFocusTask(id)}
                          className="rounded border border-border/60 bg-secondary/40 px-1.5 py-0.5 text-[10px] hover:border-primary/50">
                          {a?.wbs ?? id.slice(0, 6)}
                        </button>
                      );
                    })}
                    {c.offenders.length > 12 && <span className="text-[10px] text-muted-foreground">+{c.offenders.length - 12} more</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="risk" className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Runs 1,000 simulations varying remaining durations (triangular 0.9×–1.6×) through the network logic to forecast finish-date confidence.
            </p>
            <Button size="sm" onClick={runRisk} disabled={running}>
              <Dice5 className="mr-2 h-3.5 w-3.5" />
              {running ? "Simulating…" : risk ? "Re-run" : "Run simulation"}
            </Button>
          </div>

          {risk?.ran && (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
                <Stat label="P10 (best)" value={fmtD(risk.p10)} />
                <Stat label="P50 (likely)" value={fmtD(risk.p50)} color="var(--status-amber)" />
                <Stat label="P80 (commit)" value={fmtD(risk.p80)} color="var(--status-red)" />
                <Stat label="P90 (worst)" value={fmtD(risk.p90)} color="var(--status-red)" />
              </div>
              <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Probability of meeting baseline finish ({fmtD(risk.baselineFinish)})</span>
                  <span className="font-mono font-bold" style={{ color: risk.probOnTime >= 0.5 ? "var(--status-green)" : "var(--status-red)" }}>
                    {(risk.probOnTime * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full" style={{ width: `${risk.probOnTime * 100}%`, background: risk.probOnTime >= 0.5 ? "var(--status-green)" : "var(--status-red)" }} />
                </div>
              </div>
              <Histogram risk={risk} />
              <p className="text-[11px] text-muted-foreground">
                Recommend committing to the <b>P80</b> date ({fmtD(risk.p80)}) — there is an 80% chance the L2 finishes on or before it.
              </p>
            </>
          )}
          {!risk && !running && (
            <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              Click "Run simulation" to compute probabilistic finish dates.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function Histogram({ risk }: { risk: RiskResult }) {
  const max = Math.max(1, ...risk.histogram.map((h) => h.count));
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finish-date distribution</div>
      <div className="flex items-end gap-1" style={{ height: 90 }}>
        {risk.histogram.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${fmtD(h.date)} — ${h.count} runs`}>
            <div className="w-full rounded-t bg-primary/70" style={{ height: `${(h.count / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{fmtD(risk.histogram[0]?.date)}</span>
        <span>{fmtD(risk.histogram[risk.histogram.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon?: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon && <span style={{ color: color ?? "var(--primary)" }}>{icon}</span>}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-bold" style={{ color: color ?? "var(--foreground)" }}>{value}</div>
    </div>
  );
}
