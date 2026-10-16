import type { SupabaseClient } from "@supabase/supabase-js";

import { frontDrawing } from "@/features/berchuma-studio/services/front-drawing";
import { parseSpec } from "@/features/berchuma-studio/types/spec";
import { mergePage, SECTION_SOURCES, type Cursor, type PortfolioCard, type SectionId, type SourceId } from "@/lib/portfolio/model";
import type { Database } from "@/types/database.types";

/**
 * Where each kind of creation lives, read for its owner.
 *
 * Every query is the owner's own, under their own session: `owner = me` is
 * asked explicitly, and row-level security on each table (published for
 * everybody, everything for the owner) is what actually decides. Nothing is
 * copied into a portfolio table — the cards point at the rows where they
 * live, and open on the pages that already show them.
 */

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

type Source = {
  table: string;
  owner: string;
  columns: string;
  /** Narrows the table to this kind, when one table holds two (products). */
  only?: (query: Query) => Query;
  card: (row: Row) => Omit<PortfolioCard, "key" | "source" | "id" | "createdAt">;
};

// The query builder's chained type is not worth spelling out for a table
// chosen at run time; this is the part of it the sources use.
type Query = {
  eq: (column: string, value: unknown) => Query;
  neq: (column: string, value: unknown) => Query;
  or: (filters: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  then: PromiseLike<{ data: Row[] | null; error: { message: string } | null }>["then"];
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const label = (value: unknown) => (typeof value === "string" ? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null);
const money = (amount: unknown, currency: unknown, per?: unknown) =>
  typeof amount === "number" && amount > 0 ? { amount, currency: text(currency) ?? "ETB", per: text(per) } : null;
/** A state only the owner sees, said in a word; public states say nothing. */
const hidden = (value: unknown, words: Record<string, string>) => (typeof value === "string" ? words[value] ?? null : null);

/** A design's front view from its stored spec, or null when there is none to draw. */
function designDrawing(spec: unknown) {
  if (!spec || typeof spec !== "object") return null;
  try {
    const decoded = parseSpec(spec);
    return decoded.ok ? frontDrawing(decoded.spec) : null;
  } catch {
    return null;
  }
}

const SOURCES: Record<SourceId, Source> = {
  project: {
    table: "projects", owner: "owner_id",
    columns: "id, title, category, location_city, cover_image_url, status, views, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled project",
      subtitle: [label(row.category), text(row.location_city)].filter(Boolean).join(" · ") || null,
      image: text(row.cover_image_url),
      href: `/projects/${String(row.id)}`,
      badge: hidden(row.status, { draft: "Draft", private: "Private", archived: "Archived" }),
      price: null,
      stats: { views: count(row.views) },
    }),
  },
  product: {
    table: "products", owner: "owner_id",
    columns: "id, title, price, currency, unit, fulfilment, condition, location_city, cover_image_url, status, views, created_at",
    only: (query) => query.neq("fulfilment", "digital"),
    card: (row) => ({
      title: text(row.title) ?? "Untitled listing",
      subtitle: [row.fulfilment === "rental" ? "For rent" : row.condition && row.condition !== "new" ? "Used" : "Product", text(row.location_city)].filter(Boolean).join(" · "),
      image: text(row.cover_image_url),
      href: `/marketplace/${String(row.id)}`,
      badge: hidden(row.status, { draft: "Draft" }),
      price: money(row.price, row.currency, row.unit),
      stats: { views: count(row.views) },
    }),
  },
  digital: {
    table: "products", owner: "owner_id",
    columns: "id, title, price, currency, digital_kind, file_format, file_size_mb, cover_image_url, status, views, created_at",
    only: (query) => query.eq("fulfilment", "digital"),
    card: (row) => ({
      title: text(row.title) ?? "Untitled file",
      subtitle: [text(row.file_format)?.toUpperCase() ?? label(row.digital_kind), typeof row.file_size_mb === "number" ? `${row.file_size_mb} MB` : null].filter(Boolean).join(" · ") || "Digital file",
      image: text(row.cover_image_url),
      href: `/marketplace/${String(row.id)}`,
      badge: hidden(row.status, { draft: "Draft" }),
      price: money(row.price, row.currency),
      stats: { views: count(row.views) },
    }),
  },
  property: {
    table: "properties", owner: "owner_id",
    columns: "id, title, property_type, listing_kind, price, currency, price_period, location_city, cover_image_url, status, view_count, save_count, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled property",
      subtitle: [label(row.property_type), row.listing_kind === "rent" ? "for rent" : row.listing_kind === "sale" ? "for sale" : label(row.listing_kind), text(row.location_city)].filter(Boolean).join(" · "),
      image: text(row.cover_image_url),
      href: `/property/${String(row.id)}`,
      badge: hidden(row.status, { draft: "Draft", withdrawn: "Withdrawn", sold: "Sold", rented: "Rented", under_offer: "Under offer" }),
      price: money(row.price, row.currency, row.price_period),
      stats: { views: count(row.view_count), likes: count(row.save_count) },
    }),
  },
  equipment: {
    table: "equipment", owner: "owner_id",
    columns: "id, title, category, daily_rate, currency, location_city, cover_image_url, status, views, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled equipment",
      subtitle: ["Equipment hire", label(row.category), text(row.location_city)].filter(Boolean).join(" · "),
      image: text(row.cover_image_url),
      href: `/equipment/${String(row.id)}`,
      badge: hidden(row.status, { draft: "Draft", archived: "Archived" }),
      price: money(row.daily_rate, row.currency, "day"),
      stats: { views: count(row.views) },
    }),
  },
  design: {
    table: "designs", owner: "owner_id",
    columns: "id, slug, title, kind, cover_url, visibility, view_count, remix_count, created_at, spec",
    card: (row) => ({
      title: text(row.title) ?? "Untitled design",
      subtitle: `${label(row.kind) ?? "Furniture"} design`,
      image: text(row.cover_url),
      // No cover: the design drawn from its own spec. One that no longer
      // parses keeps the empty picture rather than taking the page down.
      drawing: text(row.cover_url) ? null : designDrawing(row.spec),
      href: `/designs/${String(row.slug ?? row.id)}`,
      badge: hidden(row.visibility, { private: "Private", unlisted: "Unlisted" }),
      price: null,
      stats: { views: count(row.view_count) },
    }),
  },
  tour: {
    table: "tours", owner: "owner_id",
    columns: "id, title, thumbnail_url, visibility, view_count, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled tour",
      subtitle: "360° tour",
      image: text(row.thumbnail_url),
      href: `/tours/${String(row.id)}`,
      badge: hidden(row.visibility, { draft: "Draft", private: "Private", unlisted: "Unlisted", archived: "Archived" }),
      price: null,
      stats: { views: count(row.view_count) },
    }),
  },
  post: {
    table: "posts", owner: "author_id",
    columns: "id, title, body, kind, status, like_count, comment_count, view_count, created_at",
    card: (row) => ({
      title: text(row.title) ?? (text(row.body)?.slice(0, 80) ?? "Post"),
      subtitle: label(row.kind),
      image: null,
      href: `/community/${String(row.id)}`,
      badge: hidden(row.status, { hidden: "Hidden", removed: "Removed" }),
      price: null,
      stats: { likes: count(row.like_count), comments: count(row.comment_count), views: count(row.view_count) },
      excerpt: text(row.title) ? text(row.body)?.slice(0, 140) ?? null : null,
    }),
  },
  service: {
    table: "services", owner: "provider_id",
    columns: "id, title, subcategory, price_from, currency, unit, location_city, cover_image_url, status, rating, review_count, views, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled service",
      subtitle: [label(row.subcategory), text(row.location_city)].filter(Boolean).join(" · ") || "Service",
      image: text(row.cover_image_url),
      // A draft is not on the public page yet; its owner edits it here.
      href: row.status === "published" ? `/services/${String(row.id)}` : `/dashboard/services/${String(row.id)}`,
      badge: hidden(row.status, { draft: "Draft", archived: "Archived" }),
      price: money(row.price_from, row.currency, row.unit),
      stats: { views: count(row.views), comments: count(row.review_count) },
    }),
  },
  job: {
    table: "jobs", owner: "poster_id",
    columns: "id, title, job_type, location_city, status, visibility, application_count, views, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled job",
      subtitle: ["Job", label(row.job_type), text(row.location_city)].filter(Boolean).join(" · "),
      image: null,
      href: `/jobs/${String(row.id)}`,
      badge: row.visibility === "private" ? "Private" : hidden(row.status, { draft: "Draft", closed: "Closed", filled: "Filled" }),
      price: null,
      stats: { views: count(row.views), comments: count(row.application_count) },
    }),
  },
  invest: {
    table: "invest_projects", owner: "owner_id",
    columns: "id, slug, title, city, hero_image_url, published, follower_count, created_at",
    card: (row) => ({
      title: text(row.title) ?? "Untitled investment",
      subtitle: ["Investment", text(row.city)].filter(Boolean).join(" · "),
      image: text(row.hero_image_url),
      href: `/invest/${String(row.slug ?? row.id)}`,
      badge: row.published === false ? "Draft" : null,
      price: null,
      stats: { likes: count(row.follower_count) },
    }),
  },
};

