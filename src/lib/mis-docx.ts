import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
} from "docx";
import { saveAs } from "file-saver";
import { format, differenceInCalendarDays } from "date-fns";
import {
  buildStatusMap,
  computeRowState,
  statusLabel,
  type L2Task,
  type Status,
  type RowStatus,
} from "./gantt-utils";
import { isSubmissionOverdue, type StationDrawing } from "./drawings";
import { computePortfolioAnalytics } from "./mis-analytics";
import { TYPE_SHORT } from "./meeting-types";
import type { WeeklyPdfExtras } from "./mis-pdf";

type Station = {
  id: string;
  name: string;
  lot: string;
  capacity_mwh: number;
  agency: string | null;
  ntpc_eic: string | null;
};

const BRAND = "0D6E7C";
const RED = "DC2626";
const AMBER = "D97706";
const GREEN = "16A34A";
const PURPLE = "7C3AED";

const HEALTH_LABEL: Record<string, string> = { green: "On Track", amber: "At Risk", red: "Delayed" };
const HEALTH_HEX: Record<string, string> = { green: GREEN, amber: AMBER, red: RED };

function cleanAgency(a: string | null): string {
  if (!a) return "Unassigned";
  return a.replace(/,\s*\d+\s*$/, "").trim() || "Unassigned";
}

function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND, size: 28 })],
  });
}

function para(text: string, opts: { size?: number; bold?: boolean; color?: string } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, size: opts.size ?? 22, bold: opts.bold, color: opts.color })],
  });
}

function bullet(text: string, color?: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, color })],
  });
}

function cell(text: string, opts: { bold?: boolean; color?: string; fill?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 18 })],
      }),
    ],
  });
}

function headerRow(labels: string[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l) => cell(l, { bold: true, color: "FFFFFF", fill: BRAND })),
  });
}

function buildTable(head: string[], rows: TableCell[][]): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "D9D9D9" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [headerRow(head), ...rows.map((r) => new TableRow({ children: r }))],
  });
}

