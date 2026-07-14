/**
 * ============================================================================
 * NTPC BESS Lot-1 & Lot-2 (4.70 GWh) — MASTER DATA
 * ----------------------------------------------------------------------------
 * Source of truth: "Battery Energy Storage System (BESS) Lot-1 & Lot-2
 * Financial Appraisal Report", prepared by Resurgent India Ltd, 24-Mar-2026
 * (NTPC Board Agenda 565.2.5). Every figure below is transcribed verbatim
 * from that report. NOTHING here is fabricated — where the report does not
 * state a value it is left configurable in `GLOBAL_ASSUMPTIONS` and flagged.
 *
 * Units: money in ₹ Crore unless noted; capacity in MW / MWh; price levels at
 * Qtr-IV FY2025-26. Zero date 1-Apr-2026, COD 1-Oct-2027 (18 months).
 * ============================================================================
 */

export type Lot = "Lot-1" | "Lot-2";

/** Global financial-model assumptions — verbatim from report §C2 "Key Assumptions". */
export const GLOBAL_ASSUMPTIONS = {
  zeroDate: "2026-04-01",
  constructionMonths: 18,
  constructionEndDate: "2027-09-30",
  codDate: "2027-10-01",
  operationalYears: 15,

  plfOfPlant: 0.85, // %
  roe: 0.14, // Return on Equity, % p.a. (post-tax)
  interestOnWC: 0.1225, // Interest on Working Capital, % p.a.
  omCostPctOfEqp: 0.02, // O&M cost as % of equipment cost
  omEscalation: 0.0525, // Annual escalation in O&M cost
  omEscalationUptoYear: 3,

  mat: 0.0, // Minimum Alternate Tax
  corporateTax: 0.2517, // Corporate tax rate

  // Working capital norms
  receivablesDays: 45,
  omSparesPctOfOM: 0.10, // O&M spares as % of O&M cost
  omExpensesMonths: 1, // months of O&M in WC

  vgfPerMWhLakh: 18.0, // VGF ₹ Lakh / MWh  (= 0.18 ₹Cr/MWh)

  // Soft-cost loadings on works cost (excl CAMC)
  contingencyPct: 0.01, // 1.00%
  pmcPct: 0.005, // 0.50%
  preCommsPct: 0.0025, // 0.25%

  // Capital structure (of project cost net of VGF)
  debtPct: 0.70,
  equityPct: 0.30,
  roi: 0.0825, // Rate of Interest on term loan, % p.a.
  financingChargesPct: 0.0025, // 0.25% of debt (upfront)

  // VGF disbursement schedule
  vgfInstalment1: 0.20, // Yr-1 of construction
  vgfInstalment2: 0.50, // after COD
  vgfInstalment3: 0.30, // 1 yr after COD

  // Depreciation
  depreciableAssetPct: 0.90, // 90% of asset value is depreciable
  taxDepreciationRate: 0.15, // 15% (WDV) for tax
  initialDepreciationRate: 0.0633, // 6.33% p.a. book depreciation (accelerated slab)
  initialDepreciationYears: 12,
  initialDepreciationEndDate: "2040-03-31",

  // Debt terms (books / P&L)
  debtTenorYears: 11,
  principalRepaymentsPerYear: 2,

  // Capex phasing across the 18-month (6-quarter) construction window
  capexPhasing: [0.10, 0.10, 0.20, 0.25, 0.20, 0.15], // Q1..Q6, sums to 100%

  annualEscalationCompletedCost: 0.04, // 4.00%

  // Performance
  roundTripEfficiencyPlusAEC: 0.80, // RTE 85% & AEC 5% => 80% effective
  normativeAvailability: 0.90,
  annualDegradation: 0.02,
  bessOperationPeriodYears: 15,

  // CERC excess-discharge incentive & gain-sharing (§ Sale of Power)
  excessDischargeIncentivePaisePerKwh: 10, // 10 paise/kWh
  gainSharingRatio: "1:1",
} as const;

/** Per-project INPUTS (transcribed from §"Project Key Parameters" & §C1). */
export interface ProjectInput {
  id: string;
  name: string;
  lot: Lot;
  hostStation: string;
  noOfUnits: number;
  capacityPerUnitMW: number;
  apc: number; // Auxiliary Power Consumption of host plant, %
  worksCostInclCAMC: number; // ₹Cr
  camcCost: number; // ₹Cr
  worksCostCapex: number; // ₹Cr (Works Cost minus CAMC — the BESS equipment capex)
  avgEcrRsPerKwh: number; // Average Energy Charge Rate of host plant (FY24-25)
  bessMW: number;
  bessMWh: number;
  cyclesPerDay: number;
  operationYears: number;
  omYears: number;
  annualDegradation: number;
  bessToPlantMWPct: number;
  poiVoltage: string;
}

