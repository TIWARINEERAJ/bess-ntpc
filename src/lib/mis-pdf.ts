import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format, differenceInCalendarDays } from "date-fns";
import {
  buildStatusMap,
  computeRowState,
  stationProgress,
  statusLabel,
  type L2Task,
  type Status,
  type RowStatus,
} from "./gantt-utils";
import { isSubmissionOverdue, type StationDrawing } from "./drawings";
import { TYPE_SHORT } from "./meeting-types";

type Station = {
  id: string;
  name: string;
  lot: string;
  capacity_mwh: number;
  agency: string | null;
  ntpc_eic: string | null;
};

type BoiMaster = { id: string; sl_no: number; name: string; scheduled_po_date: string | null };
type BoiStatus = { station_id: string; boi_id: string; actual_po_date: string | null };
type MeetingRow = { station_id: string; meeting_type: string; meeting_date: string };
type PlanRow = { station_id: string; meeting_type: string; planned_date: string; title: string | null };
type Snapshot = { snapshot_date: string; station_id: string; pct: number };
type ComplMaster = { id: string; category: string; name: string };
type ComplStatus = { station_id: string; compliance_id: string; status: string };

export type WeeklyPdfExtras = {
  drawings?: StationDrawing[];
  boiMaster?: BoiMaster[];
  boiStatus?: BoiStatus[];
  meetings?: MeetingRow[];
  plans?: PlanRow[];
  snapshots?: Snapshot[];
  complianceMaster?: ComplMaster[];
  complianceStatus?: ComplStatus[];
};

type Health = "green" | "amber" | "red";
type RGB = [number, number, number];

function cleanAgency(a: string | null): string {
  if (!a) return "Unassigned";
  return a.replace(/,\s*\d+\s*$/, "").trim() || "Unassigned";
}

function healthOf(delayed: number): Health {
  if (delayed >= 5) return "red";
  if (delayed > 0) return "amber";
  return "green";
}

const HEALTH_LABEL: Record<Health, string> = { green: "On Track", amber: "At Risk", red: "Delayed" };
const HEALTH_RGB: Record<Health, RGB> = {
  green: [22, 163, 74],
  amber: [217, 119, 6],
  red: [220, 38, 38],
};

const BRAND: RGB = [13, 110, 124];
const BRAND_LIGHT: RGB = [83, 170, 182];
const INK: RGB = [30, 30, 30];
const MUTED: RGB = [110, 110, 110];

/* ---------------- native vector charts ---------------- */

function drawColumnChart(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; title: string; data: { label: string; value: number; color: RGB }[]; max?: number; suffix?: string },
) {
  const { x, y, w, h, title, data, suffix = "" } = opts;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(title, x, y);

  const top = y + 12;
  const chartH = h - 34;
  const baseY = top + chartH;
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.6);
  doc.line(x, baseY, x + w, baseY);

  const n = Math.max(1, data.length);
  const slot = w / n;
  const barW = Math.min(46, slot * 0.55);
  const maxV = opts.max ?? Math.max(1, ...data.map((d) => d.value));

  data.forEach((d, i) => {
    const cx = x + slot * i + slot / 2;
    const bh = maxV > 0 ? (d.value / maxV) * chartH : 0;
    const by = baseY - bh;
    doc.setFillColor(d.color[0], d.color[1], d.color[2]);
    doc.roundedRect(cx - barW / 2, by, barW, Math.max(0.6, bh), 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(70, 70, 70);
    doc.text(`${d.value}${suffix}`, cx, by - 3, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(d.label, slot - 4);
    doc.text(lines.slice(0, 2), cx, baseY + 10, { align: "center" });
  });
}

function drawLineChart(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; title: string; points: { label: string; value: number }[]; color: RGB },
) {
  const { x, y, w, h, title, points, color } = opts;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(title, x, y);

  const top = y + 12;
  const chartH = h - 34;
  const baseY = top + chartH;
  const maxV = 100;

  // gridlines + y labels
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160);
  for (const v of [0, 25, 50, 75, 100]) {
    const yy = baseY - (v / maxV) * chartH;
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.4);
    doc.line(x, yy, x + w, yy);
    doc.text(`${v}`, x - 4, yy + 2, { align: "right" });
  }

  if (points.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("No snapshot history yet — capture a weekly snapshot to build the trend.", x + 6, top + chartH / 2);
    return;
  }

  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    px: points.length > 1 ? x + step * i : x + w / 2,
    py: baseY - (Math.min(100, Math.max(0, p.value)) / maxV) * chartH,
    p,
  }));

  // area fill
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    doc.triangle(a.px, baseY, a.px, a.py, b.px, b.py, "F");
    doc.triangle(a.px, baseY, b.px, b.py, b.px, baseY, "F");
  }
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // line
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(1.6);
  for (let i = 0; i < coords.length - 1; i++) {
    doc.line(coords[i].px, coords[i].py, coords[i + 1].px, coords[i + 1].py);
  }

  // dots + value labels + x labels
  coords.forEach((c, i) => {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(c.px, c.py, 1.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(`${c.p.value}%`, c.px, c.py - 5, { align: "center" });
    if (i === 0 || i === coords.length - 1 || coords.length <= 8 || i % Math.ceil(coords.length / 8) === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(c.p.label, c.px, baseY + 10, { align: "center" });
    }
  });
}

