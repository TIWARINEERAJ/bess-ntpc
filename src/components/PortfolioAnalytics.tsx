import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  
} from "recharts";
import { ArrowRight, FileStack, Package, ShieldCheck } from "lucide-react";
import { isApproved, isSubmitted, type StationDrawing } from "@/lib/drawings";

type StationLite = { id: string; name: string };

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function SectionHeading({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Canonical key + display label for a drawing type (collapses spelling variants). */
function typeKeyLabel(raw: string): { key: string; label: string } {
  const t = (raw || "Uncategorised").trim();
  const key = t.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Title-case a clean label
  const label = t
    .replace(/[,/]+/g, " / ")
    .replace(/\s+/g, " ")
    .replace(/\bengg\b/i, "Engg")
    .trim();
  return { key, label };
}

/* ================================================================== */
/* 1. Drawing-type-wise MDL analytics (all stations together)          */
/* ================================================================== */

type TypeRow = {
  key: string;
  label: string;
  total: number;
  approved: number;
  submitted: number; // submitted but not yet approved
  pending: number; // neither submitted nor approved
  approvedPct: number;
};

export function DrawingTypeAnalytics({
  stations,
  drawings,
}: {
  stations: StationLite[];
  drawings: StationDrawing[];
}) {
  const rows = useMemo<TypeRow[]>(() => {
    const m = new Map<string, TypeRow>();
    for (const d of drawings) {
      const { key, label } = typeKeyLabel(d.category);
      let r = m.get(key);
      if (!r) {
        r = { key, label, total: 0, approved: 0, submitted: 0, pending: 0, approvedPct: 0 };
        m.set(key, r);
      }
      r.total += 1;
      if (isApproved(d)) r.approved += 1;
      else if (isSubmitted(d)) r.submitted += 1;
      else r.pending += 1;
    }
    return Array.from(m.values())
      .map((r) => ({ ...r, approvedPct: r.total ? Math.round((r.approved / r.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [drawings]);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (a, r) => ({
        total: a.total + r.total,
        approved: a.approved + r.approved,
        submitted: a.submitted + r.submitted,
        pending: a.pending + r.pending,
      }),
      { total: 0, approved: 0, submitted: 0, pending: 0 },
    );
    return t;
  }, [rows]);

  const [drill, setDrill] = useState<TypeRow | null>(null);

  // Per-station breakdown for the drilled type
  const drillStations = useMemo(() => {
    if (!drill) return [];
    const byStation = new Map<string, { approved: number; submitted: number; pending: number; total: number }>();
    for (const d of drawings) {
      if (typeKeyLabel(d.category).key !== drill.key) continue;
      let e = byStation.get(d.station_id);
      if (!e) { e = { approved: 0, submitted: 0, pending: 0, total: 0 }; byStation.set(d.station_id, e); }
      e.total += 1;
      if (isApproved(d)) e.approved += 1;
      else if (isSubmitted(d)) e.submitted += 1;
      else e.pending += 1;
    }
    return stations
      .map((s) => ({ s, c: byStation.get(s.id) }))
      .filter((x) => x.c && x.c.total > 0)
      .map((x) => ({ s: x.s, ...x.c! }))
      .sort((a, b) => b.total - a.total);
  }, [drill, drawings, stations]);

  if (rows.length === 0) return null;

  const chartData = rows.map((r) => ({ name: r.label, approved: r.approved, submitted: r.submitted, pending: r.pending, key: r.key }));

  return (
    <section>
      <SectionHeading
        title="Drawings (MDL) — by Type · all stations"
        sub="Master Drawing List (MDL) broken down by engineering discipline · totals are counted from the MDL register · approved = CAT-I / CAT-II only · click a type for the station split"
        right={
          <Link to="/drawings" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:text-primary">
            <FileStack className="h-3.5 w-3.5" /> Drawings page
          </Link>
        }
      />
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total MDL Drawings" value={totals.total} tone="var(--primary)" />
          <Stat label="Approved (CAT-I/II)" value={totals.approved} tone="var(--status-green)" sub={totals.total ? `${Math.round((totals.approved / totals.total) * 100)}%` : undefined} />
          <Stat label="Submitted, awaiting" value={totals.submitted} tone="var(--status-blue)" />
          <Stat label="Pending submission" value={totals.pending} tone="var(--status-amber)" />
        </div>


        <div className="mt-4" style={{ width: "100%", height: 380 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 90 }} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={90} />
              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="approved" stackId="d" name="Approved" fill="var(--status-green)" radius={[0, 0, 0, 0]} cursor="pointer" onClick={(d: any) => setDrill(rows.find((r) => r.key === d.key) ?? null)} />
              <Bar dataKey="submitted" stackId="d" name="Submitted" fill="var(--status-blue)" cursor="pointer" onClick={(d: any) => setDrill(rows.find((r) => r.key === d.key) ?? null)} />
              <Bar dataKey="pending" stackId="d" name="Pending" fill="var(--status-amber)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: any) => setDrill(rows.find((r) => r.key === d.key) ?? null)} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <button
              key={r.key}
              onClick={() => setDrill(r)}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.label}</span>
                <span className="text-[10px] text-muted-foreground">{r.total} drawings · {r.approvedPct}% approved</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono">
                <span style={{ color: "var(--status-green)" }}>{r.approved}</span>
                <span style={{ color: "var(--status-amber)" }}>{r.pending}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drill?.label} — station split</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Station</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right" style={{ color: "var(--status-green)" }}>Approved</th>
                  <th className="py-2 text-right" style={{ color: "var(--status-blue)" }}>Submitted</th>
                  <th className="py-2 text-right" style={{ color: "var(--status-amber)" }}>Pending</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {drillStations.map(({ s, total, approved, submitted, pending }) => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="py-2 text-right font-mono">{total}</td>
                    <td className="py-2 text-right font-mono" style={{ color: "var(--status-green)" }}>{approved}</td>
                    <td className="py-2 text-right font-mono" style={{ color: "var(--status-blue)" }}>{submitted}</td>
                    <td className="py-2 text-right font-mono" style={{ color: "var(--status-amber)" }}>{pending}</td>
                    <td className="py-2 text-right">
                      <Link to="/stations/$stationId" params={{ stationId: s.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ================================================================== */
/* 2. BOI + Compliance analytics (all stations together)               */
/* ================================================================== */

type BoiMaster = { id: string; station_id: string; name: string; sort_order?: number; inspection_category?: string | null; scheduled_po_date?: string | null };
type BoiStatus = { station_id: string; boi_id: string; actual_po_date: string | null; delivery_date?: string | null; site_receipt_date?: string | null };
type ComplMaster = { id: string; category: string; name: string };
type ComplStatus = { station_id: string; compliance_id: string; status: string | null };

export function BoiComplianceAnalytics({
  stations,
  boiMaster,
  boiStatus,
  complMaster,
  complStatus,
}: {
  stations: StationLite[];
  boiMaster: BoiMaster[];
  boiStatus: BoiStatus[];
  complMaster: ComplMaster[];
  complStatus: ComplStatus[];
}) {
  /* ---- BOI master grouped per station (each plant has its own list) ---- */
  const boiMasterByStation = useMemo(() => {
    const m = new Map<string, BoiMaster[]>();
    for (const b of boiMaster) {
      const arr = m.get(b.station_id) ?? [];
      arr.push(b);
      m.set(b.station_id, arr);
    }
    return m;
  }, [boiMaster]);

  /* ---- BOI: per-station procurement funnel ---- */
  const boiStatusMap = useMemo(() => {
    const m = new Map<string, BoiStatus>();
    for (const s of boiStatus) m.set(`${s.station_id}::${s.boi_id}`, s);
    return m;
  }, [boiStatus]);

  const boiByStation = useMemo(() => {
    return stations.map((st) => {
      const items = boiMasterByStation.get(st.id) ?? [];
      let po = 0, delivered = 0, received = 0;
      for (const b of items) {
        const cell = boiStatusMap.get(`${st.id}::${b.id}`);
        if (cell?.actual_po_date) po += 1;
        if (cell?.delivery_date) delivered += 1;
        if (cell?.site_receipt_date) received += 1;
      }
      return { id: st.id, name: st.name, po, delivered, received, total: items.length };
    });
  }, [stations, boiMasterByStation, boiStatusMap]);

  const boiTotals = useMemo(() => {
    const cells = boiMaster.length;
    const po = boiByStation.reduce((a, s) => a + s.po, 0);
    const delivered = boiByStation.reduce((a, s) => a + s.delivered, 0);
    const received = boiByStation.reduce((a, s) => a + s.received, 0);
    return { cells, po, delivered, received };
  }, [boiByStation, boiMaster.length]);

  /* ---- BOI: per-component (item) roll-up across stations, grouped by item name ---- */
  const boiByItem = useMemo(() => {
    const byName = new Map<string, { name: string; category: string | null; sort: number; po: number; delivered: number; received: number; total: number }>();
    for (const st of stations) {
      const items = boiMasterByStation.get(st.id) ?? [];
      for (const b of items) {
        let e = byName.get(b.name);
        if (!e) { e = { name: b.name, category: b.inspection_category ?? null, sort: b.sort_order ?? 0, po: 0, delivered: 0, received: 0, total: 0 }; byName.set(b.name, e); }
        e.total += 1;
        const cell = boiStatusMap.get(`${st.id}::${b.id}`);
        if (cell?.actual_po_date) e.po += 1;
        if (cell?.delivery_date) e.delivered += 1;
        if (cell?.site_receipt_date) e.received += 1;
      }
    }
    return Array.from(byName.values())
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((e) => ({ id: e.name, name: e.name, category: e.category, po: e.po, delivered: e.delivered, received: e.received, total: e.total }));
  }, [boiMasterByStation, stations, boiStatusMap]);

  const [boiDrill, setBoiDrill] = useState<{ id: string; name: string } | null>(null);

  // Drill into a single station + stage (clicked from the chart bars)
  const [stationDrill, setStationDrill] = useState<{ stationId: string; name: string; stage: "po" | "delivered" | "received" } | null>(null);

  const stationDrillItems = useMemo(() => {
    if (!stationDrill) return [];
    const { stationId, stage } = stationDrill;
    const items = boiMasterByStation.get(stationId) ?? [];
    return [...items]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map((b) => {
        const cell = boiStatusMap.get(`${stationId}::${b.id}`);
        const match =
          stage === "po" ? !!cell?.actual_po_date :
          stage === "delivered" ? !!cell?.delivery_date :
          !!cell?.site_receipt_date;
        if (!match) return null;
        return {
          id: b.id,
          name: b.name,
          category: b.inspection_category ?? null,
          po: cell?.actual_po_date ?? null,
          delivery: cell?.delivery_date ?? null,
          receipt: cell?.site_receipt_date ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [stationDrill, boiMasterByStation, boiStatusMap]);

  // Per-station constituents for the drilled component (matched by item name)
  const boiDrillStations = useMemo(() => {
    if (!boiDrill) return [];
    return stations.map((st) => {
      const items = boiMasterByStation.get(st.id) ?? [];
      const b = items.find((x) => x.name === boiDrill.id);
      if (!b) return null;
      const cell = boiStatusMap.get(`${st.id}::${b.id}`);
      const stage = cell?.site_receipt_date ? "received" : cell?.delivery_date ? "delivered" : cell?.actual_po_date ? "po" : "pending";
      return {
        s: st,
        stage,
        po: cell?.actual_po_date ?? null,
        delivery: cell?.delivery_date ?? null,
        receipt: cell?.site_receipt_date ?? null,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => {
      const order = { received: 0, delivered: 1, po: 2, pending: 3 } as const;
      return order[a.stage as keyof typeof order] - order[b.stage as keyof typeof order];
    });
  }, [boiDrill, stations, boiMasterByStation, boiStatusMap]);

  /* ---- Compliance: status split by category ---- */
  const complStatusMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of complStatus) m.set(`${c.station_id}::${c.compliance_id}`, c.status ?? "not_applied");
    return m;
  }, [complStatus]);

  const complByCategory = useMemo(() => {
    const m = new Map<string, { category: string; approved: number; inProgress: number; pending: number; na: number; total: number }>();
    for (const st of stations) {
      for (const cm of complMaster) {
        const status = complStatusMap.get(`${st.id}::${cm.id}`) ?? "not_applied";
        let e = m.get(cm.category);
        if (!e) { e = { category: cm.category, approved: 0, inProgress: 0, pending: 0, na: 0, total: 0 }; m.set(cm.category, e); }
        e.total += 1;
        if (status === "approved") e.approved += 1;
        else if (status === "applied" || status === "under_review") e.inProgress += 1;
        else if (status === "not_applicable") e.na += 1;
        else e.pending += 1; // not_applied / rejected / expired
      }
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [stations, complMaster, complStatusMap]);

  const complTotals = useMemo(() => {
    return complByCategory.reduce(
      (a, c) => ({
        approved: a.approved + c.approved,
        inProgress: a.inProgress + c.inProgress,
        pending: a.pending + c.pending,
        na: a.na + c.na,
        total: a.total + c.total,
      }),
      { approved: 0, inProgress: 0, pending: 0, na: 0, total: 0 },
    );
  }, [complByCategory]);

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      {/* BOI */}
      <div>
        <SectionHeading title="BOI Procurement — all stations" sub="Bought-out items: PO placed → delivered → received at site (per-station item master)" />
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="PO placed" value={boiTotals.po} tone="var(--status-blue)" sub={boiTotals.cells ? `${Math.round((boiTotals.po / boiTotals.cells) * 100)}%` : undefined} icon={<Package className="h-3.5 w-3.5" />} />
            <Stat label="Delivered" value={boiTotals.delivered} tone="#8b5cf6" />
            <Stat label="Received at site" value={boiTotals.received} tone="var(--status-green)" />
          </div>
          <div className="mt-4" style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <ComposedChart data={boiByStation} margin={{ top: 12, right: 12, left: 0, bottom: 80 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={80} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="po" name="PO placed" fill="var(--status-blue)" radius={[3, 3, 0, 0]} maxBarSize={16} cursor="pointer" onClick={(d: any) => d?.payload && setStationDrill({ stationId: d.payload.id, name: d.payload.name, stage: "po" })} />
                <Bar dataKey="delivered" name="Delivered" fill="#8b5cf6" radius={[3, 3, 0, 0]} maxBarSize={16} cursor="pointer" onClick={(d: any) => d?.payload && setStationDrill({ stationId: d.payload.id, name: d.payload.name, stage: "delivered" })} />
                <Bar dataKey="received" name="Received" fill="var(--status-green)" radius={[3, 3, 0, 0]} maxBarSize={16} cursor="pointer" onClick={(d: any) => d?.payload && setStationDrill({ stationId: d.payload.id, name: d.payload.name, stage: "received" })} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">Tip: click a bar to see the underlying items for that station &amp; stage</p>


          {/* Per-component (item) breakdown — click a component for its station-wise constituents */}
          {boiByItem.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Components ({boiByItem.length}) · click for station-wise constituents
              </div>
              <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
                {boiByItem.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setBoiDrill({ id: it.id, name: it.name })}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{it.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {it.received}/{it.total} received{it.category ? ` · ${it.category}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-mono">
                      <span style={{ color: "var(--status-blue)" }} title="PO placed">{it.po}</span>
                      <span style={{ color: "#8b5cf6" }} title="Delivered">{it.delivered}</span>
                      <span style={{ color: "var(--status-green)" }} title="Received">{it.received}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!boiDrill} onOpenChange={(o) => !o && setBoiDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{boiDrill?.name} — station-wise constituents</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Station</th>
                  <th className="py-2">Stage</th>
                  <th className="py-2 text-right" style={{ color: "var(--status-blue)" }}>PO placed</th>
                  <th className="py-2 text-right" style={{ color: "#8b5cf6" }}>Delivered</th>
                  <th className="py-2 text-right" style={{ color: "var(--status-green)" }}>Received</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {boiDrillStations.map(({ s, stage, po, delivery, receipt }) => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="py-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          color: stage === "received" ? "var(--status-green)" : stage === "delivered" ? "#8b5cf6" : stage === "po" ? "var(--status-blue)" : "var(--status-amber)",
                          background: "color-mix(in oklab, currentColor 12%, transparent)",
                        }}
                      >
                        {stage === "po" ? "PO placed" : stage === "pending" ? "Not started" : stage.charAt(0).toUpperCase() + stage.slice(1)}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono text-[11px]">{po ?? "—"}</td>
                    <td className="py-2 text-right font-mono text-[11px]">{delivery ?? "—"}</td>
                    <td className="py-2 text-right font-mono text-[11px]">{receipt ?? "—"}</td>
                    <td className="py-2 text-right">
                      <Link to="/stations/$stationId" params={{ stationId: s.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Station + stage drill-down (clicked from a chart bar) */}
      <Dialog open={!!stationDrill} onOpenChange={(o) => !o && setStationDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {stationDrill?.name} — {stationDrill?.stage === "po" ? "PO placed" : stationDrill?.stage === "delivered" ? "Delivered" : "Received at site"} items ({stationDrillItems.length})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {stationDrillItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No items at this stage for this station.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right" style={{ color: "var(--status-blue)" }}>PO placed</th>
                    <th className="py-2 text-right" style={{ color: "#8b5cf6" }}>Delivered</th>
                    <th className="py-2 text-right" style={{ color: "var(--status-green)" }}>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {stationDrillItems.map((it) => (
                    <tr key={it.id} className="border-b border-border/50">
                      <td className="py-2 font-medium">
                        {it.name}
                        {it.category ? <span className="ml-2 text-[10px] text-muted-foreground">{it.category}</span> : null}
                      </td>
                      <td className="py-2 text-right font-mono text-[11px]">{it.po ?? "—"}</td>
                      <td className="py-2 text-right font-mono text-[11px]">{it.delivery ?? "—"}</td>
                      <td className="py-2 text-right font-mono text-[11px]">{it.receipt ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {stationDrill && (
            <div className="flex justify-end">
              <Link to="/stations/$stationId" params={{ stationId: stationDrill.stationId }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Open station <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compliance */}
      <div>

        <SectionHeading title="Statutory Compliances — all stations" sub="Approval status of common statutory items grouped by category, summed across stations" />
        <Card className="p-4">
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Approved" value={complTotals.approved} tone="var(--status-green)" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
            <Stat label="In progress" value={complTotals.inProgress} tone="var(--status-blue)" />
            <Stat label="Pending" value={complTotals.pending} tone="var(--status-amber)" />
            <Stat label="N/A" value={complTotals.na} tone="#8b5cf6" />
          </div>
          <div className="mt-4" style={{ width: "100%", height: 340 }}>
            {complByCategory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No compliance items configured.</div>
            ) : (
              <ResponsiveContainer>
                <ComposedChart data={complByCategory} margin={{ top: 12, right: 12, left: 0, bottom: 80 }} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="category" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={80} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="approved" stackId="c" name="Approved" fill="var(--status-green)" />
                  <Bar dataKey="inProgress" stackId="c" name="In progress" fill="var(--status-blue)" />
                  <Bar dataKey="pending" stackId="c" name="Pending" fill="var(--status-amber)" />
                  <Bar dataKey="na" stackId="c" name="N/A" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone, icon }: { label: string; value: number; sub?: string; tone: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon && <span style={{ color: tone }}>{icon}</span>}
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: tone }}>{value.toLocaleString()}</span>
        {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}
