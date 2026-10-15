/**
 * The creator portfolio's vocabulary: which sections there are, what a card
 * carries, and how pages of several tables are merged into one stream.
 *
 * Client-safe. Nothing here decides who may see what — every row is read
 * under the viewer's own session, so row-level security does that — and
 * nothing here is a copy of anybody's content: a card is a pointer to a row
 * that lives in its own feature's table, opened at that feature's own page.
 */

export const SECTIONS = [
  { id: "projects", title: "My Projects", short: "Projects", empty: "Architecture, interiors, construction and furniture you have built or designed." },
  { id: "marketplace", title: "My Marketplace", short: "Marketplace", empty: "Products, furniture, materials, properties and equipment you list." },
  { id: "digital", title: "My Digital Products", short: "Digital Products", empty: "Floor plans, CAD drawings, 3D models, BOQs and templates you sell as files." },
  { id: "designs", title: "My Designs & Posts", short: "Designs & Posts", empty: "Furniture designs, 360° tours and the posts you write." },
  { id: "services", title: "My Services & Professional Work", short: "Services", empty: "The services you offer, and your skills." },
  { id: "other", title: "More of My Work", short: "More", empty: "Jobs you have posted and investment projects you run." },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
export const SECTION_IDS = SECTIONS.map((section) => section.id) as SectionId[];
export const isSectionId = (value: unknown): value is SectionId => typeof value === "string" && (SECTION_IDS as string[]).includes(value);

/** The filter chips: All, then the sections people asked to filter by. "More" is reached from its section. */
export const FILTERS: ("all" | SectionId)[] = ["all", "projects", "marketplace", "digital", "designs", "services"];

/** One thing somebody made, wherever it lives. */
export type PortfolioCard = {
  /** `<source>:<id>` — unique across every table, so a merged page never shows a row twice. */
  key: string;
  source: SourceId;
  id: string;
  title: string;
  /** A short line under the title: a category, a kind, a place. */
  subtitle: string | null;
  image: string | null;
  href: string;
  createdAt: string;
  /** Shown only to the owner, and only when the row is not public: "Draft", "Private", … */
  badge: string | null;
  price: { amount: number; currency: string; per?: string | null } | null;
  /** Counts the row already keeps; none are invented. */
  stats: { likes?: number; comments?: number; views?: number };
  /** Text-first items (posts) show a line of their body. */
  excerpt?: string | null;
};

export type SourceId =
  | "project" | "product" | "property" | "equipment" | "digital"
  | "post" | "design" | "tour" | "service" | "job" | "invest";

/** Which tables feed which section, in the order their rows are merged. */
export const SECTION_SOURCES: Record<SectionId, SourceId[]> = {
  projects: ["project"],
  marketplace: ["product", "property", "equipment"],
  digital: ["digital"],
  designs: ["design", "tour", "post"],
  services: ["service"],
  other: ["job", "invest"],
};

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

/**
 * Where a page ended: the newest-first position of its last card. Rows are
 * ordered by (created_at desc, id desc) in every table, so "everything after
 * this" is the same question for each of them, and a row added while somebody
 * scrolls cannot shift a page and show a card twice — which an offset would.
 */
export type Cursor = { at: string; id: string };

export function encodeCursor(cursor: Cursor | null): string | null {
  return cursor ? `${cursor.at}|${cursor.id}` : null;
}

export function decodeCursor(raw: unknown): Cursor | null {
  if (typeof raw !== "string") return null;
  const [at, id] = raw.split("|");
  if (!at || !id || Number.isNaN(microseconds(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

/**
 * A timestamp to the microsecond, as PostgreSQL keeps it. `Date.parse` stops
 * at the millisecond, and two rows made in the same millisecond would then
 * sort here differently from the database's order — and the one that sorted
 * the wrong side of a cursor would never be shown.
 */
export function microseconds(timestamp: string): number {
  const match = /^(.*?:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(timestamp.trim().replace(" ", "T"));
  if (!match) return Date.parse(timestamp) * 1000;
  // `+03` and `+0300` are what PostgreSQL may print; `Date.parse` wants `+03:00`.
  const zone = (match[3] ?? "Z").replace(/^([+-]\d{2})$/, "$1:00").replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const whole = Date.parse(`${match[1]}${zone}`);
  const fraction = Number((match[2] ?? "").slice(0, 6).padEnd(6, "0"));
  return whole * 1000 + fraction;
}

/** Newest first; ties broken by id, so the order is total and stable. */
export function compareCards(a: Pick<PortfolioCard, "createdAt" | "id">, b: Pick<PortfolioCard, "createdAt" | "id">): number {
  const byTime = microseconds(b.createdAt) - microseconds(a.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Whether a card comes after the cursor in that order. */
export function isAfter(card: Pick<PortfolioCard, "createdAt" | "id">, cursor: Cursor | null): boolean {
  if (!cursor) return true;
  return compareCards({ createdAt: cursor.at, id: cursor.id }, card) < 0;
}

/**
 * One page of a section from a page of each of its tables.
 *
 * Each table was asked for `limit` rows after the cursor, so the newest
 * `limit` of all of them are the true next page; anything beyond is left for
 * the next call, which asks again from the new cursor. A table that returned
 * fewer than `limit` rows has nothing further, so when every table did and
 * nothing was left over, the section is finished.
 */
export function mergePage(lists: { cards: PortfolioCard[]; full: boolean }[], limit: number, cursor: Cursor | null): { cards: PortfolioCard[]; next: Cursor | null; done: boolean } {
  const seen = new Set<string>();
  const all: PortfolioCard[] = [];
  for (const list of lists) {
    for (const card of list.cards) {
      if (seen.has(card.key) || !isAfter(card, cursor)) continue;
      seen.add(card.key);
      all.push(card);
    }
  }
  all.sort(compareCards);
  const cards = all.slice(0, limit);
  const leftOver = all.length > limit;
  const more = leftOver || lists.some((list) => list.full);
  const last = cards.at(-1);
  return { cards, next: more && last ? { at: last.createdAt, id: last.id } : null, done: !more || !last };
}

/** Adds a page to what is shown, keeping each card once. */
export function appendUnique(shown: PortfolioCard[], page: PortfolioCard[]): PortfolioCard[] {
  const keys = new Set(shown.map((card) => card.key));
  return [...shown, ...page.filter((card) => !keys.has(card.key))];
}

export const PAGE_SIZE = 12;
export const PREVIEW_SIZE = 6;
