// Development seed dataset for Medosha. FOR DEV/TESTING/DEMOS ONLY.
//
//   tsx --env-file=.env.local scripts/seed.ts     (or: npm run seed)
//
// Idempotent and safe to re-run: users are matched by email, and every other
// record is upserted on a stable key, so re-running updates in place rather
// than duplicating. Requires migrations 0001–0006 applied (see SETUP.md).
//
// All data is fictional (no real people/emails/photos) — see scripts/lib/fictional.ts.

import {
  adminClient,
  listAllUserEmails,
  requireTables,
  type Admin,
} from "./lib/admin";
import {
  makeCompanies,
  makeProducts,
  makeProjects,
  makeUsers,
  type DemoUser,
} from "./lib/fictional";

const USER_COUNT = 50;
const COMPANY_COUNT = 20;
const PROJECT_COUNT = 50;
const PRODUCT_COUNT = 200;

async function seedUsers(admin: Admin) {
  const users = makeUsers(USER_COUNT);
  const existing = await listAllUserEmails(admin);
  const ids: string[] = [];

  for (const user of users) {
    let id = existing.get(user.email.toLowerCase());
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: { full_name: user.fullName },
      });
      if (error) throw new Error(`createUser ${user.email}: ${error.message}`);
      id = data.user.id;
    }
    ids.push(id);
  }

  // Upsert rich profile data for each demo user.
  const profileRows = users.map((user, i) => ({
    id: ids[i],
    account_type: user.accountType,
    username: user.username,
    full_name: user.fullName,
    company_name: user.companyName,
    email: user.email,
    bio: user.bio,
    location_city: user.city,
    location_country: user.country,
    years_experience: user.yearsExperience,
    languages: user.languages,
    avatar_url: user.avatarUrl,
    cover_url: user.coverUrl,
    verification_status: user.verified
      ? ("verified" as const)
      : ("unverified" as const),
    onboarding_completed: true,
    onboarding_step: 2,
  }));

  const { error } = await admin.from("profiles").upsert(profileRows);
  if (error) throw new Error(`profiles upsert: ${error.message}`);

  console.log(`✓ ${users.length} users + profiles`);
  return { users, ids };
}

async function seedCompanies(admin: Admin, ownerIds: string[]) {
  const companies = makeCompanies(COMPANY_COUNT);
  const rows = companies.map((company, i) => ({
    slug: company.slug,
    name: company.name,
    category: company.category,
    description: company.description,
    logo_url: company.logoUrl,
    cover_url: company.coverUrl,
    website: company.website,
    email: company.email,
    phone: company.phone,
    address: company.address,
    city: company.city,
    country: company.country,
    employees_count: company.employeesCount,
    projects_completed: company.projectsCompleted,
    followers_count: company.followersCount,
    rating: company.rating,
    verified: company.verified,
    is_claimed: company.claimed,
    owner_id: company.claimed ? ownerIds[i % ownerIds.length] : null,
    import_source: "seed",
    external_ref: company.externalRef,
  }));

  const { error } = await admin
    .from("companies")
    .upsert(rows, { onConflict: "import_source,external_ref" });
  if (error) throw new Error(`companies upsert: ${error.message}`);
  console.log(`✓ ${rows.length} companies`);
}

async function replaceImages(
  admin: Admin,
  table: "project_images" | "product_images",
  fkColumn: "project_id" | "product_id",
  imagesByParent: Map<string, string[]>,
) {
  const parentIds = [...imagesByParent.keys()];
  if (parentIds.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const del = await admin.from(table).delete().in(fkColumn, parentIds as any);
  if (del.error) throw new Error(`${table} delete: ${del.error.message}`);

  const rows: Record<string, unknown>[] = [];
  for (const [parentId, urls] of imagesByParent) {
    urls.forEach((url, position) =>
      rows.push({ [fkColumn]: parentId, url, position }),
    );
  }
  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ins = await admin.from(table).insert(rows as any);
    if (ins.error) throw new Error(`${table} insert: ${ins.error.message}`);
  }
}

async function seedProjects(admin: Admin, ownerIds: string[]) {
  const projects = makeProjects(PROJECT_COUNT);
  const rows = projects.map((project, i) => ({
    owner_id: ownerIds[i % ownerIds.length],
    title: project.title,
    slug: project.slug,
    description: project.description,
    location_city: project.city,
    location_country: project.country,
    building_type: project.buildingType as never,
    style: project.style,
    budget: project.budget,
    budget_currency: project.budgetCurrency,
    materials: project.materials,
    completion_date: project.completionDate,
    cover_image_url: project.images[0] ?? null,
    status: "published" as const,
    views: project.views,
  }));

  const { data, error } = await admin
    .from("projects")
    .upsert(rows, { onConflict: "owner_id,slug" })
    .select("id, slug, owner_id");
  if (error) throw new Error(`projects upsert: ${error.message}`);

  const idByKey = new Map(data!.map((r) => [`${r.owner_id}|${r.slug}`, r.id]));
  const imagesByProject = new Map<string, string[]>();
  projects.forEach((project, i) => {
    const id = idByKey.get(`${ownerIds[i % ownerIds.length]}|${project.slug}`);
    if (id) imagesByProject.set(id, project.images);
  });
  await replaceImages(admin, "project_images", "project_id", imagesByProject);

  console.log(`✓ ${rows.length} projects (+ images)`);
}

async function seedProducts(admin: Admin, ownerIds: string[]) {
  const { data: categories, error: catError } = await admin
    .from("product_categories")
    .select("id, slug");
  if (catError) throw new Error(`categories: ${catError.message}`);
  const categoryId = new Map((categories ?? []).map((c) => [c.slug, c.id]));

  const products = makeProducts(PRODUCT_COUNT);
  const rows = products.map((product, i) => ({
    owner_id: ownerIds[i % ownerIds.length],
    category_id: categoryId.get(product.categorySlug) ?? null,
    title: product.title,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    price: product.price,
    currency: product.currency,
    unit: product.unit,
    stock_status: product.stockStatus,
    specs: product.specs,
    location_city: product.city,
    location_country: product.country,
    delivery_available: product.deliveryAvailable,
    cover_image_url: product.images[0] ?? null,
    status: "published" as const,
  }));

  const { data, error } = await admin
    .from("products")
    .upsert(rows, { onConflict: "owner_id,slug" })
    .select("id, slug, owner_id");
  if (error) throw new Error(`products upsert: ${error.message}`);

  const idByKey = new Map(data!.map((r) => [`${r.owner_id}|${r.slug}`, r.id]));
  const imagesByProduct = new Map<string, string[]>();
  products.forEach((product, i) => {
    const id = idByKey.get(`${ownerIds[i % ownerIds.length]}|${product.slug}`);
    if (id) imagesByProduct.set(id, product.images);
  });
  await replaceImages(admin, "product_images", "product_id", imagesByProduct);

  console.log(`✓ ${rows.length} products (+ images)`);
}

async function main() {
  const admin = adminClient();
  console.log("Seeding Medosha development data…");

  await requireTables(admin, [
    "profiles",
    "projects",
    "products",
    "product_categories",
    "companies",
  ]);

  const { ids } = await seedUsers(admin);
  await seedCompanies(admin, ids);
  await seedProjects(admin, ids);
  await seedProducts(admin, ids);

  console.log("\nDone. Demo logins: demo01@medosha.test … demo50@medosha.test");
  console.log("Password for all demo users: medosha-demo-1234");
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

// Keep DemoUser referenced for downstream typing clarity.
export type { DemoUser };
