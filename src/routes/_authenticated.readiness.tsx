import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Gauge, TrendingUp, PackageCheck, Factory } from "lucide-react";
import { fetchTasksByStation, fetchStatusesByStation } from "@/lib/task-data";
import { fetchAllDrawings } from "@/lib/drawings";
import { buildStatusMap } from "@/lib/gantt-utils";
import {
  computeStationMaturity,
  maturityColor,
  STAGE_META,
  type MaturityResult,
  type StageKey,
} from "@/lib/maturity";

export const Route = createFileRoute("/_authenticated/readiness")({
  head: () => ({ meta: [{ title: "Project Readiness — NTPC BESS Maturity Model" }] }),
  component: ReadinessDashboard,
});

type Station = { id: string; name: string; capacity_mwh: number; connectivity_transformer: string | null };

type Row = { station: Station; result: MaturityResult };

// Corporate 5-layer pipeline derived from the 8 stage scores.
const LAYERS: { label: string; keys: StageKey[] }[] = [
  { label: "Studies", keys: ["mobilization", "studies"] },
  { label: "Engineering", keys: ["engineering"] },
  { label: "Vendor Approval", keys: ["vendor"] },
  { label: "BOI Ordering", keys: ["boi"] },
  { label: "Site Execution", keys: ["civil", "construction", "commissioning"] },
];

function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

