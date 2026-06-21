import { useMemo, useRef } from "react";
import { differenceInCalendarDays, addMonths, startOfMonth, format } from "date-fns";
import { computeRowState, sectionDerived, projectBounds, type L2Task, type Status } from "@/lib/gantt-utils";
import { parsePredecessors } from "@/lib/cpm";

type Props = {
  tasks: L2Task[];
  statusMap: Map<string, Status>;
  expanded: Set<string>;
  onTaskClick?: (t: L2Task) => void;
  visibleTasks: L2Task[];
  rowHeight?: number;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  onBodyVerticalScroll?: (scrollTop: number) => void;
  /** When provided, activities in this set are rendered as critical (driving) path. */
  criticalIds?: Set<string>;
  showCritical?: boolean;
  /** Show Primavera/MS-Project style predecessor dependency arrows (default true). */
  showDependencies?: boolean;
};

type Placed = {
  t: L2Task;
  i: number;
  yc: number;          // row vertical centre
  barTop: number;      // top of the planned bar
  barH: number;
  plannedX: number;    // left of planned bar
  plannedEndX: number; // right of planned bar
  hasPlanned: boolean;
  isMilestone: boolean;
};

export function GanttChart({ tasks, statusMap, onTaskClick, visibleTasks, rowHeight = 32, bodyRef: externalBodyRef, onBodyVerticalScroll, criticalIds, showCritical, showDependencies = true }: Props) {
  const { start: pStart, end: pEnd } = useMemo(() => projectBounds(tasks), [tasks]);
  const totalDays = Math.max(differenceInCalendarDays(pEnd, pStart), 1) + 14;
  const pxPerDay = 3.2;
  const width = totalDays * pxPerDay;
  const today = new Date();
  const todayX = differenceInCalendarDays(today, pStart) * pxPerDay;

  // monthly grid
  const months: { x: number; label: string }[] = [];
  let cursor = startOfMonth(pStart);
  while (cursor <= pEnd) {
    const x = differenceInCalendarDays(cursor, pStart) * pxPerDay;
    months.push({ x, label: format(cursor, "MMM yy") });
    cursor = addMonths(cursor, 1);
  }

  const headerRef = useRef<HTMLDivElement>(null);
  const internalBodyRef = useRef<HTMLDivElement>(null);
  const bodyRef = externalBodyRef ?? internalBodyRef;
  // sync horizontal scroll with header and report vertical scroll to parent
  const onBodyScroll = () => {
    if (headerRef.current && bodyRef.current) headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    if (bodyRef.current) onBodyVerticalScroll?.(bodyRef.current.scrollTop);
  };

  const height = visibleTasks.length * rowHeight;

  // ---- Geometry for every visible row (shared by bars + dependency arrows) ----
  const placed = useMemo<Placed[]>(() => {
    return visibleTasks.map((t, i) => {
      const st = statusMap.get(t.id);
      const cs = computeRowState(t, st, today);
      const y = i * rowHeight;
      const isMilestone = t.duration_days === 0;
      const barH = t.is_section ? 6 : 10;
      const barTop = y + (rowHeight - barH) / 2 - 2;
      const plannedX = cs.plannedStart ? differenceInCalendarDays(cs.plannedStart, pStart) * pxPerDay : 0;
      const plannedW = cs.plannedStart && cs.plannedEnd ? Math.max(differenceInCalendarDays(cs.plannedEnd, cs.plannedStart) * pxPerDay, 2) : 0;
      return {
        t, i,
        yc: y + rowHeight / 2,
        barTop, barH,
        plannedX,
        plannedEndX: plannedX + plannedW,
        hasPlanned: !!(cs.plannedStart && cs.plannedEnd),
        isMilestone,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTasks, statusMap, rowHeight, pStart]);

  // ---- Predecessor dependency arrows (Finish→Start elbow connectors) ----
  const deps = useMemo(() => {
    if (!showDependencies) return [] as { path: string; crit: boolean; key: string }[];
    const bySort = new Map<number, Placed>();
    for (const p of placed) bySort.set(p.t.sort_order, p);
    const stub = 9;
    const out: { path: string; crit: boolean; key: string }[] = [];
    for (const succ of placed) {
      const rels = parsePredecessors(succ.t.predecessors);
      for (const r of rels) {
        const pred = bySort.get(r.act);
        if (!pred || pred === succ) continue;
        if (!pred.hasPlanned || !succ.hasPlanned) continue;
        const px = pred.plannedEndX, py = pred.yc;       // predecessor finish
        const qx = succ.plannedX, qy = succ.yc;          // successor start
        let path: string;
        if (qx >= px + stub) {
          path = `M ${px} ${py} L ${px + stub} ${py} L ${px + stub} ${qy} L ${qx} ${qy}`;
        } else {
          const midY = py < qy ? py + rowHeight / 2 : py - rowHeight / 2;
          path = `M ${px} ${py} L ${px + stub} ${py} L ${px + stub} ${midY} L ${qx - stub} ${midY} L ${qx - stub} ${qy} L ${qx} ${qy}`;
        }
        const crit = !!showCritical && !!criticalIds?.has(pred.t.id) && !!criticalIds?.has(succ.t.id);
        out.push({ path, crit, key: `${pred.t.id}->${succ.t.id}` });
      }
    }
    // critical arrows drawn last (on top)
    return out.sort((a, b) => Number(a.crit) - Number(b.crit));
  }, [placed, showDependencies, showCritical, criticalIds, rowHeight]);

  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-card/40">
      {/* timeline header */}
      <div ref={headerRef} className="overflow-hidden border-b border-border bg-sidebar/60">
        <svg width={width} height={32} className="block">
          {months.map((m, i) => (
            <g key={i}>
              <line x1={m.x} x2={m.x} y1={0} y2={32} stroke="var(--border)" />
              <text x={m.x + 4} y={20} fontSize={10} fill="var(--muted-foreground)" className="font-mono">{m.label}</text>
            </g>
          ))}
          {todayX >= 0 && todayX <= width && (
            <line x1={todayX} x2={todayX} y1={0} y2={32} stroke="var(--primary)" strokeWidth={1.5} />
          )}
        </svg>
      </div>
      {/* body */}
      <div ref={bodyRef} onScroll={onBodyScroll} className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
        <svg width={width} height={height} className="block">
          <defs>
            <marker id="gantt-dep-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--muted-foreground)" />
            </marker>
            <marker id="gantt-dep-arrow-crit" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--status-red)" />
            </marker>
          </defs>
          {/* row backgrounds */}
          {visibleTasks.map((t, i) => (
            <rect key={`bg-${t.id}`} x={0} y={i * rowHeight} width={width} height={rowHeight}
              fill={i % 2 ? "color-mix(in oklab, var(--card) 60%, transparent)" : "transparent"} />
          ))}
          {/* month gridlines */}
          {months.map((m, i) => (
            <line key={`grid-${i}`} x1={m.x} x2={m.x} y1={0} y2={height} stroke="var(--border)" strokeOpacity={0.4} />
          ))}
          {/* today line */}
          {todayX >= 0 && todayX <= width && (
            <line x1={todayX} x2={todayX} y1={0} y2={height} stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 3" />
          )}

          {/* dependency (predecessor) connectors */}
          {deps.map((d) => (
            <path
              key={d.key}
              d={d.path}
              fill="none"
              stroke={d.crit ? "var(--status-red)" : "var(--muted-foreground)"}
              strokeWidth={d.crit ? 1.8 : 1}
              strokeOpacity={d.crit ? 0.95 : 0.4}
              markerEnd={`url(#${d.crit ? "gantt-dep-arrow-crit" : "gantt-dep-arrow"})`}
            />
          ))}

          {/* bars */}
          {placed.map((pl) => {
            const t = pl.t;
            const st = statusMap.get(t.id);
            const cs = computeRowState(t, st, today);
            const pStartD = cs.plannedStart, pEndD = cs.plannedEnd;
            // For section rows, derive actual dates and % from leaf children
            const derived = t.is_section ? sectionDerived(tasks, statusMap, t.wbs_code) : null;
            const aStartD = derived ? derived.actual_start : cs.actualStart;
            const aEndD = derived ? derived.actual_finish ?? (derived.actual_start ? today : null) : (cs.actualEnd ?? (cs.actualStart ? today : null));
            const effPct = derived ? derived.pct : cs.pct;
            const isMilestone = pl.isMilestone;
            const barH = pl.barH;
            const yPlanned = pl.barTop;
            const yActual = pl.barTop + 8;

            const plannedX = pl.plannedX;
            const plannedW = pl.plannedEndX - pl.plannedX;
            const actualX = aStartD ? differenceInCalendarDays(aStartD, pStart) * pxPerDay : 0;
            const actualW = aStartD && aEndD ? Math.max(differenceInCalendarDays(aEndD, aStartD) * pxPerDay, 2) : 0;

            const barColor = cs.status === "completed" ? "var(--gantt-done)" : cs.status === "delayed" ? "var(--gantt-delayed)" : "var(--gantt-actual)";
            const isCrit = !!showCritical && !!criticalIds?.has(t.id);

            if (isMilestone && pStartD) {
              const mx = plannedX;
              const my = pl.yc;
              const fill = aStartD ? "var(--gantt-done)" : "var(--gantt-planned)";
              return (
                <g key={t.id} onClick={() => onTaskClick?.(t)} className="cursor-pointer">
                  <polygon points={`${mx-6},${my} ${mx},${my-6} ${mx+6},${my} ${mx},${my+6}`} fill={fill} stroke={isCrit ? "var(--status-red)" : "var(--primary)"} strokeWidth={isCrit ? 2 : 1} />
                </g>
              );
            }

            return (
              <g key={t.id} onClick={() => onTaskClick?.(t)} className="cursor-pointer">
                {isCrit && pStartD && pEndD && (
                  <rect x={plannedX - 1.5} y={yPlanned - 1.5} width={plannedW + 3} height={barH + 3}
                    fill="none" stroke="var(--status-red)" strokeWidth={1.5} rx={3} opacity={0.9} />
                )}
                {pStartD && pEndD && (
                  <rect x={plannedX} y={yPlanned} width={plannedW} height={barH}
                    fill={t.is_section ? "var(--primary)" : "var(--gantt-planned)"} opacity={t.is_section ? 0.5 : 0.85} rx={2} />
                )}
                {aStartD && (
                  <rect x={actualX} y={yActual} width={actualW} height={barH - 4} fill={isCrit ? "var(--status-red)" : barColor} rx={2}>
                    <title>{`Actual: ${format(aStartD, "dd-MMM")} → ${aEndD ? format(aEndD, "dd-MMM") : "ongoing"}`}</title>
                  </rect>
                )}
                {effPct > 0 && effPct < 100 && aStartD && (
                  <rect x={actualX} y={yActual} width={(actualW * effPct) / 100} height={barH - 4}
                    fill="var(--primary)" opacity={0.6} rx={2} />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
