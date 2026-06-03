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

export function meetingTypeLabel(t: string): string {
  return (TYPE_LABEL as Record<string, string>)[t] ?? t;
}