function query(client: Client, source: Source, owner: string): Query {
  const base = (client.from(source.table as never) as unknown as { select: (columns: string) => Query }).select(source.columns).eq(source.owner, owner);
  return source.only ? source.only(base) : base;
}

/** One table's rows after the cursor, newest first. */
async function readSource(client: Client, id: SourceId, owner: string, cursor: Cursor | null, limit: number) {
  const source = SOURCES[id];
  let request = query(client, source, owner);
  if (cursor) {
    // Quoted: a timestamp holds ":" and "+", which the filter grammar reads as syntax.
    request = request.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`);
  }
  const { data, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) throw new Error(`${source.table}: ${error.message}`);
  const cards = (data ?? []).map((row): PortfolioCard => ({
    ...source.card(row),
    key: `${id}:${String(row.id)}`,
    source: id,
    id: String(row.id),
    createdAt: String(row.created_at),
  }));
  return { cards, full: cards.length === limit };
}

/** The next page of a section, from a page of each of its tables. */
export async function readSectionPage(client: Client, owner: string, section: SectionId, cursor: Cursor | null, limit: number) {
  const lists = await Promise.all(SECTION_SOURCES[section].map((id) => readSource(client, id, owner, cursor, limit)));
  return mergePage(lists, limit, cursor);
}

/** How many of each the owner has — counted by the database, not by fetching them. */
export async function countSections(client: Client, owner: string): Promise<Record<SectionId, number>> {
  const counted = await Promise.all(
    (Object.keys(SECTION_SOURCES) as SectionId[]).map(async (section) => {
      const totals = await Promise.all(SECTION_SOURCES[section].map(async (id) => {
        const source = SOURCES[id];
        const base = (client.from(source.table as never) as unknown as { select: (columns: string, options: { count: "exact"; head: true }) => Query })
          .select("id", { count: "exact", head: true }).eq(source.owner, owner);
        const { count: total } = (await (source.only ? source.only(base) : base)) as unknown as { count: number | null };
        return total ?? 0;
      }));
      return [section, totals.reduce((sum, value) => sum + value, 0)] as const;
    }),
  );
  return Object.fromEntries(counted) as Record<SectionId, number>;
}
