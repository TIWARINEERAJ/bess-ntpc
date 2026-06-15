import { supabase } from "@/integrations/supabase/client";

/**
 * A single drawing record in a station's Master Drawing List (MDL).
 *
 * IMPORTANT — single source of truth:
 * The MDL (Master Drawing List) IS the collection of these rows. Every
 * "Drawings" / "Total MDL" figure shown anywhere in the app is derived by
 * counting these rows — never from a separately stored planned total. This
 * guarantees one consistent number propagates across the whole codebase.
 */
export type StationDrawing = {
  id: string;
  station_id: string;
  category: string;
  drg_ref: string;
  drg_desc: string;
  /** Equipment (BOI) item this drawing belongs to, from the MDL "BOI Name" column. */
  boi_name: string | null;
  cat: string | null;
  sch_date: string | null;
  sch_apprvl_date: string | null;
  submitted_date: string | null;
  resubmitted_date: string | null;
  approved_date: string | null;
  sort_order: number;
};

/**
 * Fetch every MDL drawing row, transparently paginating past the Supabase
 * 1000-row response cap. Without this, portfolio-wide drawing totals silently
 * top out at 1000 even though there are thousands of drawings.
 */
export async function fetchAllDrawings(): Promise<StationDrawing[]> {
  const PAGE = 1000;
  const all: StationDrawing[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("station_drawings")
      .select("*")
      .order("category")
      .order("sort_order")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as StationDrawing[]));
    if (data.length < PAGE) break;
  }
  return all;
}


/** Normalise the drawing CAT classification to a canonical code. */
export function catCode(cat: string | null): "I" | "II" | "III" | "REL" | null {
  if (!cat) return null;
  const c = cat.toUpperCase().replace(/[\s.]/g, "");
  if (c === "CAT-I" || c === "CATI" || c === "CAT1") return "I";
  if (c === "CAT-II" || c === "CATII" || c === "CAT2") return "II";
  if (c === "CAT-III" || c === "CATIII" || c === "CAT3") return "III";
  if (c === "CATREL" || c === "CAT-REL" || c === "REL") return "REL";
  return null;
}

/**
 * CAT-I / CAT-II (and released CAT-REL) classification implies the drawing is
 * approved. CAT-III is an explicit "returned / not approved" classification.
 */
export function catImpliesApproved(cat: string | null): boolean {
  const c = catCode(cat);
  return c === "I" || c === "II" || c === "REL";
}

/** CAT-III is explicitly NOT approved, even if an approval date is present. */
export function catBlocksApproval(cat: string | null): boolean {
  return catCode(cat) === "III";
}


export type DrawingCounts = {
  total: number;
  registered: number;
  submitted: number;
  approved: number;
  pending: number;
  /** scheduled approval date has passed and the drawing is not yet approved */
  overdue: number;
  /** scheduled SUBMISSION date has passed and the drawing is not yet submitted */
  submissionOverdue: number;
  /** scheduled approval falls within the next 2 months and not yet approved */
  upcoming: number;
  submittedPct: number;
  approvedPct: number;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * A drawing is "approved" only when classified CAT-I / CAT-II (or CAT-REL).
 * CAT-III is a returned drawing and is never counted as approved. Drawings with
 * no CAT classification fall back to the presence of an approval date.
 */
export function isApproved(r: StationDrawing): boolean {
  if (catBlocksApproval(r.cat)) return false;
  if (catImpliesApproved(r.cat)) return true;
  return !!r.approved_date;
}

/** A drawing counts as submitted once it has a submitted or re-submitted date (or is approved). */
export function isSubmitted(r: StationDrawing): boolean {
  return !!r.submitted_date || !!r.resubmitted_date || isApproved(r);
}

/** Overdue = scheduled approval date in the past, still not approved. */
export function isOverdue(r: StationDrawing, today = startOfToday()): boolean {
  if (isApproved(r) || !r.sch_apprvl_date) return false;
  return new Date(r.sch_apprvl_date) < today;
}

/** Submission overdue = scheduled SUBMISSION date in the past, still not submitted (and not approved). */
export function isSubmissionOverdue(r: StationDrawing, today = startOfToday()): boolean {
  if (isSubmitted(r) || !r.sch_date) return false;
  return new Date(r.sch_date) < today;
}

/** Upcoming = scheduled approval within the next `months` months, not approved, not already overdue. */
export function isUpcoming(r: StationDrawing, months = 2, today = startOfToday()): boolean {
  if (isApproved(r) || !r.sch_apprvl_date) return false;
  const d = new Date(r.sch_apprvl_date);
  if (d < today) return false;
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + months);
  return d <= horizon;
}

/* ================================================================== */
/* Station-wise MDL approval summary (matches the MDL Station Summary)  */
/* ================================================================== */

/**
 * Per-station MDL approval-category breakdown — the same conclusion view as the
 * consolidated MDL "Station Summary" sheet. Every figure is derived from the
 * drawing rows (single source of truth) using these definitions:
 *  - submitted        : has a submission date
 *  - catI/II/REL/III  : count by approval category
 *  - approvedCat12     : CAT-I + CAT-II
 *  - approvedCat12Rel  : CAT-I + CAT-II + CAT-REL (the app's "approved")
 *  - categorized       : CAT-I + II + III + REL (all reviewed)
 *  - approvalPending   : submitted but not yet categorised (= submitted − categorized)
 *  - balanceSubmission : not yet categorised at all (= total − categorized)
 */
