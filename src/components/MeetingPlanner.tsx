import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Loader2, Trash2, CalendarClock, CheckCircle2, AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { fmtD } from "@/lib/gantt-utils";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { TYPE_LABEL, type MeetingType } from "@/lib/meeting-types";

export type MeetingPlan = {
  id: string;
  station_id: string;
  meeting_type: string;
  title: string | null;
  planned_date: string;
  planned_time: string | null;
  agenda: string | null;
  status: string;
  created_at: string;
};

// The generated Supabase types may not yet include meeting_plans; use a loose client.
const db = supabase as unknown as {
  from: (t: string) => any;
  auth: typeof supabase.auth;
};

export function MeetingPlanner({ stationId, meetingType, canEdit }: { stationId: string; meetingType: MeetingType; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["meeting-plans", stationId, meetingType];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await db
        .from("meeting_plans")
        .select("*")
        .eq("station_id", stationId)
        .eq("meeting_type", meetingType)
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MeetingPlan[];
    },
  });

  const blank = {
    title: "",
    planned_date: "",
    planned_time: "",
    agenda: "",
  };
  const [form, setForm] = useState(blank);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.planned_date) throw new Error("Pick a meeting date");
      const { data: { user } } = await db.auth.getUser();
      const { error } = await db.from("meeting_plans").insert({
        station_id: stationId,
        meeting_type: meetingType,
        title: form.title || null,
        planned_date: form.planned_date,
        planned_time: form.planned_time || null,
        agenda: form.agenda || null,
        status: "planned",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      toast.success("Meeting scheduled — it will show in Upcoming Meetings");
      setForm(blank);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("meeting_plans").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meeting_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
      toast.success("Removed");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = q.data ?? [];
  const today = new Date();
  const upcoming = rows.filter((r) => r.status === "planned" && parseISO(r.planned_date) >= startOfDay(today));
  const past = rows.filter((r) => !(r.status === "planned" && parseISO(r.planned_date) >= startOfDay(today)));

  return (
    <div className="space-y-3">
      {canEdit && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <CalendarPlus className="h-3.5 w-3.5" /> Plan a {TYPE_LABEL[meetingType]}
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Save the date — it is highlighted as an upcoming important date on the dashboard and triggers a notification as it approaches.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Meeting date</Label>
              <Input type="date" value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Time (optional)</Label>
              <Input type="time" value={form.planned_time} onChange={(e) => setForm({ ...form, planned_time: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Title / Purpose (optional)</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={`e.g. ${TYPE_LABEL[meetingType]} — agenda lock`} />
            </div>
            <div className="col-span-2">
              <Label>Agenda notes (optional)</Label>
              <Textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
            </div>
          </div>
          <Button className="mt-3" size="sm" onClick={() => create.mutate()} disabled={create.isPending || !form.planned_date}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <CalendarPlus className="mr-1 h-4 w-4" /> Schedule meeting
          </Button>
        </Card>
      )}

      <div className="text-sm text-muted-foreground">
        {upcoming.length} upcoming · {past.length} past
      </div>

      {q.isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}

      {!q.isLoading && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No {TYPE_LABEL[meetingType].toLowerCase()} planned yet.</Card>
      )}

      <div className="space-y-2">
        {upcoming.map((p) => (
          <PlanCard key={p.id} p={p} canEdit={canEdit} onDone={() => setStatus.mutate({ id: p.id, status: "completed" })} onDelete={() => del.mutate(p.id)} highlight />
        ))}
        {past.map((p) => (
          <PlanCard key={p.id} p={p} canEdit={canEdit} onDone={() => setStatus.mutate({ id: p.id, status: "completed" })} onDelete={() => del.mutate(p.id)} />
        ))}
      </div>
    </div>
  );
}

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function PlanCard({ p, canEdit, onDone, onDelete, highlight }: { p: MeetingPlan; canEdit: boolean; onDone: () => void; onDelete: () => void; highlight?: boolean }) {
  const days = differenceInCalendarDays(parseISO(p.planned_date), startOfDay(new Date()));
  const done = p.status === "completed";
  const cancelled = p.status === "cancelled";
  return (
    <Card className={`p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={highlight ? "default" : "outline"} className="font-mono">
              <CalendarClock className="mr-1 h-3 w-3" />
              {fmtD(p.planned_date)}{p.planned_time ? ` · ${p.planned_time}` : ""}
            </Badge>
            {!done && !cancelled && (
              <Badge variant="secondary" className="text-[10px]">
                <AlarmClock className="mr-1 h-3 w-3" />
                {days === 0 ? "Today" : days > 0 ? `in ${days}d` : `${-days}d ago`}
              </Badge>
            )}
            {done && <Badge className="bg-[color:var(--status-green)] text-[10px] text-white">Completed</Badge>}
            {cancelled && <Badge variant="outline" className="text-[10px] text-muted-foreground">Cancelled</Badge>}
          </div>
          {p.title && <div className="text-sm font-medium">{p.title}</div>}
          {p.agenda && <div className="whitespace-pre-wrap text-xs text-muted-foreground">{p.agenda}</div>}
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            {!done && (
              <Button variant="outline" size="sm" onClick={onDone}>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Done
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
