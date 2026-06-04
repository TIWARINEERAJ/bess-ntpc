import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  differenceInCalendarDays,
  parseISO,
  format,
} from "date-fns";
import { MEETING_TYPES, MEETING_FREQUENCY, type MeetingType, type Frequency } from "@/lib/meeting-types";

export type ConductedMeeting = { meeting_type: string; meeting_date: string };
export type PlannedMeeting = { meeting_type: string; planned_date: string; status: string };

export type CadenceState = "done" | "planned" | "due" | "overdue";

export type CadenceRow = {
  type: MeetingType;
  frequency: Frequency;
  /** Expected number of occurrences in the selected month. */
  required: number;
  /** Actual meetings conducted in the selected month. */
  conducted: number;
  /** Future planned (not yet conducted) meetings in the selected month. */
  planned: number;
  /** Most recent conducted date (any time, ISO) or null. */
  lastConducted: string | null;
  /** Next upcoming planned date in the month (ISO) or null. */
  nextPlanned: string | null;
  /** Whether the current week's weekly slot is covered (weekly only). */
  thisWeekDone: boolean;
  state: CadenceState;
};

/** Number of ISO weeks that start within the given month — used for weekly cadence targets. */
function weeksInMonth(monthRef: Date): number {
  const start = startOfMonth(monthRef);
  const end = endOfMonth(monthRef);
  let count = 0;
  let cursor = startOfWeek(start, { weekStartsOn: 1 });
  // advance to first week whose start is within the month, or whose interval overlaps
  while (cursor <= end) {
    if (cursor >= start || endOfWeek(cursor, { weekStartsOn: 1 }) >= start) count++;
    cursor = new Date(cursor.getTime() + 7 * 24 * 3600 * 1000);
  }
  return Math.max(1, count);
}

export function monthLabel(monthRef: Date): string {
  return format(monthRef, "MMMM yyyy");
}

/**
 * Compute per-meeting-type cadence compliance for a given month.
 * `today` lets callers freeze "now" for testing; defaults to current date.
 */
export function computeCadence(
  meetings: ConductedMeeting[],
  plans: PlannedMeeting[],
  monthRef: Date,
  today: Date = new Date()
): CadenceRow[] {
  const mStart = startOfMonth(monthRef);
  const mEnd = endOfMonth(monthRef);
  const isCurrentMonth =
    monthRef.getMonth() === today.getMonth() && monthRef.getFullYear() === today.getFullYear();
  const isPastMonth = mEnd < startOfDay(today);

  const wkStart = startOfWeek(today, { weekStartsOn: 1 });
  const wkEnd = endOfWeek(today, { weekStartsOn: 1 });

  return MEETING_TYPES.map((type) => {
    const freq = MEETING_FREQUENCY[type];
    const required = freq === "weekly" ? weeksInMonth(monthRef) : 1;

    const conductedDates = meetings
      .filter((m) => m.meeting_type === type)
      .map((m) => parseISO(m.meeting_date))
      .filter((d) => !isNaN(d.getTime()));

    const conductedThisMonth = conductedDates.filter((d) =>
      isWithinInterval(d, { start: mStart, end: mEnd })
    );
    const conducted = conductedThisMonth.length;
    const lastConducted =
      conductedDates.length > 0
        ? format(conductedDates.sort((a, b) => b.getTime() - a.getTime())[0], "yyyy-MM-dd")
        : null;

    const plannedDates = plans
      .filter((p) => p.meeting_type === type && (p.status ?? "planned") === "planned")
      .map((p) => parseISO(p.planned_date))
      .filter((d) => !isNaN(d.getTime()));

    const plannedThisMonth = plannedDates
      .filter((d) => isWithinInterval(d, { start: mStart, end: mEnd }) && d >= startOfDay(today))
      .sort((a, b) => a.getTime() - b.getTime());
    const planned = plannedThisMonth.length;
    const nextPlanned = plannedThisMonth.length > 0 ? format(plannedThisMonth[0], "yyyy-MM-dd") : null;

    const thisWeekDone =
      freq === "weekly" &&
      isCurrentMonth &&
      conductedDates.some((d) => isWithinInterval(d, { start: wkStart, end: wkEnd }));

    let state: CadenceState;
    if (conducted >= required) {
      state = "done";
    } else if (nextPlanned) {
      state = "planned";
    } else if (isPastMonth) {
      state = "overdue";
    } else if (isCurrentMonth) {
      const daysLeft = differenceInCalendarDays(mEnd, today);
      // weekly: overdue if this week's slot missed; monthly: overdue in last week of month
      if (freq === "weekly") {
        state = thisWeekDone ? "due" : daysLeft <= 2 ? "overdue" : "due";
      } else {
        state = daysLeft <= 7 ? "overdue" : "due";
      }
    } else {
      state = "due"; // future month
    }

    return {
      type,
      frequency: freq,
      required,
      conducted,
      planned,
      lastConducted,
      nextPlanned,
      thisWeekDone,
      state,
    };
  });
}

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

export const STATE_META: Record<CadenceState, { label: string; tone: string }> = {
  done: { label: "Conducted", tone: "var(--status-green)" },
  planned: { label: "Planned", tone: "var(--status-amber)" },
  due: { label: "Due", tone: "var(--status-amber)" },
  overdue: { label: "Overdue", tone: "var(--status-red)" },
};
