import { designKinds, type DesignKind } from "@/features/berchuma-studio/types/spec";

/**
 * The bridge between the furniture calculators and Berchuma Studio.
 *
 * Five of the six furniture calculators name a piece the studio already knows
 * how to build, so the link is a real one: the slug maps to a `DesignKind`, the
 * studio opens with that starting design, and the width carries across so the
 * unit the reader just costed is the unit they see in 3D.
 *
 * The mapping is checked against `designKinds` at module load rather than
 * trusted, so renaming a kind in the studio breaks the build here instead of
 * producing a link that silently opens the wrong thing.
 */
const STUDIO_KINDS: Record<string, DesignKind> = {
  wardrobe: "wardrobe",
  kitchen: "kitchen",
  "tv-unit": "tv_unit",
  vanity: "vanity",
  bookshelf: "bookshelf",
  cabinet: "office_storage",
};

for (const [slug, kind] of Object.entries(STUDIO_KINDS)) {
  if (!designKinds.includes(kind)) {
    throw new Error(`Calculator "${slug}" maps to "${kind}", which is not a studio design kind.`);
  }
}

export function studioKindFor(slug: string): DesignKind | null {
  return STUDIO_KINDS[slug] ?? null;
}

/** The link, with the width carried across when there is one. */
export function studioLinkFor(slug: string, width?: number): { href: string; kind: DesignKind } | null {
  const kind = studioKindFor(slug);
  if (!kind) return null;

  const params = new URLSearchParams({ kind });
  if (width && Number.isFinite(width) && width > 0) {
    params.set("width", String(Math.round(width)));
  }
  return { href: `/studio?${params.toString()}`, kind };
}

/** The reverse trip: the studio offering "Send to calculator". */
export function calculatorSlugForKind(kind: DesignKind): string | null {
  const entry = Object.entries(STUDIO_KINDS).find(([, value]) => value === kind);
  return entry?.[0] ?? null;
}