/** Per-project PUBLISHED OUTCOMES (transcribed from §C1/§C3/§C4/tariff — used to VALIDATE the engine). */
export interface ProjectPublished {
  contingency: number;
  pmc: number;
  preComms: number;
  projectCostExclIDC: number;
  idcFc: number;
  totalProjectCost: number;
  costPerMWh: number;
  vgfDuringConstruction: number;
  debtAfterVGF: number;
  equityAfterVGF: number;
  projectIRR: number; // %
  equityIRR: number; // %
  wacc: number; // %
  averageDSCR: number;
  // Standalone tariff (paise/kWh)
  tariffFC: number;
  projectECR: number;
  bessAddlVC: number;
  tariffVC: number;
  tariffTotal: number;
  // Additional-capitalisation mode (paise/kWh)
  addcapFC: number;
  addcapVC: number;
  addcapTotal: number;
}

export interface Project extends ProjectInput {
  published: ProjectPublished;
}

/** ---- BESS Lot-1 (2,334 MWh, 7 host stations, 10 project entries) ---- */
const LOT1: Project[] = [
  {
    id: "kudgi", name: "Kudgi", lot: "Lot-1", hostStation: "Kudgi STPP",
    noOfUnits: 3, capacityPerUnitMW: 800, apc: 0.0575,
    worksCostInclCAMC: 662.93, camcCost: 66.09, worksCostCapex: 596.84,
    avgEcrRsPerKwh: 4.690, bessMW: 240, bessMWh: 480, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "400kV",
    published: { contingency: 5.97, pmc: 3.01, preComms: 1.51, projectCostExclIDC: 607.33, idcFc: 24.00, totalProjectCost: 631.32, costPerMWh: 1.32, vgfDuringConstruction: 17.28, debtAfterVGF: 381.45, equityAfterVGF: 163.48, projectIRR: 12.40, equityIRR: 17.02, wacc: 8.52, averageDSCR: 1.72, tariffFC: 345, projectECR: 469, bessAddlVC: 117, tariffVC: 586, tariffTotal: 931, addcapFC: 5.57, addcapVC: 1.95, addcapTotal: 7.52 },
  },
  {
    id: "mouda-1", name: "Mouda-I", lot: "Lot-1", hostStation: "Mouda STPP, Stage-I",
    noOfUnits: 2, capacityPerUnitMW: 500, apc: 0.0575,
    worksCostInclCAMC: 243.89, camcCost: 24.13, worksCostCapex: 219.76,
    avgEcrRsPerKwh: 3.531, bessMW: 100, bessMWh: 200, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "132kV",
    published: { contingency: 2.20, pmc: 1.11, preComms: 0.55, projectCostExclIDC: 223.63, idcFc: 8.76, totalProjectCost: 232.39, costPerMWh: 1.16, vgfDuringConstruction: 7.20, debtAfterVGF: 137.47, equityAfterVGF: 58.92, projectIRR: 12.41, equityIRR: 17.07, wacc: 8.52, averageDSCR: 1.72, tariffFC: 298, projectECR: 353, bessAddlVC: 88, tariffVC: 441, tariffTotal: 740, addcapFC: 4.84, addcapVC: 1.47, addcapTotal: 6.30 },
  },
  {
    id: "mouda-2", name: "Mouda-II", lot: "Lot-1", hostStation: "Mouda STPP, Stage-II",
    noOfUnits: 2, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 243.89, camcCost: 24.13, worksCostCapex: 219.76,
    avgEcrRsPerKwh: 3.478, bessMW: 100, bessMWh: 200, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.0758, poiVoltage: "132kV",
    published: { contingency: 2.20, pmc: 1.11, preComms: 0.55, projectCostExclIDC: 223.63, idcFc: 8.76, totalProjectCost: 232.39, costPerMWh: 1.16, vgfDuringConstruction: 7.20, debtAfterVGF: 137.47, equityAfterVGF: 58.92, projectIRR: 12.41, equityIRR: 17.07, wacc: 8.52, averageDSCR: 1.72, tariffFC: 298, projectECR: 348, bessAddlVC: 87, tariffVC: 435, tariffTotal: 733, addcapFC: 3.66, addcapVC: 1.09, addcapTotal: 4.75 },
  },
  {
    id: "barh-1", name: "Barh-I", lot: "Lot-1", hostStation: "Barh STPP, Stage-I",
    noOfUnits: 3, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 280.88, camcCost: 28.30, worksCostCapex: 252.58,
    avgEcrRsPerKwh: 2.946, bessMW: 100, bessMWh: 200, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.0505, poiVoltage: "132kV",
    published: { contingency: 2.53, pmc: 1.28, preComms: 0.64, projectCostExclIDC: 257.02, idcFc: 10.16, totalProjectCost: 267.18, costPerMWh: 1.34, vgfDuringConstruction: 7.20, debtAfterVGF: 161.83, equityAfterVGF: 69.35, projectIRR: 12.36, equityIRR: 16.99, wacc: 8.52, averageDSCR: 1.72, tariffFC: 347, projectECR: 295, bessAddlVC: 74, tariffVC: 368, tariffTotal: 715, addcapFC: 2.85, addcapVC: 0.62, addcapTotal: 3.47 },
  },
  {
    id: "barh-2", name: "Barh-II", lot: "Lot-1", hostStation: "Barh STPP, Stage-II",
    noOfUnits: 2, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 280.88, camcCost: 28.30, worksCostCapex: 252.58,
    avgEcrRsPerKwh: 2.884, bessMW: 100, bessMWh: 200, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.0758, poiVoltage: "132kV",
    published: { contingency: 2.53, pmc: 1.28, preComms: 0.64, projectCostExclIDC: 257.02, idcFc: 10.16, totalProjectCost: 267.18, costPerMWh: 1.34, vgfDuringConstruction: 7.20, debtAfterVGF: 161.83, equityAfterVGF: 69.35, projectIRR: 12.36, equityIRR: 16.99, wacc: 8.52, averageDSCR: 1.72, tariffFC: 347, projectECR: 288, bessAddlVC: 72, tariffVC: 361, tariffTotal: 707, addcapFC: 4.28, addcapVC: 0.91, addcapTotal: 5.19 },
  },
  {
    id: "nabinagar-1", name: "Nabinagar-I", lot: "Lot-1", hostStation: "Nabinagar STPP, Stage-I",
    noOfUnits: 3, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 583.56, camcCost: 60.35, worksCostCapex: 523.20,
    avgEcrRsPerKwh: 2.825, bessMW: 200, bessMWh: 400, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.1010, poiVoltage: "132kV",
    published: { contingency: 5.23, pmc: 2.64, preComms: 1.32, projectCostExclIDC: 532.40, idcFc: 21.10, totalProjectCost: 553.50, costPerMWh: 1.38, vgfDuringConstruction: 14.40, debtAfterVGF: 337.05, equityAfterVGF: 144.45, projectIRR: 12.33, equityIRR: 16.90, wacc: 8.52, averageDSCR: 1.71, tariffFC: 360, projectECR: 283, bessAddlVC: 71, tariffVC: 353, tariffTotal: 714, addcapFC: 5.95, addcapVC: 1.18, addcapTotal: 7.13 },
  },
  {
    id: "simhadri-1", name: "Simhadri-I", lot: "Lot-1", hostStation: "Simhadri STPP, Stage-I",
    noOfUnits: 2, capacityPerUnitMW: 500, apc: 0.0525,
    worksCostInclCAMC: 191.85, camcCost: 19.04, worksCostCapex: 172.81,
    avgEcrRsPerKwh: 3.631, bessMW: 75, bessMWh: 150, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.075, poiVoltage: "400kV",
    published: { contingency: 1.73, pmc: 0.87, preComms: 0.44, projectCostExclIDC: 175.85, idcFc: 6.91, totalProjectCost: 182.76, costPerMWh: 1.22, vgfDuringConstruction: 5.40, debtAfterVGF: 109.03, equityAfterVGF: 46.73, projectIRR: 12.40, equityIRR: 17.05, wacc: 8.52, averageDSCR: 1.72, tariffFC: 315, projectECR: 363, bessAddlVC: 91, tariffVC: 454, tariffTotal: 769, addcapFC: 3.81, addcapVC: 1.12, addcapTotal: 4.93 },
  },
  {
    id: "simhadri-2", name: "Simhadri-II", lot: "Lot-1", hostStation: "Simhadri STPP, Stage-II",
    noOfUnits: 2, capacityPerUnitMW: 500, apc: 0.0525,
    worksCostInclCAMC: 179.06, camcCost: 17.77, worksCostCapex: 161.29,
    avgEcrRsPerKwh: 3.646, bessMW: 70, bessMWh: 140, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.070, poiVoltage: "400kV",
    published: { contingency: 1.61, pmc: 0.81, preComms: 0.41, projectCostExclIDC: 164.12, idcFc: 6.45, totalProjectCost: 170.58, costPerMWh: 1.22, vgfDuringConstruction: 5.04, debtAfterVGF: 101.76, equityAfterVGF: 43.61, projectIRR: 12.40, equityIRR: 17.05, wacc: 8.52, averageDSCR: 1.72, tariffFC: 315, projectECR: 365, bessAddlVC: 91, tariffVC: 456, tariffTotal: 771, addcapFC: 3.55, addcapVC: 1.05, addcapTotal: 4.60 },
  },
  {
    id: "solapur-1", name: "Solapur (Lot-1)", lot: "Lot-1", hostStation: "Solapur STPP",
    noOfUnits: 2, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 370.84, camcCost: 40.79, worksCostCapex: 330.05,
    avgEcrRsPerKwh: 4.411, bessMW: 132, bessMWh: 264, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "132kV",
    published: { contingency: 3.30, pmc: 1.67, preComms: 0.83, projectCostExclIDC: 335.85, idcFc: 13.27, totalProjectCost: 349.12, costPerMWh: 1.32, vgfDuringConstruction: 9.50, debtAfterVGF: 211.12, equityAfterVGF: 90.48, projectIRR: 12.28, equityIRR: 16.70, wacc: 8.52, averageDSCR: 1.71, tariffFC: 346, projectECR: 441, bessAddlVC: 110, tariffVC: 551, tariffTotal: 898, addcapFC: 5.60, addcapVC: 1.83, addcapTotal: 7.44 },
  },
  {
    id: "ramagundam-3", name: "Ramagundam-III", lot: "Lot-1", hostStation: "Ramagundam STPP, Stage-III",
    noOfUnits: 1, capacityPerUnitMW: 500, apc: 0.0575,
    worksCostInclCAMC: 120.98, camcCost: 12.01, worksCostCapex: 108.97,
    avgEcrRsPerKwh: 3.895, bessMW: 50, bessMWh: 100, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "33kV",
    published: { contingency: 1.09, pmc: 0.55, preComms: 0.28, projectCostExclIDC: 110.88, idcFc: 4.34, totalProjectCost: 115.23, costPerMWh: 1.15, vgfDuringConstruction: 3.60, debtAfterVGF: 68.06, equityAfterVGF: 29.17, projectIRR: 12.41, equityIRR: 17.07, wacc: 8.52, averageDSCR: 1.72, tariffFC: 297, projectECR: 390, bessAddlVC: 97, tariffVC: 487, tariffTotal: 783, addcapFC: 4.79, addcapVC: 1.62, addcapTotal: 6.41 },
  },
];

