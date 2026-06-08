import { createFileRoute } from "@tanstack/react-router";
import { buildStatusMap, stationProgress, type L2Task, type Status } from "@/lib/gantt-utils";

const PAGE = 1000;

/** Sunday of the current week (one snapshot date per week). */
function currentWeekend(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + ((7 - day) % 7));
  return d.toISOString().slice(0, 10);
}

async function fetchAll<T>(
  table: string,
  select: string,
): Promise<T[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

async function captureSnapshot() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [stations, tasks, statuses] = await Promise.all([
    fetchAll<{ id: string; name: string }>("stations", "id,name"),
    fetchAll<L2Task>("l2_tasks", "*"),
    fetchAll<Status>("station_task_status", "*"),
  ]);

  const snapshotDate = currentWeekend();
  const tasksByStation = new Map<string, L2Task[]>();
  for (const t of tasks) (tasksByStation.get(t.station_id) ?? tasksByStation.set(t.station_id, []).get(t.station_id)!).push(t);
  const statusByStation = new Map<string, Status[]>();
  for (const s of statuses) (statusByStation.get(s.station_id) ?? statusByStation.set(s.station_id, []).get(s.station_id)!).push(s);

  const rows = stations.map((s) => {
    const map = buildStatusMap(statusByStation.get(s.id));
    const p = stationProgress(tasksByStation.get(s.id) ?? [], map);
    const health = p.delayed > 0 ? (p.delayed >= 5 ? "red" : "amber") : "green";
    return {
      snapshot_date: snapshotDate,
      station_id: s.id,
      station_name: s.name,
      pct: p.pct,
      delayed: p.delayed,
      completed: p.completed,
      total: p.total,
      health,
    };
  });

  if (rows.length) {
    const { error } = await supabaseAdmin
      .from("weekly_progress_snapshots")
      .upsert(rows, { onConflict: "snapshot_date,station_id" });
    if (error) throw new Error(error.message);
  }

  return { snapshotDate, stations: rows.length };
}

export const Route = createFileRoute("/api/public/hooks/weekly-snapshot")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await captureSnapshot();
          return Response.json({ success: true, ...result });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => {
        try {
          const result = await captureSnapshot();
          return Response.json({ success: true, ...result });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
