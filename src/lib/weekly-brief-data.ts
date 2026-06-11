import { differenceInCalendarDays, format } from "date-fns";
import {
  buildStatusMap,
  computeRowState,
  stationProgress,
  plannedPctAt,
  type L2Task,
  type Status,
} from "./gantt-utils";
import { drawingCounts, isApproved, isSubmitted, type StationDrawing } from "./drawings";

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type BriefStation = {
  id: string;
  name: string;
  lot: string;
  capacity_mwh: number;
  capacity_mw?: number | null;
  agency: string | null;
  ntpc_eic: string | null;
};

export type BriefBoiMaster = { id: string; station_id: string; sl_no: number; name: string; scheduled_po_date?: string | null };
export type BriefBoiStatus = {
  station_id: string;
  boi_id: string;
  actual_po_date: string | null;
  delivery_date?: string | null;
  site_receipt_date?: string | null;
};
export type BriefMeeting = { station_id: string; meeting_type: string; meeting_date: string };
export type BriefComplMaster = { id: string; category: string; name: string };
export type BriefComplStatus = { station_id: string; compliance_id: string; status: string };
export type BriefIssue = { station_id: string; title: string; severity: string; status: string };
export type BriefDelay = { station_id: string; title: string; root_cause?: string | null; corrective_action?: string | null };

export type WeeklyBriefInput = {
  stations: BriefStation[];
  tasks: L2Task[];
  statusByStation: Record<string, Status[]>;
  drawings?: StationDrawing[];
  boiMaster?: BriefBoiMaster[];
  boiStatus?: BriefBoiStatus[];
  meetings?: BriefMeeting[];
  complianceMaster?: BriefComplMaster[];
  complianceStatus?: BriefComplStatus[];
  issues?: BriefIssue[];
  delays?: BriefDelay[];
};

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

export type Health = "green" | "amber" | "red";

export type BoiItemBrief = {
  name: string;
  poDate: string | null;
  deliveryDate: string | null;
  receiptDate: string | null;
};

export type StationBrief = {
  id: string;
  name: string;
  lot: string;
  agency: string;
  eic: string;
  capacityMwh: number;
  capacityMw: number | null;
  health: Health;
  pct: number;
  ideal: number;
  variance: number;
  l2: { done: number; total: number; delayed: number };
  mdl: { total: number; submitted: number; approved: number; pending: number; overdue: number };
  civil: { pct: number; done: number; total: number; delayed: number };
  boi: { ordered: number; total: number; delivered: number; received: number; items: BoiItemBrief[] };
  meetings: { held: number; last: string | null };
  compliance: { cleared: number; total: number; pending: number };
  criticalIssues: string[];
  progressNotes: string[];
};

