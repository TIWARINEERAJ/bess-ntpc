import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { format } from "date-fns";
import { computeRowState, statusLabel, stationProgress, buildStatusMap, type L2Task, type Status, type RowStatus } from "./gantt-utils";

type Station = { id: string; name: string; lot: string; capacity_mwh: number; agency: string | null; ntpc_eic: string | null };

function saveBook(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([wbout], { type: "application/octet-stream" }), filename);
}

export function exportWeeklyMIS(stations: Station[], tasks: L2Task[], statusByStation: Record<string, Status[]>) {
  const wb = XLSX.utils.book_new();
  // Summary sheet
  const summary = stations.map(s => {
    const map = buildStatusMap(statusByStation[s.id]);
    const sTasks = tasks.filter(t => t.station_id === s.id);
    const p = stationProgress(sTasks, map);
    return {
      Station: s.name, Lot: s.lot, "Capacity (MWh)": s.capacity_mwh, Agency: s.agency ?? "",
      EIC: s.ntpc_eic ?? "", "Progress %": p.pct, "Tasks Completed": p.completed, "Total Tasks": p.total, "Delayed Tasks": p.delayed,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Station Summary");

  // Detail per station
  for (const s of stations) {
    const map = buildStatusMap(statusByStation[s.id]);
    const sTasks = tasks.filter(t => t.station_id === s.id);
    const rows = sTasks.map(t => {
      const st = map.get(t.id);
      const cs = computeRowState(t, st);
      return {
        WBS: t.wbs_code, Task: t.name, Section: t.is_section ? "Yes" : "",
        "Duration (d)": t.duration_days,
        "Planned Start": t.baseline_start ?? "", "Planned Finish": t.baseline_finish ?? "",
        "Actual Start": st?.actual_start ?? "", "Actual Finish": st?.actual_finish ?? "",
        "% Complete": st?.percent_complete ?? 0,
        Status: statusLabel(cs.status as RowStatus),
        "Slip (days)": cs.slipDays,
        Owner: st?.owner ?? "", Remarks: st?.remarks ?? "",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), s.name.slice(0, 28));
  }
  saveBook(wb, `NTPC-BESS-Weekly-MIS-${format(new Date(), "yyyyMMdd")}.xlsx`);
}

export function exportExceptions(stations: Station[], tasks: L2Task[], statusByStation: Record<string, Status[]>) {
  const wb = XLSX.utils.book_new();
  const exc: Array<Record<string, string | number>> = [];
  for (const s of stations) {
    const map = buildStatusMap(statusByStation[s.id]);
    for (const t of tasks) {
      if (t.is_section) continue;
      const st = map.get(t.id);
      const cs = computeRowState(t, st);
      if (cs.status === "delayed" || cs.status === "blocked" || cs.slipDays > 0) {
        exc.push({
          Station: s.name, Lot: s.lot, WBS: t.wbs_code, Task: t.name,
          "Planned Finish": t.baseline_finish ?? "", "Actual Finish": st?.actual_finish ?? "",
          "Slip (days)": cs.slipDays, "% Complete": st?.percent_complete ?? 0,
          Status: statusLabel(cs.status as RowStatus),
          Owner: st?.owner ?? "", Remarks: st?.remarks ?? "",
        });
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exc.length ? exc : [{ Note: "No exceptions" }]), "Exceptions");
  saveBook(wb, `NTPC-BESS-Exceptions-${format(new Date(), "yyyyMMdd")}.xlsx`);
}

export function exportStation(station: Station, tasks: L2Task[], status: Status[]) {
  const map = buildStatusMap(status);
  const wb = XLSX.utils.book_new();
  const rows = tasks.map(t => {
    const st = map.get(t.id);
    const cs = computeRowState(t, st);
    return {
      WBS: t.wbs_code, Task: t.name, Section: t.is_section ? "Yes" : "",
      "Duration (d)": t.duration_days,
      "Planned Start": t.baseline_start ?? "", "Planned Finish": t.baseline_finish ?? "",
      "Actual Start": st?.actual_start ?? "", "Actual Finish": st?.actual_finish ?? "",
      "% Complete": st?.percent_complete ?? 0,
      Status: statusLabel(cs.status as RowStatus),
      "Slip (days)": cs.slipDays,
      Predecessors: t.predecessors ?? "",
      Owner: st?.owner ?? "", Remarks: st?.remarks ?? "",
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "L2 Schedule");
  saveBook(wb, `${station.name}-L2-${format(new Date(), "yyyyMMdd")}.xlsx`);
}