export async function exportWeeklyDOCX(
  stations: Station[],
  tasks: L2Task[],
  statusByStation: Record<string, Status[]>,
  extras: WeeklyPdfExtras = {},
) {
  const today = new Date();
  const stationName = new Map(stations.map((s) => [s.id, s.name]));
  const analytics = computePortfolioAnalytics(stations, tasks, statusByStation, today);
  const t = analytics.totals;
  const sorted = [...analytics.stations].sort(
    (a, b) => (["red", "amber", "green"].indexOf(a.health) - ["red", "amber", "green"].indexOf(b.health)) || a.pct - b.pct,
  );

  const content: (Paragraph | Table)[] = [];

  // Title
  content.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: "NTPC BESS — Weekly MIS Report", bold: true, color: BRAND, size: 40 })],
    }),
    para(`Portfolio progress, exceptions & governance · As of ${format(today, "dd MMM yyyy, HH:mm")}`, { size: 20, color: "6E6E6E" }),
  );

  // KPI summary line
  content.push(h2("Portfolio Snapshot"));
  content.push(
    buildTable(
      ["Metric", "Value"],
      [
        ["Stations", String(t.stations)],
        ["Total Capacity", `${t.totalMWh.toLocaleString()} MWh`],
        ["Average Progress (Actual)", `${t.avgProgress}%`],
        ["Ideal / Baseline Progress", `${t.idealProgress}%`],
        ["Schedule Variance", `${t.daysBehind >= 0 ? `${t.daysBehind} days behind` : `${Math.abs(t.daysBehind)} days ahead`}`],
        ["On Track / At Risk / Delayed", `${t.onTrack} / ${t.atRisk} / ${t.delayed}`],
      ].map(([k, v]) => [cell(k, { bold: true }), cell(v)]),
    ),
  );

  // Executive Narrative
  const narrative = extras.narrative;
  if (narrative) {
    content.push(h2("Executive Narrative & Analysis"));
    for (const p of narrative.executiveSummary.split(/\n\n+/)) {
      if (p.trim()) content.push(para(p.trim()));
    }
    content.push(para("Key Insights", { bold: true, color: BRAND, size: 24 }));
    narrative.keyInsights.forEach((i) => content.push(bullet(i)));
    content.push(para("Top Risks", { bold: true, color: RED, size: 24 }));
    narrative.risks.forEach((i) => content.push(bullet(i, RED)));
    content.push(para("Recommendations", { bold: true, color: GREEN, size: 24 }));
    narrative.recommendations.forEach((i) => content.push(bullet(i, GREEN)));
    content.push(para("Outlook", { bold: true, color: BRAND, size: 24 }));
    content.push(para(narrative.outlook));
  }

  // Station Status Summary
  content.push(h2("Station Status Summary"));
  content.push(
    buildTable(
      ["Station", "Lot", "Agency", "EIC", "Actual %", "Ideal %", "Var.", "Tasks Done", "Delayed", "Status"],
      sorted.map((r) => {
        const v = r.pct - r.ideal;
        return [
          cell(r.name, { bold: true }),
          cell(r.lot),
          cell(r.agency),
          cell(r.eic),
          cell(`${r.pct}%`, { align: AlignmentType.RIGHT }),
          cell(`${r.ideal}%`, { align: AlignmentType.RIGHT }),
          cell(`${v >= 0 ? "+" : ""}${v}%`, { align: AlignmentType.RIGHT, color: v >= 0 ? GREEN : v >= -10 ? AMBER : RED, bold: true }),
          cell(`${r.completed}/${r.total}`, { align: AlignmentType.RIGHT }),
          cell(String(r.delayed), { align: AlignmentType.RIGHT }),
          cell(HEALTH_LABEL[r.health], { bold: true, color: HEALTH_HEX[r.health] }),
        ];
      }),
    ),
  );

  // Drawings exceptions
  const drawingExc = (extras.drawings ?? [])
    .filter((d: StationDrawing) => isSubmissionOverdue(d, today))
    .map((d) => ({
      station: stationName.get(d.station_id) ?? "—",
      ref: d.drg_ref || "—",
      desc: d.drg_desc || "—",
      cat: d.category || "—",
      sch: d.sch_date ? format(new Date(d.sch_date), "dd-MMM-yy") : "—",
      days: d.sch_date ? Math.max(0, differenceInCalendarDays(today, new Date(d.sch_date))) : 0,
    }))
    .sort((a, b) => b.days - a.days);
  content.push(h2("Drawings Exceptions — Submission Overdue"));
  content.push(
    buildTable(
      ["Station", "Drg Ref", "Description", "Category", "Sch. Submission", "Days Overdue"],
      drawingExc.length
        ? drawingExc.slice(0, 80).map((e) => [cell(e.station), cell(e.ref), cell(e.desc), cell(e.cat), cell(e.sch), cell(`${e.days}d`, { align: AlignmentType.RIGHT, color: RED, bold: true })])
        : [[cell("No drawing submission exceptions.")]],
    ),
  );

  // BOI exceptions
  const boiMaster = extras.boiMaster ?? [];
  const boiStatusMap = new Map((extras.boiStatus ?? []).map((s) => [`${s.station_id}::${s.boi_id}`, s]));
  const boiExc: Array<{ station: string; equip: string; sch: string; days: number }> = [];
  for (const s of stations) {
    for (const b of boiMaster) {
      if (!b.scheduled_po_date) continue;
      const st = boiStatusMap.get(`${s.id}::${b.id}`);
      if (st?.actual_po_date) continue;
      const days = differenceInCalendarDays(today, new Date(b.scheduled_po_date));
      if (days > 0) boiExc.push({ station: s.name, equip: b.name, sch: format(new Date(b.scheduled_po_date), "dd-MMM-yy"), days });
    }
  }
  boiExc.sort((a, b) => b.days - a.days);
  content.push(h2("BOI Exceptions — PO Overdue"));
  content.push(
    buildTable(
      ["Station", "BOI Equipment", "Scheduled PO", "Days Overdue"],
      boiExc.length
        ? boiExc.slice(0, 80).map((e) => [cell(e.station), cell(e.equip), cell(e.sch), cell(`${e.days}d`, { align: AlignmentType.RIGHT, color: AMBER, bold: true })])
        : [[cell("No BOI PO exceptions.")]],
    ),
  );

  // L2 exceptions
  const l2Exc: Array<{ station: string; wbs: string; task: string; planFinish: string; committed: string; daysOverdue: number; status: RowStatus; owner: string }> = [];
  for (const s of stations) {
    const map = buildStatusMap(statusByStation[s.id]);
    for (const task of tasks.filter((tk) => tk.station_id === s.id)) {
      if (task.is_section) continue;
      const st = map.get(task.id);
      const cs = computeRowState(task, st, today);
      const overdueDays = cs.plannedEnd && cs.pct < 100 && today > cs.plannedEnd ? differenceInCalendarDays(today, cs.plannedEnd) : 0;
      if (cs.status === "delayed" || cs.status === "blocked" || overdueDays > 0) {
        l2Exc.push({
          station: s.name,
          wbs: task.wbs_code,
          task: task.name,
          planFinish: task.baseline_finish ? format(new Date(task.baseline_finish), "dd-MMM-yy") : "—",
          committed: st?.committed_date ? format(new Date(st.committed_date), "dd-MMM-yy") : "—",
          daysOverdue: Math.max(overdueDays, cs.slipDays),
          status: cs.status as RowStatus,
          owner: st?.owner ?? "—",
        });
      }
    }
  }
  l2Exc.sort((a, b) => a.station.localeCompare(b.station) || b.daysOverdue - a.daysOverdue);
  content.push(h2("L2 Schedule Exceptions — Activities Overdue"));
  content.push(
    buildTable(
      ["Station", "WBS", "Activity", "Planned Finish", "Committed", "Days O/D", "Status", "Owner"],
      l2Exc.length
        ? l2Exc.slice(0, 120).map((e) => [cell(e.station), cell(e.wbs), cell(e.task), cell(e.planFinish), cell(e.committed), cell(`${e.daysOverdue}d`, { align: AlignmentType.RIGHT, color: RED, bold: true }), cell(statusLabel(e.status)), cell(e.owner)])
        : [[cell("No exceptions. All activities on schedule.")]],
    ),
  );

  // Compliance pending
  const complMaster = extras.complianceMaster ?? [];
  const complMap = new Map((extras.complianceStatus ?? []).map((c) => [`${c.station_id}::${c.compliance_id}`, c.status]));
  const isComplCleared = (s: string | undefined) => s === "approved" || s === "not_applicable";
  const complRows = stations
    .map((s) => {
      const items = complMaster.filter((m) => !isComplCleared(complMap.get(`${s.id}::${m.id}`)));
      return { station: s.name, pending: items.length, total: complMaster.length, names: items.map((m) => m.name) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.pending - a.pending);
  content.push(h2("Statutory Compliance — Pending Items"));
  content.push(
    buildTable(
      ["Station", "Pending", "Cleared", "Open Compliance Items"],
      complRows.length
        ? complRows.map((r) => [cell(r.station), cell(String(r.pending), { align: AlignmentType.RIGHT, color: r.pending > 0 ? PURPLE : undefined, bold: true }), cell(`${r.total - r.pending}/${r.total}`, { align: AlignmentType.RIGHT }), cell(r.names.slice(0, 12).join(", ") || "—")])
        : [[cell("No compliance master configured.")]],
    ),
  );

  // Meetings governance
  const plans = (extras.plans ?? [])
    .filter((p) => p.planned_date >= format(today, "yyyy-MM-dd"))
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
    .slice(0, 20);
  const meetingsDone = (extras.meetings ?? []).slice().sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)).slice(0, 20);
  content.push(h2("Meetings Governance — Upcoming"));
  content.push(
    buildTable(
      ["Upcoming Meeting", "Station", "Planned Date"],
      plans.length
        ? plans.map((p) => [
            cell(`${TYPE_SHORT[p.meeting_type as keyof typeof TYPE_SHORT] ?? p.meeting_type}${p.title ? ` — ${p.title}` : ""}`),
            cell(stationName.get(p.station_id) ?? "—"),
            cell(format(new Date(p.planned_date), "dd-MMM-yy")),
          ])
        : [[cell("No upcoming meetings planned.")]],
    ),
  );
  content.push(h2("Meetings Governance — Last Concluded"));
  content.push(
    buildTable(
      ["Meeting", "Station", "Date"],
      meetingsDone.length
        ? meetingsDone.map((m) => [
            cell(TYPE_SHORT[m.meeting_type as keyof typeof TYPE_SHORT] ?? m.meeting_type),
            cell(stationName.get(m.station_id) ?? "—"),
            cell(format(new Date(m.meeting_date), "dd-MMM-yy")),
          ])
        : [[cell("No concluded meetings recorded.")]],
    ),
  );

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: 15840, height: 12240 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: content,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `NTPC-BESS-Weekly-MIS-${format(today, "yyyyMMdd")}.docx`);
}

void cleanAgency;
