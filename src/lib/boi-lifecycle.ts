/**
 * Month-wise BOI (Bill of Items) procurement lifecycle analytics.
 *
 * Mirrors the drawings (MDL) lifecycle but for the equipment procurement flow:
 *  - due:        scheduled to be ORDERED in this month (boi_master.scheduled_po_date)
 *  - ordered:    PO actually placed in this month (actual_po_date)
 *  - delivered:  dispatched / delivered in this month (delivery_date)
 *  - received:   received at site in this month (site_receipt_date)
 *  - cum* :      running totals to the end of the month
 *  - slippage:   cumulative ordering backlog = cumDue − cumOrdered
 */

export type BoiLifecycleRow = {
  scheduled_po_date: string | null;
  actual_po_date: string | null;
  delivery_date: string | null;
  site_receipt_date: string | null;
};

export type BoiMonthBucket = {
  month: string;
  label: string;
  due: number;
  ordered: number;
  delivered: number;
  received: number;
  cumDue: number;
  cumOrdered: number;
  cumDelivered: number;
  cumReceived: number;
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
 * Build the month-by-month BOI procurement lifecycle series.
 * Returns an empty array when there are no dated BOI items to plot.
 */
export function boiMonthlySeries(rows: BoiLifecycleRow[]): BoiMonthBucket[] {
  type Acc = { due: number; ordered: number; delivered: number; received: number };
  const map = new Map<string, Acc>();
  const bump = (m: string, k: keyof Acc) => {
    let b = map.get(m);
    if (!b) { b = { due: 0, ordered: 0, delivered: 0, received: 0 }; map.set(m, b); }
    b[k] += 1;
  };

  for (const r of rows) {
    const dueM = ym(r.scheduled_po_date);
    if (dueM) bump(dueM, "due");

    const ordM = ym(r.actual_po_date);
    if (ordM) bump(ordM, "ordered");

    const delM = ym(r.delivery_date);
    if (delM) bump(delM, "delivered");

    const recM = ym(r.site_receipt_date);
    if (recM) bump(recM, "received");
  }

  const months = Array.from(map.keys()).sort();
  if (months.length === 0) return [];

  const all = monthRange(months[0], months[months.length - 1]);
  let cumDue = 0, cumOrd = 0, cumDel = 0, cumRec = 0;
  return all.map((m) => {
    const b = map.get(m) ?? { due: 0, ordered: 0, delivered: 0, received: 0 };
    cumDue += b.due;
    cumOrd += b.ordered;
    cumDel += b.delivered;
    cumRec += b.received;
    return {
      month: m,
      label: monthLabel(m),
      due: b.due,
      ordered: b.ordered,
      delivered: b.delivered,
      received: b.received,
      cumDue,
      cumOrdered: cumOrd,
      cumDelivered: cumDel,
      cumReceived: cumRec,
      slippage: Math.max(0, cumDue - cumOrd),
    };
  });
}
