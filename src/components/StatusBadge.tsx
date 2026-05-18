import { statusColor, statusLabel, type RowStatus } from "@/lib/gantt-utils";

export function StatusBadge({ status, className = "" }: { status: RowStatus; className?: string }) {
  const c = statusColor(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${className}`}
      style={{ backgroundColor: `color-mix(in oklab, ${c} 18%, transparent)`, color: c, borderColor: c, border: "1px solid" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {statusLabel(status)}
    </span>
  );
}
