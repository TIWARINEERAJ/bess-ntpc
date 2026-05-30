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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, Loader2, Trash2, FileDown, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { fmtD } from "@/lib/gantt-utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MeetingRecorder } from "@/components/MeetingRecorder";

/** L2 schedule line items captured as commitments in CRM Coordination Review meetings */
const CRM_L2_ITEMS = [
  "Site mobilization",
  "Site clearance and grading work",
  "BESS Plant layout and SLD submission",
  "Ordering status — Switch gear",
  "Ordering status — BESS",
  "Ordering status — PCS",
  "Ordering status — Transformer (PCS duty & Auxiliary)",
  "Ordering status — HT cables",
  "Ordering status — LT cable",
  "Ordering status — Communication cable",
  "Ordering status — BESS EMS system",
  "Ordering status — SCADA & PPC system",
  "Ordering status — Earthing & lighting system",
  "BBU submission for the supplies",
] as const;

type MeetingType = "weekly" | "monthly" | "hop_vendor" | "management" | "prt" | "crm";

const TYPE_LABEL: Record<MeetingType, string> = {
  weekly: "Weekly Review",
  monthly: "Monthly Review",
  hop_vendor: "HOP Review with Vendors",
  management: "Management Review",
  prt: "Project Review Team (PRT)",
  crm: "CRM Coordination Review (Vendors)",
};

const TEMPLATES: Record<MeetingType, { agenda: string; attendees: string; action_items: string }> = {
  weekly: {
    attendees: "NTPC EIC, PM Coordinator, Site Engineer, Agency PM, Sub-vendor reps",
    agenda: "1. Review last week's planned vs actual\n2. Critical path activities (next 7 days)\n3. BOI / drawing approvals pending\n4. Safety & quality observations\n5. Hindrances / decisions required\n6. Action items for next week",
    action_items: "Owner — Action — Due date\nNTPC — Issue revised GA drawing for switchyard — DD-MMM\nAgency — Mobilise additional crew for civil works — DD-MMM",
  },
  monthly: {
    attendees: "AGM (Projects), NTPC EIC, PM Coordinator, Engg Taskforce, Agency MD/Director, OEM",
    agenda: "1. Monthly physical & financial progress vs L2 baseline\n2. Major equipment status (BOI register)\n3. Statutory approvals (CEA / DISCOM / Environment)\n4. Risk register & mitigation plan\n5. Cash flow / invoice status\n6. Look-ahead for next 30 / 60 / 90 days",
    action_items: "Owner — Action — Due date\nAgency — Submit monthly QAP compliance report — 30 of month\nNTPC — Release pending RA bill — within 15 days",
  },
  hop_vendor: {
    attendees: "Head of Project (HOP-NTPC), GM (Projects), NTPC EIC, EPC Contractor, OEMs (PCS / BESS / Transformer), Civil sub-vendor",
    agenda: "1. HOP overview & milestone status\n2. Vendor-wise delivery commitments\n3. FAT / inspection schedules\n4. Site mobilisation status by vendor\n5. Issues escalated to HOP for decision\n6. Commitments closing",
    action_items: "Owner — Action — Due date\nBESS OEM — Confirm FAT date — DD-MMM\nTransformer vendor — Submit dispatch plan — DD-MMM",
  },
  management: {
    attendees: "Director (Projects), ED (Renewables), Regional ED, GM (Projects), HOP, NTPC EIC",
    agenda: "1. Portfolio-level dashboard review\n2. Project-wise schedule health (RAG)\n3. Critical risks & escalations\n4. Cost & contract status\n5. Regulatory / policy updates\n6. Management directives",
    action_items: "Owner — Action — Due date\nGM — Submit revised L2 if slip > 30 days — within 2 weeks\nHOP — Resolve pending vendor escalations — DD-MMM",
  },
  prt: {
    attendees: "Project Review Team Chair, HOP, NTPC EIC, PM Coordinator, Engg Taskforce, Discipline Leads (Civil / Electrical / C&I), Agency PM, OEM reps",
    agenda: "1. Schedule health vs L2 baseline (critical path)\n2. BOI / drawing & approval status\n3. Quality & inspection (QAP / FQP / MQP) progress\n4. Safety incidents & corrective actions\n5. Statutory & contractual compliance\n6. Open issues, risks & mitigation\n7. Decisions required from PRT",
    action_items: "Owner — Action — Due date\nEIC — Close pending TQs with agency — DD-MMM\nAgency — Submit recovery plan for slipped milestones — DD-MMM",
  },
  crm: {
    attendees: "NTPC EIC, PM Coordinator, CRM (Contractor Relationship Manager), Agency PM, OEM / Vendor reps (Switchgear / BESS / PCS / Transformer / Cables / EMS / SCADA)",
    agenda: "L2 Schedule — Commitment for CRM Meeting (Start / End dates per station)\n1.1 Site mobilization\n1.2 Site clearance and grading work\n1.3 BESS Plant layout and SLD submission\n1.4 Ordering status\n    - Switch gear\n    - BESS\n    - PCS\n    - Transformer (PCS duty & Auxiliary)\n    - HT cables / LT cable / Communication cable\n    - BESS EMS system\n    - SCADA & PPC system\n    - Earthing & lighting system\n1.5 BBU submission for the supplies",
    action_items: "Owner — Action — Due date\nVendor — Confirm ordering status for switchgear / PCS / BESS — DD-MMM\nAgency — Submit BESS layout & SLD — DD-MMM\nAgency — BBU submission for supplies — DD-MMM",
  },
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

function downloadMomPdf(m: Meeting, stationName: string) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  doc.setFontSize(11); doc.setTextColor(120);
  doc.text("NTPC BESS — Minutes of Meeting", w / 2, 14, { align: "center" });
  doc.setFontSize(15); doc.setTextColor(0);
  doc.text(`${TYPE_LABEL[m.meeting_type]} — ${stationName}`, w / 2, 22, { align: "center" });
  doc.setFontSize(10); doc.setTextColor(80);
  doc.text(`Date: ${fmtD(m.meeting_date)}    Next meeting: ${m.next_meeting_date ? fmtD(m.next_meeting_date) : "—"}`, w / 2, 28, { align: "center" });

  autoTable(doc, {
    startY: 34,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3, valign: "top" },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 0: { cellWidth: 35, fontStyle: "bold" } },
    body: [
      ["Attendees", m.attendees || "—"],
      ["Agenda", m.agenda || "—"],
      ["Minutes / Discussion", m.minutes || "—"],
      ["Action Items", m.action_items || "—"],
    ],
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`Generated ${new Date().toLocaleString()}  ·  Page ${i} of ${pageCount}`, w / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
  }

  doc.save(`MoM_${stationName.replace(/\s+/g, "-")}_${m.meeting_type}_${m.meeting_date}.pdf`);
}

