import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Calendar, Loader2, Trash2, FileDown, Sparkles, X, CalendarClock, CalendarPlus,
  CheckCircle2, Circle, AlarmClock, ChevronLeft, ChevronRight, ListChecks, History, Mic,
} from "lucide-react";
import { toast } from "sonner";
import { fmtD } from "@/lib/gantt-utils";
import { DatePicker } from "@/components/DatePicker";
import { addMonths, differenceInCalendarDays, parseISO, startOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { MeetingRecorder } from "@/components/MeetingRecorder";
import { MEETING_TYPES, TYPE_LABEL, TYPE_SHORT, TYPE_PURPOSE, FREQUENCY_LABEL, MEETING_FREQUENCY, type MeetingType } from "@/lib/meeting-types";
import { computeCadence, monthLabel, STATE_META, type CadenceRow } from "@/lib/meeting-cadence";

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

/** Strip the trailing vendor-code (e.g. ", 1148481") from agency names for display. */
function cleanAgency(agency: string | null): string {
  if (!agency) return "Agency";
  return agency.split(",")[0].trim() || "Agency";
}
/** Replace the {AGENCY} placeholder in a meeting template with the station's agency. */
function applyAgency(text: string, agency: string): string {
  return text.replace(/\{AGENCY\}/g, agency);
}

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
    attendees: "Project Review Team Chair, HOP, NTPC EIC, PM Coordinator, Engg Taskforce, Discipline Leads (Civil / Electrical / C&I), {AGENCY} PM, OEM reps",
    agenda:
      "BESS PROJECT REVIEW TEAM (PRT) MEETING — STANDARD AGENDA\n" +
      "\nA. AGENDA POINTS\n" +
      "1. Compliance with Project Management Tools (Hindrance Register & L2 Schedule)\n" +
      "2. Capex Planning for FY 26-27\n" +
      "3. Safety Performance & Exceptions — EHS Plan, EHS requirement documents, Induction (LSP) & medical tie-up with local hospital, Daily Safety Report, weekly EHS walkdown\n" +
      "4. Subcontractor weekly safety meeting — Incident reports, Job Safety Analysis, HIRA report, Method Statement, Emergency Response Plan\n" +
      "5. Schedule / Award status of packages to be awarded by {AGENCY}\n" +
      "6. TOPO Survey — completed & approved\n" +
      "7. GEOTECH Study — NTPC bid document data to be adopted\n" +
      "8. GRID Study\n" +
      "9. Civil and Electrical Works\n" +
      "10. Review of Short-Term & Medium-Term targets\n" +
      "    Short-Term: Construction power setup; Area clearance grading; Storage space; BESS layout approval; No-increase-in-pollution-load certificate; Start of fencing/drains/road\n" +
      "    Medium-Term: Drawing approvals; Ordering of BOIs completion; Trial mix; Start of civil foundation work\n" +
      "11. Site Readiness & Enabling Works (Table-01); Gate pass process; {AGENCY} office & manpower mobilisation; Area-wise exception review (Table-02); Hindrance & risk register\n" +
      "12. Engineering Submission\n" +
      "13. Monthly progress report submission by {AGENCY}\n" +
      "\nB. SITE READINESS & ENABLING WORKS REVIEW (Table-01) — Details | Present status | Remarks ({AGENCY})\n" +
      "1 Site mobilization, site office & preparatory works\n2 Safety Park\n3 Field Quality Lab setup\n4 Geo investigation & report submission\n5 Topography & report submission\n6 Site grading work\n7 Deputation of admin\n8 Site store development\n9 Trial mix design & approval\n10 No increase in pollution load certificate\n11 Grid / interconnection / reactive-power compensation studies & approval\n12 MDL submission\n13 Approval of BESS plant layout (preliminary)\n14 Soil testing & ERT\n15 HT & DC cable routing, earthing, lightning protection\n16 Illumination system — calculation & layout\n17 Civil — fencing drawings\n18 Civil — road & drainage work drawings\n" +
      "\nC. AREA-WISE EXCEPTION REVIEW (Table-02) — Package/Area | Issue | Status | Remarks ({AGENCY})\n" +
      "Engineering & Quality Exceptions:\n1 Submission of civil drawings as per schedule\n2 Submission of electrical drawings as per schedule\n3 Provenness criterion submission\n4 Sub-vendor approval\n" +
      "Civil Progress Exceptions:\n5 Mobilization schedule of civil agency & T&P\n6 Fencing material ordering & delivery schedule\n7 Drainage material ordering & delivery schedule\n8 Road construction material ordering & delivery schedule\n" +
      "Electrical Progress Exceptions:\n9 Electrical agency finalization\n10 Any other specific issues\n" +
      "\nD. ORDERING STATUS OF BROUGHT-OUT ITEMS — BOI (Table-03) — Scheduled PO date as per L-2 network | Remarks from {AGENCY}\n" +
      "(If any BOI is ordered, PO copy shall be shared with EIC.)\n" +
      "1 Power Transformer\n2 Switchyard circuit breaker\n3 Switchyard equipment\n4 Switchgear\n5 BESS\n6 PCS\n7 Transformers (PCS duty)\n8 HT Cable\n9 LT Cables\n10 Auxiliary Transformers\n11 BESS EMS System\n12 SCADA and PPC system\n13 Earthing and Lighting system",
    action_items: "Owner — Action — Due date\nEIC — Close pending TQs with {AGENCY} — DD-MMM\n{AGENCY} — Submit recovery plan for slipped milestones — DD-MMM",
  },
  crm: {
    attendees: "NTPC EIC, PM Coordinator, CRM (Contractor Relationship Manager), Agency PM, OEM / Vendor reps (Switchgear / BESS / PCS / Transformer / Cables / EMS / SCADA)",
    agenda: "L2 Schedule — Commitment for CRM Meeting (Start / End dates per station)\n1.1 Site mobilization\n1.2 Site clearance and grading work\n1.3 BESS Plant layout and SLD submission\n1.4 Ordering status\n    - Switch gear\n    - BESS\n    - PCS\n    - Transformer (PCS duty & Auxiliary)\n    - HT cables / LT cable / Communication cable\n    - BESS EMS system\n    - SCADA & PPC system\n    - Earthing & lighting system\n1.5 BBU submission for the supplies",
    action_items: "Owner — Action — Due date\nVendor — Confirm ordering status for switchgear / PCS / BESS — DD-MMM\nAgency — Submit BESS layout & SLD — DD-MMM\nAgency — BBU submission for supplies — DD-MMM",
  },
  tcm: {
    attendees: "Engineering Taskforce (Civil / Electrical / C&I), NTPC EIC, Design Lead, OEM/Vendor engineers (PCS / BESS / Transformer / SCADA), Agency Engineering Manager",
    agenda: "1. Drawing & document submission status (GA, SLD, layouts)\n2. Technical queries (TQ) & clarifications with vendor\n3. Interface / interconnection design coordination\n4. Equipment technical specifications & datasheet approvals\n5. FAT / type-test protocols review\n6. Design changes & deviation requests\n7. Engineering action items & target dates",
    action_items: "Owner — Action — Due date\nVendor Engg — Resubmit revised SLD with EIC comments — DD-MMM\nEngg Taskforce — Close pending TQs — DD-MMM\nOEM — Share FAT protocol for review — DD-MMM",
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

type MeetingPlan = {
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

const db = supabase as unknown as { from: (t: string) => any; auth: typeof supabase.auth };

// ────────────────────────────────────────────────────────────────────────────
// Top-level orchestrator
// ────────────────────────────────────────────────────────────────────────────
export function MeetingsTab({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [monthRef, setMonthRef] = useState(() => startOfMonth(new Date()));
  const [logFor, setLogFor] = useState<MeetingType | null>(null);
  const [planFor, setPlanFor] = useState<MeetingType | null>(null);

  const meetingsQ = useQuery({
    queryKey: ["meetings", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings").select("*").eq("station_id", stationId)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Meeting[];
    },
  });
  const plansQ = useQuery({
    queryKey: ["meeting-plans", stationId],
    queryFn: async () => {
      const { data, error } = await db.from("meeting_plans").select("*").eq("station_id", stationId)
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MeetingPlan[];
    },
  });
  const stationQ = useQuery({
    queryKey: ["station", stationId],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("name, agency").eq("id", stationId).single();
      return { name: data?.name ?? "Station", agency: cleanAgency(data?.agency ?? null) };
    },
  });

  const meetings = meetingsQ.data ?? [];
  const plans = plansQ.data ?? [];
  const stationName = stationQ.data?.name ?? "Station";
  const agency = stationQ.data?.agency ?? "Agency";

  const cadence = useMemo(
    () => computeCadence(meetings, plans, monthRef),
    [meetings, plans, monthRef]
  );

  const summary = useMemo(() => {
    const done = cadence.filter((c) => c.state === "done").length;
    const planned = cadence.filter((c) => c.state === "planned").length;
    const action = cadence.filter((c) => c.state === "due" || c.state === "overdue").length;
    const overdue = cadence.filter((c) => c.state === "overdue").length;
    return { done, planned, action, overdue, total: cadence.length };
  }, [cadence]);

  const isCurrentMonth =
    monthRef.getMonth() === new Date().getMonth() && monthRef.getFullYear() === new Date().getFullYear();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["meetings", stationId] });
    qc.invalidateQueries({ queryKey: ["meeting-plans", stationId] });
    qc.invalidateQueries({ queryKey: ["upcoming-meetings"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Meeting Management</div>
          <h2 className="text-lg font-bold tracking-tight">Cadence, planner & minutes</h2>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPlanFor("weekly")}>
              <CalendarPlus className="mr-1 h-4 w-4" /> Plan meeting
            </Button>
            <Button size="sm" onClick={() => setLogFor("weekly")}>
              <Plus className="mr-1 h-4 w-4" /> Log meeting
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist"><ListChecks className="mr-1 h-4 w-4" /> This Month</TabsTrigger>
          <TabsTrigger value="log"><History className="mr-1 h-4 w-4" /> Meeting Log</TabsTrigger>
          <TabsTrigger value="planner"><CalendarClock className="mr-1 h-4 w-4" /> Planner</TabsTrigger>
          <TabsTrigger value="audio"><Mic className="mr-1 h-4 w-4" /> Recordings</TabsTrigger>
        </TabsList>

        {/* CHECKLIST */}
        <TabsContent value="checklist" className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthRef((m) => addMonths(m, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[140px] text-center">
                <div className="text-sm font-semibold">{monthLabel(monthRef)}</div>
                {!isCurrentMonth && (
                  <button className="text-[10px] text-primary hover:underline" onClick={() => setMonthRef(startOfMonth(new Date()))}>
                    Jump to current month
                  </button>
                )}
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthRef((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <SummaryChip tone="var(--status-green)" label="Conducted" value={summary.done} />
              <SummaryChip tone="var(--status-amber)" label="Planned" value={summary.planned} />
              <SummaryChip tone="var(--status-red)" label="Action needed" value={summary.action} />
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cadence.map((c) => (
              <CadenceCard
                key={c.type}
                row={c}
                canEdit={canEdit}
                isCurrentMonth={isCurrentMonth}
                onPlan={() => setPlanFor(c.type)}
                onLog={() => setLogFor(c.type)}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Required cadence per station: Weekly Review every week; all other reviews (Monthly, HOP, Management, PRT, CRM, TCM) once a month.
            Overdue or due meetings are also flagged on the dashboard and in notifications.
          </p>
        </TabsContent>

        {/* MEETING LOG */}
        <TabsContent value="log" className="space-y-3">
          <MeetingLog meetings={meetings} loading={meetingsQ.isLoading} stationId={stationId} stationName={stationName} canEdit={canEdit} onChanged={refresh} />
        </TabsContent>

        {/* PLANNER */}
        <TabsContent value="planner" className="space-y-3">
          <PlannerList plans={plans} loading={plansQ.isLoading} canEdit={canEdit} onPlan={() => setPlanFor("weekly")} onChanged={refresh} />
        </TabsContent>

        {/* RECORDINGS */}
        <TabsContent value="audio" className="space-y-3">
          <AudioCenter stationId={stationId} canEdit={canEdit} />
        </TabsContent>
      </Tabs>

      <LogMeetingDialog
        stationId={stationId}
        agency={agency}
        initialType={logFor}
        open={logFor !== null}
        onOpenChange={(o) => !o && setLogFor(null)}
        onSaved={refresh}
      />
      <PlanMeetingDialog
        stationId={stationId}
        agency={agency}
        initialType={planFor}
        open={planFor !== null}
        onOpenChange={(o) => !o && setPlanFor(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function SummaryChip({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1">
      <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
      <span className="font-semibold" style={{ color: tone }}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Cadence card
// ────────────────────────────────────────────────────────────────────────────
function CadenceCard({ row, canEdit, isCurrentMonth, onPlan, onLog }: {
  row: CadenceRow; canEdit: boolean; isCurrentMonth: boolean; onPlan: () => void; onLog: () => void;
}) {
  const meta = STATE_META[row.state];
  const done = row.state === "done";
  return (
    <Card className="overflow-hidden p-0">
      <div className="h-1 w-full" style={{ background: meta.tone }} />
      <div className="space-y-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--status-green)" }} />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{TYPE_LABEL[row.type]}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{TYPE_PURPOSE[row.type]}</div>
            </div>
          </div>
          <Badge className="shrink-0 text-[10px] text-white" style={{ background: meta.tone }}>{meta.label}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Badge variant="outline" className="text-[9px]">{FREQUENCY_LABEL[row.frequency]}</Badge>
          </span>
          <span>
            This month: <span className="font-semibold text-foreground">{row.conducted}/{row.required}</span>
          </span>
          {row.frequency === "weekly" && isCurrentMonth && (
            <span style={{ color: row.thisWeekDone ? "var(--status-green)" : "var(--status-amber)" }}>
              {row.thisWeekDone ? "✓ This week done" : "This week pending"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>Last: <span className="text-foreground/80">{row.lastConducted ? fmtD(row.lastConducted) : "—"}</span></span>
          {row.nextPlanned && <span>Next planned: <span className="text-foreground/80">{fmtD(row.nextPlanned)}</span></span>}
        </div>

        {canEdit && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={onPlan}>
              <CalendarPlus className="mr-1 h-3 w-3" /> Plan
            </Button>
            <Button size="sm" className="h-7 flex-1 text-[11px]" onClick={onLog}>
              <Plus className="mr-1 h-3 w-3" /> Log now
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Log meeting dialog (conducted minutes)
// ────────────────────────────────────────────────────────────────────────────
function LogMeetingDialog({ stationId, initialType, open, onOpenChange, onSaved }: {
  stationId: string; initialType: MeetingType | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [type, setType] = useState<MeetingType>(initialType ?? "weekly");
  const blank = {
    meeting_date: new Date().toISOString().slice(0, 10),
    attendees: "", agenda: "", minutes: "", action_items: "", next_meeting_date: "",
  };
  const [form, setForm] = useState(blank);
  const [commitments, setCommitments] = useState<{ item: string; date: string }[]>([]);
  const [cmtItem, setCmtItem] = useState("");
  const [cmtDate, setCmtDate] = useState("");

  // Reset when (re)opened with a preset type
  const [lastKey, setLastKey] = useState("");
  const openKey = `${open}:${initialType}`;
  if (open && openKey !== lastKey) {
    setLastKey(openKey);
    setType(initialType ?? "weekly");
    setForm(blank);
    setCommitments([]); setCmtItem(""); setCmtDate("");
  }

  const tpl = TEMPLATES[type];
  const useSample = () => setForm((f) => ({ ...f, attendees: tpl.attendees, agenda: tpl.agenda, action_items: tpl.action_items }));
  const addCommitment = () => {
    if (!cmtItem || !cmtDate) { toast.error("Pick an L2 item and a date"); return; }
    setCommitments((c) => [...c, { item: cmtItem, date: cmtDate }]);
    setCmtItem(""); setCmtDate("");
  };
  const removeCommitment = (i: number) => setCommitments((c) => c.filter((_, idx) => idx !== i));

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let agenda = form.agenda;
      if (type === "crm" && commitments.length) {
        const block = `Commitment for CRM Meeting (L2 Schedule)\n${commitments.map((c) => `• ${c.item} — ${fmtD(c.date)}`).join("\n")}`;
        agenda = agenda ? `${agenda}\n\n${block}` : block;
      }
      const { error } = await supabase.from("meetings").insert({
        station_id: stationId, meeting_type: type, meeting_date: form.meeting_date,
        attendees: form.attendees || null, agenda: agenda || null, minutes: form.minutes || null,
        action_items: form.action_items || null, next_meeting_date: form.next_meeting_date || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meeting logged"); onSaved(); onOpenChange(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a meeting</DialogTitle>
          <DialogDescription>Record minutes for a conducted meeting. It will appear in the Meeting Log and update this month's cadence.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Meeting type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEETING_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>{TYPE_LABEL[k]} · {FREQUENCY_LABEL[MEETING_FREQUENCY[k]]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Meeting date</Label>
            <DatePicker value={form.meeting_date} onChange={(v) => setForm({ ...form, meeting_date: v })} />
          </div>
          <div>
            <Label>Next meeting</Label>
            <DatePicker value={form.next_meeting_date} onChange={(v) => setForm({ ...form, next_meeting_date: v })} />
          </div>
          <div className="col-span-2 flex items-center justify-between gap-2">
            <Label>Attendees</Label>
            <Button size="sm" variant="outline" className="h-7" onClick={useSample}><Sparkles className="mr-1 h-3 w-3" /> Use {TYPE_SHORT[type]} sample</Button>
          </div>
          <div className="col-span-2 -mt-2">
            <Input value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder={tpl.attendees} />
          </div>
          {type === "crm" && (
            <div className="col-span-2 space-y-2 rounded-lg border bg-secondary/30 p-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-primary">L2 Schedule — Commitments</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground">L2 schedule item</Label>
                  <Select value={cmtItem} onValueChange={setCmtItem}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent>
                      {CRM_L2_ITEMS.map((it) => (<SelectItem key={it} value={it}>{it}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:w-40">
                  <Label className="text-[11px] text-muted-foreground">Committed date</Label>
                  <DatePicker value={cmtDate} onChange={setCmtDate} />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addCommitment}><Plus className="mr-1 h-4 w-4" /> Add</Button>
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
            <Label>Agenda{type === "crm" ? " (additional notes)" : ""}</Label>
            <Textarea rows={4} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} placeholder={tpl.agenda} />
          </div>
          <div className="col-span-2">
            <Label>Minutes / Discussion</Label>
            <Textarea rows={5} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Action items</Label>
            <Textarea rows={3} value={form.action_items} onChange={(e) => setForm({ ...form, action_items: e.target.value })} placeholder={tpl.action_items} />
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !form.meeting_date}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save meeting
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Plan meeting dialog (future schedule)
// ────────────────────────────────────────────────────────────────────────────
function PlanMeetingDialog({ stationId, initialType, open, onOpenChange, onSaved }: {
  stationId: string; initialType: MeetingType | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [type, setType] = useState<MeetingType>(initialType ?? "weekly");
  const blank = { title: "", planned_date: "", planned_time: "", agenda: "" };
  const [form, setForm] = useState(blank);

  const [lastKey, setLastKey] = useState("");
  const openKey = `${open}:${initialType}`;
  if (open && openKey !== lastKey) {
    setLastKey(openKey);
    setType(initialType ?? "weekly");
    setForm(blank);
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!form.planned_date) throw new Error("Pick a meeting date");
      const { data: { user } } = await db.auth.getUser();
      const { error } = await db.from("meeting_plans").insert({
        station_id: stationId, meeting_type: type, title: form.title || null,
        planned_date: form.planned_date, planned_time: form.planned_time || null,
        agenda: form.agenda || null, status: "planned", created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meeting scheduled — shows on dashboard & notifications"); onSaved(); onOpenChange(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan a meeting</DialogTitle>
          <DialogDescription>Save a future date. It is highlighted on the dashboard and triggers a notification as it approaches.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Meeting type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEETING_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>{TYPE_LABEL[k]} · {FREQUENCY_LABEL[MEETING_FREQUENCY[k]]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Meeting date</Label>
            <DatePicker value={form.planned_date} onChange={(v) => setForm({ ...form, planned_date: v })} />
          </div>
          <div>
            <Label>Time (optional)</Label>
            <Input type="time" value={form.planned_time} onChange={(e) => setForm({ ...form, planned_time: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Title / Purpose (optional)</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={`e.g. ${TYPE_LABEL[type]} — agenda lock`} />
          </div>
          <div className="col-span-2">
            <Label>Agenda notes (optional)</Label>
            <Textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !form.planned_date}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <CalendarPlus className="mr-1 h-4 w-4" /> Schedule meeting
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Meeting log (conducted)
// ────────────────────────────────────────────────────────────────────────────
function MeetingLog({ meetings, loading, stationId, stationName, canEdit, onChanged }: {
  meetings: Meeting[]; loading: boolean; stationId: string; stationName: string; canEdit: boolean; onChanged: () => void;
}) {
  const [filter, setFilter] = useState<"all" | MeetingType>("all");
  const rows = filter === "all" ? meetings : meetings.filter((m) => m.meeting_type === filter);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Filter</span>
        <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label={`All (${meetings.length})`} />
        {MEETING_TYPES.map((k) => {
          const n = meetings.filter((m) => m.meeting_type === k).length;
          return <FilterPill key={k} active={filter === k} onClick={() => setFilter(k)} label={`${TYPE_SHORT[k]} (${n})`} />;
        })}
      </div>

      {loading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!loading && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No meetings logged{filter !== "all" ? ` for ${TYPE_LABEL[filter]}` : ""} yet.</Card>
      )}

      <div className="space-y-2">
        {rows.map((m) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[m.meeting_type]}</Badge>
                  <Badge variant="outline" className="font-mono"><Calendar className="mr-1 h-3 w-3" />{fmtD(m.meeting_date)}</Badge>
                  {m.next_meeting_date && <Badge variant="outline" className="text-[10px]">Next: {fmtD(m.next_meeting_date)}</Badge>}
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

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {label}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Planner list (future / past plans, all types)
// ────────────────────────────────────────────────────────────────────────────
function PlannerList({ plans, loading, canEdit, onPlan, onChanged }: {
  plans: MeetingPlan[]; loading: boolean; canEdit: boolean; onPlan: () => void; onChanged: () => void;
}) {
  const today = startOfDayLocal(new Date());
  const upcoming = plans.filter((p) => p.status === "planned" && parseISO(p.planned_date) >= today);
  const past = plans.filter((p) => !(p.status === "planned" && parseISO(p.planned_date) >= today));

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("meeting_plans").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("meeting_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{upcoming.length} upcoming · {past.length} past</div>
        {canEdit && <Button size="sm" onClick={onPlan}><CalendarPlus className="mr-1 h-4 w-4" /> Plan meeting</Button>}
      </div>

      {loading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
      {!loading && plans.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No meetings planned yet.</Card>
      )}

      <div className="space-y-2">
        {upcoming.map((p) => (
          <PlanCard key={p.id} p={p} canEdit={canEdit} highlight onDone={() => setStatus.mutate({ id: p.id, status: "completed" })} onDelete={() => del.mutate(p.id)} />
        ))}
        {past.map((p) => (
          <PlanCard key={p.id} p={p} canEdit={canEdit} onDone={() => setStatus.mutate({ id: p.id, status: "completed" })} onDelete={() => del.mutate(p.id)} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ p, canEdit, onDone, onDelete, highlight }: {
  p: MeetingPlan; canEdit: boolean; onDone: () => void; onDelete: () => void; highlight?: boolean;
}) {
  const days = differenceInCalendarDays(parseISO(p.planned_date), startOfDayLocal(new Date()));
  const done = p.status === "completed";
  const cancelled = p.status === "cancelled";
  const label = TYPE_SHORT[p.meeting_type as MeetingType] ?? p.meeting_type;
  return (
    <Card className={`p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{label}</Badge>
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
            {!done && <Button variant="outline" size="sm" onClick={onDone}><CheckCircle2 className="mr-1 h-3 w-3" /> Done</Button>}
            <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Audio center (type-level recordings, e.g. live Teams capture)
// ────────────────────────────────────────────────────────────────────────────
function AudioCenter({ stationId, canEdit }: { stationId: string; canEdit: boolean }) {
  const [type, setType] = useState<MeetingType>("weekly");
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
          <Mic className="h-3.5 w-3.5" /> Record / upload meeting audio
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Capture a live meeting (microphone + Teams/computer audio) or upload an exported Teams recording. Recordings against a specific minute live inside that entry in the Meeting Log.
        </p>
        <div className="max-w-xs">
          <Label className="text-[11px] text-muted-foreground">Meeting type</Label>
          <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEETING_TYPES.map((k) => (<SelectItem key={k} value={k}>{TYPE_LABEL[k]}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <MeetingRecorder stationId={stationId} meetingType={type} canEdit={canEdit} />
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PDF + helpers
// ────────────────────────────────────────────────────────────────────────────
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
    startY: 34, theme: "grid",
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

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="whitespace-pre-wrap text-sm">{text}</div>
    </div>
  );
}

function startOfDayLocal(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
