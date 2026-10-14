import { z } from "zod";

import type {
  CollabAccessLevel,
  CollabAnnotationKind,
  CollabItemKind,
  CollabThreadStatus,
} from "@/types/database.types";

/**
 * The Collaborative Studio's vocabulary, shared by the browser and the server.
 *
 * Client-safe on purpose: the board, the canvas and the review screen validate
 * what they are about to save with the same schemas the server actions use,
 * so a card the browser accepts is a card the server accepts.
 *
 * Who may do what is decided by the database (0105's `collab_level` and the
 * policies on every table). `can` below says the same thing so the screen
 * offers only what will work — it is never what makes it safe.
 */

export type Level = CollabAccessLevel;
export type ItemKind = CollabItemKind;
export type ThreadStatus = CollabThreadStatus;
export type AnnotationKind = CollabAnnotationKind;

export const LEVELS: { value: Level; label: string; summary: string }[] = [
  { value: "owner", label: "Owner", summary: "Manages the Studio and who may do what" },
  { value: "editor", label: "Editor", summary: "Changes boards, the canvas and markup; assigns work" },
  { value: "commenter", label: "Commenter", summary: "Sees everything and gives feedback" },
  { value: "viewer", label: "Viewer", summary: "Sees everything, changes nothing" },
];

export const can = {
  view: (level: Level | null) => level !== null,
  comment: (level: Level | null) => level === "owner" || level === "editor" || level === "commenter",
  edit: (level: Level | null) => level === "owner" || level === "editor",
  manage: (level: Level | null) => level === "owner",
};

export const THREAD_STATUSES: { value: ThreadStatus; label: string; tone: "open" | "review" | "done" | "warn" }[] = [
  { value: "open", label: "Open", tone: "open" },
  { value: "ready_for_review", label: "Ready for review", tone: "review" },
  { value: "changes_requested", label: "Changes requested", tone: "warn" },
  { value: "resolved", label: "Resolved", tone: "done" },
  { value: "approved", label: "Approved", tone: "done" },
];

export const isClosed = (status: ThreadStatus) => status === "resolved" || status === "approved";

/** Studio task columns, as Agenda's task statuses. */
export const TASK_COLUMNS = [
  { value: "todo", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "In Review" },
  { value: "done", label: "Done" },
] as const;
export type StudioTaskStatus = (typeof TASK_COLUMNS)[number]["value"];

/** Suggested sections for an architecture project. A suggestion, not a rule. */
export const STARTER_SECTIONS = [
  "Concept",
  "Floor Plans",
  "Interior Design",
  "Materials",
  "3D Renders",
  "Client Feedback",
  "Approved Designs",
] as const;

export const BOARD_KINDS = ["text", "note", "image", "document", "link", "checklist", "column", "section"] as const;
export const CANVAS_KINDS = ["sticky", "text", "image", "document", "rect", "ellipse", "line", "arrow", "freehand", "connector", "group"] as const;

export const COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa", "#e5e7eb", "#ffffff"] as const;
export const INKS = ["#0f172a", "#1d4ed8", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#64748b"] as const;

// ---------------------------------------------------------------------------
// What each kind of object holds
// ---------------------------------------------------------------------------

const text = (max: number) => z.string().max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const finite = z.number().finite();
const labels = z.array(text(40)).max(10).optional();
const common = { labels, description: text(2000).optional() };

/** Only web addresses: a `javascript:` link on a card would run on a click. */
export const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Links must start with http:// or https://");

const stroke = { stroke: color.optional(), strokeWidth: finite.min(0.5).max(64).optional() };

export const ITEM_DATA: Record<ItemKind, z.ZodType> = {
  text: z.object({ text: text(10000), fontSize: finite.min(8).max(200).optional(), color: color.optional(), ...common }).strict(),
  note: z.object({ title: text(200).optional(), text: text(10000), color: color.optional(), ...common }).strict(),
  sticky: z.object({ text: text(2000), color: color.optional(), ...common }).strict(),
  image: z.object({ title: text(200).optional(), caption: text(1000).optional(), fileName: text(200).optional(), mimeType: text(120).optional(), ...common }).strict(),
  document: z.object({ title: text(200).optional(), caption: text(1000).optional(), fileName: text(200).optional(), mimeType: text(120).optional(), page: z.number().int().min(1).max(5000).optional(), ...common }).strict(),
  link: z.object({ url: safeUrl, title: text(200).optional(), ...common }).strict(),
  checklist: z
    .object({
      title: text(200).optional(),
      items: z.array(z.object({ id: text(40), text: text(500), done: z.boolean() }).strict()).max(100),
      ...common,
    })
    .strict(),
  column: z.object({ title: text(120), color: color.optional(), ...common }).strict(),
  section: z.object({ title: text(120), color: color.optional(), ...common }).strict(),
  rect: z.object({ fill: color.optional(), text: text(2000).optional(), ...stroke, ...common }).strict(),
  ellipse: z.object({ fill: color.optional(), text: text(2000).optional(), ...stroke, ...common }).strict(),
  // Points relative to the object's x and y, flattened: [x0, y0, x1, y1, …].
  line: z.object({ points: z.array(finite).min(4).max(8).refine((p) => p.length % 2 === 0), ...stroke, ...common }).strict(),
  arrow: z.object({ points: z.array(finite).min(4).max(8).refine((p) => p.length % 2 === 0), ...stroke, ...common }).strict(),
  freehand: z.object({ points: z.array(finite).min(4).max(8000).refine((p) => p.length % 2 === 0), ...stroke, ...common }).strict(),
  connector: z
    .object({ from: z.string().uuid(), to: z.string().uuid(), label: text(200).optional(), arrow: z.boolean().optional(), ...stroke, ...common })
    .strict(),
  group: z.object({ title: text(120).optional(), ...common }).strict(),
};

export function parseItemData(kind: ItemKind, data: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const schema = ITEM_DATA[kind];
  if (!schema) return { ok: false, error: "That is not a kind of object the Studio knows." };
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That object is not valid." };
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

/** The geometry every item has, in world units. */
export const geometry = z.object({
  x: finite.min(-1e7).max(1e7),
  y: finite.min(-1e7).max(1e7),
  w: finite.min(0).max(1e6),
  h: finite.min(0).max(1e6),
  rotation: finite.min(-3600).max(3600),
  z: finite.min(-1e12).max(1e12),
});

export const uuid = z.string().uuid();

/** One change to a board, as the browser sends it. */
export const itemChange = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    id: uuid,
    kind: z.enum([...BOARD_KINDS, ...CANVAS_KINDS] as [ItemKind, ...ItemKind[]]),
    parentId: uuid.nullable().optional(),
    drawingId: uuid.nullable().optional(),
    storagePath: z.string().max(400).nullable().optional(),
    data: z.unknown(),
  }).merge(geometry.partial()),
  z.object({
    op: z.literal("update"),
    id: uuid,
    revision: z.number().int().min(1),
    parentId: uuid.nullable().optional(),
    data: z.unknown().optional(),
  }).merge(geometry.partial()),
  z.object({ op: z.literal("archive"), id: uuid, revision: z.number().int().min(1) }),
  z.object({ op: z.literal("restore"), id: uuid, revision: z.number().int().min(1) }),
]);
export type ItemChange = z.infer<typeof itemChange>;

