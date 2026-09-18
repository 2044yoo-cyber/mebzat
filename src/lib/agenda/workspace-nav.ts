import {
  Activity, Banknote, Boxes, Building2, CalendarRange, ClipboardCheck,
  ClipboardList, Coins, Contact, FileSignature, FileSpreadsheet, FileStack,
  FileText, Gavel, HardHat, Image as ImageIcon, LayoutDashboard, ListChecks,
  type LucideIcon, MessageCircleQuestion, Package, PencilRuler, Receipt,
  Rotate3d, ScrollText, Settings, ShoppingCart, Timer, TriangleAlert, Users,
  Wallet,
} from "lucide-react";

/**
 * The project workspace's own navigation.
 *
 * Thirty sections is too many for one row of tabs and far too many for one
 * screen, so they are grouped the way a project is actually run: what is
 * happening now, what is drawn and written, what is being asked and answered,
 * what is being checked, and what it costs. A project manager looking for the
 * punch list should not have to read the word "Commitments" on the way.
 *
 * `phase` is honest rather than decorative. Agenda is being built in stages,
 * and a section whose screen does not exist yet is shown as coming rather than
 * linked to an empty page — a dead link is a worse answer than "not yet".
 */

export type WorkspaceSection = {
  id: string;
  /** The path segment under /agenda/projects/[id]. Empty string is Overview. */
  segment: string;
  label: string;
  icon: LucideIcon;
  /** Which build stage brings this screen. 1 means it is here now. */
  phase: 1 | 2 | 3 | 4 | 5;
};

export type WorkspaceGroup = {
  id: string;
  label: string;
  sections: WorkspaceSection[];
};

export const WORKSPACE_GROUPS: WorkspaceGroup[] = [
  {
    id: "now",
    label: "Now",
    sections: [
      { id: "overview", segment: "", label: "Overview", icon: LayoutDashboard, phase: 1 },
      { id: "tasks", segment: "tasks", label: "Tasks", icon: ListChecks, phase: 1 },
      { id: "schedule", segment: "schedule", label: "Schedule", icon: CalendarRange, phase: 2 },
      { id: "daily-logs", segment: "daily-logs", label: "Daily Logs", icon: ScrollText, phase: 2 },
      { id: "activity", segment: "activity", label: "Activity Log", icon: Activity, phase: 1 },
    ],
  },
  {
    id: "records",
    label: "Drawings and documents",
    sections: [
      { id: "drawings", segment: "drawings", label: "Drawings", icon: PencilRuler, phase: 1 },
      { id: "documents", segment: "documents", label: "Documents", icon: FileStack, phase: 1 },
      { id: "photos", segment: "photos", label: "Photos", icon: ImageIcon, phase: 2 },
      { id: "progress-360", segment: "progress-360", label: "360 Progress", icon: Rotate3d, phase: 3 },
    ],
  },
  {
    id: "questions",
    label: "Questions and approvals",
    sections: [
      { id: "rfis", segment: "rfis", label: "RFIs", icon: MessageCircleQuestion, phase: 2 },
      { id: "submittals", segment: "submittals", label: "Submittals", icon: ClipboardCheck, phase: 2 },
      { id: "meetings", segment: "meetings", label: "Meetings", icon: Users, phase: 2 },
    ],
  },
  {
    id: "quality",
    label: "Quality and safety",
    sections: [
      { id: "inspections", segment: "inspections", label: "Inspections", icon: ClipboardList, phase: 3 },
      { id: "observations", segment: "observations", label: "Observations", icon: TriangleAlert, phase: 3 },
      { id: "punch-list", segment: "punch-list", label: "Punch List", icon: ClipboardCheck, phase: 3 },
      { id: "forms", segment: "forms", label: "Forms", icon: FileText, phase: 3 },
    ],
  },
  {
    id: "money",
    label: "Cost and contracts",
    sections: [
      { id: "boq", segment: "boq", label: "BOQ", icon: FileSpreadsheet, phase: 4 },
      { id: "budget", segment: "budget", label: "Budget", icon: Wallet, phase: 4 },
      { id: "contracts", segment: "contracts", label: "Contracts", icon: FileSignature, phase: 4 },
      { id: "commitments", segment: "commitments", label: "Commitments", icon: Coins, phase: 4 },
      { id: "purchase-orders", segment: "purchase-orders", label: "Purchase Orders", icon: ShoppingCart, phase: 4 },
      { id: "change-events", segment: "change-events", label: "Change Events", icon: Boxes, phase: 4 },
      { id: "change-orders", segment: "change-orders", label: "Change Orders", icon: FileSignature, phase: 4 },
      { id: "invoices", segment: "invoices", label: "Invoices", icon: Receipt, phase: 5 },
      { id: "payments", segment: "payments", label: "Payments", icon: Banknote, phase: 5 },
      { id: "bidding", segment: "bidding", label: "Bidding", icon: Gavel, phase: 5 },
    ],
  },
  {
    id: "people",
    label: "People and plant",
    sections: [
      { id: "directory", segment: "directory", label: "Directory", icon: Contact, phase: 1 },
      { id: "timesheets", segment: "timesheets", label: "Timesheets", icon: Timer, phase: 5 },
      { id: "equipment", segment: "equipment", label: "Equipment", icon: Package, phase: 5 },
      { id: "reports", segment: "reports", label: "Reports", icon: Building2, phase: 5 },
      { id: "settings", segment: "settings", label: "Settings", icon: Settings, phase: 1 },
    ],
  },
];

/** Flat, for lookups and for the check that the routes and the menu agree. */
export const WORKSPACE_SECTIONS: WorkspaceSection[] = WORKSPACE_GROUPS.flatMap(
  (group) => group.sections,
);

/** The sections that have a screen today. */
export const LIVE_SECTIONS = WORKSPACE_SECTIONS.filter(
  (section) => section.phase === 1,
);

export function sectionHref(projectId: string, segment: string): string {
  return segment
    ? `/agenda/projects/${projectId}/${segment}`
    : `/agenda/projects/${projectId}`;
}

/** Which section a pathname is in, for highlighting. */
export function activeSection(projectId: string, pathname: string): string {
  const base = `/agenda/projects/${projectId}`;
  if (pathname === base || pathname === `${base}/`) return "overview";
  const rest = pathname.slice(base.length + 1).split("/")[0] ?? "";
  return (
    WORKSPACE_SECTIONS.find((section) => section.segment === rest)?.id ??
    "overview"
  );
}

// HardHat is imported for the project header, which is in a sibling file and
// shares this module's icon vocabulary.
export const PROJECT_ICON = HardHat;
