import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X, FileSpreadsheet, ExternalLink } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { buildStatusMap, computeRowState, stationProgress, type L2Task, type Status } from "@/lib/gantt-utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/_authenticated/weekly-planner")({
  head: () => ({ meta: [{ title: "Weekly Review Planner — NTPC BESS" }] }),
  component: WeeklyPlanner,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function WeeklyPlanner() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekKey = format(weekStart, "yyyy-MM-dd");

  const stationsQ = useQuery({ queryKey: ["stations"], queryFn: async () => {
    const { data, error } = await supabase.from("stations").select("*").order("sort_order").order("name");
    if (error) throw error; return data;
  }});
  const planQ = useQuery({ queryKey: ["weekly_plan", weekKey], queryFn: async () => {
    const { data, error } = await supabase.from("weekly_review_plan").select("*").eq("week_start_date", weekKey);
    if (error) throw error; return data;
  }});
  const tasksQ = useQuery({ queryKey: ["l2_tasks"], queryFn: async () => {
    const { data, error } = await supabase.from("l2_tasks").select("*").order("sort_order");
    if (error) throw error; return data as L2Task[];
  }});
  const statusQ = useQuery({ queryKey: ["all_status"], queryFn: async () => {
    const { data, error } = await supabase.from("station_task_status").select("*");
    if (error) throw error; return data as Status[];
  }});

  const stations = stationsQ.data ?? [];
  const plan = planQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const allStatus = statusQ.data ?? [];

  const statusByStation = useMemo(() => {
    const o: Record<string, Status[]> = {};
    for (const r of allStatus) (o[r.station_id] ??= []).push(r);
    return o;
  }, [allStatus]);

  const assign = useMutation({
    mutationFn: async ({ day, slot, stationId }: { day: number; slot: number; stationId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("weekly_review_plan").upsert(
        { week_start_date: weekKey, day_of_week: day, slot, station_id: stationId, created_by: user?.id ?? null },
        { onConflict: "week_start_date,day_of_week,slot" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly_plan", weekKey] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("weekly_review_plan").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly_plan", weekKey] }),
  });
  const noteSave = useMutation({
    mutationFn: async ({ id, agenda_notes }: { id: string; agenda_notes: string }) => {
      const { error } = await supabase.from("weekly_review_plan").update({ agenda_notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly_plan", weekKey] }),
  });

  const slotItem = (day: number, slot: number) => plan.find(p => p.day_of_week === day && p.slot === slot);
  const stationById = (id: string) => stations.find(s => s.id === id);

  const exportPlan = () => {
    const wb = XLSX.utils.book_new();
    const rows: Array<Record<string, string>> = [];
    for (let d = 0; d < 7; d++) {
      for (let s = 0; s < 3; s++) {
        const item = slotItem(d, s); if (!item) continue;
        const st = stationById(item.station_id); if (!st) continue;
        const m = buildStatusMap(statusByStation[st.id]);
        const p = stationProgress(tasks, m);
        rows.push({ Date: format(addDays(weekStart, d), "dd-MMM (EEE)"), Slot: `${s + 1}`,
          Station: st.name, Lot: st.lot, "Progress %": String(p.pct), "Delayed": String(p.delayed),
          EIC: st.ntpc_eic ?? "", Notes: item.agenda_notes ?? "" });
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No assignments" }]), "Weekly Plan");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([out]), `Weekly-Review-Plan-${weekKey}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Weekly Review</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Planner — Week of {format(weekStart, "dd MMM yyyy")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Assign up to 3 stations per day for the daily review cycle (covers all 15 stations in 5 working days).</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setWeekStart(addWeeks(weekStart, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This Week</Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" onClick={exportPlan}><FileSpreadsheet className="mr-2 h-4 w-4" /> Export Plan</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {DAYS.map((dayLabel, day) => (
          <Card key={day} className="flex flex-col p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{dayLabel}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{format(addDays(weekStart, day), "dd MMM")}</div>
              </div>
              <Badge variant="outline" className="text-[10px]">{plan.filter(p => p.day_of_week === day).length}/3</Badge>
            </div>
            <div className="space-y-2">
              {[0, 1, 2].map(slot => {
                const item = slotItem(day, slot);
                const st = item ? stationById(item.station_id) : null;
                const m = st ? buildStatusMap(statusByStation[st.id]) : null;
                const p = st && m ? stationProgress(tasks, m) : null;
                const topDelays = st && m ? tasks.filter(t => !t.is_section).map(t => ({ t, cs: computeRowState(t, m.get(t.id)) })).filter(x => x.cs.status === "delayed").sort((a, b) => b.cs.slipDays - a.cs.slipDays).slice(0, 3) : [];
                return (
                  <div key={slot} className="rounded-md border border-border/60 bg-card/40 p-2">
                    {!item ? (
                      <Select disabled={!canEdit} onValueChange={(v) => assign.mutate({ day, slot, stationId: v })}>
                        <SelectTrigger className="h-7 w-full text-xs"><SelectValue placeholder={`Slot ${slot + 1} — add station`} /></SelectTrigger>
                        <SelectContent>{stations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <Link to="/stations/$stationId" params={{ stationId: item.station_id }} className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 truncate text-xs font-semibold hover:text-primary">{st?.name} <ExternalLink className="h-3 w-3 shrink-0" /></div>
                          </Link>
                          {canEdit && <button onClick={() => remove.mutate(item.id)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
                        </div>
                        {p && (
                          <div className="mt-1 flex items-center gap-2 text-[10px]">
                            <span className="font-mono text-primary">{p.pct}%</span>
                            {p.delayed > 0 && <span className="font-mono" style={{ color: "var(--status-red)" }}>{p.delayed} delayed</span>}
                          </div>
                        )}
                        {topDelays.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                            {topDelays.map(({ t, cs }) => <li key={t.id} className="truncate">• {t.name} <span style={{ color: "var(--status-red)" }}>+{cs.slipDays}d</span></li>)}
                          </ul>
                        )}
                        <Textarea rows={2} disabled={!canEdit} className="mt-2 text-[10px]" placeholder="Agenda notes…"
                          defaultValue={item.agenda_notes ?? ""}
                          onBlur={(e) => { if (e.target.value !== (item.agenda_notes ?? "")) noteSave.mutate({ id: item.id, agenda_notes: e.target.value }); }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
