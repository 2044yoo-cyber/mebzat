/**
 * Agenda's vocabulary.
 *
 * Client-safe: the roles, the record kinds and the labels are needed by forms
 * and badges, and none of them are secrets. What *is* sensitive — who may read
 * the ledger — is decided in the database, never here. A permission checked in
 * a component is a permission that is not enforced.
 */

export type AgendaRole =
  | "client"
  | "project_manager"
  | "contractor"
  | "architect"
  | "engineer"
  | "interior_designer"
  | "quantity_surveyor"
  | "supervisor"
  | "supplier"
  | "employee"
  | "administrator";

export const AGENDA_ROLES: {
  value: AgendaRole;
  label: string;
  blurb: string;
  /** What the client usually grants this role, as the form's starting point. */
  suggests: {
    finance?: boolean;
    meetings?: boolean;
    contracts?: boolean;
    approve?: boolean;
  };
}[] = [
  {
    value: "client",
    label: "Client",
    blurb: "Owns the project and controls who sees what.",
    suggests: { finance: true, meetings: true, contracts: true, approve: true },
  },
  {
    value: "project_manager",
    label: "Project Manager",
    blurb: "Runs the job day to day.",
    suggests: { finance: true, meetings: true, contracts: true, approve: true },
  },
  {
    value: "contractor",
    label: "Contractor",
    blurb: "Builds it. Records the daily log.",
    suggests: { meetings: true },
  },
  {
    value: "architect",
    label: "Architect",
    blurb: "Design authority and drawings.",
    suggests: { meetings: true, approve: true },
  },
  {
    value: "engineer",
    label: "Engineer",
    blurb: "Structural, electrical, mechanical.",
    suggests: { meetings: true, approve: true },
  },
  {
    value: "interior_designer",
    label: "Interior Designer",
    blurb: "Finishes, furniture, materials.",
    suggests: { meetings: true },
  },
  {
    value: "quantity_surveyor",
    label: "Quantity Surveyor",
    blurb: "Measures and values the work.",
    suggests: { finance: true, meetings: true, contracts: true },
  },
  {
    value: "supervisor",
    label: "Supervisor",
    blurb: "On site. Records what happened.",
    suggests: { meetings: true },
  },
  {
    value: "supplier",
    label: "Supplier",
    blurb: "Limited: sees only what it is given.",
    suggests: {},
  },
  {
    value: "employee",
    label: "Invited Employee",
    blurb: "A named person on one of the above teams.",
    suggests: {},
  },
  {
    value: "administrator",
    label: "Administrator",
    blurb: "Full access, including the roster.",
    suggests: { finance: true, meetings: true, contracts: true, approve: true },
  },
];

