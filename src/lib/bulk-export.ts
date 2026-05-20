import JSZip from "jszip";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { buildStatusMap, computeRowState, statusLabel, stationProgress, type L2Task, type Status, type RowStatus } from "./gantt-utils";

type Station = { id: string; name: string; lot: string; capacity_mwh: number; agency: string | null; ntpc_eic: string | null };
type ReportKind = "weekly" | "exceptions" | "boi" | "delays" | "compliance" | "audit";

function sheet<T extends object>(rows: T[]) { return XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]); }
function bookToBlob(wb: XLSX.WorkBook) {
  const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([arr], { type: "application/octet-stream" });
}

export async function bulkExport(opts: {
  stations: Station[];
  tasks: L2Task[];
  statusByStation: Record<string, Status[]>;
  reports: ReportKind[];
  selectedStationIds: string[];
}) {
  const zip = new JSZip();
  const stations = opts.stations.filter(s => opts.selectedStationIds.includes(s.id));
  const stationIds = stations.map(s => s.id);

  // 1. Weekly MIS — consolidated workbook
  if (opts.reports.includes("weekly")) {
    const wb = XLSX.utils.book_new();
    const summary = stations.map(s => {
      const m = buildStatusMap(opts.statusByStation[s.id]);
      const sTasks = opts.tasks.filter(t => t.station_id === s.id);
      const p = stationProgress(sTasks, m);
      return { Station: s.name, Lot: s.lot, "MWh": s.capacity_mwh, Agency: s.agency ?? "",
        EIC: s.ntpc_eic ?? "", "Progress %": p.pct, Done: p.completed, Total: p.total, Delayed: p.delayed };
    });
    XLSX.utils.book_append_sheet(wb, sheet(summary), "Summary");
    for (const s of stations) {
      const m = buildStatusMap(opts.statusByStation[s.id]);
      const sTasks = opts.tasks.filter(t => t.station_id === s.id);
      const rows = sTasks.map(t => {
        const st = m.get(t.id); const cs = computeRowState(t, st);
        return { WBS: t.wbs_code, Task: t.name, "Plan Start": t.baseline_start, "Plan Finish": t.baseline_finish,
          "Actual Start": st?.actual_start ?? "", "Actual Finish": st?.actual_finish ?? "",
          "% Comp": st?.percent_complete ?? 0, Status: statusLabel(cs.status as RowStatus), Slip: cs.slipDays,
          Owner: st?.owner ?? "", Remarks: st?.remarks ?? "" };
      });
      XLSX.utils.book_append_sheet(wb, sheet(rows), s.name.slice(0, 28));
    }
    zip.file("Weekly-MIS.xlsx", bookToBlob(wb));
  }

  // 2. Exceptions
  if (opts.reports.includes("exceptions")) {
    const wb = XLSX.utils.book_new();
    const exc: Array<Record<string, string | number>> = [];
    for (const s of stations) {
      const m = buildStatusMap(opts.statusByStation[s.id]);
      for (const t of opts.tasks) {
        if (t.is_section) continue;
        const st = m.get(t.id); const cs = computeRowState(t, st);
        if (cs.status === "delayed" || cs.status === "blocked" || cs.slipDays > 0) {
          exc.push({ Station: s.name, WBS: t.wbs_code, Task: t.name, "Plan Finish": t.baseline_finish ?? "",
            "Actual Finish": st?.actual_finish ?? "", Slip: cs.slipDays, "% Comp": st?.percent_complete ?? 0,
            Status: statusLabel(cs.status as RowStatus), Owner: st?.owner ?? "", Remarks: st?.remarks ?? "" });
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(exc), "Exceptions");
    zip.file("Exceptions.xlsx", bookToBlob(wb));
  }

  // 3. BOI Status
  if (opts.reports.includes("boi")) {
    const [{ data: master }, { data: stat }] = await Promise.all([
      supabase.from("boi_master").select("*").order("sort_order"),
      supabase.from("station_boi_status").select("*").in("station_id", stationIds),
    ]);
    const wb = XLSX.utils.book_new();
    const rows: Array<Record<string, string | number>> = [];
    for (const s of stations) {
      for (const b of master ?? []) {
        const r = (stat ?? []).find(x => x.station_id === s.id && x.boi_id === b.id);
        rows.push({ Station: s.name, "SL": b.sl_no, BOI: b.name, "Drawings": b.drawings_count ?? "",
          "Sched PO": b.scheduled_po_date ?? "", "Actual PO": r?.actual_po_date ?? "",
          "Sub-Vendor Cat": r?.sub_vendor_category ?? "", "Sub-Vendor": r?.sub_vendor_details ?? "",
          "Inspection": b.inspection_category ?? "", "Delivery": r?.delivery_date ?? "",
          "Site Receipt": r?.site_receipt_date ?? "", "Mobilization": r?.mobilization_status ?? "",
          "Remarks": r?.remarks ?? "" });
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows), "BOI Status");
    zip.file("BOI-Status.xlsx", bookToBlob(wb));
  }

  // 4. Delay Register
  if (opts.reports.includes("delays")) {
    const { data } = await supabase.from("delay_register").select("*").in("station_id", stationIds);
    const wb = XLSX.utils.book_new();
    const sName = new Map(stations.map(s => [s.id, s.name]));
    const rows = (data ?? []).map(r => ({ Station: sName.get(r.station_id) ?? "", Title: r.title,
      Reason: r.reason_category ?? "", "Root Cause": r.root_cause ?? "", Responsibility: r.responsibility ?? "",
      "Corrective Action": r.corrective_action ?? "", "Recovery Plan": r.recovery_plan ?? "",
      "Recovery Date": r.recovery_date ?? "", Status: r.status, Created: r.created_at }));
    XLSX.utils.book_append_sheet(wb, sheet(rows), "Delays");
    zip.file("Delay-Register.xlsx", bookToBlob(wb));
  }

  // 5. Compliance
  if (opts.reports.includes("compliance")) {
    const [{ data: master }, { data: stat }] = await Promise.all([
      supabase.from("compliance_master").select("*").order("sort_order"),
      supabase.from("station_compliance").select("*").in("station_id", stationIds),
    ]);
    const wb = XLSX.utils.book_new();
    const rows: Array<Record<string, string | number>> = [];
    for (const s of stations) {
      for (const c of master ?? []) {
        const r = (stat ?? []).find(x => x.station_id === s.id && x.compliance_id === c.id);
        rows.push({ Station: s.name, Category: c.category, Item: c.name, Authority: c.authority ?? "",
          Status: r?.status ?? "not_applied", "Applied": r?.application_date ?? "",
          "Approved": r?.approval_date ?? "", "Expires": r?.expiry_date ?? "",
          "Doc Ref": r?.document_ref ?? "", Owner: r?.owner ?? "", Remarks: r?.remarks ?? "" });
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows), "Compliance");
    zip.file("Compliance-Status.xlsx", bookToBlob(wb));
  }

  // 6. Audit log
  if (opts.reports.includes("audit")) {
    const { data } = await supabase.from("audit_log").select("*").in("station_id", stationIds).order("created_at", { ascending: false }).limit(5000);
    const wb = XLSX.utils.book_new();
    const sName = new Map(stations.map(s => [s.id, s.name]));
    const rows = (data ?? []).map(r => ({ When: r.created_at, User: r.user_email ?? "",
      Station: r.station_id ? sName.get(r.station_id) ?? "" : "", Entity: r.entity_type,
      Action: r.action, "Entity ID": r.entity_id ?? "" }));
    XLSX.utils.book_append_sheet(wb, sheet(rows), "Audit Log");
    zip.file("Audit-Trail.xlsx", bookToBlob(wb));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `NTPC-BESS-MIS-Pack-${format(new Date(), "yyyyMMdd-HHmm")}.zip`);
}