/** Grouped columns: per station a Progress% bar (left scale 0-100) and a Delays bar (right scale). */
function drawProgressDelayChart(
  doc: jsPDF,
  opts: { x: number; y: number; w: number; h: number; title: string; data: { label: string; pct: number; delayed: number }[] },
) {
  const { x, y, w, h, title, data } = opts;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...INK);
  doc.text(title, x, y);

  // legend
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const lx = x + w - 150;
  doc.setFillColor(...BRAND); doc.rect(lx, y - 7, 9, 9, "F");
  doc.setTextColor(...MUTED); doc.text("Progress %", lx + 13, y);
  doc.setFillColor(...HEALTH_RGB.red); doc.rect(lx + 78, y - 7, 9, 9, "F");
  doc.text("Delays", lx + 91, y);

  const top = y + 14;
  const chartH = h - 40;
  const baseY = top + chartH;
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.6);
  doc.line(x, baseY, x + w, baseY);

  const n = Math.max(1, data.length);
  const slot = w / n;
  const groupW = Math.min(34, slot * 0.6);
  const barW = groupW / 2 - 1;
  const maxDelay = Math.max(1, ...data.map((d) => d.delayed));

  data.forEach((d, i) => {
    const cx = x + slot * i + slot / 2;
    // progress bar (0-100 scale)
    const ph = (Math.min(100, Math.max(0, d.pct)) / 100) * chartH;
    doc.setFillColor(...BRAND);
    doc.roundedRect(cx - groupW / 2, baseY - ph, barW, Math.max(0.6, ph), 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND);
    doc.text(`${d.pct}`, cx - groupW / 2 + barW / 2, baseY - ph - 2.5, { align: "center" });
    // delay bar (scaled to maxDelay)
    const dh = (d.delayed / maxDelay) * chartH;
    doc.setFillColor(...HEALTH_RGB.red);
    doc.roundedRect(cx + 1, baseY - dh, barW, Math.max(d.delayed > 0 ? 1.2 : 0, dh), 1, 1, "F");
    if (d.delayed > 0) {
      doc.setTextColor(...HEALTH_RGB.red);
      doc.text(`${d.delayed}`, cx + 1 + barW / 2, baseY - dh - 2.5, { align: "center" });
    }
    // label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(d.label, slot - 2);
    doc.text(lines.slice(0, 2), cx, baseY + 9, { align: "center" });
  });
}


  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(text, x, y);
  if (sub) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(sub, x, y + 12);
  }
}

/* ---------------- main report ---------------- */

export function exportWeeklyPDF(
  stations: Station[],
  tasks: L2Task[],
  statusByStation: Record<string, Status[]>,
  extras: WeeklyPdfExtras = {},
) {
  const doc = buildWeeklyDoc(stations, tasks, statusByStation, extras);
  doc.save(`NTPC-BESS-Weekly-MIS-${format(new Date(), "yyyyMMdd")}.pdf`);
}