export function roleLabel(role: AgendaRole): string {
  return AGENDA_ROLES.find((entry) => entry.value === role)?.label ?? role;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";

export const TASK_STATUSES: {
  value: TaskStatus;
  label: string;
  tone: "idle" | "active" | "warn" | "done";
}[] = [
  { value: "todo", label: "To do", tone: "idle" },
  { value: "in_progress", label: "In progress", tone: "active" },
  { value: "blocked", label: "Blocked", tone: "warn" },
  { value: "review", label: "In review", tone: "active" },
  { value: "done", label: "Done", tone: "done" },
  { value: "cancelled", label: "Cancelled", tone: "idle" },
];

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const TASK_PRIORITIES: {
  value: TaskPriority;
  label: string;
  tone: string;
}[] = [
  { value: "low", label: "Low", tone: "text-muted-foreground" },
  { value: "normal", label: "Normal", tone: "text-foreground" },
  { value: "high", label: "High", tone: "text-amber-600 dark:text-amber-400" },
  { value: "urgent", label: "Urgent", tone: "text-rose-600 dark:text-rose-400" },
];

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export type LedgerKind =
  | "material_purchase"
  | "labour_payment"
  | "equipment_rental"
  | "supplier_payment"
  | "cash_expense"
  | "transport"
  | "fuel"
  | "unexpected_cost"
  | "variation_order"
  | "client_payment"
  | "other";

export const LEDGER_KINDS: {
  value: LedgerKind;
  label: string;
  /** -1 money leaves the project, +1 money arrives. */
  direction: -1 | 1;
}[] = [
  { value: "material_purchase", label: "Material purchase", direction: -1 },
  { value: "labour_payment", label: "Labour payment", direction: -1 },
  { value: "equipment_rental", label: "Equipment rental", direction: -1 },
  { value: "supplier_payment", label: "Supplier payment", direction: -1 },
  { value: "cash_expense", label: "Cash expense", direction: -1 },
  { value: "transport", label: "Transport", direction: -1 },
  { value: "fuel", label: "Fuel", direction: -1 },
  { value: "unexpected_cost", label: "Unexpected cost", direction: -1 },
  { value: "variation_order", label: "Variation order", direction: -1 },
  { value: "client_payment", label: "Client payment received", direction: 1 },
  { value: "other", label: "Other", direction: -1 },
];

export function ledgerKindLabel(kind: LedgerKind): string {
  return LEDGER_KINDS.find((entry) => entry.value === kind)?.label ?? kind;
}

export function directionFor(kind: LedgerKind): -1 | 1 {
  return LEDGER_KINDS.find((entry) => entry.value === kind)?.direction ?? -1;
}

export type LedgerStatus = "paid" | "outstanding" | "void";

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type FileKind =
  | "image"
  | "video"
  | "voice"
  | "pdf"
  | "cad"
  | "model"
  | "spreadsheet"
  | "document"
  | "other";

/**
 * What kind of file this is, from its name and type.
 *
 * Extension first, because the MIME type for a DWG or an RVT is usually
 * `application/octet-stream` — the browser has no idea, and the extension is
 * the only thing that does.
 */
export function fileKindOf(name: string, mime?: string): FileKind {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";

  if (["dwg", "dxf"].includes(extension)) return "cad";
  if (["rvt", "rfa", "skp", "ifc", "3ds", "obj"].includes(extension)) {
    return "model";
  }
  if (["xls", "xlsx", "csv"].includes(extension)) return "spreadsheet";
  if (["doc", "docx", "odt", "rtf"].includes(extension)) return "document";
  if (extension === "pdf") return "pdf";

  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "voice";

  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(extension)) {
    return "image";
  }
  if (["mp4", "mov", "webm", "avi"].includes(extension)) return "video";
  if (["mp3", "m4a", "ogg", "wav", "webm"].includes(extension)) return "voice";

  return "other";
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: "Photo",
  video: "Video",
  voice: "Voice note",
  pdf: "PDF",
  cad: "CAD drawing",
  model: "3D model",
  spreadsheet: "Spreadsheet",
  document: "Document",
  other: "File",
};

/** Everything the uploader accepts, for the file input. */
export const ACCEPTED_FILES = [
  "image/*",
  "video/*",
  "audio/*",
  ".pdf",
  ".dwg",
  ".dxf",
  ".rvt",
  ".rfa",
  ".skp",
  ".ifc",
  ".xls",
  ".xlsx",
  ".csv",
  ".doc",
  ".docx",
].join(",");

// ---------------------------------------------------------------------------
// Timeline and reminders
// ---------------------------------------------------------------------------

export type EventKind =
  | "log"
  | "task_created"
  | "task_started"
  | "task_completed"
  | "ledger"
  | "meeting"
  | "decision"
  | "attachment"
  | "member"
  | "reminder"
  | "milestone";

export type ReminderKind =
  | "late_task"
  | "meeting"
  | "inspection"
  | "material_order"
  | "payment"
  | "warranty"
  | "deadline";

export const REMINDER_KINDS: { value: ReminderKind; label: string }[] = [
  { value: "late_task", label: "Late task" },
  { value: "meeting", label: "Meeting" },
  { value: "inspection", label: "Inspection" },
  { value: "material_order", label: "Material order" },
  { value: "payment", label: "Payment" },
  { value: "warranty", label: "Warranty" },
  { value: "deadline", label: "Deadline" },
];

export type Confidentiality = "members" | "finance" | "meetings";

export const WEATHER = [
  "Clear",
  "Partly cloudy",
  "Cloudy",
  "Light rain",
  "Heavy rain",
  "Storm",
  "Windy",
  "Hot",
  "Cold",
] as const;

/** Money, written the way an Ethiopian site office writes it. */
export function birr(amount: number, currency = "ETB"): string {
  return `${amount.toLocaleString("en-ET", { maximumFractionDigits: 2 })} ${currency}`;
}
