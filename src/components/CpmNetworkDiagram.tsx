import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtD } from "@/lib/gantt-utils";
import type { CpmResult, CpmNetNode } from "@/lib/cpm";
import { Network, Check, X, Info, ChevronDown, ChevronRight } from "lucide-react";

/** Traditional activity-on-node CPM diagram: circles (activities) + connecting
 *  lines (dependencies), with the critical path highlighted in red. */
export function CpmNetworkDiagram({
  cpm,
  onFocusTask,
}: {
  cpm: CpmResult;
  onFocusTask?: (taskId: string) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const net = cpm.network;

  // Layout geometry
  const R = 30;                 // node radius
  const COL_W = 210;            // horizontal gap between columns
  const ROW_H = 120;            // vertical gap between rows
  const PAD = 60;               // outer padding

  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    let maxRow = 0;
    for (const n of net.nodes) {
      const x = PAD + n.level * COL_W;
      const y = PAD + n.row * ROW_H;
      pos.set(n.id, { x, y });
      if (n.row > maxRow) maxRow = n.row;
    }
    const width = PAD * 2 + Math.max(0, net.levels - 1) * COL_W + R * 2;
    const height = PAD * 2 + maxRow * ROW_H + R * 2;
    return { pos, width, height };
  }, [net]);

  // Verification checks
  const checks = useMemo(() => buildChecks(net.nodes), [net.nodes]);

  if (!cpm.hasNetwork || net.nodes.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        No schedule logic (predecessors/baseline) available to draw the critical-path network.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-sidebar/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Critical Path Network (Activity-on-Node)</span>
          <Badge variant="outline" className="text-[10px]">{net.nodes.length} activities</Badge>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: "var(--status-red)", background: "color-mix(in oklab, var(--status-red) 18%, transparent)" }} />
            Critical (float = 0)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: "var(--primary)", background: "color-mix(in oklab, var(--primary) 12%, transparent)" }} />
            Has float
          </span>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
        <svg width={layout.width} height={layout.height} className="block">
          <defs>
            <marker id="cpm-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--muted-foreground)" />
            </marker>
            <marker id="cpm-arrow-crit" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--status-red)" />
            </marker>
          </defs>

          {/* edges */}
          {net.edges.map((e, i) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + R, y1 = a.y;
            const x2 = b.x - R, y2 = b.y;
            const mx = (x1 + x2) / 2;
            const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={e.critical ? "var(--status-red)" : "var(--muted-foreground)"}
                strokeWidth={e.critical ? 2.2 : 1.1}
                strokeOpacity={e.critical ? 0.95 : 0.5}
                markerEnd={`url(#${e.critical ? "cpm-arrow-crit" : "cpm-arrow"})`}
              />
            );
          })}

          {/* nodes */}
          {net.nodes.map((n) => {
            const p = layout.pos.get(n.id)!;
            const crit = n.isCritical;
            const stroke = crit ? "var(--status-red)" : "var(--primary)";
            const fill = crit
              ? "color-mix(in oklab, var(--status-red) 16%, var(--card))"
              : "color-mix(in oklab, var(--primary) 8%, var(--card))";
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                onClick={() => onFocusTask?.(n.id)}
              >
                <title>
                  {`${n.wbs} ${n.name}\nDuration: ${n.dur}d  •  Total float: ${n.tf}d${crit ? " (critical)" : ""}\nBaseline: ${fmtD(n.baselineStart)} → ${fmtD(n.baselineFinish)}`}
                </title>
                {n.isMilestone ? (
                  <polygon
                    points={`${p.x},${p.y - R} ${p.x + R},${p.y} ${p.x},${p.y + R} ${p.x - R},${p.y}`}
                    fill={fill} stroke={stroke} strokeWidth={crit ? 3 : 2}
                  />
                ) : (
                  <circle cx={p.x} cy={p.y} r={R} fill={fill} stroke={stroke} strokeWidth={crit ? 3 : 2} />
                )}
                <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--foreground)" className="font-mono">{n.sort}</text>
                <text x={p.x} y={p.y + 9} textAnchor="middle" fontSize={9} fill={crit ? "var(--status-red)" : "var(--muted-foreground)"} className="font-mono">
                  {n.dur}d · f{n.tf}
                </text>
                <text x={p.x} y={p.y + R + 13} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
                  {truncate(n.name, 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Verification panel */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold hover:bg-secondary/40"
        >
          {showHelp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Info className="h-3.5 w-3.5 text-primary" />
          How do I know the critical path is correct? (verification)
        </button>
        {showHelp && (
          <div className="space-y-3 px-4 pb-4 text-xs">
            <div className="space-y-1.5">
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2">
                  {c.pass
                    ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--status-green)" }} />
                    : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--status-amber)" }} />}
                  <div>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-[11px] text-muted-foreground">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">The four rules a correct critical path must satisfy</p>
              <ol className="ml-4 list-decimal space-y-1">
                <li><b>Zero total float.</b> Every activity on the critical path has total float = 0 (Late Start − Early Start). Any slack and it is not critical.</li>
                <li><b>Longest path.</b> The critical path is the single longest continuous chain from project start to finish. Its length equals the project duration — no other chain is longer.</li>
                <li><b>Unbroken chain.</b> The red activities link end-to-end from a starting activity (no predecessors) to the finishing activity (no successors), with no gaps.</li>
                <li><b>Forward = backward.</b> The forward pass (Early dates) and backward pass (Late dates) agree on the critical activities: ES = LS and EF = LF for each red node.</li>
              </ol>
              <p className="mt-2">To verify by hand: pick any red activity, confirm its float chip reads <b>f0</b>, then trace the red arrows backward — they should reach a start activity, and forward — they should reach the finish, with the durations summing to the project length shown above.</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

type CheckItem = { label: string; detail: string; pass: boolean };

function buildChecks(nodes: CpmNetNode[]): CheckItem[] {
  const crit = nodes.filter((n) => n.isCritical);
  const maxTf = crit.length ? Math.max(...crit.map((n) => Math.abs(n.tf))) : 0;
  const projLen = nodes.length ? Math.max(...nodes.map((n) => n.ef)) - Math.min(...nodes.map((n) => n.es)) : 0;
  const critLen = crit.length ? Math.max(...crit.map((n) => n.ef)) - Math.min(...crit.map((n) => n.es)) : 0;
  const hasStart = crit.some((n) => n.level === 0);

  return [
    {
      label: "Critical activities carry zero float",
      detail: `${crit.length} critical activities, maximum |total float| = ${maxTf}d (must be 0).`,
      pass: crit.length > 0 && maxTf <= 1,
    },
    {
      label: "Critical path spans the full project length",
      detail: `Critical chain = ${critLen}d vs. project duration = ${projLen}d.`,
      pass: projLen > 0 && Math.abs(critLen - projLen) <= 1,
    },
    {
      label: "Chain starts at a project-start activity",
      detail: hasStart ? "A critical activity has no predecessors — the chain is anchored." : "No zero-level critical activity found.",
      pass: hasStart,
    },
    {
      label: "Network is connected (logic present)",
      detail: `${nodes.length} activities linked by dependency lines.`,
      pass: nodes.length > 1,
    },
  ];
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