export type WeeklyBrief = {
  generatedAt: Date;
  totals: {
    stations: number;
    totalMwh: number;
    avgPct: number;
    idealPct: number;
    onTrack: number;
    atRisk: number;
    delayed: number;
    boiOrdered: number;
    boiTotal: number;
    mdlApproved: number;
    mdlTotal: number;
  };
  stationsBrief: StationBrief[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function cleanAgency(a: string | null): string {
  if (!a) return "Unassigned";
  return a.replace(/,\s*\d+\s*$/, "").trim() || "Unassigned";
}

function healthOf(delayed: number): Health {
  if (delayed >= 5) return "red";
  if (delayed > 0) return "amber";
  return "green";
}

function withinDays(dateStr: string | null | undefined, today: Date, n: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const diff = differenceInCalendarDays(today, d);
  return diff >= 0 && diff <= n;
}

function fmt(d: string | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return format(dt, "dd-MMM-yy");
}

const CLEARED_COMPL = new Set(["approved", "not_applicable"]);

/** Roll up civil works progress for a station from civil-named L2 sections + leaves. */
function civilRollup(tasks: L2Task[], map: Map<string, Status>, today: Date) {
  const civilSections = tasks.filter((t) => t.is_section && /civil/i.test(t.name));
  const leafIds = new Set<string>();
  const leaves: L2Task[] = [];
  const addLeaf = (t: L2Task) => {
    if (t.is_section || leafIds.has(t.id)) return;
    leafIds.add(t.id);
    leaves.push(t);
  };
  for (const sec of civilSections) {
    for (const t of tasks) {
      if (t.is_section) continue;
      if (t.parent_wbs === sec.wbs_code || t.wbs_code.startsWith(sec.wbs_code + ".")) addLeaf(t);
    }
  }
  // Also pick up standalone leaf activities that mention civil.
  for (const t of tasks) if (!t.is_section && /civil/i.test(t.name)) addLeaf(t);

  let totalDur = 0,
    weighted = 0,
    done = 0,
    delayed = 0;
  for (const l of leaves) {
    const dur = Math.max(l.duration_days, 1);
    const st = map.get(l.id);
    const pct = st?.percent_complete ?? 0;
    totalDur += dur;
    weighted += dur * pct;
    if (pct >= 100) done += 1;
    if (computeRowState(l, st, today).status === "delayed") delayed += 1;
  }
  return {
    pct: totalDur ? Math.round(weighted / totalDur) : 0,
    done,
    total: leaves.length,
    delayed,
  };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function computeWeeklyBrief(input: WeeklyBriefInput, today: Date = new Date()): WeeklyBrief {
  const {
    stations,
    tasks,
    statusByStation,
    drawings = [],
    boiMaster = [],
    boiStatus = [],
    meetings = [],
    complianceMaster = [],
    complianceStatus = [],
    issues = [],
    delays = [],
  } = input;

  const drawingsByStation = new Map<string, StationDrawing[]>();
  for (const d of drawings) (drawingsByStation.get(d.station_id) ?? drawingsByStation.set(d.station_id, []).get(d.station_id)!).push(d);

  const boiStatusByStation = new Map<string, Map<string, BriefBoiStatus>>();
  for (const b of boiStatus) {
    let m = boiStatusByStation.get(b.station_id);
    if (!m) { m = new Map(); boiStatusByStation.set(b.station_id, m); }
    m.set(b.boi_id, b);
  }

  // Each station has its own BOI master list.
  const boiMasterByStation = new Map<string, BriefBoiMaster[]>();
  for (const b of boiMaster) {
    const arr = boiMasterByStation.get(b.station_id);
    if (arr) arr.push(b);
    else boiMasterByStation.set(b.station_id, [b]);
  }

  const meetingsByStation = new Map<string, BriefMeeting[]>();
  for (const m of meetings) (meetingsByStation.get(m.station_id) ?? meetingsByStation.set(m.station_id, []).get(m.station_id)!).push(m);

  const complByStation = new Map<string, Map<string, string>>();
  for (const c of complianceStatus) {
    let m = complByStation.get(c.station_id);
    if (!m) { m = new Map(); complByStation.set(c.station_id, m); }
    m.set(c.compliance_id, c.status);
  }

  const issuesByStation = new Map<string, BriefIssue[]>();
  for (const i of issues) (issuesByStation.get(i.station_id) ?? issuesByStation.set(i.station_id, []).get(i.station_id)!).push(i);

  const delaysByStation = new Map<string, BriefDelay[]>();
  for (const d of delays) (delaysByStation.get(d.station_id) ?? delaysByStation.set(d.station_id, []).get(d.station_id)!).push(d);

  const complTotal = complianceMaster.length;

  const stationsBrief: StationBrief[] = stations.map((s) => {
    const map = buildStatusMap(statusByStation[s.id]);
    const sTasks = tasks.filter((t) => t.station_id === s.id);
    const p = stationProgress(sTasks, map);
    const ideal = sTasks.length ? Math.round(plannedPctAt(sTasks, today)) : 0;
    const health = healthOf(p.delayed);

    // --- MDL / drawings ---
    const dRows = drawingsByStation.get(s.id) ?? [];
    const dc = drawingCounts(dRows);

    // --- Civil ---
    const civil = civilRollup(sTasks, map, today);

    // --- BOI (station-specific master list) ---
    const sBoi = boiStatusByStation.get(s.id) ?? new Map<string, BriefBoiStatus>();
    const sBoiMaster = boiMasterByStation.get(s.id) ?? [];
    const boiTotal = sBoiMaster.length;
    let ordered = 0, delivered = 0, received = 0;
    const orderedItems: Array<BoiItemBrief & { _sort: number }> = [];
    for (const b of sBoiMaster) {
      const st = sBoi.get(b.id);
      if (!st) continue;
      if (st.actual_po_date) {
        ordered += 1;
        orderedItems.push({
          name: b.name,
          poDate: st.actual_po_date,
          deliveryDate: st.delivery_date ?? null,
          receiptDate: st.site_receipt_date ?? null,
          _sort: new Date(st.actual_po_date).getTime(),
        });
      }
      if (st.delivery_date) delivered += 1;
      if (st.site_receipt_date) received += 1;
    }
    orderedItems.sort((a, b) => b._sort - a._sort);
    const items: BoiItemBrief[] = orderedItems.slice(0, 5).map(({ name, poDate, deliveryDate, receiptDate }) => ({
      name,
      poDate: fmt(poDate),
      deliveryDate: fmt(deliveryDate),
      receiptDate: fmt(receiptDate),
    }));

    // --- Meetings ---
    const mtgs = (meetingsByStation.get(s.id) ?? []).slice().sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    const meetingsBrief = { held: mtgs.length, last: mtgs.length ? fmt(mtgs[0].meeting_date) : null };

    // --- Compliance ---
    const cmap = complByStation.get(s.id) ?? new Map<string, string>();
    let cleared = 0;
    for (const cm of complianceMaster) {
      if (CLEARED_COMPL.has(cmap.get(cm.id) ?? "")) cleared += 1;
    }
    const compliance = { cleared, total: complTotal, pending: Math.max(0, complTotal - cleared) };

    // --- Critical issues ---
    const sIssues = issuesByStation.get(s.id) ?? [];
    let criticalIssues = sIssues
      .filter((i) => i.status !== "resolved" && i.status !== "closed" && /high|critical/i.test(i.severity))
      .map((i) => i.title);
    if (criticalIssues.length === 0) {
      criticalIssues = (delaysByStation.get(s.id) ?? []).slice(0, 3).map((d) => d.title);
    }
    if (criticalIssues.length === 0) criticalIssues = ["No critical issues flagged."];

    // --- Progress this week (last 7 days) ---
    const notes: string[] = [];
    let l2Done = 0, l2Started = 0;
    for (const t of sTasks) {
      if (t.is_section) continue;
      const st = map.get(t.id);
      if (withinDays(st?.actual_finish, today, 7)) l2Done += 1;
      else if (withinDays(st?.actual_start, today, 7)) l2Started += 1;
    }
    if (l2Done) notes.push(`${l2Done} L2 activit${l2Done === 1 ? "y" : "ies"} completed`);
    if (l2Started) notes.push(`${l2Started} new activit${l2Started === 1 ? "y" : "ies"} started`);
    const drgSub = dRows.filter((d) => withinDays(d.submitted_date, today, 7) || withinDays(d.resubmitted_date, today, 7)).length;
    const drgApp = dRows.filter((d) => isApproved(d) && withinDays(d.approved_date, today, 7)).length;
    if (drgSub) notes.push(`${drgSub} drawing${drgSub === 1 ? "" : "s"} submitted`);
    if (drgApp) notes.push(`${drgApp} drawing${drgApp === 1 ? "" : "s"} approved`);
    let poWk = 0, dlvWk = 0;
    for (const st of sBoi.values()) {
      if (withinDays(st.actual_po_date, today, 7)) poWk += 1;
      if (withinDays(st.delivery_date, today, 7)) dlvWk += 1;
    }
    if (poWk) notes.push(`${poWk} PO${poWk === 1 ? "" : "s"} placed`);
    if (dlvWk) notes.push(`${dlvWk} item${dlvWk === 1 ? "" : "s"} delivered`);
    if (notes.length === 0) notes.push("No major movement recorded this week.");

    return {
      id: s.id,
      name: s.name,
      lot: s.lot,
      agency: cleanAgency(s.agency),
      eic: s.ntpc_eic ?? "—",
      capacityMwh: Number(s.capacity_mwh) || 0,
      capacityMw: s.capacity_mw ?? null,
      health,
      pct: p.pct,
      ideal,
      variance: p.pct - ideal,
      l2: { done: p.completed, total: p.total, delayed: p.delayed },
      mdl: { total: dc.total, submitted: dc.submitted, approved: dc.approved, pending: dc.pending, overdue: dc.overdue },
      civil,
      boi: { ordered, total: boiTotal, delivered, received, items },
      meetings: meetingsBrief,
      compliance,
      criticalIssues,
      progressNotes: notes,
    };
  });

  const n = stationsBrief.length;
  const totals = {
    stations: n,
    totalMwh: stationsBrief.reduce((a, r) => a + r.capacityMwh, 0),
    avgPct: n ? Math.round(stationsBrief.reduce((a, r) => a + r.pct, 0) / n) : 0,
    idealPct: n ? Math.round(stationsBrief.reduce((a, r) => a + r.ideal, 0) / n) : 0,
    onTrack: stationsBrief.filter((r) => r.health === "green").length,
    atRisk: stationsBrief.filter((r) => r.health === "amber").length,
    delayed: stationsBrief.filter((r) => r.health === "red").length,
    boiOrdered: stationsBrief.reduce((a, r) => a + r.boi.ordered, 0),
    boiTotal: stationsBrief.reduce((a, r) => a + r.boi.total, 0),
    mdlApproved: stationsBrief.reduce((a, r) => a + r.mdl.approved, 0),
    mdlTotal: stationsBrief.reduce((a, r) => a + r.mdl.total, 0),
  };

  return { generatedAt: today, totals, stationsBrief };
}

void isSubmitted;
