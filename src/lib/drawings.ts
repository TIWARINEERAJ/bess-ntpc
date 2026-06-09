export type StationDrawing = {
  id: string;
  station_id: string;
  category: string;
  drg_ref: string;
  drg_desc: string;
  cat: string | null;
  sch_date: string | null;
  sch_apprvl_date: string | null;
  submitted_date: string | null;
  resubmitted_date: string | null;
  approved_date: string | null;
  sort_order: number;
};

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

/**
 * Derive MDL counts for a station.
 * - total: declared Total MDL (planned drawing count) — falls back to registered rows when larger.
 * - submitted / approved: counted from the actual drawing register.
 * - pending: total minus approved.
 * - overdue / upcoming: based on scheduled approval dates.
 */
export function drawingCounts(mdlTotal: number, rows: StationDrawing[]): DrawingCounts {
  const today = startOfToday();
  const registered = rows.length;
  const submitted = rows.filter(isSubmitted).length;
  const approved = rows.filter(isApproved).length;
  const overdue = rows.filter((r) => isOverdue(r, today)).length;
  const submissionOverdue = rows.filter((r) => isSubmissionOverdue(r, today)).length;
  const upcoming = rows.filter((r) => isUpcoming(r, 2, today)).length;
  const total = Math.max(mdlTotal, registered);
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
