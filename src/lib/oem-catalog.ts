/**
 * Procurement-grade OEM master catalogue for utility-scale BESS packages
 * (NTPC / SECI / NHPC / SJVN / PGCIL / State utilities).
 *
 * Used for:
 *  - OEM Name suggestions per BOI item (tiered, category-aware)
 *  - Clubbing equivalent BOI item names (e.g. "PCS Duty Transformer" == IDT)
 */

export type OemCategory =
  | "battery"
  | "pcs"
  | "power_transformer"
  | "idt"
  | "breaker"
  | "gis"
  | "switchgear_33kv"
  | "protection_sas"
  | "ems_scada"
  | "container"
  | "epc"
  | "other";

export const OEM_CATEGORY_LABELS: Record<OemCategory, string> = {
  battery: "Battery Cell / Container",
  pcs: "Power Conversion System (PCS)",
  power_transformer: "Power Transformer (132–765 kV)",
  idt: "Inverter Duty Transformer (IDT)",
  breaker: "EHV Circuit Breaker (33–765 kV)",
  gis: "GIS / AIS Switchyard",
  switchgear_33kv: "33 kV Switchgear",
  protection_sas: "Protection Relays & SAS",
  ems_scada: "EMS / PPC / SCADA",
  container: "Container / Enclosure",
  epc: "EPC Contractor",
  other: "Other / General",
};

export type OemEntry = { name: string; tier: 1 | 2 | 3; category: OemCategory };

const T = (category: OemCategory, tier: 1 | 2 | 3, names: string[]): OemEntry[] =>
  names.map((name) => ({ name, tier, category }));

export const OEM_CATALOG: OemEntry[] = [
  // 1. Battery cell / container
  ...T("battery", 1, ["CATL", "BYD", "EVE Energy", "Hithium", "REPT Battero", "Trina Storage", "Sungrow", "HyperStrong", "Envision Energy"]),
  ...T("battery", 2, ["Narada", "Great Power", "CALB", "Gotion High-Tech", "SVOLT", "PotisEdge", "Fluence", "Wärtsilä"]),
  ...T("battery", 3, ["Exide Energy", "Amara Raja Advanced Cell Technologies", "JSW Energy", "Reliance New Energy", "HBL Energy", "EnerCube", "Prostarm"]),

  // 2. PCS
  ...T("pcs", 1, ["Sungrow", "Sineng Electric", "Kehua Tech", "Huawei Digital Power", "Hitachi Energy", "Siemens Energy", "ABB", "TMEIC", "Dynapower", "Newen Systems"]),
  ...T("pcs", 2, ["FIMER", "Power Electronics (Spain)", "Ingeteam", "Gamesa Electric", "Delta Electronics", "NR Electric", "CLOU Electronics", "Parker Hannifin", "Toshiba", "Socomec", "Consul Neowatt"]),
  ...T("pcs", 3, ["Statcon Energiaa", "Servotech Power Systems", "Fuji Electric India", "Schneider Electric", "Eaton", "CG Power", "Quality Power Electrical Equipments"]),

  // 3. Power transformers
  ...T("power_transformer", 1, ["Hitachi Energy", "Siemens Energy", "CG Power", "Transformers & Rectifiers India (TRIL)", "BHEL", "GE Vernova", "Toshiba Transmission & Distribution", "TBEA", "Voltamp"]),
  ...T("power_transformer", 2, ["Bharat Bijlee", "Kirloskar Electric", "Prime Meiden", "Kanohar Electricals", "Technical Associates", "Tesla Transformers", "Victory Transformers"]),
  ...T("power_transformer", 3, ["Atlanta Electricals", "Vishwas Power Engineering", "SkipperSeil", "Nucon Switchgear", "Servokon", "Star Delta", "MEI Power", "Indo Tech Transformers", "Vijay Transformers"]),

  // 4. Inverter duty transformers
  ...T("idt", 1, ["Hitachi Energy", "CG Power", "Voltamp", "Transformers & Rectifiers India (TRIL)", "Bharat Bijlee", "TBEA"]),
  ...T("idt", 2, ["Technical Associates", "Prime Meiden", "Tesla Transformers", "Kanohar Electricals", "Kirloskar Electric"]),
  ...T("idt", 3, ["Servokon", "Star Delta", "Vijay Transformers", "Indo Tech Transformers", "MEI Power"]),

  // 5. EHV circuit breakers
  ...T("breaker", 1, ["Hitachi Energy", "Siemens Energy", "GE Vernova", "Toshiba", "Schneider Electric", "ABB"]),
  ...T("breaker", 2, ["BHEL", "CG Power", "Eaton", "Lucy Electric"]),
  ...T("breaker", 3, ["Orecco", "Megawin", "Fuji Electric", "Hyundai Electric", "Hyosung Heavy Industries"]),

  // 6. GIS / AIS switchyard
  ...T("gis", 1, ["Hitachi Energy", "Siemens Energy", "GE Vernova", "Toshiba", "Schneider Electric", "ABB"]),
  ...T("gis", 2, ["BHEL", "CG Power", "Hyundai Electric", "Hyosung Heavy Industries", "TBEA"]),
  ...T("gis", 3, ["Lucy Electric", "Orecco", "Megawin", "Fuji Electric"]),

  // 7. 33 kV switchgear
  ...T("switchgear_33kv", 1, ["Siemens", "Schneider Electric", "ABB", "Eaton", "Hitachi Energy", "CG Power"]),
  ...T("switchgear_33kv", 2, ["Lucy Electric", "Toshiba", "Larsen & Toubro", "Fuji Electric", "Hyosung Heavy Industries", "Hyundai Electric"]),
  ...T("switchgear_33kv", 3, ["C&S Electric", "Megawin", "Orecco", "Indo Tech", "BCH Electric", "Electromech", "Elmeasure", "Nucon Switchgear"]),

  // 8. Protection relays & SAS
  ...T("protection_sas", 1, ["Siemens SIPROTEC", "Hitachi Energy", "ABB Relion", "GE Multilin", "Schneider Electric"]),
  ...T("protection_sas", 2, ["SEL (Schweitzer)", "NR Electric", "Toshiba", "Hyosung Heavy Industries"]),
  ...T("protection_sas", 3, ["Easun Reyrolle", "Megawin", "C&S Electric"]),

  // 9. EMS / PPC / SCADA
  ...T("ems_scada", 1, ["Hitachi Energy", "Siemens", "GE Vernova", "Schneider Electric", "Fluence", "Wärtsilä"]),
  ...T("ems_scada", 2, ["Sungrow", "Huawei Digital Power", "Kehua Tech", "Newen Systems", "Delta Electronics"]),
  ...T("ems_scada", 3, ["Statcon Energiaa", "Consul Neowatt", "Ampin Energy", "Green Power Monitor"]),

  // 10. Container / enclosure
  ...T("container", 1, ["HyperStrong", "Sungrow", "CATL", "Trina Storage", "BYD", "Fluence", "Wärtsilä"]),
  ...T("container", 2, ["Newen Systems", "Exide Energy", "Amara Raja Advanced Cell Technologies", "JSW Energy", "Reliance New Energy"]),
  ...T("container", 3, ["Pennar Industries", "Everest Kanto", "LMW Fabrication", "Karamtara Engineering"]),

  // 11. EPC contractors
  ...T("epc", 1, ["BHEL", "Larsen & Toubro", "Tata Projects", "KEC International", "Kalpataru Projects"]),
  ...T("epc", 2, ["Sterling & Wilson Renewable Energy", "Jakson Green", "Shirdi Sai Electricals", "Rays Power Infra", "Bondada Engineering"]),
  ...T("epc", 3, ["Gensol Engineering", "Prozeal Green Energy", "Pace Digitek", "Oriana Power", "Hartek Group"]),
];

