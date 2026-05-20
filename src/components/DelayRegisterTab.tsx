import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { buildStatusMap, computeRowState, type L2Task, type Status } from "@/lib/gantt-utils";

type Delay = { id?: string; station_id: string; task_id: string | null; title: string; reason_category: string | null; root_cause: string | null; responsibility: string | null; corrective_action: string | null; recovery_plan: string | null; recovery_date: string | null; status: string };

const REASONS = ["Vendor", "Clearance", "Site", "Design", "Force Majeure", "Other"];
const RESP = ["NTPC", "Vendor", "Statutory", "Joint"];
const STATUS = ["open", "mitigated", "closed"];

export function DelayRegisterTab({ stationId, canEdit, tasks, status }: { stationId: string; canEdit: boolean; tasks: L2Task[]; status: Status[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["delays", stationId], queryFn: async () => {
    const { data, error } = await supabase.from("delay_register").select("*").eq("station_id", stationId).order("created_at", { ascending: false });
    if (error) throw error; return data as Delay[];
  }});

  const autoDelays = useMemo(() => {
    const m = buildStatusMap(status);
    const out: Array<{ task: L2Task; slip: number }> = [];
    for (const t of tasks) {
      if (t.is_section) continue;
      const cs = computeRowState(t, m.get(t.id));
      if (cs.slipDays > 0 || cs.status === "delayed") out.push({ task: t, slip: cs.slipDays });
    }
    return out.sort((a, b) => b.slip - a.slip);
  }, [tasks, status]);

  const existingTaskIds = new Set((q.data ?? []).map(d => d.task_id).filter(Boolean));
  const autoUnregistered = autoDelays.filter(a => !existingTaskIds.has(a.task.id));

  const upsert = useMutation({
    mutationFn: async (d: Delay) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { ...d, updated_by: user?.id ?? null, updated_at: new Date().toISOString() };
      const op = d.id ? supabase.from("delay_register").update(payload).eq("id", d.id) : supabase.from("delay_register").insert(payload);
      const { error } = await op; if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["delays", stationId] }); qc.invalidateQueries({ queryKey: ["notifications"] }); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const [edit, setEdit] = useState<Delay | null>(null);
  const blank = (): Delay => ({ station_id: stationId, task_id: null, title: "", reason_category: null, root_cause: null, responsibility: null, corrective_action: null, recovery_plan: null, recovery_date: null, status: "open" });

  const autoSeed = async () => {
    for (const a of autoUnregistered.slice(0, 20)) {
      await upsert.mutateAsync({ ...blank(), task_id: a.task.id, title: `${a.task.wbs_code} ${a.task.name} (slip ${a.slip}d)`, status: "open" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{(q.data ?? []).length} hindrance entr{(q.data ?? []).length === 1 ? "y" : "ies"} · {autoUnregistered.length} auto-detected slips</div>
        {canEdit && (
          <div className="flex gap-2">
            {autoUnregistered.length > 0 && <Button size="sm" variant="outline" onClick={autoSeed}><Wand2 className="mr-1 h-3 w-3" /> Auto-register slips</Button>}
            <Button size="sm" onClick={() => setEdit(blank())}><Plus className="mr-1 h-3 w-3" /> Add Entry</Button>
          </div>
        )}
      </div>
      {(q.data ?? []).length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground">No delays recorded yet.</Card>}
      <div className="grid gap-2">
        {(q.data ?? []).map(d => (
          <Card key={d.id} className="cursor-pointer p-3 hover:border-primary/40" onClick={() => setEdit(d)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.title}</span>
                  {d.reason_category && <Badge variant="outline" className="text-[10px]">{d.reason_category}</Badge>}
                  {d.responsibility && <Badge variant="outline" className="text-[10px]">{d.responsibility}</Badge>}
                  <Badge variant="outline" className="text-[10px]" style={{ color: d.status === "closed" ? "var(--status-green)" : d.status === "mitigated" ? "var(--status-amber)" : "var(--status-red)" }}>{d.status}</Badge>
                </div>
                {d.root_cause && <p className="mt-1 text-xs text-muted-foreground">Root: {d.root_cause}</p>}
                {d.corrective_action && <p className="mt-0.5 text-xs text-muted-foreground">Action: {d.corrective_action}</p>}
                <div className="mt-1 text-[11px] text-muted-foreground">Recovery: {d.recovery_date ?? "—"}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {edit && (
            <>
              <SheetHeader><SheetTitle>{edit.id ? "Edit Delay" : "New Delay Entry"}</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-3 px-4">
                <div><Label>Activity (L2 task)</Label>
                  <Select value={edit.task_id ?? "__none__"} onValueChange={v => setEdit({ ...edit, task_id: v === "__none__" ? null : v })} disabled={!canEdit}>
                    <SelectTrigger><SelectValue placeholder="Select activity" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__none__">— None / general —</SelectItem>
                      {tasks.filter(t => !t.is_section).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.wbs_code} · {t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Title</Label><Input value={edit.title} disabled={!canEdit} onChange={e => setEdit({ ...edit, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Reason</Label>
                    <Select value={edit.reason_category ?? ""} onValueChange={v => setEdit({ ...edit, reason_category: v })} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Responsibility</Label>
                    <Select value={edit.responsibility ?? ""} onValueChange={v => setEdit({ ...edit, responsibility: v })} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{RESP.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Root Cause</Label><Textarea rows={2} value={edit.root_cause ?? ""} disabled={!canEdit} onChange={e => setEdit({ ...edit, root_cause: e.target.value })} /></div>
                <div><Label>Corrective Action</Label><Textarea rows={2} value={edit.corrective_action ?? ""} disabled={!canEdit} onChange={e => setEdit({ ...edit, corrective_action: e.target.value })} /></div>
                <div><Label>Recovery Plan</Label><Textarea rows={2} value={edit.recovery_plan ?? ""} disabled={!canEdit} onChange={e => setEdit({ ...edit, recovery_plan: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Recovery Date</Label><Input type="date" disabled={!canEdit} value={edit.recovery_date ?? ""} onChange={e => setEdit({ ...edit, recovery_date: e.target.value || null })} /></div>
                  <div><Label>Status</Label>
                    <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v })} disabled={!canEdit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {canEdit && <Button className="w-full" onClick={async () => { await upsert.mutateAsync(edit); setEdit(null); }}>Save</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
