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

/** CAT-I / CAT-II classification implies the drawing is approved (no separate approval needed). */
export function catImpliesApproved(cat: string | null): boolean {
  if (!cat) return false;
  const c = cat.toUpperCase().replace(/[\s.]/g, "");
  return c === "CAT-I" || c === "CATI" || c === "CAT1" ||
    c === "CAT-II" || c === "CATII" || c === "CAT2";
}


export type DrawingCounts = {
  total: number;
  registered: number;
  submitted: number;
  approved: number;
  pending: number;
  /** scheduled approval date has passed and the drawing is not yet approved */
  overdue: number;
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

/** A drawing is "cleared" once it has an approval date. */
export function isApproved(r: StationDrawing): boolean {
  return !!r.approved_date;
}

/** Overdue = scheduled approval date in the past, still not approved. */
export function isOverdue(r: StationDrawing, today = startOfToday()): boolean {
  if (isApproved(r) || !r.sch_apprvl_date) return false;
  return new Date(r.sch_apprvl_date) < today;
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
  const submitted = rows.filter((r) => !!r.submitted_date).length;
  const approved = rows.filter(isApproved).length;
  const overdue = rows.filter((r) => isOverdue(r, today)).length;
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
    upcoming,
    submittedPct: total ? Math.round((submitted / total) * 100) : 0,
    approvedPct: total ? Math.round((approved / total) * 100) : 0,
  };
}

export function uniqueCategories(rows: StationDrawing[]): string[] {
  return Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b));
}
