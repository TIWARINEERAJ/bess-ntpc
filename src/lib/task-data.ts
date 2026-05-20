import { supabase } from "@/integrations/supabase/client";
import type { L2Task, Status } from "./gantt-utils";

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(queryFactory: () => ReturnType<typeof supabase.from> extends infer _ ? any : never): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export function groupByStation<T extends { station_id: string }>(rows: T[], stationIds: string[] = []) {
  const grouped: Record<string, T[]> = {};
  for (const id of stationIds) grouped[id] = [];
  for (const row of rows) (grouped[row.station_id] ??= []).push(row);
  return grouped;
}

export async function fetchAllStationTasks() {
  return fetchAllPages<L2Task>(() => supabase.from("l2_tasks").select("*").order("station_id").order("sort_order"));
}

export async function fetchStationTasks(stationId: string) {
  return fetchAllPages<L2Task>(() => supabase.from("l2_tasks").select("*").eq("station_id", stationId).order("sort_order"));
}

export async function fetchAllTaskStatuses() {
  return fetchAllPages<Status>(() => supabase.from("station_task_status").select("*").order("station_id"));
}

export async function fetchStationTaskStatuses(stationId: string) {
  return fetchAllPages<Status>(() => supabase.from("station_task_status").select("*").eq("station_id", stationId));
}