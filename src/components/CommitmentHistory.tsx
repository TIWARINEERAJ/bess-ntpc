import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { fmtD } from "@/lib/gantt-utils";
import { totalSlipDays, type CommitmentRevision } from "@/lib/commitments";

/**
 * Compact revision badge for a committed/promised date. Shows the current
 * revision number (R0, R1 …) and, on click, the full version history with the
 * slip introduced at each revision — the agency's slippage trail at a glance.
 */
export function CommitmentHistory({ revisions }: { revisions?: CommitmentRevision[] }) {
  if (!revisions || revisions.length === 0) return null;
  const latest = revisions[revisions.length - 1];
  const slipped = revisions.length > 1;
  const total = totalSlipDays(revisions);
  const tone = !slipped
    ? "var(--status-grey)"
    : total > 0
      ? "var(--status-red)"
      : "var(--status-green)";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[9px] font-semibold leading-none"
          style={{ color: tone, border: `1px solid ${tone}` }}
          title="Committed-date revision history"
        >
          R{latest.revision_no}
          {slipped && <History className="h-2.5 w-2.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2.5 text-xs" align="end">
        <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
          <History className="h-3 w-3 text-primary" /> Commitment history
        </div>
        <div className="space-y-1">
          {revisions.map((r, i) => {
            const prev = i > 0 ? revisions[i - 1] : null;
            const slip = prev
              ? differenceInCalendarDays(parseISO(r.committed_date), parseISO(prev.committed_date))
              : 0;
            return (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <span className="w-7 font-mono text-muted-foreground">R{r.revision_no}</span>
                <span className="flex-1 text-right font-mono tabular-nums">{fmtD(r.committed_date)}</span>
                <span
                  className="w-14 text-right font-mono tabular-nums"
                  style={{
                    color:
                      slip > 0 ? "var(--status-red)" : slip < 0 ? "var(--status-green)" : "var(--muted-foreground)",
                  }}
                >
                  {prev ? (slip > 0 ? `+${slip}d` : `${slip}d`) : "baseline"}
                </span>
              </div>
            );
          })}
        </div>
        {slipped && (
          <div className="mt-1.5 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
            Net slip vs R0:{" "}
            <span
              className="font-mono font-semibold"
              style={{ color: total > 0 ? "var(--status-red)" : "var(--status-green)" }}
            >
              {total > 0 ? `+${total}` : total} days
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