export function buildWeeklyDoc(
  stations: Station[],
  tasks: L2Task[],
  statusByStation: Record<string, Status[]>,
  extras: WeeklyPdfExtras = {},
): jsPDF {
  const today = new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const contentW = pageW - margin * 2;
  const stationName = new Map(stations.map((s) => [s.id, s.name]));

  const rows = stations.map((s) => {
    const map = buildStatusMap(statusByStation[s.id]);
    const sTasks = tasks.filter((t) => t.station_id === s.id);
    const p = stationProgress(sTasks, map);
    return { s, ...p, health: healthOf(p.delayed) };
  });

  const total = rows.length;
  const green = rows.filter((r) => r.health === "green").length;
  const amber = rows.filter((r) => r.health === "amber").length;
  const red = rows.filter((r) => r.health === "red").length;
  const avgPct = total ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / total) : 0;

  // ---- Header ----
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageW, 60, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("NTPC BESS — Weekly MIS Report", margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Portfolio progress, exceptions & governance · As of ${format(today, "dd MMM yyyy, HH:mm")}`, margin, 47);

  // ---- KPI strip ----
  let y = 78;
  const kpis: Array<[string, string, RGB]> = [
    ["Stations", String(total), BRAND],
    ["Avg. Progress", `${avgPct}%`, BRAND],
    ["On Track", String(green), HEALTH_RGB.green],
    ["At Risk", String(amber), HEALTH_RGB.amber],
    ["Delayed", String(red), HEALTH_RGB.red],
  ];
  const kpiW = (contentW - 8 * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 8);
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 250);
    doc.roundedRect(x, y, kpiW, 50, 5, 5, "FD");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(k[0].toUpperCase(), x + 12, y + 18);
    doc.setTextColor(k[2][0], k[2][1], k[2][2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(k[1], x + 12, y + 41);
  });
  y += 70;

  // ---- Charts band: health distribution + progress trend ----
  const half = (contentW - 20) / 2;
  const chartH = 130;
  drawColumnChart(doc, {
    x: margin,
    y,
    w: half,
    h: chartH,
    title: "Station Health Distribution",
    data: [
      { label: "On Track", value: green, color: HEALTH_RGB.green },
      { label: "At Risk", value: amber, color: HEALTH_RGB.amber },
      { label: "Delayed", value: red, color: HEALTH_RGB.red },
    ],
  });

  // progress trend from snapshots (portfolio avg per weekend)
  const snaps = extras.snapshots ?? [];
  const byDate = new Map<string, { sum: number; n: number }>();
  for (const sp of snaps) {
    const e = byDate.get(sp.snapshot_date) ?? { sum: 0, n: 0 };
    e.sum += sp.pct;
    e.n += 1;
    byDate.set(sp.snapshot_date, e);
  }
  const trendPoints = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({ label: format(new Date(date), "dd MMM"), value: Math.round(e.sum / e.n) }));

  drawLineChart(doc, {
    x: margin + half + 20,
    y,
    w: half,
    h: chartH,
    title: "Portfolio Progress Trend (weekly)",
    points: trendPoints,
    color: BRAND,
  });
  y += chartH + 8;

  // ---- Agency performance full-width column chart ----
  const agencyMap = new Map<string, { pctSum: number; count: number; delayed: number }>();
  for (const r of rows) {
    const key = cleanAgency(r.s.agency);
    const e = agencyMap.get(key) ?? { pctSum: 0, count: 0, delayed: 0 };
    e.pctSum += r.pct;
    e.count += 1;
    e.delayed += r.delayed;
    agencyMap.set(key, e);
  }
  const agencyRows = Array.from(agencyMap.entries())
    .map(([agency, e]) => ({ agency, count: e.count, avgPct: Math.round(e.pctSum / e.count), delayed: e.delayed }))
    .sort((a, b) => b.avgPct - a.avgPct);

  drawColumnChart(doc, {
    x: margin,
    y,
    w: contentW,
    h: 150,
    title: "Agency-wise Progress Performance (avg % complete)",
    data: agencyRows.map((a) => ({
      label: `${a.agency} (${a.count})`,
      value: a.avgPct,
      color: a.avgPct >= 60 ? HEALTH_RGB.green : a.avgPct >= 35 ? HEALTH_RGB.amber : HEALTH_RGB.red,
    })),
    max: 100,
    suffix: "%",
  });
  y += 150 + 16;

  // ---- Station status summary table ----
  const order: Health[] = ["red", "amber", "green"];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.health) - order.indexOf(b.health) || a.pct - b.pct);
  if (y > pageH - 160) { doc.addPage(); y = margin; }
  sectionTitle(doc, "Station Status Summary", margin, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Station", "Lot", "Agency", "EIC", "Progress %", "Tasks Done", "Delayed", "Status"]],
    body: sorted.map((r) => [
      r.s.name,
      r.s.lot,
      cleanAgency(r.s.agency),
      r.s.ntpc_eic ?? "—",
      `${r.pct}%`,
      `${r.completed}/${r.total}`,
      String(r.delayed),
      HEALTH_LABEL[r.health],
    ]),
    styles: { fontSize: 9.5, cellPadding: 4 },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9.5 },
    alternateRowStyles: { fillColor: [246, 248, 249] },
    columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const h = sorted[data.row.index].health;
        data.cell.styles.textColor = HEALTH_RGB[h];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- Drawings exceptions (submission overdue) ----
  const drawings = extras.drawings ?? [];
  const drawingExc = drawings
    .filter((d) => isSubmissionOverdue(d, today))
    .map((d) => ({
      station: stationName.get(d.station_id) ?? "—",
      ref: d.drg_ref || "—",
      desc: d.drg_desc || "—",
      cat: d.category || "—",
      sch: d.sch_date ? format(new Date(d.sch_date), "dd-MMM-yy") : "—",
      days: d.sch_date ? Math.max(0, differenceInCalendarDays(today, new Date(d.sch_date))) : 0,
    }))
    .sort((a, b) => b.days - a.days);

  // @ts-expect-error lastAutoTable injected by plugin
  let curY = doc.lastAutoTable.finalY + 22;
  if (curY > pageH - 120) { doc.addPage(); curY = margin; }
  sectionTitle(doc, "Drawings Exceptions — Submission Overdue", margin, curY, "Drawings past their scheduled submission date that are not yet submitted, sorted by days overdue");
  autoTable(doc, {
    startY: curY + 20,
    head: [["Station", "Drg Ref", "Drawing Description", "Category", "Sch. Submission", "Days Overdue"]],
    body: drawingExc.length
      ? drawingExc.slice(0, 60).map((e) => [e.station, e.ref, e.desc, e.cat, e.sch, `${e.days}d`])
      : [["—", "—", "No drawing submission exceptions.", "—", "—", "—"]],
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: HEALTH_RGB.red, textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [252, 246, 246] },
    columnStyles: { 2: { cellWidth: 300 }, 5: { halign: "right" } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5 && drawingExc.length) {
        data.cell.styles.textColor = HEALTH_RGB.red;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- BOI exceptions (PO overdue from scheduled date) ----
  const boiMaster = extras.boiMaster ?? [];
  const boiStatus = extras.boiStatus ?? [];
  const boiStatusMap = new Map(boiStatus.map((s) => [`${s.station_id}::${s.boi_id}`, s]));
  const boiExc: Array<{ station: string; equip: string; sch: string; days: number }> = [];
  for (const s of stations) {
    for (const b of boiMaster) {
      if (!b.scheduled_po_date) continue;
      const st = boiStatusMap.get(`${s.id}::${b.id}`);
      if (st?.actual_po_date) continue;
      const days = differenceInCalendarDays(today, new Date(b.scheduled_po_date));
      if (days > 0) {
        boiExc.push({ station: s.name, equip: b.name, sch: format(new Date(b.scheduled_po_date), "dd-MMM-yy"), days });
      }
    }
  }
  boiExc.sort((a, b) => b.days - a.days);

  // @ts-expect-error lastAutoTable injected by plugin
  let boiY = doc.lastAutoTable.finalY + 22;
  if (boiY > pageH - 120) { doc.addPage(); boiY = margin; }
  sectionTitle(doc, "BOI Exceptions — PO Overdue", margin, boiY, "Bought-out items past their scheduled PO date with no actual PO placed");
  autoTable(doc, {
    startY: boiY + 20,
    head: [["Station", "BOI Equipment", "Scheduled PO", "Days Overdue"]],
    body: boiExc.length
      ? boiExc.slice(0, 60).map((e) => [e.station, e.equip, e.sch, `${e.days}d`])
      : [["—", "No BOI PO exceptions.", "—", "—"]],
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [252, 249, 244] },
    columnStyles: { 3: { halign: "right" } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 3 && boiExc.length) {
        data.cell.styles.textColor = [180, 83, 9];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- L2 station-wise exceptions ----
  const l2Exc: Array<{ station: string; wbs: string; task: string; planFinish: string; daysOverdue: number; status: RowStatus; owner: string }> = [];
  for (const r of rows) {
    const map = buildStatusMap(statusByStation[r.s.id]);
    for (const t of tasks.filter((t) => t.station_id === r.s.id)) {
      if (t.is_section) continue;
      const st = map.get(t.id);
      const cs = computeRowState(t, st, today);
      const overdueDays = cs.plannedEnd && cs.pct < 100 && today > cs.plannedEnd ? differenceInCalendarDays(today, cs.plannedEnd) : 0;
      if (cs.status === "delayed" || cs.status === "blocked" || overdueDays > 0) {
        l2Exc.push({
          station: r.s.name,
          wbs: t.wbs_code,
          task: t.name,
          planFinish: t.baseline_finish ? format(new Date(t.baseline_finish), "dd-MMM-yy") : "—",
          daysOverdue: Math.max(overdueDays, cs.slipDays),
          status: cs.status as RowStatus,
          owner: st?.owner ?? "—",
        });
      }
    }
  }
  l2Exc.sort((a, b) => a.station.localeCompare(b.station) || b.daysOverdue - a.daysOverdue);

  // @ts-expect-error lastAutoTable injected by plugin
  let exY = doc.lastAutoTable.finalY + 22;
  if (exY > pageH - 120) { doc.addPage(); exY = margin; }
  sectionTitle(doc, "L2 Schedule Exceptions — Activities Overdue", margin, exY, "Delayed / blocked leaf activities, sorted by station and days overdue");
  autoTable(doc, {
    startY: exY + 20,
    head: [["Station", "WBS", "Activity", "Planned Finish", "Days Overdue", "Status", "Owner"]],
    body: l2Exc.length
      ? l2Exc.slice(0, 80).map((e) => [e.station, e.wbs, e.task, e.planFinish, `${e.daysOverdue}d`, statusLabel(e.status), e.owner])
      : [["—", "—", "No exceptions. All activities on schedule.", "—", "—", "—", "—"]],
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: HEALTH_RGB.red, textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [252, 246, 246] },
    columnStyles: { 2: { cellWidth: 280 }, 4: { halign: "right" } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4 && l2Exc.length) {
        data.cell.styles.textColor = HEALTH_RGB.red;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- Meetings governance (upcoming + last concluded) ----
  const plans = (extras.plans ?? [])
    .filter((p) => p.planned_date >= format(today, "yyyy-MM-dd"))
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
    .slice(0, 20);
  const meetingsDone = (extras.meetings ?? [])
    .slice()
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
    .slice(0, 20);

  // @ts-expect-error lastAutoTable injected by plugin
  let mY = doc.lastAutoTable.finalY + 22;
  if (mY > pageH - 140) { doc.addPage(); mY = margin; }
  sectionTitle(doc, "Meetings Governance", margin, mY, "Upcoming planned meetings and most recently concluded meetings");
  mY += 20;

  const mHalf = (contentW - 20) / 2;
  autoTable(doc, {
    startY: mY,
    head: [["Upcoming Meeting", "Station", "Planned Date"]],
    body: plans.length
      ? plans.map((p) => [
          `${TYPE_SHORT[p.meeting_type as keyof typeof TYPE_SHORT] ?? p.meeting_type}${p.title ? ` — ${p.title}` : ""}`,
          stationName.get(p.station_id) ?? "—",
          format(new Date(p.planned_date), "dd-MMM-yy"),
        ])
      : [["No upcoming meetings planned.", "—", "—"]],
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [246, 248, 249] },
    tableWidth: mHalf,
    margin: { left: margin },
  });
  // @ts-expect-error lastAutoTable injected by plugin
  const leftEnd = doc.lastAutoTable.finalY;

  autoTable(doc, {
    startY: mY,
    head: [["Last Concluded", "Station", "Date"]],
    body: meetingsDone.length
      ? meetingsDone.map((m) => [
          TYPE_SHORT[m.meeting_type as keyof typeof TYPE_SHORT] ?? m.meeting_type,
          stationName.get(m.station_id) ?? "—",
          format(new Date(m.meeting_date), "dd-MMM-yy"),
        ])
      : [["No concluded meetings recorded.", "—", "—"]],
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: BRAND_LIGHT, textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [246, 248, 249] },
    tableWidth: mHalf,
    margin: { left: margin + mHalf + 20 },
  });
  // @ts-expect-error lastAutoTable injected by plugin
  const rightEnd = doc.lastAutoTable.finalY;
  void leftEnd; void rightEnd;

  // ---- Footer page numbers ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`NTPC BESS Weekly MIS · Page ${i} of ${pageCount}`, pageW - margin, pageH - 14, { align: "right" });
  }

  return doc;
}
