import { jsPDF } from "jspdf";
import { format } from "date-fns";
import {
  computeWeeklyBrief,
  type WeeklyBriefInput,
  type StationBrief,
  type Health,
} from "./weekly-brief-data";

type RGB = [number, number, number];

const BRAND: RGB = [13, 110, 124];
const INK: RGB = [28, 28, 28];
const MUTED: RGB = [120, 120, 120];
const LINE: RGB = [222, 226, 228];
const SOFT: RGB = [246, 249, 250];

const HEALTH_RGB: Record<Health, RGB> = {
  green: [22, 163, 74],
  amber: [217, 119, 6],
  red: [220, 38, 38],
};
const HEALTH_LABEL: Record<Health, string> = { green: "ON TRACK", amber: "AT RISK", red: "DELAYED" };

/** Readiness % → traffic-light RGB (matches the in-app maturity color bands). */
function readyRGB(pct: number): RGB {
  if (pct >= 67) return [22, 163, 74];
  if (pct >= 34) return [217, 119, 6];
  if (pct > 0) return [220, 38, 38];
  return [120, 120, 120];
}

function trunc(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1);
  return t + "…";
}

function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number, b: StationBrief) {
  const pad = 8;
  const ix = x + pad + 3;
  const iw = w - 2 * pad - 3;

  // shell + health accent
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");
  doc.setFillColor(...HEALTH_RGB[b.health]);
  doc.roundedRect(x, y, 3.5, h, 2, 2, "F");

  let cy = y + 14;

  // header: name + health pill + L2%
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(trunc(doc, b.name, iw - 96), ix, cy);

  // L2% on the right
  doc.setFontSize(13);
  doc.setTextColor(...BRAND);
  doc.text(`${b.pct}%`, x + w - pad, cy, { align: "right" });

  // health pill under % (small)
  const pillW = 52;
  doc.setFillColor(...HEALTH_RGB[b.health]);
  doc.roundedRect(x + w - pad - pillW, cy + 3, pillW, 9, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text(HEALTH_LABEL[b.health], x + w - pad - pillW / 2, cy + 9.2, { align: "center" });

  cy += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const sub = `${b.lot} · ${b.agency} · ${b.capacityMwh.toLocaleString()} MWh · EIC ${b.eic}`;
  doc.text(trunc(doc, sub, iw - 56), ix, cy);

  // progress bar (actual vs ideal)
  cy += 10;
  const barW = iw;
  const barH = 6;
  doc.setFillColor(...SOFT);
  doc.roundedRect(ix, cy, barW, barH, 1.5, 1.5, "F");
  doc.setFillColor(...BRAND);
  doc.roundedRect(ix, cy, Math.max(1, (b.pct / 100) * barW), barH, 1.5, 1.5, "F");
  // ideal marker
  const ix2 = ix + (Math.min(100, b.ideal) / 100) * barW;
  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  doc.line(ix2, cy - 1.5, ix2, cy + barH + 1.5);
  cy += barH + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  const varStr = `${b.variance >= 0 ? "+" : ""}${b.variance}%`;
  doc.text(`Actual ${b.pct}%`, ix, cy);
  doc.text(`Ideal ${b.ideal}%`, ix + barW / 2, cy, { align: "center" });
  doc.setTextColor(...(b.variance >= 0 ? HEALTH_RGB.green : b.variance >= -10 ? HEALTH_RGB.amber : HEALTH_RGB.red));
  doc.setFont("helvetica", "bold");
  doc.text(`Var ${varStr}`, ix + barW, cy, { align: "right" });

  // metric chips row (5)
  cy += 6;
  const chips: Array<[string, string, RGB?]> = [
    ["MDL S/A/T", `${b.mdl.submitted}/${b.mdl.approved}/${b.mdl.total}`],
    ["CIVIL", `${b.civil.pct}%`],
    ["L2 DONE", `${b.l2.done}/${b.l2.total}`],
    ["DELAYED", `${b.l2.delayed}`, b.l2.delayed > 0 ? HEALTH_RGB.red : undefined],
    ["COMPL", `${b.compliance.cleared}/${b.compliance.total}`],
  ];
  const chipGap = 4;
  const chipW = (iw - chipGap * (chips.length - 1)) / chips.length;
  const chipH = 22;
  chips.forEach((c, i) => {
    const cx = ix + i * (chipW + chipGap);
    doc.setFillColor(...SOFT);
    doc.roundedRect(cx, cy, chipW, chipH, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED);
    doc.text(c[0], cx + chipW / 2, cy + 8, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...(c[2] ?? INK));
    doc.text(c[1], cx + chipW / 2, cy + 18, { align: "center" });
  });
  cy += chipH + 8;

  // BOI ordered section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...BRAND);
  doc.text(`BOI ORDERING`, ix, cy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(`Ordered ${b.boi.ordered}/${b.boi.total} · Dlv ${b.boi.delivered} · Recd ${b.boi.received}`, x + w - pad, cy, {
    align: "right",
  });
  cy += 4;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.4);
  doc.line(ix, cy, ix + iw, cy);
  cy += 7;

  const boxesH = 58;
  const boiBottom = y + h - pad - boxesH - 4;
  const nameW = iw * 0.5;
  const dateX = ix + nameW + 4;
  if (b.boi.items.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("No items ordered yet.", ix, cy);
    cy += 9;
  } else {
    for (const it of b.boi.items) {
      if (cy > boiBottom) break;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
      doc.setTextColor(...INK);
      doc.text(trunc(doc, `• ${it.name}`, nameW), ix, cy);
      doc.setFontSize(6.2);
      doc.setTextColor(...MUTED);
      const dates = `PO ${it.poDate ?? "—"}  Dlv ${it.deliveryDate ?? "—"}`;
      doc.text(trunc(doc, dates, iw - nameW - 4), dateX, cy);
      cy += 8.5;
    }
  }

  // commentary boxes (2)
  const boxY = y + h - pad - boxesH;
  const boxGap = 6;
  const boxW = (iw - boxGap) / 2;
  const drawBox = (bx: number, title: string, lines: string[], accent: RGB) => {
    doc.setFillColor(...SOFT);
    doc.roundedRect(bx, boxY, boxW, boxesH, 2.5, 2.5, "F");
    doc.setFillColor(...accent);
    doc.roundedRect(bx, boxY, 2.2, boxesH, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(...accent);
    doc.text(title, bx + 6, boxY + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(70, 70, 70);
    let ly = boxY + 18;
    for (const ln of lines.slice(0, 3)) {
      if (ly > boxY + boxesH - 3) break;
      const wrapped = doc.splitTextToSize(`• ${ln}`, boxW - 9) as string[];
      for (const wl of wrapped.slice(0, 2)) {
        if (ly > boxY + boxesH - 3) break;
        doc.text(wl, bx + 6, ly);
        ly += 7.5;
      }
    }
  };
  drawBox(ix, "CRITICAL ISSUES", b.criticalIssues, HEALTH_RGB.red);
  drawBox(ix + boxW + boxGap, "PROGRESS THIS WEEK", b.progressNotes, HEALTH_RGB.green);
}

export function buildWeeklyBriefDoc(input: WeeklyBriefInput): jsPDF {
  const brief = computeWeeklyBrief(input);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const today = brief.generatedAt;

  const cols = 2;
  const rows = 2;
  const perPage = cols * rows;
  const gap = 12;

  const list = brief.stationsBrief;
  const pages = Math.max(1, Math.ceil(list.length / perPage));

  for (let pg = 0; pg < pages; pg++) {
    if (pg > 0) doc.addPage();

    // header band
    const t = brief.totals;
    let topY: number;
    if (pg === 0) {
      doc.setFillColor(...BRAND);
      doc.rect(0, 0, pageW, 52, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(255, 255, 255);
      doc.text("NTPC BESS — Weekly Brief", margin, 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`All-station snapshot · As of ${format(today, "dd MMM yyyy, HH:mm")}`, margin, 40);
      // inline KPI strip on the right (two lines, ASCII only)
      doc.setFontSize(8.5);
      doc.text(
        `${t.stations} stations · Avg ${t.avgPct}% vs ideal ${t.idealPct}%`,
        pageW - margin,
        22,
        { align: "right" },
      );
      doc.text(
        `On Track ${t.onTrack} / At Risk ${t.atRisk} / Delayed ${t.delayed} · BOI ${t.boiOrdered}/${t.boiTotal} ordered · MDL ${t.mdlApproved}/${t.mdlTotal} approved`,
        pageW - margin,
        38,
        { align: "right" },
      );
      topY = 64;
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND);
      doc.text("NTPC BESS — Weekly Brief", margin, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(`Page ${pg + 1} of ${pages}`, pageW - margin, 20, { align: "right" });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.6);
      doc.line(margin, 26, pageW - margin, 26);
      topY = 36;
    }

    const areaW = pageW - margin * 2;
    const areaH = pageH - topY - margin;
    const cardW = (areaW - gap * (cols - 1)) / cols;
    const cardH = (areaH - gap * (rows - 1)) / rows;

    for (let i = 0; i < perPage; i++) {
      const idx = pg * perPage + i;
      if (idx >= list.length) break;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = margin + c * (cardW + gap);
      const yy = topY + r * (cardH + gap);
      drawCard(doc, x, yy, cardW, cardH, list[idx]);
    }

    // footer page number on first page too
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`NTPC BESS Weekly Brief · ${format(today, "dd MMM yyyy")}`, margin, pageH - 10);
    if (pg === 0) doc.text(`Page 1 of ${pages}`, pageW - margin, pageH - 10, { align: "right" });
  }

  return doc;
}

export function exportWeeklyBriefPDF(input: WeeklyBriefInput) {
  const doc = buildWeeklyBriefDoc(input);
  doc.save(`NTPC-BESS-Weekly-Brief-${format(new Date(), "yyyyMMdd")}.pdf`);
}