export type DrawingCatSummary = {
  total: number;
  submitted: number;
  catI: number;
  catII: number;
  catREL: number;
  catIII: number;
  approvedCat12: number;
  approvedCat12Rel: number;
  categorized: number;
  approvalPending: number;
  balanceSubmission: number;
};

export function drawingCatSummary(rows: StationDrawing[]): DrawingCatSummary {
  const total = rows.length;
  const submitted = rows.filter(isSubmitted).length;
  let catI = 0, catII = 0, catREL = 0, catIII = 0;
  for (const r of rows) {
    switch (catCode(r.cat)) {
      case "I": catI++; break;
      case "II": catII++; break;
      case "REL": catREL++; break;
      case "III": catIII++; break;
    }
  }
  const approvedCat12 = catI + catII;
  const approvedCat12Rel = catI + catII + catREL;
  const categorized = catI + catII + catREL + catIII;
  return {
    total,
    submitted,
    catI,
    catII,
    catREL,
    catIII,
    approvedCat12,
    approvedCat12Rel,
    categorized,
    approvalPending: Math.max(0, submitted - categorized),
    balanceSubmission: Math.max(0, total - categorized),
  };
}

/**
 * Derive MDL counts from a station's (or the portfolio's) drawing register.
 *
 * The MDL register is the SINGLE source of truth: the total is simply the
 * number of drawing rows — there is no separately stored planned total. Every
 * other figure (submitted / approved / pending / overdue) is counted from the
 * same rows so all numbers stay perfectly consistent everywhere they appear.
 */
export function drawingCounts(rows: StationDrawing[]): DrawingCounts {
  const today = startOfToday();
  const registered = rows.length;
  const submitted = rows.filter(isSubmitted).length;
  const approved = rows.filter(isApproved).length;
  const overdue = rows.filter((r) => isOverdue(r, today)).length;
  const submissionOverdue = rows.filter((r) => isSubmissionOverdue(r, today)).length;
  const upcoming = rows.filter((r) => isUpcoming(r, 2, today)).length;
  const total = registered;
  const pending = Math.max(0, total - approved);
  return {
    total,
    registered,
    submitted,
    approved,
    pending,
    overdue,
    submissionOverdue,
    upcoming,
    submittedPct: total ? Math.round((submitted / total) * 100) : 0,
    approvedPct: total ? Math.round((approved / total) * 100) : 0,
  };
}


export function uniqueCategories(rows: StationDrawing[]): string[] {
  return Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b));
}


/* ================================================================== */
/* Month-wise drawings lifecycle analytics                             */
/* ================================================================== */

/**
 * A single month in the MDL drawings lifecycle. Every figure is derived from
 * the same drawing rows so the picture stays internally consistent:
 *  - due:        scheduled to be SUBMITTED in this month (by sch_date)
 *  - submitted:  actually submitted in this month (by submitted_date)
 *  - approved:   approved (CAT-I / CAT-II / CAT-REL) in this month
 *  - catIII:     returned for re-submission (CAT-III) reviewed in this month
 *  - cumDue / cumSubmitted / cumApproved: running totals to end of month
 *  - slippage:   cumulative submission backlog = cumDue − cumSubmitted
 */
export type DrawingMonthBucket = {
  month: string;
  label: string;
  due: number;
  submitted: number;
  approved: number;
  catIII: number;
  cumDue: number;
  cumSubmitted: number;
  cumApproved: number;
  slippage: number;
};

function ym(date: string | null): string | null {
  if (!date) return null;
  const s = String(date).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1]} '${y.slice(2)}`;
}

/** Inclusive list of YYYY-MM strings between two months (fills gaps). */
function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Build the month-by-month lifecycle series for a set of MDL drawings.
 * Returns an empty array when there are no dated drawings to plot.
 */
export function drawingMonthlySeries(rows: StationDrawing[]): DrawingMonthBucket[] {
  type Acc = { due: number; submitted: number; approved: number; catIII: number };
  const map = new Map<string, Acc>();
  const bump = (m: string, k: keyof Acc) => {
    let b = map.get(m);
    if (!b) { b = { due: 0, submitted: 0, approved: 0, catIII: 0 }; map.set(m, b); }
    b[k] += 1;
  };

  for (const r of rows) {
    const dueM = ym(r.sch_date);
    if (dueM) bump(dueM, "due");

    const subM = ym(r.submitted_date) ?? ym(r.resubmitted_date);
    if (subM) bump(subM, "submitted");

    if (isApproved(r)) {
      const apM = ym(r.approved_date);
      if (apM) bump(apM, "approved");
    }

    if (catBlocksApproval(r.cat)) {
      // CAT-III = returned, re-submission requested. Use the review (approved_date)
      // month, falling back to the (re)submission month.
      const cm = ym(r.approved_date) ?? ym(r.resubmitted_date) ?? ym(r.submitted_date);
      if (cm) bump(cm, "catIII");
    }
  }

  const months = Array.from(map.keys()).sort();
  if (months.length === 0) return [];

  const all = monthRange(months[0], months[months.length - 1]);
  let cumDue = 0, cumSub = 0, cumApp = 0;
  return all.map((m) => {
    const b = map.get(m) ?? { due: 0, submitted: 0, approved: 0, catIII: 0 };
    cumDue += b.due;
    cumSub += b.submitted;
    cumApp += b.approved;
    return {
      month: m,
      label: monthLabel(m),
      due: b.due,
      submitted: b.submitted,
      approved: b.approved,
      catIII: b.catIII,
      cumDue,
      cumSubmitted: cumSub,
      cumApproved: cumApp,
      slippage: Math.max(0, cumDue - cumSub),
    };
  });
}
