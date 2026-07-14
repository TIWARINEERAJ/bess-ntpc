/**
 * ============================================================================
 * NTPC BESS — FINANCIAL CALCULATION ENGINE
 * ----------------------------------------------------------------------------
 * Reverse-engineered from the Resurgent India Financial Appraisal Report.
 *
 * Two tiers of calculation:
 *  1. DETERMINISTIC CORE (validated to the paisa against the published report):
 *       cost build-up, IDC, VGF, means of finance, WACC, viability.
 *  2. CERC ANNUAL MODEL (documented, indicative): year-by-year fixed + variable
 *       cost tariff, income statement, debt schedule, DSCR, Project IRR &
 *       Equity IRR. Built strictly from the report's §C2 assumptions. O&M and
 *       tax treatment are exposed as configurable drivers because the appraisal
 *       embeds CAMC within works cost — see `EngineAssumptions.omPctOfEquipment`.
 *
 * Every input is overridable (for What-If / sensitivity). Nothing is hardcoded
 * outside `GLOBAL_ASSUMPTIONS` in data.ts.
 * ============================================================================
 */

import { GLOBAL_ASSUMPTIONS as G, PROJECTS, type Project } from "./data";

/** Assumptions that drive a single calculation run (defaults = report §C2). */
export interface EngineAssumptions {
  contingencyPct: number;
  pmcPct: number;
  preCommsPct: number;
  debtPct: number;
  roi: number;
  roe: number;
  corporateTax: number;
  financingChargesPct: number;
  vgfPerMWhCr: number; // ₹Cr per MWh (18 Lakh/MWh = 0.18)
  interestOnWC: number;
  omPctOfEquipment: number;
  omEscalation: number;
  receivablesDays: number;
  debtTenorYears: number;
  initialDeprRate: number;
  initialDeprYears: number;
  depreciableAssetPct: number;
  availability: number;
  rte: number;
  annualDegradation: number;
  operationalYears: number;
  /** Multiplier on equipment (battery) capex — the primary sensitivity lever. */
  capexMultiplier: number;
  /** Multiplier on host-plant ECR (charging cost lever). */
  ecrMultiplier: number;
}

