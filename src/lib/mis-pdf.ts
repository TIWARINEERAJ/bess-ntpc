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

type Station = {
  id: string;
  name: string;
  lot: string;
  capacity_mwh: number;
  agency: string | null;
  ntpc_eic: string | null;
};

type Health = "green" | "amber" | "red";

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
const HEALTH_RGB: Record<Health, [number, number, number]> = {
  green: [22, 163, 74],
  amber: [217, 119, 6],
  red: [220, 38, 38],
};

const BRAND: [number, number, number] = [13, 110, 124];

export function exportWeeklyPDF(
  stations: Station[],
  tasks: L2Task[],
  statusByStation: Record<string, Status[]>,
) {
  const today = new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 32;

  // Per-station derived rollup
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
  doc.rect(0, 0, pageW, 56, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("NTPC BESS — Weekly MIS Report", margin, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Portfolio L2 schedule status · As of ${format(today, "dd MMM yyyy, HH:mm")}`, margin, 42);

  // ---- KPI strip ----
  let y = 74;
  const kpis: Array<[string, string, [number, number, number]]> = [
    ["Stations", String(total), BRAND],
    ["Avg. Progress", `${avgPct}%`, BRAND],
    ["On Track", String(green), HEALTH_RGB.green],
    ["At Risk", String(amber), HEALTH_RGB.amber],
    ["Delayed", String(red), HEALTH_RGB.red],
  ];
  const kpiW = (pageW - margin * 2 - 8 * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 8);
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 250);
    doc.roundedRect(x, y, kpiW, 44, 4, 4, "FD");
    doc.setTextColor(110, 110, 110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(k[0].toUpperCase(), x + 10, y + 16);
    doc.setTextColor(...k[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(k[1], x + 10, y + 36);
  });
  y += 60;

  // ---- Station status summary (grouped by health) ----
  const order: Health[] = ["red", "amber", "green"];
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.health) - order.indexOf(b.health) || a.pct - b.pct,
  );
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Station Status Summary", margin, y);
  y += 6;

  autoTable(doc, {
    startY: y + 4,
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
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [246, 248, 249] },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const h = sorted[data.row.index].health;
        data.cell.styles.textColor = HEALTH_RGB[h];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- Agency-wise progress ----
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

  // @ts-expect-error lastAutoTable is added by the autotable plugin
  let curY = doc.lastAutoTable.finalY + 22;
  if (curY > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); curY = margin; }
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Agency-wise Progress Performance", margin, curY);

  autoTable(doc, {
    startY: curY + 10,
    head: [["Awarded Agency (EPC)", "Stations", "Avg. Progress %", "Delayed Tasks"]],
    body: agencyRows.map((a) => [a.agency, String(a.count), `${a.avgPct}%`, String(a.delayed)]),
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: BRAND, textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 249] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  // ---- Station-wise exceptions (events overdue by N days) ----
  const exceptions: Array<{ station: string; wbs: string; task: string; planFinish: string; daysOverdue: number; status: RowStatus; owner: string }> = [];
  for (const r of rows) {
    const map = buildStatusMap(statusByStation[r.s.id]);
    for (const t of tasks.filter((t) => t.station_id === r.s.id)) {
      if (t.is_section) continue;
      const st = map.get(t.id);
      const cs = computeRowState(t, st, today);
      const overdueDays =
        cs.plannedEnd && cs.pct < 100 && today > cs.plannedEnd
          ? differenceInCalendarDays(today, cs.plannedEnd)
          : 0;
      if (cs.status === "delayed" || cs.status === "blocked" || overdueDays > 0) {
        exceptions.push({
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
  exceptions.sort((a, b) => a.station.localeCompare(b.station) || b.daysOverdue - a.daysOverdue);

  // @ts-expect-error lastAutoTable is added by the autotable plugin
  let exY = doc.lastAutoTable.finalY + 22;
  if (exY > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); exY = margin; }
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Station-wise Exceptions — Events Overdue", margin, exY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Delayed / blocked leaf activities, sorted by station and days overdue", margin, exY + 12);

  autoTable(doc, {
    startY: exY + 20,
    head: [["Station", "WBS", "Activity", "Planned Finish", "Days Overdue", "Status", "Owner"]],
    body: exceptions.length
      ? exceptions.map((e) => [
          e.station,
          e.wbs,
          e.task,
          e.planFinish,
          e.daysOverdue > 0 ? `${e.daysOverdue}d` : "—",
          statusLabel(e.status),
          e.owner,
        ])
      : [["—", "—", "No exceptions. All activities on schedule.", "—", "—", "—", "—"]],
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: HEALTH_RGB.red, textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [252, 246, 246] },
    columnStyles: {
      2: { cellWidth: 260 },
      4: { halign: "right" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 4 && exceptions.length) {
        data.cell.styles.textColor = HEALTH_RGB.red;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- Footer page numbers ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `NTPC BESS Weekly MIS · Page ${i} of ${pageCount}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 14,
      { align: "right" },
    );
  }

  doc.save(`NTPC-BESS-Weekly-MIS-${format(today, "yyyyMMdd")}.pdf`);
}