function ReadinessDashboard() {
  const stationsQ = useQuery({
    queryKey: ["stations", "readiness"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("id,name,capacity_mwh,connectivity_transformer").order("sort_order").order("name");
      if (error) throw error;
      return data as Station[];
    },
  });
  const stations = stationsQ.data ?? [];
  const ids = useMemo(() => stations.map((s) => s.id), [stations]);
  const key = ids.join("|");

  const tasksQ = useQuery({ queryKey: ["l2_tasks", "by-station", key], queryFn: () => fetchTasksByStation(ids), enabled: ids.length > 0 });
  const statusQ = useQuery({ queryKey: ["all_status", "by-station", key], queryFn: () => fetchStatusesByStation(ids), enabled: ids.length > 0 });
  const drawingsQ = useQuery({ queryKey: ["all_drawings"], queryFn: fetchAllDrawings });
  const boiMasterQ = useQuery({
    queryKey: ["boi_master_all_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("boi_master").select("id,station_id,name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const boiStatusQ = useQuery({
    queryKey: ["all_boi_status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_boi_status").select("station_id,boi_id,actual_po_date,delivery_date,site_receipt_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const vendorsQ = useQuery({
    queryKey: ["all_vendor_status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("station_vendor_status").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = stationsQ.isLoading || tasksQ.isLoading || statusQ.isLoading || drawingsQ.isLoading || boiMasterQ.isLoading || vendorsQ.isLoading;

  const rows = useMemo<Row[]>(() => {
    if (!stations.length) return [];
    const tasksByStation = tasksQ.data ?? {};
    const statusByStation = statusQ.data ?? {};
    const drawings = drawingsQ.data ?? [];
    const boiMaster = boiMasterQ.data ?? [];
    const boiStatus = boiStatusQ.data ?? [];
    const vendors = vendorsQ.data ?? [];
    return stations.map((station) => {
      const result = computeStationMaturity({
        tasks: tasksByStation[station.id] ?? [],
        statusMap: buildStatusMap(statusByStation[station.id]),
        drawings: drawings.filter((d) => d.station_id === station.id),
        boiMaster: boiMaster.filter((b) => b.station_id === station.id),
        boiStatus: boiStatus.filter((b) => b.station_id === station.id),
        vendors: vendors.filter((v) => v.station_id === station.id),
      });
      return { station, result };
    });
  }, [stations, tasksQ.data, statusQ.data, drawingsQ.data, boiMasterQ.data, boiStatusQ.data, vendorsQ.data]);

  const ranked = useMemo(() => [...rows].sort((a, b) => b.result.readiness - a.result.readiness), [rows]);

  const fleet = useMemo(() => {
    const layerAvgs = LAYERS.map((l) => ({
      label: l.label,
      pct: avg(rows.map((r) => avg(l.keys.map((k) => r.result.stages[k])))),
    }));
    const avgReadiness = avg(rows.map((r) => r.result.readiness));
    const engFrozen = rows.filter((r) => r.result.stages.engineering >= 80).length;
    const trfOrdered = rows.filter((r) => r.result.stages.boi >= 40).length;
    const vendorFinal = rows.filter((r) => r.result.stages.vendor >= 60).length;
    return { layerAvgs, avgReadiness, engFrozen, trfOrdered, vendorFinal };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <section>
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Corporate Monitoring</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Project Readiness — Maturity Model</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A single readiness number per package weighted across the real BESS critical path. Unlike conventional physical-%
          reporting (which shows every site near zero), this exposes where COD risk truly sits: <b>Vendor/Provenness approval</b> and
          <b> BOI / Power-Transformer ordering</b>.
        </p>
      </section>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi icon={<Gauge className="h-4 w-4" />} label="Fleet Avg. Readiness" value={`${fleet.avgReadiness}%`} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Engineering Frozen" value={`${fleet.engFrozen}/${rows.length}`} />
            <Kpi icon={<PackageCheck className="h-4 w-4" />} label="BOI Ordering Underway" value={`${fleet.trfOrdered}/${rows.length}`} />
            <Kpi icon={<Factory className="h-4 w-4" />} label="Vendors Finalized" value={`${fleet.vendorFinal}/${rows.length}`} />
          </section>

          {/* 5-layer corporate pipeline */}
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Corporate Pipeline — fleet average by layer</div>
            <div className="grid gap-3 sm:grid-cols-5">
              {fleet.layerAvgs.map((l, i) => (
                <div key={l.label} className="relative">
                  <div className="rounded-lg border border-border p-3 text-center">
                    <div className="text-2xl font-bold tabular-nums" style={{ color: maturityColor(l.pct) }}>{l.pct}%</div>
                    <div className="mt-1 text-xs text-muted-foreground">{l.label}</div>
                  </div>
                  {i < fleet.layerAvgs.length - 1 && (
                    <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground sm:block" />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Fleet is gated by the lowest-scoring layers — typically Vendor Approval and BOI Ordering.</p>
          </Card>

          {/* Station readiness ranking */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">Station Readiness Ranking</div>
            <div className="divide-y divide-border/50">
              {ranked.map(({ station, result }) => (
                <Link
                  key={station.id}
                  to="/stations/$stationId"
                  params={{ stationId: station.id }}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/40"
                >
                  <div className="w-36 shrink-0">
                    <div className="text-sm font-medium">{station.name}</div>
                    <div className="text-[10px] text-muted-foreground">{station.capacity_mwh} MWh · {station.connectivity_transformer ?? "—"}</div>
                  </div>
                  <div className="flex h-5 flex-1 overflow-hidden rounded bg-secondary/50">
                    {STAGE_META.map((m) => (
                      <div
                        key={m.key}
                        style={{ width: `${m.weight}%`, background: maturityColor(result.stages[m.key]) }}
                        title={`${m.label}: ${result.stages[m.key]}%`}
                        className="h-full border-r border-background/40 last:border-0"
                      />
                    ))}
                  </div>
                  <div className="w-12 shrink-0 text-right text-lg font-bold tabular-nums" style={{ color: maturityColor(result.readiness) }}>
                    {result.readiness}%
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Bottleneck heatmap */}
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">Bottleneck Heatmap — stations × stages</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Station</th>
                    {STAGE_META.map((m) => (
                      <th key={m.key} className="px-2 py-2 text-center font-semibold" title={`${m.label} (${m.weight}%)`}>{m.short}</th>
                    ))}
                    <th className="px-2 py-2 text-center font-semibold">Ready</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map(({ station, result }) => (
                    <tr key={station.id} className="border-b border-border/40">
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium">{station.name}</td>
                      {STAGE_META.map((m) => {
                        const v = result.stages[m.key];
                        return (
                          <td key={m.key} className="px-1 py-1 text-center">
                            <span
                              className="inline-block w-10 rounded py-1 text-[10px] font-semibold text-background"
                              style={{ background: maturityColor(v) }}
                            >
                              {v}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-center text-sm font-bold tabular-nums" style={{ color: maturityColor(result.readiness) }}>
                        {result.readiness}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-[11px] uppercase tracking-wider">{label}</span></div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}