function MeetingsList({ stationId, meetingType, canEdit }: { stationId: string; meetingType: MeetingType; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["meetings", stationId, meetingType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings").select("*").eq("station_id", stationId).eq("meeting_type", meetingType)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return data as Meeting[];
    },
  });
  const stationQ = useQuery({
    queryKey: ["station", stationId],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("name").eq("id", stationId).single();
      return data?.name ?? "Station";
    },
  });

  const tpl = TEMPLATES[meetingType];
  const [open, setOpen] = useState(false);
  const blank = {
    meeting_date: new Date().toISOString().slice(0, 10),
    attendees: "",
    agenda: "",
    minutes: "",
    action_items: "",
    next_meeting_date: "",
  };
  const [form, setForm] = useState(blank);

  // CRM commitments: L2 schedule item + committed date
  const [commitments, setCommitments] = useState<{ item: string; date: string }[]>([]);
  const [cmtItem, setCmtItem] = useState("");
  const [cmtDate, setCmtDate] = useState("");
  const resetCrm = () => { setCommitments([]); setCmtItem(""); setCmtDate(""); };
  const addCommitment = () => {
    if (!cmtItem || !cmtDate) { toast.error("Pick an L2 item and a date"); return; }
    setCommitments((c) => [...c, { item: cmtItem, date: cmtDate }]);
    setCmtItem(""); setCmtDate("");
  };
  const removeCommitment = (i: number) => setCommitments((c) => c.filter((_, idx) => idx !== i));
  const commitmentsText = () =>
    commitments.map((c) => `• ${c.item} — ${fmtD(c.date)}`).join("\n");

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let agenda = form.agenda;
      if (meetingType === "crm" && commitments.length) {
        const block = `Commitment for CRM Meeting (L2 Schedule)\n${commitmentsText()}`;
        agenda = agenda ? `${agenda}\n\n${block}` : block;
      }
      const { error } = await supabase.from("meetings").insert({
        station_id: stationId,
        meeting_type: meetingType,
        meeting_date: form.meeting_date,
        attendees: form.attendees || null,
        agenda: agenda || null,
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
      setForm(blank);
      resetCrm();
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings", stationId, meetingType] }); toast.success("Deleted"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const useSample = () => setForm(f => ({ ...f, attendees: tpl.attendees, agenda: tpl.agenda, action_items: tpl.action_items }));
  const rows = q.data ?? [];
  const stationName = stationQ.data ?? "Station";

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
          Audio recorder · {TYPE_LABEL[meetingType]}
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Record this meeting live (mic + Teams/computer audio) or upload an exported Teams recording. Saved recordings appear below.
        </p>
        <MeetingRecorder stationId={stationId} meetingType={meetingType} canEdit={canEdit} />
      </Card>

      <Card className="border-dashed bg-secondary/30 p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Standard format · {TYPE_LABEL[meetingType]}</div>
          <Badge variant="outline" className="text-[10px]">Sample</Badge>
        </div>
        <div className="grid gap-2 text-[11px] md:grid-cols-2">
          <div><span className="text-muted-foreground">Attendees: </span>{tpl.attendees}</div>
          <div><span className="text-muted-foreground">Agenda: </span><span className="whitespace-pre-wrap">{tpl.agenda}</span></div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(blank); resetCrm(); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Log {TYPE_LABEL[meetingType]}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle>New {TYPE_LABEL[meetingType]}</DialogTitle>
                  <Button size="sm" variant="outline" onClick={useSample}><Sparkles className="mr-1 h-3 w-3" /> Use sample</Button>
                </div>
              </DialogHeader>
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
                  <Input value={form.attendees} onChange={e => setForm({ ...form, attendees: e.target.value })} placeholder={tpl.attendees} />
                </div>
                {meetingType === "crm" && (
                  <div className="col-span-2 space-y-2 rounded-lg border bg-secondary/30 p-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-primary">L2 Schedule — Commitments</Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground">L2 schedule item</Label>
                        <Select value={cmtItem} onValueChange={setCmtItem}>
                          <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>
                            {CRM_L2_ITEMS.map((it) => (
                              <SelectItem key={it} value={it}>{it}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:w-40">
                        <Label className="text-[11px] text-muted-foreground">Committed date</Label>
                        <Input type="date" value={cmtDate} onChange={(e) => setCmtDate(e.target.value)} />
                      </div>
                      <Button type="button" size="sm" variant="secondary" onClick={addCommitment}>
                        <Plus className="mr-1 h-4 w-4" /> Add
                      </Button>
                    </div>
                    {commitments.length > 0 && (
                      <div className="space-y-1">
                        {commitments.map((c, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1 text-sm">
                            <span><span className="text-muted-foreground">{c.item}</span> — {fmtD(c.date)}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCommitment(i)}>
                              <X className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="col-span-2">
                  <Label>Agenda{meetingType === "crm" ? " (additional notes)" : ""}</Label>
                  <Textarea rows={4} value={form.agenda} onChange={e => setForm({ ...form, agenda: e.target.value })} placeholder={tpl.agenda} />
                </div>
                <div className="col-span-2">
                  <Label>Minutes / Discussion</Label>
                  <Textarea rows={5} value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Action items</Label>
                  <Textarea rows={3} value={form.action_items} onChange={e => setForm({ ...form, action_items: e.target.value })} placeholder={tpl.action_items} />
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
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => downloadMomPdf(m, stationName)}>
                  <FileDown className="mr-1 h-3 w-3" /> PDF
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(m.id)} disabled={del.isPending}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            {m.agenda && <Section title="Agenda" text={m.agenda} />}
            {m.minutes && <Section title="Minutes" text={m.minutes} />}
            {m.action_items && <Section title="Action items" text={m.action_items} />}
            <MeetingRecorder meetingId={m.id} stationId={stationId} canEdit={canEdit} />
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
