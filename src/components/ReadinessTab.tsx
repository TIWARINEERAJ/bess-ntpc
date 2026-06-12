import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchAllDrawings } from "@/lib/drawings";
import {
  computeStationMaturity,
  maturityColor,
  STAGE_META,
  type StageKey,
  type L2TaskLike,
} from "@/lib/maturity";
import type { L2Task, Status } from "@/lib/gantt-utils";

export function ReadinessTab({
  stationId,
  tasks,
  statusMap,
}: {
  stationId: string;
  tasks: L2Task[];
  statusMap: Map<string, Status>;
}) {
  const drawingsQ = useQuery({ queryKey: ["all_drawings"], queryFn: fetchAllDrawings });
  const boiMasterQ = useQuery({
    queryKey: ["boi_master_min", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("boi_master").select("id,station_id,name").eq("station_id", stationId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const boiStatusQ = useQuery({
    queryKey: ["boi_status_min", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_boi_status")
        .select("station_id,boi_id,actual_po_date,delivery_date,site_receipt_date")
        .eq("station_id", stationId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const vendorsQ = useQuery({
    queryKey: ["vendor_status", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_vendor_status").select("*").eq("station_id", stationId).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const result = useMemo(() => {
    const drawings = (drawingsQ.data ?? []).filter((d) => d.station_id === stationId);
    return computeStationMaturity({
      tasks: tasks as unknown as L2TaskLike[],
      statusMap,
      drawings,
      boiMaster: boiMasterQ.data ?? [],
      boiStatus: boiStatusQ.data ?? [],
      vendors: vendorsQ.data ?? [],
    });
  }, [tasks, statusMap, drawingsQ.data, boiMasterQ.data, boiStatusQ.data, vendorsQ.data, stationId]);

  const r = result.readiness;
  const band = r >= 67 ? "On Track" : r >= 34 ? "At Risk" : r > 0 ? "Critical" : "Not Started";

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Project Readiness (Maturity Model)</div>
          <div className="mt-1 flex items-baseline gap-3">
            <div className="text-4xl font-bold tabular-nums" style={{ color: maturityColor(r) }}>{r}%</div>
            <Badge variant="outline" style={{ color: maturityColor(r), borderColor: maturityColor(r) }}>{band}</Badge>
          </div>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Weighted across the real BESS critical path — exposes Vendor Approval & BOI Ordering bottlenecks that conventional physical-% reporting hides.
          </p>
        </div>
        {/* Stacked contribution bar */}
        <div className="min-w-[260px] flex-1">
          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>Contribution to readiness</span><span>/ 100</span></div>
          <div className="flex h-5 w-full overflow-hidden rounded bg-secondary/50">
            {STAGE_META.map((m) => (
              <div
                key={m.key}
                style={{ width: `${m.weight}%`, background: maturityColor(result.stages[m.key]) }}
                title={`${m.label}: ${result.stages[m.key]}% × ${m.weight}% = ${result.contributions[m.key].toFixed(1)} pts`}
                className="h-full border-r border-background/40 last:border-0"
              />
            ))}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Segment width = weight · color = stage score</div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {STAGE_META.map((m) => (
          <StageCard key={m.key} k={m.key} label={m.label} weight={m.weight} score={result.stages[m.key]} exit={m.exit} />
        ))}
      </div>
    </div>
  );
}

function StageCard({ label, weight, score, exit }: { k: StageKey; label: string; weight: number; score: number; exit: string }) {
  const c = maturityColor(score);
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{label}</div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">{weight}% weight</Badge>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary/60">
          <div className="h-full rounded-full" style={{ width: `${score}%`, background: c }} />
        </div>
        <div className="w-10 text-right text-sm font-bold tabular-nums" style={{ color: c }}>{score}%</div>
      </div>
      <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground"><b>Exit:</b> {exit}</div>
    </Card>
  );
}
