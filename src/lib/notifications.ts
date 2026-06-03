import { differenceInCalendarDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type Notif = {
  key: string;
  kind: "task" | "boi" | "issue" | "compliance" | "delay" | "meeting";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  stationId: string;
  stationName: string;
  tab?: string;
  daysUntil: number;
};

function d(s: string | null | undefined) { return s ? parseISO(s) : null; }

export async function loadNotifications(): Promise<Notif[]> {
  const today = new Date();
  const [stations, tasks, status, boiMaster, boiStatus, issues, delays, compliance] = await Promise.all([
    supabase.from("stations").select("id,name"),
    supabase.from("l2_tasks").select("id,station_id,wbs_code,name,baseline_finish,is_section").range(0, 49999),
    supabase.from("station_task_status").select("station_id,task_id,percent_complete,actual_start").range(0, 49999),
    supabase.from("boi_master").select("id,name,scheduled_po_date"),
    supabase.from("station_boi_status").select("station_id,boi_id,actual_po_date"),
    supabase.from("issues").select("id,station_id,title,target_date,status"),
    supabase.from("delay_register").select("id,station_id,title,recovery_date,status"),
    supabase.from("station_compliance").select("station_id,compliance_id,expiry_date,status"),
  ]);
  const sMap = new Map((stations.data ?? []).map(s => [s.id, s.name]));
  const out: Notif[] = [];

  // L2 tasks due within 7 days, not started
  const stMap = new Map<string, { pct: number; started: boolean }>();
  (status.data ?? []).forEach(r => stMap.set(`${r.station_id}|${r.task_id}`, { pct: r.percent_complete, started: !!r.actual_start }));
  for (const s of stations.data ?? []) {
    for (const t of tasks.data ?? []) {
      if (t.station_id !== s.id) continue;
      if (t.is_section) continue;
      const end = d(t.baseline_finish); if (!end) continue;
      const k = stMap.get(`${s.id}|${t.id}`);
      const days = differenceInCalendarDays(end, today);
      if (days >= 0 && days <= 7 && (!k || k.pct < 100)) {
        out.push({ key: `task:${s.id}:${t.id}`, kind: "task", severity: days <= 2 ? "high" : "medium",
          title: `${t.wbs_code} ${t.name}`, detail: `Due in ${days}d at ${s.name}`,
          stationId: s.id, stationName: s.name ?? "", tab: "gantt", daysUntil: days });
      }
    }
  }

  // BOI POs due within 7 days, no actual
  const boiMap = new Map<string, string | null>();
  (boiStatus.data ?? []).forEach(r => boiMap.set(`${r.station_id}|${r.boi_id}`, r.actual_po_date));
  for (const s of stations.data ?? []) {
    for (const b of boiMaster.data ?? []) {
      const end = d(b.scheduled_po_date); if (!end) continue;
      const actual = boiMap.get(`${s.id}|${b.id}`);
      if (actual) continue;
      const days = differenceInCalendarDays(end, today);
      if (days >= -30 && days <= 7) {
        out.push({ key: `boi:${s.id}:${b.id}`, kind: "boi", severity: days < 0 ? "high" : days <= 2 ? "high" : "medium",
          title: `PO: ${b.name}`, detail: days < 0 ? `Overdue by ${-days}d at ${s.name}` : `PO due in ${days}d at ${s.name}`,
          stationId: s.id, stationName: s.name ?? "", tab: "boi", daysUntil: days });
      }
    }
  }

  // Open issues target_date within 3 days
  for (const i of issues.data ?? []) {
    if (i.status === "resolved") continue;
    const end = d(i.target_date); if (!end) continue;
    const days = differenceInCalendarDays(end, today);
    if (days >= -30 && days <= 3) {
      out.push({ key: `issue:${i.id}`, kind: "issue", severity: days <= 0 ? "high" : "medium",
        title: `Issue: ${i.title}`, detail: days < 0 ? `Overdue by ${-days}d` : `Due in ${days}d`,
        stationId: i.station_id, stationName: sMap.get(i.station_id) ?? "", tab: "issues", daysUntil: days });
    }
  }

  // Delay register recovery within 3 days
  for (const dr of delays.data ?? []) {
    if (dr.status === "closed") continue;
    const end = d(dr.recovery_date); if (!end) continue;
    const days = differenceInCalendarDays(end, today);
    if (days >= -30 && days <= 3) {
      out.push({ key: `delay:${dr.id}`, kind: "delay", severity: days <= 0 ? "high" : "medium",
        title: `Recovery: ${dr.title}`, detail: days < 0 ? `Slipped ${-days}d` : `Recovery in ${days}d`,
        stationId: dr.station_id, stationName: sMap.get(dr.station_id) ?? "", tab: "delays", daysUntil: days });
    }
  }

  // Compliance expiring within 30 days
  for (const c of compliance.data ?? []) {
    const end = d(c.expiry_date); if (!end) continue;
    const days = differenceInCalendarDays(end, today);
    if (days >= -7 && days <= 30) {
      out.push({ key: `compl:${c.station_id}:${c.compliance_id}`, kind: "compliance",
        severity: days <= 7 ? "high" : "medium",
        title: `Compliance expiring`, detail: days < 0 ? `Expired ${-days}d ago at ${sMap.get(c.station_id)}` : `Expires in ${days}d at ${sMap.get(c.station_id)}`,
        stationId: c.station_id, stationName: sMap.get(c.station_id) ?? "", tab: "compliance", daysUntil: days });
    }
  }

  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
