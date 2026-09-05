/**
 * The shape of a catalogue row, and where its public version lives.
 *
 * Separate from the query beside it because the row component is a client
 * component: importing a value out of a `server-only` module pulls the whole
 * server client into the browser bundle and the build refuses it. Types alone
 * would have been fine — they are erased — but `catalogueHref` is a function,
 * and a function has to come from somewhere both sides may read.
 */

export type CatalogueKind = "products" | "projects";

export type CatalogueItem = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  coverImageUrl: string | null;
  views: number;
  createdAt: string | null;
  ownerName: string | null;
  detail: string | null;
};

/** Where the public version of one of these lives. */
export function catalogueHref(kind: CatalogueKind, item: CatalogueItem): string {
  return kind === "products" ? `/marketplace/${item.id}` : `/designs/${item.slug}`;
}

/** The area an operator needs to touch each of them. */
export const CATALOGUE_AREA = {
  products: "products",
  projects: "projects",
} as const;
