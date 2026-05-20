import { useMemo, useRef, useEffect, useState } from "react";
import { differenceInCalendarDays, addMonths, startOfMonth, format } from "date-fns";
import { computeRowState, sectionDerived, parseD, projectBounds, type L2Task, type Status } from "@/lib/gantt-utils";

type Props = {
  tasks: L2Task[];
  statusMap: Map<string, Status>;
  expanded: Set<string>;
  onTaskClick?: (t: L2Task) => void;
  visibleTasks: L2Task[];
  rowHeight?: number;
};

export function GanttChart({ tasks, statusMap, onTaskClick, visibleTasks, rowHeight = 32 }: Props) {
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
  const bodyRef = useRef<HTMLDivElement>(null);
  // sync horizontal scroll
  const onBodyScroll = () => { if (headerRef.current && bodyRef.current) headerRef.current.scrollLeft = bodyRef.current.scrollLeft; };

  const height = visibleTasks.length * rowHeight;

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
          {/* bars */}
          {visibleTasks.map((t, i) => {
            const st = statusMap.get(t.id);
            const cs = computeRowState(t, st, today);
            const y = i * rowHeight;
            const pStartD = cs.plannedStart, pEndD = cs.plannedEnd;
            // For section rows, derive actual dates and % from leaf children
            const derived = t.is_section ? sectionDerived(tasks, statusMap, t.wbs_code) : null;
            const aStartD = derived ? derived.actual_start : cs.actualStart;
            const aEndD = derived ? derived.actual_finish ?? (derived.actual_start ? today : null) : (cs.actualEnd ?? (cs.actualStart ? today : null));
            const effPct = derived ? derived.pct : cs.pct;
            const yPlanned = y + (rowHeight - barH) / 2 - 2;
            const yActual = y + (rowHeight - barH) / 2 + 6;

            const plannedX = pStartD ? differenceInCalendarDays(pStartD, pStart) * pxPerDay : 0;
            const plannedW = pStartD && pEndD ? Math.max(differenceInCalendarDays(pEndD, pStartD) * pxPerDay, 2) : 0;
            const actualX = aStartD ? differenceInCalendarDays(aStartD, pStart) * pxPerDay : 0;
            const actualW = aStartD && aEndD ? Math.max(differenceInCalendarDays(aEndD, aStartD) * pxPerDay, 2) : 0;

            const barColor = cs.status === "completed" ? "var(--gantt-done)" : cs.status === "delayed" ? "var(--gantt-delayed)" : "var(--gantt-actual)";

            if (isMilestone && pStartD) {
              const mx = plannedX;
              const my = y + rowHeight / 2;
              const fill = aStartD ? "var(--gantt-done)" : "var(--gantt-planned)";
              return (
                <g key={t.id} onClick={() => onTaskClick?.(t)} className="cursor-pointer">
                  <polygon points={`${mx-6},${my} ${mx},${my-6} ${mx+6},${my} ${mx},${my+6}`} fill={fill} stroke="var(--primary)" />
                </g>
              );
            }

            return (
              <g key={t.id} onClick={() => onTaskClick?.(t)} className="cursor-pointer">
                {pStartD && pEndD && (
                  <rect x={plannedX} y={yPlanned} width={plannedW} height={barH}
                    fill={t.is_section ? "var(--primary)" : "var(--gantt-planned)"} opacity={t.is_section ? 0.5 : 0.85} rx={2} />
                )}
                {aStartD && (
                  <rect x={actualX} y={yActual} width={actualW} height={barH - 4} fill={barColor} rx={2}>
                    <title>{`Actual: ${format(aStartD, "dd-MMM")} → ${aEndD ? format(aEndD, "dd-MMM") : "ongoing"}`}</title>
                  </rect>
                )}
                {cs.pct > 0 && cs.pct < 100 && aStartD && (
                  <rect x={actualX} y={yActual} width={(actualW * cs.pct) / 100} height={barH - 4}
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