/** Tiered, de-duplicated suggestion list for one OEM category. */
export function oemSuggestions(category: OemCategory): OemEntry[] {
  const seen = new Set<string>();
  const out: OemEntry[] = [];
  for (const e of OEM_CATALOG) {
    if (e.category !== category) continue;
    const k = e.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* BOI item-name clubbing                                              */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Canonical display name + OEM category rules, first match wins. */
const CANON_RULES: { test: RegExp; canonical: string; category: OemCategory }[] = [
  { test: /\b(idt|inverter duty transformer|pcs duty transformer|pcs transformer|inverter transformer)\b/, canonical: "Inverter Duty Transformer (IDT / PCS Duty Transformer)", category: "idt" },
  { test: /\b(bess container|battery container|battery energy storage container|battery bank|battery cell|battery module|battery rack|bess block)\b/, canonical: "Battery Container / BESS Block", category: "battery" },
  { test: /\b(pcs|power conversion system|inverter|pcs skid)\b/, canonical: "Power Conversion System (PCS)", category: "pcs" },
  { test: /\b(ems|energy management system|ppc|power plant controller|scada|bms controller)\b/, canonical: "EMS / PPC / SCADA", category: "ems_scada" },
  { test: /\b(gis|gas insulated|ais|switchyard)\b/, canonical: "GIS / AIS Switchyard", category: "gis" },
  { test: /\b(33kv switchgear|33 kv switchgear|mv switchgear|ring main unit|rmu|hv panel|switchgear panel)\b/, canonical: "33 kV Switchgear", category: "switchgear_33kv" },
  { test: /\b(circuit breaker|breaker|cb )\b/, canonical: "Circuit Breaker", category: "breaker" },
  { test: /\b(protection relay|relay panel|protection panel|sas|numerical relay|relay)\b/, canonical: "Protection Relays & SAS", category: "protection_sas" },
  { test: /\b(power transformer|main transformer|icts?|auto transformer|generator transformer|station transformer|aux transformer|auxiliary transformer|transformer)\b/, canonical: "Power Transformer", category: "power_transformer" },
  { test: /\b(container|enclosure|shelter)\b/, canonical: "Container / Enclosure", category: "container" },
  { test: /\b(epc|erection|civil works|balance of plant|bop)\b/, canonical: "EPC / Balance of Plant", category: "epc" },
];

/** Group equivalent BOI item names under a single canonical label. */
export function canonicalBoiName(raw: string): string {
  const n = norm(raw);
  for (const r of CANON_RULES) if (r.test.test(n)) return r.canonical;
  return raw.trim();
}

/** Best-guess OEM category for a BOI item name (drives suggestion list). */
export function oemCategoryForBoi(raw: string): OemCategory {
  const n = norm(raw);
  for (const r of CANON_RULES) if (r.test.test(n)) return r.category;
  return "other";
}
