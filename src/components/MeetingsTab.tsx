import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtD } from "@/lib/gantt-utils";

type MeetingType = "weekly" | "monthly" | "hop_vendor" | "management";

const TYPE_LABEL: Record<MeetingType, string> = {
  weekly: "Weekly Review",
  monthly: "Monthly Review",
  hop_vendor: "HOP Review with Vendors",
  management: "Management Review",
};

type Meeting = {
  id: string;
  station_id: string;
  meeting_type: MeetingType;
  meeting_date: string;
  attendees: string | null;
  agenda: string | null;
  minutes: string | null;
  action_items: string | null;
  next_meeting_date: string | null;
  created_at: string;
};

export function MeetingsTab({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const [type, setType] = useState<MeetingType>("weekly");
  return (
    <div className="space-y-3">
      <Tabs value={type} onValueChange={(v) => setType(v as MeetingType)}>
        <TabsList className="flex-wrap">
          {(Object.keys(TYPE_LABEL) as MeetingType[]).map((k) => (
            <TabsTrigger key={k} value={k}>{TYPE_LABEL[k]}</TabsTrigger>
          ))}
        </TabsList>
        {(Object.keys(TYPE_LABEL) as MeetingType[]).map((k) => (
          <TabsContent key={k} value={k} className="space-y-3">
            <MeetingsList stationId={stationId} meetingType={k} canEdit={canEdit} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function MeetingsList({ stationId, meetingType, canEdit }: { stationId: string; meetingType: MeetingType; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["meetings", stationId, meetingType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("station_id", stationId)
        .eq("meeting_type", meetingType)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data as Meeting[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    meeting_date: new Date().toISOString().slice(0, 10),
    attendees: "",
    agenda: "",
    minutes: "",
    action_items: "",
    next_meeting_date: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("meetings").insert({
        station_id: stationId,
        meeting_type: meetingType,
        meeting_date: form.meeting_date,
        attendees: form.attendees || null,
        agenda: form.agenda || null,
        minutes: form.minutes || null,
        action_items: form.action_items || null,
        next_meeting_date: form.next_meeting_date || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", stationId, meetingType] });
      toast.success("Meeting logged");
      setOpen(false);
      setForm({ meeting_date: new Date().toISOString().slice(0, 10), attendees: "", agenda: "", minutes: "", action_items: "", next_meeting_date: "" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", stationId, meetingType] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Log {TYPE_LABEL[meetingType]}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>New {TYPE_LABEL[meetingType]}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Meeting date</Label>
                  <Input type="date" value={form.meeting_date} onChange={e => setForm({ ...form, meeting_date: e.target.value })} />
                </div>
                <div>
                  <Label>Next meeting</Label>
                  <Input type="date" value={form.next_meeting_date} onChange={e => setForm({ ...form, next_meeting_date: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Attendees</Label>
                  <Input value={form.attendees} onChange={e => setForm({ ...form, attendees: e.target.value })} placeholder="Names / designations" />
                </div>
                <div className="col-span-2">
                  <Label>Agenda</Label>
                  <Textarea rows={2} value={form.agenda} onChange={e => setForm({ ...form, agenda: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Minutes / Discussion</Label>
                  <Textarea rows={4} value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Action items</Label>
                  <Textarea rows={3} value={form.action_items} onChange={e => setForm({ ...form, action_items: e.target.value })} placeholder="Owner — Action — Due date" />
                </div>
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.meeting_date}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {q.isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!q.isLoading && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No {TYPE_LABEL[meetingType].toLowerCase()} entries yet.</Card>
      )}

      <div className="space-y-2">
        {rows.map((m) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono"><Calendar className="mr-1 h-3 w-3" />{fmtD(m.meeting_date)}</Badge>
                  {m.next_meeting_date && (
                    <Badge variant="secondary" className="text-[10px]">Next: {fmtD(m.next_meeting_date)}</Badge>
                  )}
                </div>
                {m.attendees && <div className="text-xs"><span className="text-muted-foreground">Attendees:</span> {m.attendees}</div>}
              </div>
              {canEdit && (
                <Button variant="ghost" size="icon" onClick={() => del.mutate(m.id)} disabled={del.isPending}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
            {m.agenda && <Section title="Agenda" text={m.agenda} />}
            {m.minutes && <Section title="Minutes" text={m.minutes} />}
            {m.action_items && <Section title="Action items" text={m.action_items} />}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="whitespace-pre-wrap text-sm">{text}</div>
    </div>
  );
}
