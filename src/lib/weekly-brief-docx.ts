import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
  TabStopType,
  TabStopPosition,
} from "docx";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { computeWeeklyBrief, type WeeklyBriefInput, type StationBrief, type Health } from "./weekly-brief-data";

const BRAND = "0D6E7C";
const RED = "DC2626";
const GREEN = "16A34A";
const AMBER = "D97706";
const MUTED = "6E6E6E";
const INK = "1C1C1C";
const SOFT = "F2F6F7";

const HEALTH_HEX: Record<Health, string> = { green: GREEN, amber: AMBER, red: RED };
const HEALTH_LABEL: Record<Health, string> = { green: "ON TRACK", amber: "AT RISK", red: "DELAYED" };

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const hair = { style: BorderStyle.SINGLE, size: 1, color: "DDE2E4" };

function run(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size ?? 14 });
}

function readyHex(pct: number): string {
  if (pct >= 67) return GREEN;
  if (pct >= 34) return AMBER;
  if (pct > 0) return RED;
  return MUTED;
}

function metricLine(b: StationBrief): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [
      run("Readiness ", { color: MUTED, size: 12 }),
      run(`${b.readiness}%`, { bold: true, size: 14, color: readyHex(b.readiness) }),
      run("   Vendor ", { color: MUTED, size: 12 }),
      run(`${b.stages.vendor}%`, { bold: true, size: 13 }),
      run("   BOI Ord ", { color: MUTED, size: 12 }),
      run(`${b.stages.boi}%`, { bold: true, size: 13 }),
      run("   MDL ", { color: MUTED, size: 12 }),
      run(`${b.mdl.submitted}/${b.mdl.approved}/${b.mdl.total}`, { bold: true, size: 13 }),
      run("   Civil ", { color: MUTED, size: 12 }),
      run(`${b.civil.pct}%`, { bold: true, size: 13 }),
      run("   Delayed ", { color: MUTED, size: 12 }),
      run(`${b.l2.delayed}`, { bold: true, size: 13, color: b.l2.delayed > 0 ? RED : INK }),
    ],
  });
}

function boiTable(b: StationBrief): Table {
  const head = new TableRow({
    tableHeader: true,
    children: [
      ["Item ordered", 56],
      ["PO date", 22],
      ["Delivery", 22],
    ].map(
      ([label, pct]) =>
        new TableCell({
          width: { size: pct as number, type: WidthType.PERCENTAGE },
          shading: { fill: BRAND, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 20, bottom: 20, left: 50, right: 50 },
          borders: { top: hair, bottom: hair, left: hair, right: hair },
          children: [new Paragraph({ children: [run(label as string, { bold: true, color: "FFFFFF", size: 11 })] })],
        }),
    ),
  });

  const rows = b.boi.items.length
    ? b.boi.items.slice(0, 4).map(
        (it, i) =>
          new TableRow({
            children: [it.name, it.poDate ?? "—", it.deliveryDate ?? "—"].map(
              (val, ci) =>
                new TableCell({
                  shading: i % 2 ? { fill: SOFT, type: ShadingType.CLEAR, color: "auto" } : undefined,
                  margins: { top: 18, bottom: 18, left: 50, right: 50 },
                  borders: { top: hair, bottom: hair, left: hair, right: hair },
                  children: [new Paragraph({ children: [run(val, { size: 11, color: ci === 0 ? INK : MUTED })] })],
                }),
            ),
          }),
      )
    : [
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 3,
              margins: { top: 18, bottom: 18, left: 50, right: 50 },
              borders: { top: hair, bottom: hair, left: hair, right: hair },
              children: [new Paragraph({ children: [run("No items ordered yet.", { size: 11, color: MUTED })] })],
            }),
          ],
        }),
      ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: hair, bottom: hair, left: hair, right: hair, insideHorizontal: hair, insideVertical: hair },
    rows: [head, ...rows],
  });
}

