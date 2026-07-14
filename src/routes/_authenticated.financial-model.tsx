import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, TrendingUp, Battery, IndianRupee, CheckCircle2, XCircle, RotateCcw, Gauge, PiggyBank, Percent, Zap } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LineChart, Line, Legend } from "recharts";
import { PROJECTS, PORTFOLIO_PUBLISHED, type Project } from "@/lib/financial-model/data";
import { computeProject, defaultAssumptions, type EngineAssumptions, type ProjectComputation } from "@/lib/financial-model/engine";

export const Route = createFileRoute("/_authenticated/financial-model")({
  head: () => ({
    meta: [
      { title: "Financial Model — NTPC BESS 4.70 GWh Appraisal Engine" },
      { name: "description", content: "Enterprise reverse-engineered financial model of the NTPC BESS Lot-1 & Lot-2 (4.70 GWh) appraisal — cost, finance, tariff, IRR, DSCR and validation." },
    ],
  }),
  component: FinancialModel,
});

const inr = (x: number, d = 2) => x.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

function FinancialModel() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <section>
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Reverse-engineered · Resurgent India Appraisal · Qtr-IV FY25-26</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">BESS Financial Model — 4.70 GWh</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Production calculation engine behind the NTPC BESS Lot-1 &amp; Lot-2 investment appraisal. Cost build-up, IDC,
          means of finance and WACC are recomputed from first principles and validated to the paisa against the published
          report; the CERC annual model derives tariff, DSCR and IRR. Adjust any assumption in <b>What-If</b> to re-run instantly.
        </p>
      </section>

      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="project">Project Detail</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="whatif">What-If</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio"><PortfolioTab /></TabsContent>
        <TabsContent value="project"><ProjectTab /></TabsContent>
        <TabsContent value="validation"><ValidationTab /></TabsContent>
        <TabsContent value="whatif"><WhatIfTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ PORTFOLIO ============================ */