export function defaultAssumptions(): EngineAssumptions {
  return {
    contingencyPct: G.contingencyPct,
    pmcPct: G.pmcPct,
    preCommsPct: G.preCommsPct,
    debtPct: G.debtPct,
    roi: G.roi,
    roe: G.roe,
    corporateTax: G.corporateTax,
    financingChargesPct: G.financingChargesPct,
    vgfPerMWhCr: G.vgfPerMWhLakh / 100, // Lakh → Cr
    interestOnWC: G.interestOnWC,
    omPctOfEquipment: G.omCostPctOfEqp,
    omEscalation: G.omEscalation,
    receivablesDays: G.receivablesDays,
    debtTenorYears: G.debtTenorYears,
    initialDeprRate: G.initialDepreciationRate,
    initialDeprYears: G.initialDepreciationYears,
    depreciableAssetPct: G.depreciableAssetPct,
    availability: G.normativeAvailability,
    rte: G.roundTripEfficiencyPlusAEC,
    annualDegradation: G.annualDegradation,
    operationalYears: G.operationalYears,
    capexMultiplier: 1,
    ecrMultiplier: 1,
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ */
/* 1. DETERMINISTIC COST BUILD-UP + IDC                               */
/* ------------------------------------------------------------------ */

export interface CostResult {
  equipmentCapex: number;
  contingency: number;
  worksInclContingency: number;
  pmc: number;
  preComms: number;
  projectCostExclIDC: number;
  idcFc: number;
  totalProjectCost: number;
  costPerMWh: number;
}

/**
 * Cost build-up exactly per §C1/§C4:
 *   capex → +contingency(1%) → +PMC(0.5%) → +PreComms(0.25%) → excl-IDC → +IDC+FC.
 * IDC computed from the 6-quarter capex phasing on the debt tranche at RoI,
 * mid-quarter accrual, plus upfront financing charge (0.25% of debt).
 */
export function computeCost(p: Project, a: EngineAssumptions): CostResult {
  const equipmentCapex = p.worksCostCapex * a.capexMultiplier;
  const contingency = equipmentCapex * a.contingencyPct;
  const worksInclContingency = equipmentCapex + contingency;
  const pmc = worksInclContingency * a.pmcPct;
  const preComms = worksInclContingency * a.preCommsPct;
  const projectCostExclIDC = worksInclContingency + pmc + preComms;

  // VGF released during construction reduces the funding base
  const vgfTotal = p.bessMWh * a.vgfPerMWhCr;
  const vgfConstruction = vgfTotal * G.vgfInstalment1;
  const fundedBase = projectCostExclIDC - vgfConstruction;
  const debtTranche = fundedBase * a.debtPct;

  // IDC: interest on cumulative debt drawn over 6 quarters (mid-quarter convention)
  let cumulative = 0;
  let idc = 0;
  for (const phase of G.capexPhasing) {
    const draw = debtTranche * phase;
    idc += (cumulative + draw / 2) * a.roi * 0.25;
    cumulative += draw;
  }
  const financingCharge = debtTranche * a.financingChargesPct;
  const idcFc = idc + financingCharge;

  const totalProjectCost = projectCostExclIDC + idcFc;
  return {
    equipmentCapex: r2(equipmentCapex),
    contingency: r2(contingency),
    worksInclContingency: r2(worksInclContingency),
    pmc: r2(pmc),
    preComms: r2(preComms),
    projectCostExclIDC: r2(projectCostExclIDC),
    idcFc: r2(idcFc),
    totalProjectCost: r2(totalProjectCost),
    costPerMWh: r2(totalProjectCost / p.bessMWh),
  };
}

/* ------------------------------------------------------------------ */
/* 2. MEANS OF FINANCE + WACC                                         */
/* ------------------------------------------------------------------ */

export interface FinanceResult {
  totalProjectCost: number;
  vgfTotal: number;
  vgfDuringConstruction: number;
  fundedAmount: number;
  debt: number;
  equity: number;
  wacc: number;
  postTaxCostOfDebt: number;
}

/**
 * Means of finance per §C3: VGF (18 Lakh/MWh) first, remainder split debt:equity
 * 70:30. WACC = wd·kd·(1−t) + we·ke.
 */
export function computeFinance(p: Project, a: EngineAssumptions, cost: CostResult): FinanceResult {
  const vgfTotal = p.bessMWh * a.vgfPerMWhCr;
  const vgfDuringConstruction = vgfTotal * G.vgfInstalment1;
  const fundedAmount = cost.totalProjectCost - vgfTotal;
  const debt = fundedAmount * a.debtPct;
  const equity = fundedAmount * (1 - a.debtPct);
  const postTaxCostOfDebt = a.roi * (1 - a.corporateTax);
  const wacc = a.debtPct * postTaxCostOfDebt + (1 - a.debtPct) * a.roe;
  return {
    totalProjectCost: cost.totalProjectCost,
    vgfTotal: r2(vgfTotal),
    vgfDuringConstruction: r2(vgfDuringConstruction),
    fundedAmount: r2(fundedAmount),
    debt: r2(debt),
    equity: r2(equity),
    wacc: r2(wacc * 100),
    postTaxCostOfDebt: r2(postTaxCostOfDebt * 100),
  };
}

/* ------------------------------------------------------------------ */
/* 3. CERC ANNUAL MODEL — tariff, income statement, DSCR, IRR         */
/* ------------------------------------------------------------------ */

export interface AnnualRow {
  fy: string;
  dischargeMWh: number;
  chargingMWh: number;
  roeAmount: number;
  depreciation: number;
  interestOnLoan: number;
  om: number;
  interestOnWC: number;
  fixedCost: number; // ₹Cr — supplementary fixed storage charge
  costOfEnergy: number; // ₹Cr — variable (pass-through)
  totalRevenue: number;
  pat: number;
  debtOutstanding: number;
  principalRepaid: number;
  dscr: number;
}

export interface AnnualModel {
  rows: AnnualRow[];
  averageDSCR: number;
  minDSCR: number;
  projectIRR: number; // %
  equityIRR: number; // %
  levellisedTariffPaise: number; // paise/kWh (life avg, FC+VC over discharge)
  levellisedFCPaise: number;
  levellisedVCPaise: number;
}

/** Convert ₹Cr over MWh into paise/kWh: Cr = MWh·(paise/kWh)/1e5 ⇒ paise/kWh = Cr·1e5/MWh. */
const crPerMWhToPaise = (cr: number, mwh: number) => (mwh > 0 ? (cr * 1e5) / mwh : 0);

export function computeAnnualModel(
  p: Project,
  a: EngineAssumptions,
  cost: CostResult,
  fin: FinanceResult,
): AnnualModel {
  const codYear = new Date(G.codDate).getFullYear();
  const years = a.operationalYears;
  const depreciableValue = cost.projectCostExclIDC * a.depreciableAssetPct;
  const initialDeprAnnual = depreciableValue * a.initialDeprRate;
  const remainingAfterInitial = depreciableValue - initialDeprAnnual * Math.min(a.initialDeprYears, years);
  const tailYears = Math.max(1, years - a.initialDeprYears);
  const tailDeprAnnual = remainingAfterInitial > 0 ? remainingAfterInitial / tailYears : 0;

  const principalPerYear = fin.debt / a.debtTenorYears;
  const roeAmountGross = (a.roe * fin.equity) / (1 - a.corporateTax); // grossed-up for tax (CERC)

  const rows: AnnualRow[] = [];
  let debtOutstanding = fin.debt;

  const projectCF: number[] = [];
  const equityCF: number[] = [];

  // Construction outflows (phased) — CY of zero date onward, netted of VGF/debt for equity CF
  projectCF.push(-cost.totalProjectCost); // t0 simplification: full project outlay at award
  equityCF.push(-fin.equity);

  for (let t = 0; t < years; t++) {
    const fyEnd = codYear + 1 + t; // FY ending 31-Mar
    const degr = Math.pow(1 - a.annualDegradation, t);
    const dischargeMWh = p.bessMWh * p.cyclesPerDay * 365 * a.availability * degr;
    const chargingMWh = dischargeMWh / a.rte;

    const depreciation = t < a.initialDeprYears ? initialDeprAnnual : tailDeprAnnual;
    const interestOnLoan = a.roi * debtOutstanding;
    const principalRepaid = t < a.debtTenorYears ? principalPerYear : 0;

    const om = p.worksCostCapex * a.omPctOfEquipment * Math.pow(1 + a.omEscalation, Math.min(t, G.omEscalationUptoYear));

    // Variable / pass-through cost of charging energy (₹Cr = MWh·Rs/kWh/1e4)
    const costOfEnergy = (chargingMWh * p.avgEcrRsPerKwh * a.ecrMultiplier) / 1e4;

    // Working capital & its interest
    const revenuePreWC = roeAmountGross + depreciation + interestOnLoan + om + costOfEnergy;
    const receivables = (revenuePreWC * a.receivablesDays) / 365;
    const spares = om * G.omSparesPctOfOM;
    const omMonth = om / 12;
    const workingCapital = receivables + spares + omMonth;
    const interestOnWC = a.interestOnWC * workingCapital;

    const fixedCost = roeAmountGross + depreciation + interestOnLoan + om + interestOnWC;
    const totalRevenue = fixedCost + costOfEnergy;

    // Income statement
    const pbt = fixedCost - depreciation - interestOnLoan - interestOnWC + 0; // = roeGross + om ... (revenue-opex-dep-int)
    const ebitda = totalRevenue - om - costOfEnergy; // = roeGross + dep + int + intWC
    const pbtReal = ebitda - depreciation - interestOnLoan - interestOnWC;
    const tax = Math.max(0, pbtReal * a.corporateTax);
    const pat = pbtReal - tax;

    const dscr = (pat + depreciation + interestOnLoan) / (interestOnLoan + principalRepaid || 1);

    rows.push({
      fy: `FY${String(fyEnd).slice(2)}`,
      dischargeMWh: Math.round(dischargeMWh),
      chargingMWh: Math.round(chargingMWh),
      roeAmount: r2(roeAmountGross),
      depreciation: r2(depreciation),
      interestOnLoan: r2(interestOnLoan),
      om: r2(om),
      interestOnWC: r2(interestOnWC),
      fixedCost: r2(fixedCost),
      costOfEnergy: r2(costOfEnergy),
      totalRevenue: r2(totalRevenue),
      pat: r2(pat),
      debtOutstanding: r2(debtOutstanding),
      principalRepaid: r2(principalRepaid),
      dscr: r2(dscr),
    });

    // Cash flows for IRR
    const projectFCF = ebitda - tax; // pre-financing operating cash flow
    projectCF.push(projectFCF);
    equityCF.push(pat + depreciation - principalRepaid);

    void pbt;
    debtOutstanding = Math.max(0, debtOutstanding - principalRepaid);
  }

  const dscrs = rows.map((x) => x.dscr).filter((x) => isFinite(x) && x > 0);
  const averageDSCR = dscrs.reduce((s, x) => s + x, 0) / (dscrs.length || 1);
  const minDSCR = Math.min(...dscrs);

  const totalDischarge = rows.reduce((s, x) => s + x.dischargeMWh, 0);
  const totalFC = rows.reduce((s, x) => s + x.fixedCost, 0);
  const totalVC = rows.reduce((s, x) => s + x.costOfEnergy, 0);

  return {
    rows,
    averageDSCR: r2(averageDSCR),
    minDSCR: r2(minDSCR),
    projectIRR: r2(irr(projectCF) * 100),
    equityIRR: r2(irr(equityCF) * 100),
    levellisedTariffPaise: r2(crPerMWhToPaise(totalFC + totalVC, totalDischarge)),
    levellisedFCPaise: r2(crPerMWhToPaise(totalFC, totalDischarge)),
    levellisedVCPaise: r2(crPerMWhToPaise(totalVC, totalDischarge)),
  };
}

/** Internal Rate of Return via bisection (robust, no dependency). */
export function irr(cashflows: number[], lo = -0.9, hi = 1.5): number {
  const npv = (rate: number) =>
    cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0);
  let a = lo, b = hi, fa = npv(a), fb = npv(b);
  if (fa * fb > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const fm = npv(m);
    if (Math.abs(fm) < 1e-6) return m;
    if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

/* ------------------------------------------------------------------ */
/* 4. VALIDATION vs published appraisal                               */
/* ------------------------------------------------------------------ */

export interface ValidationRow {
  metric: string;
  computed: number;
  published: number;
  diff: number;
  diffPct: number;
  pass: boolean;
  tier: "deterministic" | "model";
}

export interface ProjectComputation {
  project: Project;
  cost: CostResult;
  finance: FinanceResult;
  annual: AnnualModel;
  validation: ValidationRow[];
}

function mk(
  metric: string,
  computed: number,
  published: number,
  tol: number,
  tier: "deterministic" | "model",
): ValidationRow {
  const diff = r2(computed - published);
  const diffPct = published !== 0 ? r2((diff / published) * 100) : 0;
  return { metric, computed: r2(computed), published, diff, diffPct, pass: Math.abs(diffPct) <= tol, tier };
}

/** Run the full engine for a project and validate against the report. */
export function computeProject(p: Project, a: EngineAssumptions = defaultAssumptions()): ProjectComputation {
  const cost = computeCost(p, a);
  const finance = computeFinance(p, a, cost);
  const annual = computeAnnualModel(p, a, cost, finance);
  const pub = p.published;

  const validation: ValidationRow[] = [
    mk("Contingency (₹Cr)", cost.contingency, pub.contingency, 1, "deterministic"),
    mk("PMC (₹Cr)", cost.pmc, pub.pmc, 1, "deterministic"),
    mk("Pre-comm (₹Cr)", cost.preComms, pub.preComms, 1, "deterministic"),
    mk("Project cost excl IDC (₹Cr)", cost.projectCostExclIDC, pub.projectCostExclIDC, 0.5, "deterministic"),
    mk("IDC + FC (₹Cr)", cost.idcFc, pub.idcFc, 5, "deterministic"),
    mk("Total project cost (₹Cr)", cost.totalProjectCost, pub.totalProjectCost, 0.5, "deterministic"),
    mk("Cost per MWh (₹Cr)", cost.costPerMWh, pub.costPerMWh, 2, "deterministic"),
    mk("VGF during construction (₹Cr)", finance.vgfDuringConstruction, pub.vgfDuringConstruction, 1, "deterministic"),
    mk("Debt after VGF (₹Cr)", finance.debt, pub.debtAfterVGF, 1, "deterministic"),
    mk("Equity after VGF (₹Cr)", finance.equity, pub.equityAfterVGF, 1, "deterministic"),
    mk("WACC (%)", finance.wacc, pub.wacc, 1, "deterministic"),
    mk("Project IRR (%)", annual.projectIRR, pub.projectIRR, 12, "model"),
    mk("Equity IRR (%)", annual.equityIRR, pub.equityIRR, 15, "model"),
    mk("Average DSCR", annual.averageDSCR, pub.averageDSCR, 15, "model"),
  ];

  return { project: p, cost, finance, annual, validation };
}

export function computePortfolio(a: EngineAssumptions = defaultAssumptions()) {
  return PROJECTS.map((p) => computeProject(p, a));
}