/** ---- BESS Lot-2 (2,370 MWh appraised, ex-Vallur; 8 project entries) ---- */
const LOT2: Project[] = [
  {
    id: "barauni", name: "Barauni", lot: "Lot-2", hostStation: "Barauni TPP",
    noOfUnits: 2, capacityPerUnitMW: 250, apc: 0.098,
    worksCostInclCAMC: 1128.87, camcCost: 113.59, worksCostCapex: 1015.28,
    avgEcrRsPerKwh: 2.651, bessMW: 250, bessMWh: 1000, cyclesPerDay: 1,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.50, poiVoltage: "220kV",
    published: { contingency: 10.15, pmc: 5.13, preComms: 2.56, projectCostExclIDC: 1033.12, idcFc: 40.26, totalProjectCost: 1073.38, costPerMWh: 1.07, vgfDuringConstruction: 36.00, debtAfterVGF: 625.37, equityAfterVGF: 268.01, projectIRR: 12.71, equityIRR: 17.89, wacc: 8.52, averageDSCR: 1.76, tariffFC: 535, projectECR: 265, bessAddlVC: 66, tariffVC: 331, tariffTotal: 867, addcapFC: 46.80, addcapVC: 5.86, addcapTotal: 52.66 },
  },
  {
    id: "bongaigaon", name: "Bongaigaon", lot: "Lot-2", hostStation: "Bongaigaon TPP",
    noOfUnits: 3, capacityPerUnitMW: 250, apc: 0.09,
    worksCostInclCAMC: 194.61, camcCost: 19.59, worksCostCapex: 175.02,
    avgEcrRsPerKwh: 3.642, bessMW: 75, bessMWh: 150, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "33kV",
    published: { contingency: 1.75, pmc: 0.88, preComms: 0.44, projectCostExclIDC: 178.09, idcFc: 7.01, totalProjectCost: 185.10, costPerMWh: 1.23, vgfDuringConstruction: 5.40, debtAfterVGF: 110.67, equityAfterVGF: 47.43, projectIRR: 12.38, equityIRR: 17.00, wacc: 8.52, averageDSCR: 1.72, tariffFC: 319, projectECR: 364, bessAddlVC: 91, tariffVC: 455, tariffTotal: 775, addcapFC: 5.37, addcapVC: 1.57, addcapTotal: 6.93 },
  },
  {
    id: "dadri-2", name: "Dadri-II", lot: "Lot-2", hostStation: "National Capital Power Station, Dadri Stage-II",
    noOfUnits: 2, capacityPerUnitMW: 490, apc: 0.0525,
    worksCostInclCAMC: 250.66, camcCost: 31.83, worksCostCapex: 218.83,
    avgEcrRsPerKwh: 4.269, bessMW: 100, bessMWh: 200, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.102, poiVoltage: "220kV",
    published: { contingency: 2.19, pmc: 1.11, preComms: 0.55, projectCostExclIDC: 222.68, idcFc: 8.72, totalProjectCost: 231.40, costPerMWh: 1.16, vgfDuringConstruction: 7.20, debtAfterVGF: 136.78, equityAfterVGF: 58.62, projectIRR: 12.11, equityIRR: 16.17, wacc: 8.52, averageDSCR: 1.69, tariffFC: 298, projectECR: 427, bessAddlVC: 107, tariffVC: 534, tariffTotal: 832, addcapFC: 4.89, addcapVC: 1.80, addcapTotal: 6.68 },
  },
  {
    id: "unchahar-4", name: "Unchahar-IV", lot: "Lot-2", hostStation: "Feroze Gandhi Unchahar TPP, Stage-IV",
    noOfUnits: 1, capacityPerUnitMW: 500, apc: 0.0575,
    worksCostInclCAMC: 127.71, camcCost: 12.77, worksCostCapex: 114.94,
    avgEcrRsPerKwh: 3.549, bessMW: 50, bessMWh: 100, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "33kV",
    published: { contingency: 1.15, pmc: 0.58, preComms: 0.29, projectCostExclIDC: 116.96, idcFc: 4.60, totalProjectCost: 121.56, costPerMWh: 1.22, vgfDuringConstruction: 3.60, debtAfterVGF: 72.49, equityAfterVGF: 31.07, projectIRR: 12.39, equityIRR: 17.03, wacc: 8.52, averageDSCR: 1.72, tariffFC: 314, projectECR: 355, bessAddlVC: 89, tariffVC: 444, tariffTotal: 758, addcapFC: 5.09, addcapVC: 1.47, addcapTotal: 6.57 },
  },
  {
    id: "gadarwara-1", name: "Gadarwara-I", lot: "Lot-2", hostStation: "Gadarwara STPP, Stage-I",
    noOfUnits: 2, capacityPerUnitMW: 800, apc: 0.0575,
    worksCostInclCAMC: 423.49, camcCost: 41.97, worksCostCapex: 381.53,
    avgEcrRsPerKwh: 3.268, bessMW: 160, bessMWh: 320, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.10, poiVoltage: "132kV",
    published: { contingency: 3.82, pmc: 1.93, preComms: 0.96, projectCostExclIDC: 388.23, idcFc: 15.30, totalProjectCost: 403.53, costPerMWh: 1.26, vgfDuringConstruction: 11.52, debtAfterVGF: 242.15, equityAfterVGF: 103.78, projectIRR: 12.39, equityIRR: 17.05, wacc: 8.52, averageDSCR: 1.72, tariffFC: 326, projectECR: 327, bessAddlVC: 82, tariffVC: 409, tariffTotal: 735, addcapFC: 5.31, addcapVC: 1.36, addcapTotal: 6.67 },
  },
  {
    id: "khargone", name: "Khargone", lot: "Lot-2", hostStation: "Khargone STPP",
    noOfUnits: 2, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 352.63, camcCost: 34.95, worksCostCapex: 317.69,
    avgEcrRsPerKwh: 3.998, bessMW: 125, bessMWh: 250, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.0947, poiVoltage: "400kV",
    published: { contingency: 3.18, pmc: 1.60, preComms: 0.80, projectCostExclIDC: 323.27, idcFc: 12.79, totalProjectCost: 336.06, costPerMWh: 1.34, vgfDuringConstruction: 9.00, debtAfterVGF: 203.74, equityAfterVGF: 87.32, projectIRR: 12.39, equityIRR: 17.04, wacc: 8.52, averageDSCR: 1.72, tariffFC: 352, projectECR: 400, bessAddlVC: 100, tariffVC: 500, tariffTotal: 852, addcapFC: 5.40, addcapVC: 1.57, addcapTotal: 6.98 },
  },
  {
    id: "tanda-2", name: "Tanda-II", lot: "Lot-2", hostStation: "Tanda STPP, Stage-II",
    noOfUnits: 2, capacityPerUnitMW: 660, apc: 0.0525,
    worksCostInclCAMC: 284.13, camcCost: 28.45, worksCostCapex: 255.68,
    avgEcrRsPerKwh: 3.198, bessMW: 100, bessMWh: 200, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.0758, poiVoltage: "220kV",
    published: { contingency: 2.56, pmc: 1.29, preComms: 0.65, projectCostExclIDC: 260.18, idcFc: 10.30, totalProjectCost: 270.47, costPerMWh: 1.35, vgfDuringConstruction: 7.20, debtAfterVGF: 164.13, equityAfterVGF: 70.34, projectIRR: 12.37, equityIRR: 17.00, wacc: 8.52, averageDSCR: 1.72, tariffFC: 352, projectECR: 320, bessAddlVC: 80, tariffVC: 400, tariffTotal: 752, addcapFC: 4.32, addcapVC: 1.00, addcapTotal: 5.32 },
  },
  {
    id: "solapur-2", name: "Solapur (Lot-2)", lot: "Lot-2", hostStation: "Solapur STPP",
    noOfUnits: 2, capacityPerUnitMW: 660, apc: 0.0575,
    worksCostInclCAMC: 208.76, camcCost: 20.88, worksCostCapex: 187.89,
    avgEcrRsPerKwh: 4.411, bessMW: 75, bessMWh: 150, cyclesPerDay: 2,
    operationYears: 15, omYears: 14, annualDegradation: 0.02, bessToPlantMWPct: 0.0568, poiVoltage: "132kV",
    published: { contingency: 1.88, pmc: 0.95, preComms: 0.47, projectCostExclIDC: 191.19, idcFc: 7.56, totalProjectCost: 198.75, costPerMWh: 1.32, vgfDuringConstruction: 5.40, debtAfterVGF: 120.22, equityAfterVGF: 51.52, projectIRR: 12.39, equityIRR: 17.01, wacc: 8.52, averageDSCR: 1.72, tariffFC: 347, projectECR: 441, bessAddlVC: 110, tariffVC: 551, tariffTotal: 899, addcapFC: 3.19, addcapVC: 1.04, addcapTotal: 4.23 },
  },
];

export const PROJECTS: Project[] = [...LOT1, ...LOT2];

/** Portfolio totals published in the report (used to reconcile the roll-up). */
export const PORTFOLIO_PUBLISHED = {
  lot1: { mwh: 2334, capex: 2837.84, contingency: 28.39, pmcPrecomms: 21.48, idcFc: 113.91, totalCost: 3001.65, vgfConstruction: 84.02, debt: 1807.07, equity: 774.46 },
  lot2: { mwh: 2370, capex: 2666.86, contingency: 26.68, pmcPrecomms: 20.21, idcFc: 106.54, totalCost: 2820.25, vgfConstruction: 85.32, debt: 1675.55, equity: 718.09 },
  combined: { mwh: 4704, totalCost: 5821.90, idcFc: 220.45, vgfSanctioned: 900 },
} as const;

export const getProject = (id: string): Project | undefined => PROJECTS.find((p) => p.id === id);
