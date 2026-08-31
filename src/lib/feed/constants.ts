import type {
  FeedFileKindName,
  FeedKindName,
  FeedTopicName,
} from "@/types/database.types";

/**
 * The vocabulary of the Smart Discovery Feed.
 *
 * Shared by the server reads, the API route and every card, so there is one
 * place that decides what a `boq_template` is called and which icon it wears.
 * No `server-only` here on purpose — the client components import from this
 * file too, and nothing in it is a secret. The one import above is type-only
 * and erased at build, so no schema reaches the browser bundle.
 */

export const FEED_KINDS = [
  "property",
  "material",
  "furniture",
  "equipment",
  "progress",
  "architecture",
  "interior",
  "ai_design",
  "before_after",
  "floor_plan",
  "boq_template",
  "cost_tip",
  "price_update",
  "video",
  "tutorial",
  "document",
  "announcement",
  "professional",
  "investment",
  "question",
  "discussion",
  "learning",
  "success_story",
] as const;

export type FeedKind = (typeof FEED_KINDS)[number];

export const FEED_TOPICS = [
  "property",
  "materials",
  "design",
  "construction",
  "equipment",
  "finance",
  "learning",
  "community",
] as const;

export type FeedTopic = (typeof FEED_TOPICS)[number];

export const FEED_FILE_KINDS = [
  "pdf",
  "dwg",
  "revit",
  "sketchup",
  "excel",
  "word",
  "image",
  "archive",
] as const;

export type FeedFileKind = (typeof FEED_FILE_KINDS)[number];

export function isFeedKind(value: unknown): value is FeedKind {
  return (
    typeof value === "string" && (FEED_KINDS as readonly string[]).includes(value)
  );
}

export function isFeedTopic(value: unknown): value is FeedTopic {
  return (
    typeof value === "string" && (FEED_TOPICS as readonly string[]).includes(value)
  );
}

/** What a card of each kind is called, on the badge above the title. */
export const KIND_LABEL: Record<FeedKind, string> = {
  property: "Property",
  material: "Materials",
  furniture: "Furniture",
  equipment: "Equipment",
  progress: "Site progress",
  architecture: "Architecture",
  interior: "Interior",
  ai_design: "AI design",
  before_after: "Before & after",
  floor_plan: "Floor plan",
  boq_template: "BOQ template",
  cost_tip: "Cost tip",
  price_update: "Price update",
  video: "Video",
  tutorial: "Tutorial",
  document: "Download",
  announcement: "Announcement",
  professional: "Professional",
  investment: "Investment",
  question: "Question",
  discussion: "Discussion",
  learning: "Free course",
  success_story: "Success story",
};

export const TOPIC_LABEL: Record<FeedTopic, string> = {
  property: "Property",
  materials: "Materials",
  design: "Design",
  construction: "Construction",
  equipment: "Equipment",
  finance: "Cost & finance",
  learning: "Learning",
  community: "Community",
};

/**
 * The filter chips above the feed.
 *
 * Grouped by what a reader is looking for rather than by database kind: a
 * homeowner wants "Property", not the difference between a `property` post
 * and a `floor_plan` post about a house. "For you" is the unfiltered ranked
 * feed and stays first.
 */
export type FeedFilter = {
  id: string;
  label: string;
  /** Emoji rather than an icon component: the chips are a scroller on a
   *  phone, and a 20-icon import for a decorative row is a lot of bundle. */
  emoji: string;
  kinds?: FeedKind[];
  topics?: FeedTopic[];
};

export const FEED_FILTERS: FeedFilter[] = [
  { id: "for-you", label: "For you", emoji: "✨" },
  {
    id: "property",
    label: "Property",
    emoji: "🏠",
    kinds: ["property", "floor_plan", "investment"],
  },
  {
    id: "materials",
    label: "Materials",
    emoji: "🧱",
    kinds: ["material", "price_update"],
  },
  {
    id: "design",
    label: "Design",
    emoji: "📐",
    kinds: [
      "architecture",
      "interior",
      "ai_design",
      "before_after",
      "furniture",
    ],
  },
  {
    id: "site",
    label: "On site",
    emoji: "🏗",
    kinds: ["progress", "equipment"],
  },
  {
    id: "cost",
    label: "Cost",
    emoji: "💰",
    kinds: ["cost_tip", "boq_template", "price_update"],
  },
  {
    id: "learn",
    label: "Learn",
    emoji: "🎓",
    kinds: ["learning", "tutorial", "video"],
  },
  {
    id: "downloads",
    label: "Downloads",
    emoji: "📥",
    kinds: ["document", "boq_template", "floor_plan"],
  },
  {
    id: "community",
    label: "Community",
    emoji: "💬",
    kinds: ["question", "discussion", "success_story", "announcement", "professional"],
  },
];

export function filterById(id: string | null | undefined): FeedFilter {
  // `at(0)` rather than `[0]`: the array is non-empty but the compiler does
  // not know that under noUncheckedIndexedAccess, and the fallback has to be
  // a real object either way.
  const fallback = FEED_FILTERS[0] as FeedFilter;
  if (!id) return fallback;
  return FEED_FILTERS.find((filter) => filter.id === id) ?? fallback;
}

/** How a downloadable file is described next to its button. */
export const FILE_LABEL: Record<FeedFileKind, string> = {
  pdf: "PDF",
  dwg: "DWG",
  revit: "Revit",
  sketchup: "SketchUp",
  excel: "Excel",
  word: "Word",
  image: "Image",
  archive: "ZIP",
};

/** Page size. Twelve is about two phone screens of cards — enough that the
 *  next request is in flight before the reader reaches the bottom, small
 *  enough that the first paint is not waiting on forty rows. */
export const FEED_PAGE_SIZE = 12;

// The kind and topic lists exist twice: as values here, because the chips and
// the cards need to iterate them in the browser, and as unions in
// `@/types/database.types`, because that file describes the schema and must
// not import from the application layer. These assertions fail the build if
// the two ever drift, which is the only thing keeping the duplication honest.
type _KindsMatch = FeedKind extends FeedKindName
  ? FeedKindName extends FeedKind
    ? true
    : never
  : never;
type _TopicsMatch = FeedTopic extends FeedTopicName
  ? FeedTopicName extends FeedTopic
    ? true
    : never
  : never;
type _FileKindsMatch = FeedFileKind extends FeedFileKindName
  ? FeedFileKindName extends FeedFileKind
    ? true
    : never
  : never;

const _kindsMatch: _KindsMatch = true;
const _topicsMatch: _TopicsMatch = true;
const _fileKindsMatch: _FileKindsMatch = true;

// Referenced so the checks are not stripped as unused.
export const FEED_SCHEMA_IN_SYNC =
  _kindsMatch && _topicsMatch && _fileKindsMatch;
