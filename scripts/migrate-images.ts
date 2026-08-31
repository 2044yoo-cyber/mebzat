// Replaces external image URLs already stored in the database with branded
// local Medosha assets. Safe to re-run.
//
//   npm run migrate:images            # dry run — reports, changes nothing
//   npm run migrate:images -- --apply # writes the replacements
//
// Rows seeded by earlier versions may still point at external providers
// (picsum, pollinations, dicebear, unsplash…). Nothing in the app should ever
// request an external image, so this rewrites those columns to the local
// asset that matches each record (see ./lib/images.ts). Supabase Storage URLs
// are left alone — they are first-party uploads, not external providers.

import { adminClient, requireTables, type Admin } from "./lib/admin.ts";
import {
  architectureCover,
  avatarImage,
  companyCover,
  productImages,
  projectImages,
  COMPANY_PLACEHOLDER,
  PRODUCT_PLACEHOLDER,
  PROJECT_PLACEHOLDER,
} from "./lib/images.ts";

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;

/** A URL that leaves our own origin/storage — anything we must replace. */
function isExternal(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false; // local path like /images/...
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabase && url.startsWith(supabase)) return false; // first-party storage
  return true;
}

type Change = { table: string; id: string; column: string; from: string; to: string };
const changes: Change[] = [];

function note(table: string, id: string, column: string, from: string, to: string) {
  changes.push({ table, id, column, from, to });
}

async function selectAll<T>(
  admin: Admin,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(table as any)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

async function update(admin: Admin, table: string, id: string, patch: object) {
  if (!APPLY) return;
  const { error } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(table as any)
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(`${table} ${id}: ${error.message}`);
}

async function migrateProfiles(admin: Admin) {
  type Row = { id: string; full_name: string | null; username: string | null; avatar_url: string | null; cover_url: string | null };
  const rows = await selectAll<Row>(admin, "profiles", "id, full_name, username, avatar_url, cover_url");
  for (const row of rows) {
    const patch: Record<string, string> = {};
    if (isExternal(row.avatar_url)) {
      patch.avatar_url = avatarImage(row.full_name || row.username || row.id);
      note("profiles", row.id, "avatar_url", row.avatar_url!, patch.avatar_url);
    }
    if (isExternal(row.cover_url)) {
      patch.cover_url = architectureCover(row.username ?? row.id);
      note("profiles", row.id, "cover_url", row.cover_url!, patch.cover_url);
    }
    if (Object.keys(patch).length) await update(admin, "profiles", row.id, patch);
  }
  return rows.length;
}

async function migrateCompanies(admin: Admin) {
  type Row = { id: string; slug: string | null; category: string | null; logo_url: string | null; cover_url: string | null };
  const rows = await selectAll<Row>(admin, "companies", "id, slug, category, logo_url, cover_url");
  for (const row of rows) {
    const patch: Record<string, string> = {};
    const local = companyCover(row.category ?? "", row.slug ?? row.id);
    if (isExternal(row.cover_url)) {
      patch.cover_url = local;
      note("companies", row.id, "cover_url", row.cover_url!, local);
    }
    if (isExternal(row.logo_url)) {
      patch.logo_url = COMPANY_PLACEHOLDER;
      note("companies", row.id, "logo_url", row.logo_url!, COMPANY_PLACEHOLDER);
    }
    if (Object.keys(patch).length) await update(admin, "companies", row.id, patch);
  }
  return rows.length;
}

async function migrateProjects(admin: Admin) {
  type Row = { id: string; title: string | null; building_type: string | null; style: string | null; cover_image_url: string | null };
  const rows = await selectAll<Row>(admin, "projects", "id, title, building_type, style, cover_image_url");
  const localFor = (r: Row) =>
    projectImages(r.title ?? "", r.building_type ?? "other", r.style ?? "", r.id)[0] ?? PROJECT_PLACEHOLDER;

  for (const row of rows) {
    if (isExternal(row.cover_image_url)) {
      const to = localFor(row);
      note("projects", row.id, "cover_image_url", row.cover_image_url!, to);
      await update(admin, "projects", row.id, { cover_image_url: to });
    }
  }

  // project_images rows inherit the parent project's local asset.
  type Img = { id: string; project_id: string; url: string | null };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const imgs = await selectAll<Img>(admin, "project_images", "id, project_id, url");
  for (const img of imgs) {
    if (!isExternal(img.url)) continue;
    const parent = byId.get(img.project_id);
    const to = parent ? localFor(parent) : PROJECT_PLACEHOLDER;
    note("project_images", img.id, "url", img.url!, to);
    await update(admin, "project_images", img.id, { url: to });
  }
  return rows.length + imgs.length;
}

async function migrateProducts(admin: Admin) {
  type Row = { id: string; title: string | null; category_id: string | null; cover_image_url: string | null };
  type Cat = { id: string; slug: string };
  const cats = await selectAll<Cat>(admin, "product_categories", "id, slug");
  const catSlug = new Map(cats.map((c) => [c.id, c.slug]));

  const rows = await selectAll<Row>(admin, "products", "id, title, category_id, cover_image_url");
  const localFor = (r: Row) =>
    productImages(r.title ?? "", catSlug.get(r.category_id ?? "") ?? "", r.id)[0] ?? PRODUCT_PLACEHOLDER;

  for (const row of rows) {
    if (isExternal(row.cover_image_url)) {
      const to = localFor(row);
      note("products", row.id, "cover_image_url", row.cover_image_url!, to);
      await update(admin, "products", row.id, { cover_image_url: to });
    }
  }

  type Img = { id: string; product_id: string; url: string | null };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const imgs = await selectAll<Img>(admin, "product_images", "id, product_id, url");
  for (const img of imgs) {
    if (!isExternal(img.url)) continue;
    const parent = byId.get(img.product_id);
    const to = parent ? localFor(parent) : PRODUCT_PLACEHOLDER;
    note("product_images", img.id, "url", img.url!, to);
    await update(admin, "product_images", img.id, { url: to });
  }
  return rows.length + imgs.length;
}

async function main() {
  const admin = adminClient();
  await requireTables(admin, [
    "profiles",
    "companies",
    "projects",
    "project_images",
    "products",
    "product_images",
    "product_categories",
  ]);

  console.log(APPLY ? "Applying image migration…\n" : "Dry run — no changes will be written.\n");

  const scanned =
    (await migrateProfiles(admin)) +
    (await migrateCompanies(admin)) +
    (await migrateProjects(admin)) +
    (await migrateProducts(admin));

  const byTable = new Map<string, number>();
  for (const c of changes) byTable.set(c.table, (byTable.get(c.table) ?? 0) + 1);

  console.log(`Scanned ${scanned} rows.`);
  if (changes.length === 0) {
    console.log("✓ No external image URLs found — database is clean.");
    return;
  }
  for (const [table, count] of byTable) console.log(`  ${table}: ${count}`);
  for (const c of changes.slice(0, 10)) {
    console.log(`    ${c.table}.${c.column}  ${c.from.slice(0, 52)}…  ->  ${c.to}`);
  }
  if (changes.length > 10) console.log(`    …and ${changes.length - 10} more`);

  console.log(
    APPLY
      ? `\n✓ Replaced ${changes.length} external image URL(s) with local assets.`
      : `\n${changes.length} URL(s) would be replaced. Re-run with --apply to write them.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
