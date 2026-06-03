import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CalendarCheck2 } from "lucide-react";
import { fmtD } from "@/lib/gantt-utils";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { TYPE_SHORT } from "@/lib/meeting-types";

type Row = {
  id: string;
  station_id: string;
  meeting_type: string;
  title: string | null;
  planned_date: string;
  planned_time: string | null;
  status: string;
};

export function UpcomingMeetings() {
  const q = useQuery({
    queryKey: ["upcoming-meetings"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ data: plans, error }, { data: stations }] = await Promise.all([
        (supabase as any)
          .from("meeting_plans")
          .select("id,station_id,meeting_type,title,planned_date,planned_time,status")
          .gte("planned_date", today.toISOString().slice(0, 10))
          .eq("status", "planned")
          .order("planned_date", { ascending: true })
          .limit(30),
        supabase.from("stations").select("id,name"),
      ]);
      if (error) throw error;
      const sMap = new Map((stations ?? []).map((s) => [s.id, s.name]));
      return ((plans ?? []) as Row[]).map((p) => ({ ...p, stationName: sMap.get(p.station_id) ?? "Station" }));
    },
    refetchInterval: 60000,
  });

  const rows = q.data ?? [];

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-border/60 p-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Upcoming Meetings</span>
        </div>
        <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <CalendarCheck2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          No meetings planned. Open a station → Meetings → Meeting Planner to schedule one.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((m) => {
            const days = differenceInCalendarDays(parseISO(m.planned_date), startToday());
            const soon = days <= 2;
            return (
              <Link
                key={m.id}
                to="/stations/$stationId"
                params={{ stationId: m.station_id }}
                className="block p-3 transition-colors hover:bg-secondary/60"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{m.stationName}</span>
                      <Badge variant="secondary" className="text-[10px]">{TYPE_SHORT[m.meeting_type as keyof typeof TYPE_SHORT] ?? m.meeting_type}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {fmtD(m.planned_date)}{m.planned_time ? ` · ${m.planned_time}` : ""}{m.title ? ` — ${m.title}` : ""}
                    </div>
                  </div>
                  <div
                    className="shrink-0 font-mono text-xs"
                    style={{ color: soon ? "var(--status-red)" : "var(--status-amber)" }}
                  >
                    {days === 0 ? "Today" : `${days}d`}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function startToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
