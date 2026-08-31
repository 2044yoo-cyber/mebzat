import type { MetadataRoute } from "next";

import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

/**
 * The sitemap.
 *
 * Static routes are always present; the record routes are read live and each
 * query is capped, because a sitemap has a 50,000 URL limit and a crawler
 * waiting on an unbounded scan will simply give up.
 *
 * A failed query contributes nothing rather than failing the whole sitemap:
 * one missing migration should not take the file down.
 */

export const revalidate = 3600;

const PER_TYPE = 2000;

const STATIC_ROUTES: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/marketplace", priority: 0.9, changeFrequency: "daily" },
  { path: "/price-exchange", priority: 0.9, changeFrequency: "hourly" },
  { path: "/companies", priority: 0.8, changeFrequency: "daily" },
  { path: "/services", priority: 0.8, changeFrequency: "daily" },
  { path: "/equipment", priority: 0.8, changeFrequency: "daily" },
  { path: "/projects", priority: 0.8, changeFrequency: "daily" },
  { path: "/community", priority: 0.7, changeFrequency: "hourly" },
  { path: "/jobs", priority: 0.7, changeFrequency: "daily" },
  { path: "/events", priority: 0.7, changeFrequency: "daily" },
  { path: "/directory/individual", priority: 0.7, changeFrequency: "weekly" },
  { path: "/directory/contractor", priority: 0.7, changeFrequency: "weekly" },
  { path: "/directory/supplier", priority: 0.7, changeFrequency: "weekly" },
  { path: "/ai", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.4, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const supabase = await createClient();

  /** Returns [] on any failure, so one missing table cannot break the file. */
  async function rows(
    table: string,
    columns: string,
    filter: (query: ReturnType<typeof supabase.from>) => unknown,
  ): Promise<Record<string, string>[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase.from as any)(table).select(columns);
      const { data, error } = await (filter(query) as Promise<{
        data: Record<string, string>[] | null;
        error: unknown;
      }>);
      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }

  const [
    products,
    companies,
    projects,
    profiles,
    prices,
    posts,
    jobs,
    events,
    services,
    equipment,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("products", "id, updated_at", (q: any) =>
      q.eq("status", "published").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("companies", "slug, updated_at", (q: any) =>
      q.order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("projects", "id, updated_at", (q: any) =>
      q.eq("status", "published").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("profiles", "username, updated_at", (q: any) =>
      q.not("username", "is", null).order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("price_listings", "id, updated_at", (q: any) =>
      q.eq("published", true).order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("posts", "id, updated_at", (q: any) =>
      q.eq("status", "published").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("jobs", "id, updated_at", (q: any) =>
      q.eq("status", "open").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("events", "id, updated_at", (q: any) =>
      q.eq("status", "published").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("services", "id, updated_at", (q: any) =>
      q.eq("status", "published").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows("equipment", "id, updated_at", (q: any) =>
      q.eq("status", "published").order("updated_at", { ascending: false }).limit(PER_TYPE),
    ),
  ]);

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${base}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  function add(
    list: Record<string, string>[],
    key: string,
    prefix: string,
    priority: number,
  ) {
    for (const row of list) {
      const value = row[key];
      if (!value) continue;
      entries.push({
        url: `${base}${prefix}/${value}`,
        lastModified: row.updated_at ? new Date(row.updated_at) : undefined,
        changeFrequency: "weekly",
        priority,
      });
    }
  }

  add(products, "id", "/marketplace", 0.7);
  add(companies, "slug", "/companies", 0.7);
  add(projects, "id", "/projects", 0.6);
  add(profiles, "username", "/u", 0.6);
  add(prices, "id", "/price-exchange", 0.6);
  add(posts, "id", "/community", 0.5);
  add(jobs, "id", "/jobs", 0.6);
  add(events, "id", "/events", 0.6);
  add(services, "id", "/services", 0.6);
  add(equipment, "id", "/equipment", 0.6);

  return entries;
}
