export type MeetingType =
  | "weekly"
  | "monthly"
  | "hop_vendor"
  | "management"
  | "prt"
  | "crm"
  | "tcm";

export const MEETING_TYPES: MeetingType[] = [
  "weekly",
  "monthly",
  "hop_vendor",
  "management",
  "prt",
  "crm",
  "tcm",
];

export const TYPE_LABEL: Record<MeetingType, string> = {
  weekly: "Weekly Review",
  monthly: "Monthly Review",
  hop_vendor: "HOP Review with Vendors",
  management: "Management Review",
  prt: "Project Review Team (PRT)",
  crm: "CRM Coordination Review (Vendors)",
  tcm: "Technical Coordination Meeting (TCM)",
};

/** Short label for compact UI (badges, dashboard) */
export const TYPE_SHORT: Record<MeetingType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  hop_vendor: "HOP",
  management: "Management",
  prt: "PRT",
  crm: "CRM",
  tcm: "TCM",
};

export type Frequency = "weekly" | "monthly";

/** How often each meeting must be conducted, per station. */
export const MEETING_FREQUENCY: Record<MeetingType, Frequency> = {
  weekly: "weekly",
  monthly: "monthly",
  hop_vendor: "monthly",
  management: "monthly",
  prt: "monthly",
  crm: "monthly",
  tcm: "monthly",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
};

/** One-line description of each meeting's purpose, used on the management page. */
export const TYPE_PURPOSE: Record<MeetingType, string> = {
  weekly: "Site progress & next-7-day critical path",
  monthly: "Physical/financial progress vs L2 baseline",
  hop_vendor: "Head-of-Project review of vendor commitments",
  management: "Portfolio-level review & escalations",
  prt: "Project Review Team — schedule health & decisions",
  crm: "Coordination with vendors on L2 commitments",
  tcm: "Engineering–vendor technical coordination",
};

export function meetingTypeLabel(t: string): string {
  return (TYPE_LABEL as Record<string, string>)[t] ?? t;
}
