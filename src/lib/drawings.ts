export type StationDrawing = {
  id: string;
  station_id: string;
  category: string;
  drg_ref: string;
  drg_desc: string;
  cat: string | null;
  submitted_date: string | null;
  approved_date: string | null;
  sort_order: number;
};

export type DrawingCounts = {
  total: number;
  registered: number;
  submitted: number;
  approved: number;
  pending: number;
  submittedPct: number;
  approvedPct: number;
};

/**
 * Derive MDL counts for a station.
 * - total: declared Total MDL (planned drawing count) — falls back to registered rows when larger.
 * - submitted / approved: counted from the actual drawing register.
 * - pending: total minus approved.
 */
export function drawingCounts(mdlTotal: number, rows: StationDrawing[]): DrawingCounts {
  const registered = rows.length;
  const submitted = rows.filter((r) => !!r.submitted_date).length;
  const approved = rows.filter((r) => !!r.approved_date).length;
  const total = Math.max(mdlTotal, registered);
  const pending = Math.max(0, total - approved);
  return {
    total,
    registered,
    submitted,
    approved,
    pending,
    submittedPct: total ? Math.round((submitted / total) * 100) : 0,
    approvedPct: total ? Math.round((approved / total) * 100) : 0,
  };
}

export function uniqueCategories(rows: StationDrawing[]): string[] {
  return Array.from(new Set(rows.map((r) => r.category))).sort((a, b) => a.localeCompare(b));
}
