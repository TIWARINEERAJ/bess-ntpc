import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileStack, ArrowRight, FileCheck2, FileClock, FileWarning } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { drawingCounts, drawingCatSummary, fetchAllDrawings, uniqueCategories, isApproved, isSubmitted, isSubmissionOverdue, type StationDrawing } from "@/lib/drawings";
import { DrawingsLifecycleChart } from "@/components/DrawingsLifecycleChart";

export const Route = createFileRoute("/_authenticated/drawings")({
  head: () => ({
    meta: [
      { title: "Drawings — Master Drawing List Status — NTPC BESS" },
      { name: "description", content: "Portfolio-wide Master Drawing List (MDL) submission and approval status across all NTPC BESS stations." },
    ],
  }),
  component: DrawingsPage,
});

type StationRow = { id: string; name: string; lot: string; sort_order: number | null };

function DrawingsPage() {
  const stationsQ = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("id,name,lot,sort_order").order("sort_order").order("name");
      if (error) throw error;
      return data as StationRow[];
    },
  });

  const drawingsQ = useQuery({
    queryKey: ["all_drawings"],
    queryFn: fetchAllDrawings,
  });

  const loading = stationsQ.isLoading || drawingsQ.isLoading;
  const stations = useMemo(() => stationsQ.data ?? [], [stationsQ.data]);
  const drawings = useMemo(() => drawingsQ.data ?? [], [drawingsQ.data]);

  const byStation = useMemo(() => {
    const m = new Map<string, StationDrawing[]>();
    for (const d of drawings) (m.get(d.station_id) ?? m.set(d.station_id, []).get(d.station_id)!).push(d);
    return m;
  }, [drawings]);

  const categories = useMemo(() => uniqueCategories(drawings), [drawings]);

  const stationCounts = useMemo(() =>
    stations.map((s) => ({ s, c: drawingCounts(byStation.get(s.id) ?? []) })),
    [stations, byStation]);

  // Station-wise MDL approval-category summary (the "conclusion" view).
  const catSummaries = useMemo(() =>
    stations
      .map((s) => ({ s, sum: drawingCatSummary(byStation.get(s.id) ?? []) }))
      .filter((x) => x.sum.total > 0),
    [stations, byStation]);

  const catTotals = useMemo(() => catSummaries.reduce((a, x) => ({
    total: a.total + x.sum.total,
    submitted: a.submitted + x.sum.submitted,
    approvedCat12: a.approvedCat12 + x.sum.approvedCat12,
    approvedCat12Rel: a.approvedCat12Rel + x.sum.approvedCat12Rel,
    catI: a.catI + x.sum.catI,
    catII: a.catII + x.sum.catII,
    catREL: a.catREL + x.sum.catREL,
    catIII: a.catIII + x.sum.catIII,
    categorized: a.categorized + x.sum.categorized,
    approvalPending: a.approvalPending + x.sum.approvalPending,
    balanceSubmission: a.balanceSubmission + x.sum.balanceSubmission,
  }), { total: 0, submitted: 0, approvedCat12: 0, approvedCat12Rel: 0, catI: 0, catII: 0, catREL: 0, catIII: 0, categorized: 0, approvalPending: 0, balanceSubmission: 0 }),
    [catSummaries]);




  const portfolio = useMemo(() => {
    const total = stationCounts.reduce((a, x) => a + x.c.total, 0);
    const submitted = stationCounts.reduce((a, x) => a + x.c.submitted, 0);
    const approved = stationCounts.reduce((a, x) => a + x.c.approved, 0);
    const overdue = stationCounts.reduce((a, x) => a + x.c.overdue, 0);
    const submissionOverdue = stationCounts.reduce((a, x) => a + x.c.submissionOverdue, 0);
    const upcoming = stationCounts.reduce((a, x) => a + x.c.upcoming, 0);
    const pending = Math.max(0, total - approved);
    return {
      total, submitted, approved, pending, overdue, submissionOverdue, upcoming,
      submittedPct: total ? Math.round((submitted / total) * 100) : 0,
      approvedPct: total ? Math.round((approved / total) * 100) : 0,
    };
  }, [stationCounts]);

  const submissionExceptions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nameById = new Map(stations.map((s) => [s.id, s.name]));
    return drawings
      .filter((d) => isSubmissionOverdue(d, today))
      .map((d) => ({
        ...d,
        station: nameById.get(d.station_id) ?? "—",
        daysOverdue: Math.max(0, Math.round((today.getTime() - new Date(d.sch_date as string).getTime()) / 86400000)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [drawings, stations]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <section>
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Drawings = Master Drawing List (MDL)</div>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight">
          <FileStack className="h-7 w-7 text-primary" /> Master Drawing List (MDL) Status
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Submission &amp; approval progress against the MDL — totals counted from the MDL register across all {stations.length} stations.</p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Kpi icon={<FileStack className="h-4 w-4" />} label="Total MDL Drawings" value={portfolio.total} tone="primary" />
        <Kpi icon={<FileClock className="h-4 w-4" />} label="Submitted" value={portfolio.submitted} sub={`${portfolio.submittedPct}% of MDL`} tone="blue" />
        <Kpi icon={<FileCheck2 className="h-4 w-4" />} label="Approved" value={portfolio.approved} sub={`${portfolio.approvedPct}% of MDL`} tone="green" />
        <Kpi icon={<FileWarning className="h-4 w-4" />} label="Pending" value={portfolio.pending} tone="amber" />
        <Kpi icon={<FileWarning className="h-4 w-4" />} label="Submission Overdue" value={portfolio.submissionOverdue} sub="past scheduled sub. date" tone="red" />
        <Kpi icon={<FileWarning className="h-4 w-4" />} label="Approval Overdue" value={portfolio.overdue} tone="red" />
        <Kpi icon={<FileClock className="h-4 w-4" />} label="Due in 2 months" value={portfolio.upcoming} tone="violet" />
      </section>

      {!loading && submissionExceptions.length > 0 && (
        <SubmissionExceptionsTable rows={submissionExceptions} />
      )}

      {loading ? (
        <Skeleton className="h-[480px]" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">All Stations</TabsTrigger>
            {categories.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <DrawingsLifecycleChart
              rows={drawings}
              title="Portfolio Drawings (MDL) Lifecycle — Month-wise Flow"
              subtitle="All stations combined — scheduled vs actual submissions, approvals, re-submissions and cumulative slippage"
              height={460}
            />
            <Card className="p-4">
              <div style={{ width: "100%", height: 340 }}>

                <ResponsiveContainer>
                  <BarChart data={stationCounts.map((x) => ({ name: x.s.name, Submitted: x.c.submitted, Approved: x.c.approved, Pending: x.c.pending }))}
                    margin={{ top: 8, right: 16, left: 0, bottom: 70 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={70} />
                    <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="Approved" stackId="a" fill="var(--status-green)" radius={[0, 0, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="Submitted" stackId="a" fill="var(--status-blue)" radius={[0, 0, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="Pending" stackId="a" fill="var(--muted)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {["Sl", "Station", "Total MDL", "Submitted", "Approved", "Pending", "Overdue", "Due 2mo", "Approval Progress", ""].map((h, i) =>
                        <th key={i} className={`border-b border-border px-3 py-2 font-semibold ${i >= 2 && i <= 7 ? "text-right" : "text-left"}`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {stationCounts.map((x, i) => (
                      <tr key={x.s.id} className="border-b border-border/40 hover:bg-secondary/30">
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Link to="/stations/$stationId" params={{ stationId: x.s.id }} className="font-medium hover:text-primary">{x.s.name}</Link>
                          <Badge variant="outline" className="ml-2 text-[10px]">{x.s.lot}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{x.c.total}</td>
                        <td className="px-3 py-2 text-right font-mono text-[color:var(--status-blue)]">{x.c.submitted}</td>
                        <td className="px-3 py-2 text-right font-mono text-[color:var(--status-green)]">{x.c.approved}</td>
                        <td className="px-3 py-2 text-right font-mono text-[color:var(--status-amber)]">{x.c.pending}</td>
                        <td className="px-3 py-2 text-right font-mono text-[color:var(--status-red)]">{x.c.overdue}</td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: "#8b5cf6" }}>{x.c.upcoming}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Progress value={x.c.approvedPct} className="h-1.5 w-28" />
                            <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">{x.c.approvedPct}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Link to="/stations/$stationId" params={{ stationId: x.s.id }} className="text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" /></Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Station-wise MDL Summary — approval-category conclusion view */}
            <Card className="p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileCheck2 className="h-4 w-4 text-primary" /> Station-wise MDL Summary — Approval Category Conclusion
                </div>
                <Badge variant="outline" className="text-[10px]">{catTotals.total} drawings · {catSummaries.length} stations</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {["Station", "Total MDL", "Submitted", "Appr. (I+II)", "Appr. (I+II+REL)", "CAT-I", "CAT-II", "CATREL", "CAT-III", "I+II+III+REL", "Apprvl Pending", "Balance Subm."].map((h, i) =>
                        <th key={i} className={`whitespace-nowrap border-b border-border px-3 py-2 font-semibold ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {catSummaries.map(({ s, sum }) => (
                      <tr key={s.id} className="border-b border-border/40 hover:bg-secondary/30">
                        <td className="px-3 py-2">
                          <Link to="/stations/$stationId" params={{ stationId: s.id }} className="font-medium hover:text-primary">{s.name}</Link>
                        </td>
                        <SumCell stationId={s.id} view="total" value={sum.total} />
                        <SumCell stationId={s.id} view="submitted" value={sum.submitted} color="var(--status-blue)" />
                        <SumCell stationId={s.id} view="appr12" value={sum.approvedCat12} />
                        <SumCell stationId={s.id} view="appr12rel" value={sum.approvedCat12Rel} color="var(--status-green)" />
                        <SumCell stationId={s.id} view="catI" value={sum.catI} />
                        <SumCell stationId={s.id} view="catII" value={sum.catII} />
                        <SumCell stationId={s.id} view="catREL" value={sum.catREL} />
                        <SumCell stationId={s.id} view="catIII" value={sum.catIII} color="var(--status-red)" />
                        <SumCell stationId={s.id} view="categorized" value={sum.categorized} />
                        <SumCell stationId={s.id} view="pending" value={sum.approvalPending} color="var(--status-amber)" />
                        <SumCell stationId={s.id} view="balance" value={sum.balanceSubmission} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-sidebar/40 font-semibold">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.total}</td>
                      <td className="px-3 py-2 text-right font-mono text-[color:var(--status-blue)]">{catTotals.submitted}</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.approvedCat12}</td>
                      <td className="px-3 py-2 text-right font-mono text-[color:var(--status-green)]">{catTotals.approvedCat12Rel}</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.catI}</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.catII}</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.catREL}</td>
                      <td className="px-3 py-2 text-right font-mono text-[color:var(--status-red)]">{catTotals.catIII}</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.categorized}</td>
                      <td className="px-3 py-2 text-right font-mono text-[color:var(--status-amber)]">{catTotals.approvalPending}</td>
                      <td className="px-3 py-2 text-right font-mono">{catTotals.balanceSubmission}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </TabsContent>

          {categories.map((cat) => (
            <TabsContent key={cat} value={cat}>
              <CategoryTable cat={cat} drawings={drawings.filter((d) => d.category === cat)} stations={stations} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function CategoryTable({ cat, drawings, stations }: { cat: string; drawings: StationDrawing[]; stations: StationRow[] }) {
  const [q, setQ] = useState("");
  const nameById = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);
  const sub = drawings.filter(isSubmitted).length;
  const app = drawings.filter(isApproved).length;
  const rows = drawings
    .map((d) => ({ ...d, station: nameById.get(d.station_id) ?? "—" }))
    .filter((d) => !q || d.station.toLowerCase().includes(q.toLowerCase()) || d.drg_ref.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.station.localeCompare(b.station));

  const status = (d: StationDrawing) =>
    isApproved(d) ? { label: "Approved", c: "var(--status-green)" }
      : (d.submitted_date || d.resubmitted_date) ? { label: "Submitted", c: "var(--status-blue)" }
      : { label: "Pending", c: "var(--status-amber)" };

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">{cat}</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{drawings.length} drawings · <span className="text-[color:var(--status-blue)]">{sub} submitted</span> · <span className="text-[color:var(--status-green)]">{app} approved</span></span>
          <input
            placeholder="Search station / ref…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-48 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-sidebar/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {["Station", "Drg Ref", "Drawing Description", "Submitted", "Re-submitted", "Approved", "Cat", "Status"].map((h) =>
                <th key={h} className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No drawings.</td></tr>}
            {rows.map((d) => {
              const st = status(d);
              return (
                <tr key={d.id} className="border-b border-border/40 align-top hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link to="/stations/$stationId" params={{ stationId: d.station_id }} className="font-medium hover:text-primary">{d.station}</Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-muted-foreground">{d.drg_ref || "—"}</td>
                  <td className="max-w-[28rem] whitespace-normal break-words px-3 py-2 leading-snug">{d.drg_desc || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">{d.submitted_date ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">{d.resubmitted_date ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">{d.approved_date ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{d.cat ?? "—"}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]" style={{ color: st.c, borderColor: st.c }}>{st.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: number; sub?: string; tone: "primary" | "blue" | "green" | "amber" | "red" | "violet" }) {
  const color = tone === "green" ? "var(--status-green)" : tone === "blue" ? "var(--status-blue)" : tone === "amber" ? "var(--status-amber)" : tone === "red" ? "var(--status-red)" : tone === "violet" ? "#8b5cf6" : "var(--primary)";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold" style={{ color }}>{value.toLocaleString()}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