function PortfolioTab() {
  const comps = useMemo(() => PROJECTS.map((p) => computeProject(p)), []);
  const totals = useMemo(() => {
    const mwh = PROJECTS.reduce((s, p) => s + p.bessMWh, 0);
    const cost = comps.reduce((s, c) => s + c.cost.totalProjectCost, 0);
    const debt = comps.reduce((s, c) => s + c.finance.debt, 0);
    const equity = comps.reduce((s, c) => s + c.finance.equity, 0);
    const vgf = comps.reduce((s, c) => s + c.finance.vgfTotal, 0);
    const avgIRR = PROJECTS.reduce((s, p) => s + p.published.projectIRR, 0) / PROJECTS.length;
    return { mwh, cost, debt, equity, vgf, avgIRR };
  }, [comps]);

  const chartData = comps.map((c) => ({ name: c.project.name, cost: c.cost.totalProjectCost, irr: c.project.published.projectIRR, lot: c.project.lot }));

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Battery className="h-4 w-4" />} label="Appraised Capacity" value={inr(totals.mwh, 0)} unit="MWh" tone="primary" />
        <Kpi icon={<IndianRupee className="h-4 w-4" />} label="Total Project Cost" value={`₹${inr(totals.cost, 0)}`} unit="Cr" tone="primary" />
        <Kpi icon={<Landmark className="h-4 w-4" />} label="Debt (after VGF)" value={`₹${inr(totals.debt, 0)}`} unit="Cr" tone="amber" />
        <Kpi icon={<PiggyBank className="h-4 w-4" />} label="Equity (after VGF)" value={`₹${inr(totals.equity, 0)}`} unit="Cr" tone="green" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="VGF (18 L/MWh)" value={`₹${inr(totals.vgf, 0)}`} unit="Cr" tone="green" />
        <Kpi icon={<Percent className="h-4 w-4" />} label="Avg Project IRR" value={inr(totals.avgIRR, 2)} unit="%" tone="primary" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Total Project Cost by Project (₹Cr)</h2>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} angle={-40} textAnchor="end" interval={0} height={60} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`₹${inr(v, 2)} Cr`, "Cost"]} />
                <Bar dataKey="cost" radius={[3, 3, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.lot === "Lot-1" ? "var(--primary)" : "var(--status-amber)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} /> Lot-1</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--status-amber)" }} /> Lot-2</span>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Project IRR vs WACC (8.52%)</h2>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} angle={-40} textAnchor="end" interval={0} height={60} />
                <YAxis domain={[8, 13]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} unit="%" />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${inr(v, 2)}%`, "IRR"]} />
                <Line type="monotone" dataKey="irr" name="Project IRR" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line dataKey={() => 8.52} name="WACC" stroke="var(--status-red)" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section>
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold tracking-tight">Station-wise Financial Summary</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">MWh</TableHead>
                  <TableHead className="text-right">Total Cost (₹Cr)</TableHead>
                  <TableHead className="text-right">₹Cr/MWh</TableHead>
                  <TableHead className="text-right">VGF</TableHead>
                  <TableHead className="text-right">Debt</TableHead>
                  <TableHead className="text-right">Equity</TableHead>
                  <TableHead className="text-right">Proj IRR</TableHead>
                  <TableHead className="text-right">Eq IRR</TableHead>
                  <TableHead className="text-right">DSCR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comps.map((c) => (
                  <TableRow key={c.project.id}>
                    <TableCell className="font-medium">{c.project.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{c.project.lot}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{c.project.bessMWh}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.cost.totalProjectCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.cost.costPerMWh)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.finance.vgfTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.finance.debt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.finance.equity)}</TableCell>
                    <TableCell className="text-right tabular-nums" style={{ color: "var(--status-green)" }}>{inr(c.project.published.projectIRR)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.project.published.equityIRR)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(c.project.published.averageDSCR)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <ReconCard lot="Lot-1" comps={comps.filter((c) => c.project.lot === "Lot-1")} pub={PORTFOLIO_PUBLISHED.lot1} />
        <ReconCard lot="Lot-2" comps={comps.filter((c) => c.project.lot === "Lot-2")} pub={PORTFOLIO_PUBLISHED.lot2} />
      </section>
    </div>
  );
}

function ReconCard({ lot, comps, pub }: { lot: string; comps: ProjectComputation[]; pub: { mwh: number; totalCost: number; debt: number; equity: number } }) {
  const cost = comps.reduce((s, c) => s + c.cost.totalProjectCost, 0);
  const debt = comps.reduce((s, c) => s + c.finance.debt, 0);
  const equity = comps.reduce((s, c) => s + c.finance.equity, 0);
  const rows = [
    { k: "Total Cost", c: cost, p: pub.totalCost },
    { k: "Debt", c: debt, p: pub.debt },
    { k: "Equity", c: equity, p: pub.equity },
  ];
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary" /> {lot} Roll-up Reconciliation</div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const diff = r2(r.c - r.p);
          const ok = Math.abs(diff) <= Math.max(1, r.p * 0.01);
          return (
            <div key={r.k} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{r.k}</span>
              <span className="flex items-center gap-3 tabular-nums">
                <span>Model ₹{inr(r.c, 0)}</span>
                <span className="text-muted-foreground">Report ₹{inr(r.p, 0)}</span>
                {ok ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--status-green)" }} /> : <span style={{ color: "var(--status-amber)" }}>Δ{inr(diff, 0)}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ============================ PROJECT DETAIL ============================ */
function ProjectTab() {
  const [id, setId] = useState(PROJECTS[0].id);
  const project = PROJECTS.find((p) => p.id === id)!;
  const comp = useMemo(() => computeProject(project), [project]);
  const p = project.published;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={id} onValueChange={setId}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROJECTS.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name} — {pr.lot}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">{project.hostStation} · {project.bessMW} MW / {project.bessMWh} MWh · {project.cyclesPerDay} cycle/day · POI {project.poiVoltage}</div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><IndianRupee className="h-4 w-4 text-primary" /> Project Cost Build-up</h3>
          <DefRows rows={[
            ["Equipment capex (excl CAMC)", `₹${inr(comp.cost.equipmentCapex)} Cr`],
            [`Contingency (1%)`, `₹${inr(comp.cost.contingency)} Cr`],
            [`PMC (0.5%)`, `₹${inr(comp.cost.pmc)} Cr`],
            [`Pre-comm (0.25%)`, `₹${inr(comp.cost.preComms)} Cr`],
            ["Project cost excl IDC", `₹${inr(comp.cost.projectCostExclIDC)} Cr`],
            ["IDC + Financing charges", `₹${inr(comp.cost.idcFc)} Cr`],
          ]} />
          <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold">
            <span>Total Project Cost</span><span className="tabular-nums text-primary">₹{inr(comp.cost.totalProjectCost)} Cr</span>
          </div>
          <div className="mt-1 text-right text-[11px] text-muted-foreground">₹{inr(comp.cost.costPerMWh)} Cr / MWh</div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 text-primary" /> Means of Finance</h3>
          <DefRows rows={[
            ["VGF total (18 L/MWh)", `₹${inr(comp.finance.vgfTotal)} Cr`],
            ["VGF during construction (20%)", `₹${inr(comp.finance.vgfDuringConstruction)} Cr`],
            ["Funded amount (net of VGF)", `₹${inr(comp.finance.fundedAmount)} Cr`],
            ["Debt (70%)", `₹${inr(comp.finance.debt)} Cr`],
            ["Equity (30%)", `₹${inr(comp.finance.equity)} Cr`],
            ["Post-tax cost of debt", `${inr(comp.finance.postTaxCostOfDebt)}%`],
          ]} />
          <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold">
            <span>WACC</span><span className="tabular-nums text-primary">{inr(comp.finance.wacc)}%</span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Key Outcomes (appraisal)</h3>
          <DefRows rows={[
            ["Project IRR", `${inr(p.projectIRR)}%`],
            ["Equity IRR", `${inr(p.equityIRR)}%`],
            ["WACC", `${inr(p.wacc)}%`],
            ["Average DSCR", inr(p.averageDSCR)],
            ["Viability (IRR > WACC)", p.projectIRR > p.wacc ? "YES ✓" : "NO"],
          ]} />
          <div className="mt-2 rounded-md border border-border/60 p-2 text-[11px]">
            <div className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Standalone Tariff (paise/kWh)</div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <TariffChip label="FC" value={p.tariffFC} />
              <TariffChip label="VC" value={p.tariffVC} />
              <TariffChip label="Total" value={p.tariffTotal} strong />
            </div>
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">CERC Annual Model — Fixed &amp; Variable Cost, DSCR</span>
          <span className="text-[11px] text-muted-foreground">Model DSCR avg {inr(comp.annual.averageDSCR)} · min {inr(comp.annual.minDSCR)} · Levellised tariff {inr(comp.annual.levellisedTariffPaise, 0)} p/kWh</span>
        </div>
        <div className="max-h-[380px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>FY</TableHead>
                <TableHead className="text-right">Discharge MWh</TableHead>
                <TableHead className="text-right">RoE</TableHead>
                <TableHead className="text-right">Depr</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">O&amp;M</TableHead>
                <TableHead className="text-right">Int WC</TableHead>
                <TableHead className="text-right">Fixed Cost</TableHead>
                <TableHead className="text-right">Energy Cost</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">PAT</TableHead>
                <TableHead className="text-right">DSCR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comp.annual.rows.map((r) => (
                <TableRow key={r.fy}>
                  <TableCell className="font-medium">{r.fy}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.dischargeMWh, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.roeAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.depreciation)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.interestOnLoan)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.om)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.interestOnWC)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{inr(r.fixedCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.costOfEnergy)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.totalRevenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.pat)}</TableCell>
                  <TableCell className="text-right tabular-nums" style={{ color: r.dscr >= 1.2 ? "var(--status-green)" : "var(--status-amber)" }}>{inr(r.dscr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function TariffChip({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-md border border-border/60 px-1 py-1 ${strong ? "bg-primary/10" : ""}`}>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${strong ? "font-bold text-primary" : "font-medium"}`}>{value}</div>
    </div>
  );
}

/* ============================ VALIDATION ============================ */
function ValidationTab() {
  const [id, setId] = useState(PROJECTS[0].id);
  const project = PROJECTS.find((p) => p.id === id)!;
  const comp = useMemo(() => computeProject(project), [project]);

  const portfolioPass = useMemo(() => {
    let pass = 0, total = 0, detPass = 0, detTotal = 0;
    for (const p of PROJECTS) {
      for (const v of computeProject(p).validation) {
        total++; if (v.pass) pass++;
        if (v.tier === "deterministic") { detTotal++; if (v.pass) detPass++; }
      }
    }
    return { pass, total, detPass, detTotal };
  }, []);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Deterministic checks" value={`${portfolioPass.detPass}/${portfolioPass.detTotal}`} unit="PASS" tone="green" />
        <Kpi icon={<Gauge className="h-4 w-4" />} label="Deterministic accuracy" value={`${Math.round((portfolioPass.detPass / portfolioPass.detTotal) * 100)}`} unit="%" tone="green" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="All checks" value={`${portfolioPass.pass}/${portfolioPass.total}`} unit="PASS" tone="primary" />
        <Kpi icon={<Battery className="h-4 w-4" />} label="Projects covered" value={`${PROJECTS.length}`} unit="stations" tone="primary" />
      </section>

      <div className="flex items-center gap-3">
        <Select value={id} onValueChange={setId}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>{PROJECTS.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name} — {pr.lot}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Deterministic metrics reconcile to the report to the paisa. Model metrics (IRR/DSCR) are engine estimates from §C2 assumptions — variance is shown transparently.</p>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Model</TableHead>
              <TableHead className="text-right">Appraisal</TableHead>
              <TableHead className="text-right">Diff</TableHead>
              <TableHead className="text-right">Diff %</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comp.validation.map((v) => (
              <TableRow key={v.metric}>
                <TableCell className="font-medium">{v.metric}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{v.tier}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{inr(v.computed)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(v.published)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(v.diff)}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(v.diffPct)}%</TableCell>
                <TableCell className="text-center">
                  {v.pass
                    ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--status-green)" }}><CheckCircle2 className="h-3.5 w-3.5" /> PASS</span>
                    : <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--status-amber)" }}><XCircle className="h-3.5 w-3.5" /> REVIEW</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================ WHAT-IF ============================ */
function WhatIfTab() {
  const [id, setId] = useState(PROJECTS[0].id);
  const project = PROJECTS.find((p) => p.id === id)!;

  const base = useMemo(() => computeProject(project), [project]);
  const [levers, setLevers] = useState({ capex: 100, debt: 70, roi: 8.25, roe: 14, ecr: 100, tax: 25.17 });

  const scenario = useMemo(() => {
    const a: EngineAssumptions = {
      ...defaultAssumptions(),
      capexMultiplier: levers.capex / 100,
      debtPct: levers.debt / 100,
      roi: levers.roi / 100,
      roe: levers.roe / 100,
      ecrMultiplier: levers.ecr / 100,
      corporateTax: levers.tax / 100,
    };
    return computeProject(project, a);
  }, [project, levers]);

  const reset = () => setLevers({ capex: 100, debt: 70, roi: 8.25, roe: 14, ecr: 100, tax: 25.17 });

  const compareRows: [string, number, number, string][] = [
    ["Total Project Cost", base.cost.totalProjectCost, scenario.cost.totalProjectCost, "₹Cr"],
    ["Debt", base.finance.debt, scenario.finance.debt, "₹Cr"],
    ["Equity", base.finance.equity, scenario.finance.equity, "₹Cr"],
    ["WACC", base.finance.wacc, scenario.finance.wacc, "%"],
    ["Project IRR (model)", base.annual.projectIRR, scenario.annual.projectIRR, "%"],
    ["Equity IRR (model)", base.annual.equityIRR, scenario.annual.equityIRR, "%"],
    ["Average DSCR (model)", base.annual.averageDSCR, scenario.annual.averageDSCR, ""],
    ["Levellised tariff", base.annual.levellisedTariffPaise, scenario.annual.levellisedTariffPaise, "p/kWh"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={id} onValueChange={setId}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>{PROJECTS.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name} — {pr.lot}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Reset to base case</Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-primary" /> Assumption Levers</h3>
          <Lever label="Battery / equipment cost" value={levers.capex} min={60} max={160} step={1} unit="%" onChange={(v) => setLevers((s) => ({ ...s, capex: v }))} />
          <Lever label="Charging cost (host ECR)" value={levers.ecr} min={60} max={160} step={1} unit="%" onChange={(v) => setLevers((s) => ({ ...s, ecr: v }))} />
          <Lever label="Debt ratio" value={levers.debt} min={40} max={80} step={1} unit="%" onChange={(v) => setLevers((s) => ({ ...s, debt: v }))} />
          <Lever label="Interest rate (RoI)" value={levers.roi} min={6} max={12} step={0.05} unit="%" onChange={(v) => setLevers((s) => ({ ...s, roi: v }))} />
          <Lever label="Return on Equity (RoE)" value={levers.roe} min={10} max={18} step={0.1} unit="%" onChange={(v) => setLevers((s) => ({ ...s, roe: v }))} />
          <Lever label="Corporate tax" value={levers.tax} min={15} max={35} step={0.1} unit="%" onChange={(v) => setLevers((s) => ({ ...s, tax: v }))} />
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary" /> Base vs Scenario</h3>
          <div className="space-y-1.5">
            {compareRows.map(([k, b, s, u]) => {
              const delta = r2(s - b);
              const up = delta > 0.005, down = delta < -0.005;
              return (
                <div key={k} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-muted-foreground">{inr(b)}{u && ` ${u}`}</span>
                    <span className="font-semibold">{inr(s)}{u && ` ${u}`}</span>
                    <span className="w-14 text-right" style={{ color: up ? "var(--status-red)" : down ? "var(--status-green)" : "var(--muted-foreground)" }}>
                      {delta === 0 ? "—" : `${up ? "+" : ""}${inr(delta)}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Cost, finance and WACC recompute deterministically. IRR/DSCR/tariff use the CERC annual model — treat as directional
            estimates calibrated to §C2 assumptions.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Lever({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold tabular-nums">{value}{unit}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

/* ============================ SHARED ============================ */
function DefRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{k}</span>
          <span className="tabular-nums font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, unit, tone }: { icon: React.ReactNode; label: string; value: string; unit?: string; tone: "primary" | "green" | "amber" | "red" }) {
  const colorVar = tone === "primary" ? "var(--primary)" : `var(--status-${tone})`;
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: colorVar }} />
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span style={{ color: colorVar }}>{icon}</span>{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: colorVar }}>{value}</span>
        {unit && <span className="truncate text-xs text-muted-foreground">{unit}</span>}
      </div>
    </Card>
  );
}

const r2 = (x: number) => Math.round(x * 100) / 100;
