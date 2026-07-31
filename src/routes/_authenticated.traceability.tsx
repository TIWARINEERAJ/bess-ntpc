import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Network, ArrowRight, CheckCircle2, CircleDashed, FileStack, ListChecks, Package } from "lucide-react";
import { fetchAllDrawings, isApproved, isSubmitted, type StationDrawing } from "@/lib/drawings";
import { fetchAllStationTasks, fetchAllTaskStatuses } from "@/lib/task-data";
import { buildBoiLinks, classifyBoi, type BoiLite } from "@/lib/boi-links";
import { fmtD } from "@/lib/gantt-utils";
import type { L2Task, Status } from "@/lib/gantt-utils";

export const Route = createFileRoute("/_authenticated/traceability")({
  head: () => ({
    meta: [
      { title: "BOI → MDL → L2 Traceability — NTPC BESS" },
      { name: "description", content: "Drill down from any BOI equipment item to its mapped MDL drawings, L2 schedule activities, dates and completion evidence." },
      { property: "og:title", content: "BOI → MDL → L2 Traceability — NTPC BESS" },
      { property: "og:description", content: "Click a BOI item to trace its drawings, ordering activity, schedule dates and completion evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TraceabilityPage,
});

type StationRow = { id: string; name: string; lot: string; sort_order: number | null };
type BoiRow = { id: string; station_id: string; name: string; sort_order: number; inspection_category: string | null; scheduled_po_date: string | null };
type BoiStatusRow = {
  boi_id: string; station_id: string; actual_po_date: string | null; delivery_date: string | null;
  site_receipt_date: string | null; committed_date: string | null; inspection_status: string | null;
  drawings_status: string | null; remarks: string | null;
};

function pct(n: number, d: number) { return d ? Math.round((n / d) * 100) : 0; }

function TraceabilityPage() {
  const [stationId, setStationId] = useState<string | null>(null);
  const [boiId, setBoiId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const stationsQ = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("id,name,lot,sort_order").order("sort_order").order("name");
      if (error) throw error;
      return data as StationRow[];
    },
  });
  const boiQ = useQuery({
    queryKey: ["boi_master_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boi_master").select("id,station_id,name,sort_order,inspection_category,scheduled_po_date").order("station_id").order("sort_order");
      if (error) throw error;
      return data as BoiRow[];
    },
  });
  const boiStatusQ = useQuery({
    queryKey: ["boi_status_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_boi_status").select("boi_id,station_id,actual_po_date,delivery_date,site_receipt_date,committed_date,inspection_status,drawings_status,remarks");
      if (error) throw error;
      return data as BoiStatusRow[];
    },
  });
  const drawingsQ = useQuery({ queryKey: ["all_drawings"], queryFn: fetchAllDrawings });
  const tasksQ = useQuery({ queryKey: ["all_l2_tasks"], queryFn: fetchAllStationTasks });
  const statusQ = useQuery({ queryKey: ["all_task_status"], queryFn: fetchAllTaskStatuses });

  const loading = stationsQ.isLoading || boiQ.isLoading || drawingsQ.isLoading || tasksQ.isLoading;

  const stations = stationsQ.data ?? [];
  const activeStation = stationId ?? stations[0]?.id ?? null;

  const bois = useMemo(() => (boiQ.data ?? []).filter((b) => b.station_id === activeStation), [boiQ.data, activeStation]);
  const drawings = useMemo(() => (drawingsQ.data ?? []).filter((d) => d.station_id === activeStation), [drawingsQ.data, activeStation]);
  const tasks = useMemo(() => (tasksQ.data ?? []).filter((t) => t.station_id === activeStation), [tasksQ.data, activeStation]);
  const statusByTask = useMemo(() => {
    const m = new Map<string, Status>();
    for (const s of (statusQ.data ?? []) as Status[]) if (s.station_id === activeStation) m.set(s.task_id, s);
    return m;
  }, [statusQ.data, activeStation]);
  const statusByBoi = useMemo(() => {
    const m = new Map<string, BoiStatusRow>();
    for (const s of boiStatusQ.data ?? []) if (s.station_id === activeStation) m.set(s.boi_id, s);
    return m;
  }, [boiStatusQ.data, activeStation]);

  const links = useMemo(
    () => buildBoiLinks(bois.map((b): BoiLite => ({ id: b.id, name: b.name })), drawings, tasks),
    [bois, drawings, tasks],
  );

  const filteredBois = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? bois.filter((b) => b.name.toLowerCase().includes(s)) : bois;
  }, [bois, q]);

  const activeBoi = useMemo(
    () => filteredBois.find((b) => b.id === boiId) ?? filteredBois[0] ?? null,
    [filteredBois, boiId],
  );
  const activeLink = activeBoi ? links.get(activeBoi.id) : undefined;

  const linkedDwgs: StationDrawing[] = useMemo(() => {
    if (!activeLink) return [];
    const ids = new Set(activeLink.drawings.map((d) => d.id));
    return drawings.filter((d) => ids.has(d.id));
  }, [activeLink, drawings]);

  // Every L2 activity whose name classifies to the same BESS concept (not only the PO one).
  const linkedTasks: L2Task[] = useMemo(() => {
    if (!activeLink?.concept) return [];
    const extra = tasks.filter((t) => !t.is_section && classifyBoi(t.name) === activeLink.concept);
    const all = activeLink.poTask ? [activeLink.poTask, ...extra.filter((t) => t.id !== activeLink.poTask!.id)] : extra;
    return all;
  }, [activeLink, tasks]);

  if (loading) {
    return <div className="space-y-3 p-4 md:p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  const stationName = stations.find((s) => s.id === activeStation)?.name ?? "—";
  const dwgApproved = linkedDwgs.filter(isApproved).length;
  const dwgSubmitted = linkedDwgs.filter(isSubmitted).length;
  const taskDone = linkedTasks.filter((t) => statusByTask.get(t.id)?.status === "completed").length;
  const boiStat = activeBoi ? statusByBoi.get(activeBoi.id) : undefined;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary"><Network className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-semibold">BOI → MDL → L2 Traceability</h1>
          <p className="text-xs text-muted-foreground">Click any BOI item to trace its drawings, ordering activity, dates and completion evidence.</p>
        </div>
      </div>

      {/* Station selector */}
      <div className="flex flex-wrap gap-1.5">
        {stations.map((s) => (
          <button
            key={s.id}
            onClick={() => { setStationId(s.id); setBoiId(null); }}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${s.id === activeStation ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* BOI list */}
        <Card className="p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Package className="h-4 w-4 text-primary" /> BOI Items ({filteredBois.length})</div>
          <Input placeholder="Search BOI item…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8 text-xs" />
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {filteredBois.map((b) => {
              const l = links.get(b.id);
              const dw = l?.drawings.length ?? 0;
              const ap = drawings.filter((d) => l?.drawings.some((x) => x.id === d.id) && isApproved(d)).length;
              const sel = activeBoi?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setBoiId(b.id)}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${sel ? "border-primary bg-primary/10" : "border-transparent hover:bg-secondary"}`}
                >
                  <div className="font-medium leading-snug">{b.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><FileStack className="h-3 w-3" />{ap}/{dw} dwg</span>
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" />{l?.poTask ? "PO linked" : "no PO task"}</span>
                  </div>
                  {dw > 0 && <Progress value={pct(ap, dw)} className="mt-1 h-1" />}
                </button>
              );
            })}
            {filteredBois.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No BOI items.</div>}
          </div>
        </Card>

        {/* Drilldown */}
        <div className="space-y-4">
          {!activeBoi ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Select a BOI item to see its traceability chain.</Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{stationName}</Badge>
                  <h2 className="text-base font-semibold">{activeBoi.name}</h2>
                  {activeLink?.concept && <Badge className="bg-primary/15 text-primary">{activeLink.concept.replace(/_/g, " ")}</Badge>}
                  <Link to="/stations/$stationId" params={{ stationId: activeStation! }} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Open station <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Mapped drawings" value={`${linkedDwgs.length}`} sub={`${dwgSubmitted} submitted · ${dwgApproved} approved`} />
                  <Metric label="Drawing approval" value={`${pct(dwgApproved, linkedDwgs.length)}%`} sub={linkedDwgs.length ? `${dwgApproved} of ${linkedDwgs.length}` : "no mapped drawings"} />
                  <Metric label="Scheduled ordering" value={fmtD(activeLink?.orderFinish ?? activeBoi.scheduled_po_date)} sub={activeLink?.poTask?.name ?? "no linked L2 PO activity"} />
                  <Metric label="Actual PO" value={fmtD(boiStat?.actual_po_date ?? null)} sub={boiStat?.delivery_date ? `Delivery ${fmtD(boiStat.delivery_date)}` : "delivery pending"} />
                </div>
              </Card>

              {/* MDL */}
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium"><FileStack className="h-4 w-4 text-primary" /> Mapped MDL Drawings ({linkedDwgs.length})</div>
                <div className="max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Drg Ref</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>CAT</TableHead>
                        <TableHead>Sch. Sub</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedDwgs.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="whitespace-nowrap font-mono text-[11px]">{d.drg_ref}</TableCell>
                          <TableCell className="max-w-[280px] text-xs">{d.drg_desc}</TableCell>
                          <TableCell className="text-xs">{d.category}</TableCell>
                          <TableCell className="text-xs">{d.cat ?? "—"}</TableCell>
                          <TableCell className="text-xs">{fmtD(d.sch_date)}</TableCell>
                          <TableCell className="text-xs">{fmtD(d.submitted_date ?? d.resubmitted_date)}</TableCell>
                          <TableCell className="text-xs">{fmtD(d.approved_date)}</TableCell>
                          <TableCell>
                            {isApproved(d)
                              ? <Badge className="gap-1 bg-emerald-500/15 text-emerald-500"><CheckCircle2 className="h-3 w-3" />Approved</Badge>
                              : isSubmitted(d)
                                ? <Badge variant="outline" className="gap-1"><CircleDashed className="h-3 w-3" />Under review</Badge>
                                : <Badge variant="outline" className="text-muted-foreground">Pending</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                      {linkedDwgs.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">No MDL drawings map to this BOI item.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {/* L2 */}
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium"><ListChecks className="h-4 w-4 text-primary" /> Linked L2 Activities ({linkedTasks.length}) · {taskDone} completed</div>
                <div className="max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>WBS</TableHead>
                        <TableHead>Activity</TableHead>
                        <TableHead>Baseline Start</TableHead>
                        <TableHead>Baseline Finish</TableHead>
                        <TableHead>Actual Start</TableHead>
                        <TableHead>Actual Finish</TableHead>
                        <TableHead>%</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedTasks.map((t) => {
                        const st = statusByTask.get(t.id);
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="whitespace-nowrap font-mono text-[11px]">{t.wbs_code}</TableCell>
                            <TableCell className="max-w-[280px] text-xs">{t.name}</TableCell>
                            <TableCell className="text-xs">{fmtD(t.baseline_start)}</TableCell>
                            <TableCell className="text-xs">{fmtD(t.baseline_finish)}</TableCell>
                            <TableCell className="text-xs">{fmtD(st?.actual_start ?? null)}</TableCell>
                            <TableCell className="text-xs">{fmtD(st?.actual_finish ?? null)}</TableCell>
                            <TableCell className="text-xs">{st?.percent_complete ?? 0}%</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px] capitalize">{(st?.status ?? "not_started").replace(/_/g, " ")}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                      {linkedTasks.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="py-6 text-center text-xs text-muted-foreground">No L2 activity maps to this BOI item.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {/* Evidence */}
              <Card className="p-4">
                <div className="mb-2 text-sm font-medium">Completion Evidence</div>
                <ul className="space-y-1.5 text-xs">
                  <Evidence ok={linkedDwgs.length > 0 && dwgApproved === linkedDwgs.length}
                    text={`Engineering: ${dwgApproved}/${linkedDwgs.length} mapped drawings approved (CAT-I/II/REL)`} />
                  <Evidence ok={!!boiStat?.actual_po_date}
                    text={boiStat?.actual_po_date ? `Ordering: PO placed on ${fmtD(boiStat.actual_po_date)}` : "Ordering: PO not yet placed"} />
                  <Evidence ok={!!boiStat?.delivery_date} text={boiStat?.delivery_date ? `Delivery: ${fmtD(boiStat.delivery_date)}` : "Delivery: pending"} />
                  <Evidence ok={!!boiStat?.site_receipt_date} text={boiStat?.site_receipt_date ? `Site receipt: ${fmtD(boiStat.site_receipt_date)}` : "Site receipt: pending"} />
                  <Evidence ok={linkedTasks.length > 0 && taskDone === linkedTasks.length}
                    text={`Schedule: ${taskDone}/${linkedTasks.length} linked L2 activities completed`} />
                  {boiStat?.inspection_status && <Evidence ok={/clear|complete|done/i.test(boiStat.inspection_status)} text={`Inspection: ${boiStat.inspection_status}`} />}
                  {boiStat?.remarks && <li className="text-muted-foreground">Remarks: {boiStat.remarks}</li>}
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Evidence({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className={ok ? "" : "text-muted-foreground"}>{text}</span>
    </li>
  );
}