function commentaryBox(title: string, accent: string, lines: string[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: hair, bottom: hair, left: hair, right: hair, insideHorizontal: hair, insideVertical: hair },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: SOFT, type: ShadingType.CLEAR, color: "auto" },
            margins: { top: 30, bottom: 30, left: 70, right: 70 },
            borders: { top: hair, bottom: hair, left: { style: BorderStyle.SINGLE, size: 12, color: accent }, right: hair },
            children: [
              new Paragraph({ spacing: { after: 30 }, children: [run(title, { bold: true, color: accent, size: 12 })] }),
              ...lines.slice(0, 3).map(
                (ln) =>
                  new Paragraph({
                    spacing: { after: 10 },
                    bullet: { level: 0 },
                    children: [run(ln, { size: 12, color: "464646" })],
                  }),
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

function cardCell(b: StationBrief): TableCell {
  const varColor = b.variance >= 0 ? GREEN : b.variance >= -10 ? AMBER : RED;
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "DDE2E4" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDE2E4" },
      left: { style: BorderStyle.SINGLE, size: 24, color: HEALTH_HEX[b.health] },
      right: { style: BorderStyle.SINGLE, size: 4, color: "DDE2E4" },
    },
    children: [
      // header: name + L2%
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        spacing: { after: 20 },
        children: [
          run(b.name, { bold: true, size: 18, color: INK }),
          run("\t", {}),
          run(`${b.pct}%`, { bold: true, size: 20, color: BRAND }),
        ],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        spacing: { after: 30 },
        children: [
          run(`${b.lot} · ${b.agency} · ${b.capacityMwh.toLocaleString()} MWh · EIC ${b.eic}`, { size: 12, color: MUTED }),
          run("\t", {}),
          run(HEALTH_LABEL[b.health], { bold: true, size: 11, color: HEALTH_HEX[b.health] }),
        ],
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [
          run("Actual ", { size: 12, color: MUTED }),
          run(`${b.pct}%`, { bold: true, size: 12, color: BRAND }),
          run("   Ideal ", { size: 12, color: MUTED }),
          run(`${b.ideal}%`, { bold: true, size: 12, color: INK }),
          run("   Variance ", { size: 12, color: MUTED }),
          run(`${b.variance >= 0 ? "+" : ""}${b.variance}%`, { bold: true, size: 12, color: varColor }),
        ],
      }),
      metricLine(b),
      new Paragraph({
        spacing: { before: 40, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          run("BOI ORDERING", { bold: true, size: 12, color: BRAND }),
          run("\t", {}),
          run(`Ordered ${b.boi.ordered}/${b.boi.total} · Dlv ${b.boi.delivered} · Recd ${b.boi.received}`, {
            size: 11,
            color: MUTED,
          }),
        ],
      }),
      boiTable(b),
      new Paragraph({ spacing: { after: 40 }, children: [] }),
      commentaryBox("CRITICAL ISSUES", RED, b.criticalIssues),
      new Paragraph({ spacing: { after: 30 }, children: [] }),
      commentaryBox("PROGRESS THIS WEEK", GREEN, b.progressNotes),
    ],
  });
}

export async function exportWeeklyBriefDOCX(input: WeeklyBriefInput) {
  const brief = computeWeeklyBrief(input);
  const today = brief.generatedAt;
  const t = brief.totals;
  const list = brief.stationsBrief;

  // group into rows of 2 cards
  const rows: TableRow[] = [];
  for (let i = 0; i < list.length; i += 2) {
    const cells = [cardCell(list[i])];
    if (list[i + 1]) cells.push(cardCell(list[i + 1]));
    else
      cells.push(
        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [new Paragraph({ children: [] })] }),
      );
    rows.push(new TableRow({ children: cells, cantSplit: true }));
  }

  const grid = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [7000, 7000],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows,
  });

  const header = [
    new Paragraph({
      spacing: { after: 20 },
      children: [run("NTPC BESS — Weekly Brief", { bold: true, color: BRAND, size: 34 })],
    }),
    new Paragraph({
      spacing: { after: 30 },
      children: [run(`All-station snapshot · As of ${format(today, "dd MMM yyyy, HH:mm")}`, { size: 16, color: MUTED })],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        run(
          `${t.stations} stations · Avg ${t.avgPct}% (ideal ${t.idealPct}%) · On Track ${t.onTrack} / At Risk ${t.atRisk} / Delayed ${t.delayed} · BOI ${t.boiOrdered}/${t.boiTotal} ordered · MDL ${t.mdlApproved}/${t.mdlTotal} approved`,
          { size: 15, bold: true, color: INK },
        ),
      ],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 16 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: 15840, height: 12240 },
            margin: { top: 540, right: 540, bottom: 540, left: 540 },
          },
        },
        children: [...header, grid],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `NTPC-BESS-Weekly-Brief-${format(today, "yyyyMMdd")}.docx`);
}