// ---------------------------------------------------------------------------
// Drawing coordinates
// ---------------------------------------------------------------------------

/** A point on a drawing, as 0..1 across and down its page, whatever size it is shown. */
export function normalise(point: { x: number; y: number }, size: { width: number; height: number }) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clamp(point.x / size.width), y: clamp(point.y / size.height) };
}

/** Back to pixels at the size it is shown now. */
export function denormalise(point: { x: number; y: number }, size: { width: number; height: number }) {
  return { x: point.x * size.width, y: point.y * size.height };
}

export const annotationGeometry: Record<AnnotationKind, z.ZodType> = {
  freehand: z.object({ points: z.array(z.number().min(0).max(1)).min(4).max(8000).refine((p) => p.length % 2 === 0) }).strict(),
  arrow: z.object({ points: z.array(z.number().min(0).max(1)).length(4) }).strict(),
  line: z.object({ points: z.array(z.number().min(0).max(1)).length(4) }).strict(),
  rect: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }).strict(),
  ellipse: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }).strict(),
  text: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), text: text(500) }).strict(),
};

/** Next revision label after the ones a drawing has: A, B, … Z, then AA. */
export function nextRevisionLabel(existing: readonly string[]): string {
  const letters = existing.filter((label) => /^[A-Z]+$/.test(label));
  if (!letters.length) return "A";
  const value = (label: string) => [...label].reduce((sum, char) => sum * 26 + (char.charCodeAt(0) - 64), 0);
  const label = (n: number): string => (n <= 0 ? "" : label(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));
  return label(Math.max(...letters.map(value)) + 1);
}

/** People named with @handle in a comment, among the project's members. */
export function mentionedIn(body: string, members: readonly { id: string; handle: string | null }[]): string[] {
  const handles = new Set([...body.matchAll(/(^|\s)@([a-z0-9_.-]{2,40})/gi)].map((match) => match[2]!.toLowerCase()));
  return members.filter((member) => member.handle && handles.has(member.handle.toLowerCase())).map((member) => member.id);
}

// ---------------------------------------------------------------------------
// Invitation links (0107)
// ---------------------------------------------------------------------------

/**
 * The Agenda roles a link may give. Not `client` or `administrator`: Agenda
 * treats both as owners of the project, and a link is something that gets
 * forwarded. The database refuses them too.
 */
export const INVITE_ROLES = [
  "project_manager", "contractor", "architect", "engineer", "interior_designer",
  "quantity_surveyor", "supervisor", "supplier", "employee",
] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const INVITE_DAYS = [1, 7, 30] as const;
export const INVITE_USES = [1, 5, 25] as const;

/** What the owner chooses for a new link. Commenting, one person, a week, unless they say otherwise. */
export const inviteInput = z.object({
  level: z.enum(["editor", "commenter", "viewer"]).default("commenter"),
  role: z.enum(INVITE_ROLES).default("employee"),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
  maxUses: z.union([z.literal(1), z.literal(5), z.literal(25)]).default(1),
  label: z.string().trim().max(80).optional(),
}).strict();
export type InviteInput = z.input<typeof inviteInput>;

/** A token as the server makes them: 32 random bytes, base64url — 43 characters. */
export const inviteToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "This invitation link is not valid.");

/**
 * The address to send. The token goes after `#`, which a browser never sends
 * to a server: it stays out of access logs, analytics and `Referer` headers.
 */
export const inviteUrl = (origin: string, token: string) => `${origin}/agenda/join#${token}`;

/** The token from an address's `#…`, or null. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, "");
  return inviteToken.safeParse(token).success ? token : null;
}
