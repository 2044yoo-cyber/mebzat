import type { SearchKind } from "@/types/database.types";

/**
 * Labels and ordering for global search.
 *
 * In `src/lib/constants` rather than the data module so client components can
 * import them without pulling in `server-only`.
 */

export const SEARCH_KINDS = [
  { value: "product", label: "Products", plural: "products" },
  { value: "company", label: "Companies", plural: "companies" },
  { value: "professional", label: "Professionals", plural: "professionals" },
  { value: "project", label: "Projects", plural: "projects" },
  { value: "design", label: "Designs", plural: "furniture designs" },
  { value: "investment", label: "Investments", plural: "investment projects" },
  { value: "price", label: "Prices & materials", plural: "prices" },
  { value: "service", label: "Services", plural: "services" },
  { value: "equipment", label: "Equipment", plural: "equipment" },
  { value: "job", label: "Jobs", plural: "jobs" },
  { value: "event", label: "Events", plural: "events" },
  { value: "post", label: "Posts", plural: "posts" },
  { value: "hashtag", label: "Hashtags", plural: "hashtags" },
] as const satisfies readonly {
  value: SearchKind;
  label: string;
  plural: string;
}[];

export function isSearchKind(value: unknown): value is SearchKind {
  return SEARCH_KINDS.some((kind) => kind.value === value);
}

export function searchKindLabel(kind: SearchKind): string {
  return SEARCH_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Icon name per kind, resolved by `SearchKindIcon`. */
export const SEARCH_KIND_ICON: Record<SearchKind, string> = {
  product: "Package",
  company: "Building2",
  professional: "UserRound",
  project: "Hammer",
  price: "LineChart",
  service: "Wrench",
  equipment: "Truck",
  job: "Briefcase",
  event: "CalendarDays",
  post: "MessageSquare",
  hashtag: "Hash",
  investment: "Landmark",
  design: "Armchair",
};
