import { exportWeeklyPDF } from "./src/lib/mis-pdf";

// minimal jsdom-free QA: jsPDF runs in node; override save to write to /tmp
const stations = Array.from({ length: 10 }, (_, i) => ({
  id: `s${i}`, name: `Station ${i + 1}`, lot: `LOT-${(i % 3) + 1}`,
  capacity_mwh: 500 + i * 10, agency: ["EPC Alpha Ltd, 1", "Beta Power", "Gamma Infra"][i % 3], ntpc_eic: `EIC ${i}`,
}));
const tasks: any[] = [];
const statusByStation: Record<string, any[]> = {};
for (const s of stations) {
  statusByStation[s.id] = [];
  for (let t = 0; t < 12; t++) {
    const id = `${s.id}-t${t}`;
    tasks.push({ id, station_id: s.id, wbs_code: `1.${t}`, parent_wbs: null, name: `Activity ${t} for ${s.name} with a fairly long descriptive name`, is_section: false, duration_days: 30, baseline_start: "2025-01-01", baseline_finish: "2025-03-01", predecessors: null, sort_order: t });
    statusByStation[s.id].push({ station_id: s.id, task_id: id, actual_start: "2025-01-05", actual_finish: t < 6 ? "2025-02-20" : null, percent_complete: t < 6 ? 100 : t * 8, status: t < 6 ? "completed" : "in_progress", remarks: null, owner: `Owner ${t}` });
  }
}
const drawings = Array.from({ length: 25 }, (_, i) => ({
  id: `d${i}`, station_id: `s${i % 10}`, category: ["Civil", "Electrical", "C&I"][i % 3], drg_ref: `DRG-${1000 + i}`,
  drg_desc: `Detailed drawing description number ${i} that may wrap across lines`, cat: null, sch_date: "2025-01-15",
  sch_apprvl_date: "2025-02-15", submitted_date: null, resubmitted_date: null, approved_date: null, sort_order: i,
}));
const boiMaster = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, sl_no: i + 1, name: `BOI Equipment ${i + 1}`, scheduled_po_date: "2025-02-01" }));
const boiStatus: any[] = [];
const meetings = Array.from({ length: 6 }, (_, i) => ({ station_id: `s${i}`, meeting_type: ["weekly", "monthly", "prt", "crm", "tcm"][i % 5], meeting_date: "2026-05-2" + (i % 9) }));
const plans = Array.from({ length: 6 }, (_, i) => ({ station_id: `s${i}`, meeting_type: ["weekly", "monthly", "prt"][i % 3], planned_date: "2026-06-2" + (i % 9), title: i % 2 ? "Special review" : null }));
const snapshots: any[] = [];
const dates = ["2026-05-03", "2026-05-10", "2026-05-17", "2026-05-24", "2026-05-31", "2026-06-07"];
dates.forEach((d, di) => stations.forEach((s, si) => snapshots.push({ snapshot_date: d, station_id: s.id, pct: 20 + di * 8 + si })));

// stub doc.save to write file in node
const jspdfMod = await import("jspdf");
const origSave = jspdfMod.jsPDF.prototype.save;
jspdfMod.jsPDF.prototype.save = function (this: any) {
  const buf = Buffer.from(this.output("arraybuffer"));
  require("fs").writeFileSync("/tmp/mis-qa.pdf", buf);
  return this;
};

exportWeeklyPDF(stations as any, tasks, statusByStation, { drawings: drawings as any, boiMaster, boiStatus, meetings, plans, snapshots });
console.log("written /tmp/mis-qa.pdf");
