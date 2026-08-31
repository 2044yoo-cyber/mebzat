// Demo dataset for the Medosha ecosystem modules. FOR DEV/TESTING/DEMOS ONLY.
//
//   node --env-file=.env.local scripts/seed-ecosystem.ts
//   (or: npm run seed:ecosystem)
//
// Fills Community, Services, Equipment Rental, Jobs, Events and Reviews.
// Requires migrations 0010–0013 and the base seed (`npm run seed`).
//
// Idempotent: every record is matched on a stable natural key and updated in
// place, so re-running refreshes rather than duplicating.
//
// All content is fictional.

import { adminClient, requireTables, type Admin } from "./lib/admin.ts";
import { CITIES } from "./lib/fictional.ts";
import {
  chance,
  cycle,
  intBetween,
  makeRng,
  pick,
  type Rng,
} from "./lib/rng.ts";

const POST_COUNT = 60;
const SERVICE_COUNT = 70;
const EQUIPMENT_COUNT = 55;
const JOB_COUNT = 40;
const EVENT_COUNT = 25;
const REVIEW_COUNT = 160;

type Profile = { id: string; location_city: string | null };

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const POST_SEEDS: [string, string, string][] = [
  ["tip", "Curing slabs in the dry season", "Keep the slab damp for a full seven days. Hessian and a morning soak beats plastic sheeting in our climate. #concrete #curing"],
  ["question", "HCB or solid blocks for a G+1?", "Building a two storey house in Adama. Contractor says HCB is fine for infill. Anyone regret it? #masonry #hcb"],
  ["tip", "Check your rebar before it goes in", "Mill certificates matter. We rejected a batch last month that was 8% under weight. Weigh a metre and compare. #rebar #qaqc"],
  ["discussion", "Cement prices this quarter", "Up again in Addis. Are people locking in prices or buying week to week? #cement #prices"],
  ["showcase", "Finished this villa in Bishoftu", "Nine months from ground breaking. Local stone, aluminium windows, exposed concrete stair. #villa #residential"],
  ["question", "Best waterproofing for a flat roof?", "Torch-on membrane or liquid applied? Roof is 180m² with three penetrations. #waterproofing #roofing"],
  ["tip", "Formwork release agent saves you twice", "Cleaner finish and the panels last another three or four pours. Cheap insurance. #formwork #carpentry"],
  ["discussion", "Are we over-specifying foundations?", "Soil reports keep coming back better than the design assumed. Costing clients real money. #foundations #structural"],
  ["tip", "Sequence your MEP before the screed", "First fix everything, pressure test, then screed. Chasing a finished floor is a bad day. #mep #plumbing"],
  ["showcase", "Office fit-out, Bole", "420m² over two floors. Acoustic ceilings, raised floor, all locally fabricated joinery. #office #fitout"],
  ["question", "Reliable scaffolding hire in Hawassa?", "Need about 600m² for six weeks. Who have people used? #scaffolding #hawassa"],
  ["tip", "Photograph everything before you close it up", "Every wall, every ceiling void, dated. It has settled three disputes for us. #sitemanagement"],
  ["discussion", "Skilled labour shortage", "Good steel fixers are booked months out. Are rates rising where you are? #labour #rates"],
  ["tip", "Test your blocks, not the sample", "Suppliers send their best block as a sample. Pull three at random from the delivery. #hcb #quality"],
  ["showcase", "Landscape handover in Debre Birhan", "Indigenous planting, permeable paving, rainwater harvesting to a 20m³ tank. #landscape"],
];

const SERVICE_SEEDS: [string, string, string, string, number, number][] = [
  ["architecture", "Residential architectural design", "Concept through to construction drawings for houses and villas.", "per_m2", 350, 900],
  ["architecture", "Planning permission drawings", "Municipality submission set, including revisions.", "fixed", 25000, 60000],
  ["structural", "Structural design and calculations", "Reinforced concrete and steel frame design to Ethiopian codes.", "per_m2", 220, 550],
  ["structural", "Structural survey and assessment", "Condition survey with a written report and remedial advice.", "fixed", 18000, 45000],
  ["mep", "Electrical design and load schedule", "Full distribution design, single line diagram and schedules.", "per_m2", 120, 320],
  ["mep", "Plumbing and drainage design", "Supply, waste and rainwater layouts with pipe sizing.", "per_m2", 110, 290],
  ["surveying", "Bill of quantities preparation", "Measured BOQ from drawings, ready to tender.", "per_project", 20000, 90000],
  ["surveying", "Land and topographic survey", "Boundary, levels and contours with a CAD deliverable.", "fixed", 12000, 40000],
  ["general-contracting", "Full build contracting", "Ground breaking to handover, managed by our own site team.", "per_m2", 20000, 45000],
  ["general-contracting", "Renovation and extension", "Structural alterations, finishes and MEP.", "per_m2", 9000, 22000],
  ["interior", "Interior design and fit-out", "Space planning, finishes selection, and delivery on site.", "per_m2", 1800, 6500],
  ["interior", "Kitchen design and installation", "Design, fabrication and fitting, hardware included.", "per_project", 65000, 260000],
  ["landscaping", "Garden design and planting", "Soft and hard landscape design with a planting schedule.", "per_m2", 900, 2800],
  ["electrical", "Electrical first and second fix", "Containment, wiring, accessories and testing.", "per_m2", 260, 620],
  ["plumbing", "Sanitary installation", "Supply, waste and fixture installation with testing.", "fixed", 1200, 3500],
  ["finishing", "Plastering and painting", "Two coat render, primer and two finish coats.", "per_m2", 180, 420],
  ["joinery", "Bespoke joinery", "Wardrobes, doors and cabinetry made to measure.", "per_m2", 6500, 16000],
  ["project-management", "Construction project management", "Programme, cost control and contractor coordination.", "per_project", 80000, 400000],
];

const EQUIPMENT_SEEDS: [string, string, string, string, number, number][] = [
  ["Excavator 20t", "Earthmoving", "Komatsu", "PC200-8", 9500, 16000],
  ["Excavator 8t", "Earthmoving", "Kubota", "KX080", 5500, 9000],
  ["Backhoe loader", "Earthmoving", "JCB", "3CX", 6000, 11000],
  ["Wheel loader", "Earthmoving", "Caterpillar", "950H", 8500, 14000],
  ["Bulldozer D6", "Earthmoving", "Caterpillar", "D6R", 12000, 20000],
  ["Concrete mixer 350L", "Concrete", "Belle", "Premier 350", 900, 1900],
  ["Concrete mixer 500L", "Concrete", "Altrad", "M500", 1300, 2600],
  ["Concrete pump (trailer)", "Concrete", "Putzmeister", "BSA 1005", 7000, 13000],
  ["Poker vibrator", "Concrete", "Wacker Neuson", "IRFU45", 350, 800],
  ["Power float", "Concrete", "Wacker Neuson", "CT36", 700, 1500],
  ["Tower crane 40m", "Lifting", "Potain", "MC 85", 22000, 45000],
  ["Mobile crane 25t", "Lifting", "Tadano", "TR-250M", 15000, 28000],
  ["Telehandler", "Lifting", "Manitou", "MT 1440", 6000, 11000],
  ["Scaffolding (100m²)", "Access", "Layher", "Allround", 1200, 2800],
  ["Boom lift 16m", "Access", "Genie", "Z-45", 5000, 9500],
  ["Generator 100kVA", "Power", "Cummins", "C100D5", 3200, 6000],
  ["Generator 30kVA", "Power", "Perkins", "P33-1", 1500, 3000],
  ["Welding set 400A", "Fabrication", "Lincoln", "Invertec V400", 600, 1400],
  ["Plate compactor", "Compaction", "Wacker Neuson", "DPU 3050", 700, 1600],
  ["Roller (single drum)", "Compaction", "Bomag", "BW 120", 4500, 8500],
  ["Dewatering pump 4in", "Water", "Honda", "WT40", 500, 1100],
  ["Site tower light", "Power", "Atlas Copco", "HiLight V4", 700, 1500],
];

const JOB_SEEDS: [string, string, string, string, string][] = [
  ["Site Engineer", "Civil Engineer", "mid", "full_time", "Run day to day works on a G+6 residential build. Setting out, quality control, progress reporting."],
  ["Senior Architect", "Architect", "senior", "full_time", "Lead design on residential and mixed use projects from concept to construction issue."],
  ["Structural Engineer", "Structural Engineer", "mid", "full_time", "Reinforced concrete and steel design for buildings up to twelve storeys."],
  ["Quantity Surveyor", "Quantity Surveyor", "mid", "full_time", "Measurement, valuations, variations and final accounts across three live sites."],
  ["Site Foreman", "Contractor", "senior", "full_time", "Supervise trades, manage sequence and hold the programme on a commercial fit-out."],
  ["Electrical Supervisor", "Electrician", "senior", "contract", "Supervise first and second fix, testing and commissioning."],
  ["Plumbing Technician", "Plumber", "junior", "contract", "Install supply, waste and sanitary fixtures under supervision."],
  ["Interior Designer", "Interior Designer", "mid", "full_time", "Concept design, material selection and site coordination for office fit-outs."],
  ["Draughtsperson (AutoCAD)", "Architect", "junior", "full_time", "Produce and revise working drawings from senior markups."],
  ["Project Manager", "Contractor", "lead", "full_time", "Own programme, cost and quality across a portfolio of residential projects."],
  ["Safety Officer", "Contractor", "mid", "full_time", "Site inductions, toolbox talks, inspections and incident reporting."],
  ["Landscape Architect", "Landscape Architect", "mid", "contract", "Design and deliver soft and hard landscape for a mixed use scheme."],
  ["BIM Coordinator", "Architect", "mid", "full_time", "Model coordination, clash detection and drawing production in Revit."],
  ["Furniture Maker", "Furniture Designer", "mid", "freelance", "Fabricate bespoke joinery from approved shop drawings."],
  ["Junior Civil Engineer", "Civil Engineer", "entry", "internship", "Support the site team with setting out, records and material checks."],
];

const EVENT_SEEDS: [string, string, string][] = [
  ["exhibition", "Addis Build Expo", "Three days of materials, machinery and technology for the Ethiopian construction industry."],
  ["trade_fair", "Ethiopia Construction Materials Fair", "Suppliers and manufacturers from across the region under one roof."],
  ["training", "Reinforced Concrete Design Workshop", "Two day intensive on design to current codes, with worked examples."],
  ["workshop", "Practical Waterproofing", "Hands-on session covering membranes, liquid systems and detailing."],
  ["conference", "Sustainable Building East Africa", "Speakers on low carbon materials, passive design and local supply chains."],
  ["webinar", "Reading a Bill of Quantities", "A one hour session for clients and junior professionals."],
  ["site_visit", "Behind the Hoarding: G+12 Site Tour", "Guided walk through a live structural frame with the site team."],
  ["training", "Quantity Surveying Fundamentals", "Five evenings covering measurement, valuation and final accounts."],
  ["workshop", "AutoCAD to Revit Migration", "Move a real project across and learn the workflow differences."],
  ["exhibition", "Interiors and Furniture Show", "Local makers, imported finishes and design studios."],
];

const REVIEW_BODIES = [
  "Delivered on time and the finish was better than I expected. Would use again.",
  "Good communication throughout. A few delays on materials but they kept me informed.",
  "Professional team, clean site, and they stuck to the quoted price.",
  "Quality was solid. Would have liked more detail in the initial quote.",
  "Turned up when they said they would, which is half the battle. Happy with the work.",
  "Very knowledgeable. Spotted an issue with the drawings before it cost us money.",
  "Fair price and honest about what was and was not included.",
  "Machine arrived in good condition and the operator knew what he was doing.",
  "Responsive to messages and flexible when our programme slipped.",
  "Excellent workmanship. The detailing around the openings was particularly good.",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function priceIn(rng: Rng, low: number, high: number): number {
  const raw = low + rng() * (high - low);
  const step = raw > 5000 ? 500 : raw > 500 ? 50 : 10;
  return Math.round(raw / step) * step;
}

async function loadProfiles(admin: Admin): Promise<Profile[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, location_city")
    .not("username", "is", null)
    .limit(80);

  if (error) throw new Error(`profiles: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("No profiles found. Run `npm run seed` first.");
  }
  return data;
}

async function loadCompanies(admin: Admin) {
  const { data } = await admin.from("companies").select("id, owner_id").limit(40);
  return data ?? [];
}

/**
 * Upserts by a natural key that the table has no unique constraint for.
 *
 * Reads what is there, updates the matches and inserts the rest — the same
 * shape as the price-exchange seed, for the same reason: these tables let a
 * user legitimately create two similar rows, so `on conflict` is not available.
 */
async function upsertBy<T extends Record<string, unknown>>(
  admin: Admin,
  table: string,
  rows: T[],
  keyOf: (row: Record<string, unknown>) => string,
  keyColumns: string,
  updatable: (keyof T)[],
): Promise<{ inserted: number; updated: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error } = await (admin.from as any)(table)
    .select(`id, ${keyColumns}`)
    .limit(5000);
  if (error) throw new Error(`${table} read: ${error.message}`);

  const byKey = new Map<string, string>(
    (existing ?? []).map((row: Record<string, unknown>) => [
      keyOf(row),
      row.id as string,
    ]),
  );

  const inserts: T[] = [];
  let updated = 0;

  for (const row of rows) {
    const id = byKey.get(keyOf(row));
    if (!id) {
      inserts.push(row);
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const column of updatable) patch[column as string] = row[column];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin.from as any)(table)
      .update(patch)
      .eq("id", id);
    if (updateError) throw new Error(`${table} update: ${updateError.message}`);
    updated += 1;
  }

  for (let i = 0; i < inserts.length; i += 200) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (admin.from as any)(table).insert(
      inserts.slice(i, i + 200),
    );
    if (insertError) throw new Error(`${table} insert: ${insertError.message}`);
  }

  return { inserted: inserts.length, updated };
}

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

async function seedPosts(admin: Admin, profiles: Profile[], rng: Rng) {
  const rows = Array.from({ length: POST_COUNT }, (_, index) => {
    const [kind, title, body] = cycle(POST_SEEDS, index);
    const author = pick(rng, profiles);
    // Repeats past the seed list get a suffix so the natural key stays unique.
    const round = Math.floor(index / POST_SEEDS.length);
    return {
      author_id: author.id,
      kind,
      title: round === 0 ? title : `${title} (${round + 1})`,
      body,
      status: "published" as const,
    };
  });

  return upsertBy(
    admin,
    "posts",
    rows,
    (row) => `${row.author_id}|${row.title}`,
    "author_id, title",
    ["body", "kind", "status"],
  );
}

async function seedServices(admin: Admin, profiles: Profile[], rng: Rng) {
  const { data: categories } = await admin
    .from("service_categories")
    .select("id, slug");
  const bySlug = new Map((categories ?? []).map((c) => [c.slug, c.id]));

  const rows = Array.from({ length: SERVICE_COUNT }, (_, index) => {
    const [slug, title, description, pricing, low, high] =
      cycle(SERVICE_SEEDS, index);
    const provider = pick(rng, profiles);
    const from = priceIn(rng, low, high);

    return {
      provider_id: provider.id,
      category_id: bySlug.get(slug) ?? null,
      title,
      slug: slugify(title),
      description,
      pricing,
      price_from: from,
      price_to: Math.round(from * (1.3 + rng() * 0.7)),
      currency: "ETB",
      lead_time_days: intBetween(rng, 3, 45),
      accepting_work: chance(rng, 0.82),
      location_city: provider.location_city ?? pick(rng, CITIES),
      serves_remotely: chance(rng, 0.3),
      status: "published" as const,
    };
  });

  return upsertBy(
    admin,
    "services",
    rows,
    (row) => `${row.provider_id}|${row.slug}`,
    "provider_id, slug",
    ["description", "price_from", "price_to", "lead_time_days", "accepting_work", "status"],
  );
}

async function seedEquipment(admin: Admin, profiles: Profile[], rng: Rng) {
  const rows = Array.from({ length: EQUIPMENT_COUNT }, (_, index) => {
    const [title, category, brand, model, low, high] =
      cycle(EQUIPMENT_SEEDS, index);
    const owner = pick(rng, profiles);
    const daily = priceIn(rng, low, high);

    return {
      owner_id: owner.id,
      title,
      slug: slugify(title),
      category,
      brand,
      model,
      description: `${brand} ${model} available for hire. Serviced and ready for site.`,
      year_made: intBetween(rng, 2012, 2024),
      condition: pick(rng, ["new", "excellent", "good", "fair"] as const),
      // Weekly is roughly six days and monthly roughly twenty-two, which is
      // the discount an owner would actually offer.
      daily_rate: daily,
      weekly_rate: Math.round(daily * 6),
      monthly_rate: Math.round(daily * 22),
      currency: "ETB",
      deposit: Math.round(daily * intBetween(rng, 2, 6)),
      operator_included: chance(rng, 0.4),
      delivery_available: chance(rng, 0.6),
      min_rental_days: pick(rng, [1, 1, 1, 3, 7]),
      location_city: owner.location_city ?? pick(rng, CITIES),
      available: chance(rng, 0.78),
      status: "published" as const,
    };
  });

  return upsertBy(
    admin,
    "equipment",
    rows,
    (row) => `${row.owner_id}|${row.slug}`,
    "owner_id, slug",
    ["daily_rate", "weekly_rate", "monthly_rate", "deposit", "available", "status"],
  );
}

async function seedJobs(
  admin: Admin,
  profiles: Profile[],
  companies: { id: string; owner_id: string | null }[],
  rng: Rng,
) {
  const rows = Array.from({ length: JOB_COUNT }, (_, index) => {
    const [title, profession, level, jobType, description] =
      cycle(JOB_SEEDS, index);
    const poster = pick(rng, profiles);
    const company = companies.length > 0 && chance(rng, 0.7) ? pick(rng, companies) : null;
    const min = priceIn(rng, 9000, 32000);
    const round = Math.floor(index / JOB_SEEDS.length);

    return {
      poster_id: poster.id,
      company_id: company?.id ?? null,
      title: round === 0 ? title : `${title} (${round + 1})`,
      slug: slugify(round === 0 ? title : `${title}-${round + 1}`),
      description,
      responsibilities:
        "Day to day delivery on site, coordination with other trades, and accurate record keeping.",
      requirements:
        "Relevant qualification, demonstrable site experience, and working English or Amharic.",
      job_type: jobType,
      work_mode: pick(rng, ["on_site", "on_site", "on_site", "hybrid", "remote"] as const),
      experience_level: level,
      profession,
      salary_min: min,
      salary_max: Math.round(min * (1.25 + rng() * 0.5)),
      currency: "ETB",
      salary_period: "month",
      salary_visible: chance(rng, 0.75),
      location_city: poster.location_city ?? pick(rng, CITIES),
      openings: chance(rng, 0.2) ? intBetween(rng, 2, 5) : 1,
      status: "open" as const,
    };
  });

  return upsertBy(
    admin,
    "jobs",
    rows,
    (row) => `${row.poster_id}|${row.slug}`,
    "poster_id, slug",
    ["description", "salary_min", "salary_max", "salary_visible", "status"],
  );
}

async function seedEvents(admin: Admin, profiles: Profile[], rng: Rng) {
  const rows = Array.from({ length: EVENT_COUNT }, (_, index) => {
    const [kind, title, description] = cycle(EVENT_SEEDS, index);
    const organizer = pick(rng, profiles);
    const round = Math.floor(index / EVENT_SEEDS.length);

    // Mostly ahead, a few behind, so the "Past" tab is not empty.
    const offsetDays = chance(rng, 0.8)
      ? intBetween(rng, 3, 180)
      : -intBetween(rng, 5, 200);
    const starts = new Date(Date.now() + offsetDays * 86_400_000);
    starts.setHours(intBetween(rng, 8, 17), 0, 0, 0);
    const ends = new Date(starts.getTime() + intBetween(rng, 2, 10) * 3_600_000);

    const online = kind === "webinar" || chance(rng, 0.2);
    const city = organizer.location_city ?? pick(rng, CITIES);

    return {
      organizer_id: organizer.id,
      title: round === 0 ? title : `${title} ${starts.getFullYear()}`,
      slug: slugify(round === 0 ? title : `${title}-${round + 1}`),
      description,
      kind,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      is_online: online,
      online_url: online ? "https://meet.medosha.example/event" : null,
      venue: online ? null : pick(rng, ["Millennium Hall", "Skylight Hotel", "Exhibition Centre", "Hyatt Regency", "Ghion Hotel"]),
      location_city: online ? null : city,
      price: chance(rng, 0.45) ? priceIn(rng, 200, 4000) : 0,
      currency: "ETB",
      capacity: chance(rng, 0.6) ? intBetween(rng, 30, 400) : null,
      status: "published" as const,
    };
  });

  return upsertBy(
    admin,
    "events",
    rows,
    (row) => `${row.organizer_id}|${row.slug}`,
    "organizer_id, slug",
    ["description", "starts_at", "ends_at", "capacity", "status"],
  );
}

/** Reviews across companies, professionals, products, services and equipment. */
async function seedReviews(admin: Admin, profiles: Profile[], rng: Rng) {
  const [companies, products, services, equipment] = await Promise.all([
    admin.from("companies").select("id").limit(40),
    admin.from("products").select("id").limit(60),
    admin.from("services").select("id").limit(60),
    admin.from("equipment").select("id").limit(60),
  ]);

  const subjects: { type: string; id: string }[] = [
    ...(companies.data ?? []).map((row) => ({ type: "company", id: row.id })),
    ...(products.data ?? []).map((row) => ({ type: "product", id: row.id })),
    ...(services.data ?? []).map((row) => ({ type: "service", id: row.id })),
    ...(equipment.data ?? []).map((row) => ({ type: "equipment", id: row.id })),
    ...profiles.slice(0, 20).map((row) => ({ type: "professional", id: row.id })),
  ];

  if (subjects.length === 0) return { inserted: 0, updated: 0 };

  // The unique constraint is (author, subject_type, subject_id), so the same
  // pair must not appear twice in one batch.
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < REVIEW_COUNT * 2 && rows.length < REVIEW_COUNT; i++) {
    const subject = pick(rng, subjects);
    const author = pick(rng, profiles);
    // A professional reviewing themselves would be nonsense data.
    if (subject.type === "professional" && subject.id === author.id) continue;

    const key = `${author.id}|${subject.type}|${subject.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Weighted towards the top, which is what a real distribution looks like.
    const rating = pick(rng, [5, 5, 5, 4, 4, 4, 4, 3, 3, 2]);

    rows.push({
      author_id: author.id,
      subject_type: subject.type,
      subject_id: subject.id,
      rating,
      body: pick(rng, REVIEW_BODIES),
      verified: chance(rng, 0.55),
    });
  }

  const { error } = await admin
    .from("reviews")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: "author_id,subject_type,subject_id" });

  if (error) throw new Error(`reviews upsert: ${error.message}`);
  return { inserted: rows.length, updated: 0 };
}

/** Likes, comments and follows, so the counters are not all zero. */
async function seedEngagement(admin: Admin, profiles: Profile[], rng: Rng) {
  const { data: posts } = await admin
    .from("posts")
    .select("id, author_id")
    .eq("status", "published")
    .limit(100);

  if (!posts || posts.length === 0) return { likes: 0, comments: 0, follows: 0 };

  const likes: { post_id: string; user_id: string }[] = [];
  const comments: { post_id: string; author_id: string; body: string }[] = [];
  const seenLikes = new Set<string>();

  const COMMENT_BODIES = [
    "Useful, thanks for writing this up.",
    "We do the same and it has not failed us yet.",
    "Depends on the soil, but broadly agreed.",
    "Any figures on what that costs per m²?",
    "This matches my experience in Adama.",
    "Good point about the sequencing.",
  ];

  for (const post of posts) {
    for (let i = 0; i < intBetween(rng, 0, 12); i++) {
      const user = pick(rng, profiles);
      const key = `${post.id}|${user.id}`;
      if (seenLikes.has(key)) continue;
      seenLikes.add(key);
      likes.push({ post_id: post.id, user_id: user.id });
    }

    for (let i = 0; i < intBetween(rng, 0, 4); i++) {
      const author = pick(rng, profiles);
      if (author.id === post.author_id) continue;
      comments.push({
        post_id: post.id,
        author_id: author.id,
        body: pick(rng, COMMENT_BODIES),
      });
    }
  }

  // Likes are keyed on (post, user), so a re-run is a no-op rather than a
  // duplicate. Comments have no such key, so they are only added once.
  for (let i = 0; i < likes.length; i += 500) {
    const { error } = await admin
      .from("post_likes")
      .upsert(likes.slice(i, i + 500), { onConflict: "post_id,user_id" });
    if (error) throw new Error(`post_likes: ${error.message}`);
  }

  const { count: existingComments } = await admin
    .from("post_comments")
    .select("id", { count: "exact", head: true });

  if ((existingComments ?? 0) === 0) {
    for (let i = 0; i < comments.length; i += 500) {
      const { error } = await admin
        .from("post_comments")
        .insert(comments.slice(i, i + 500));
      if (error) throw new Error(`post_comments: ${error.message}`);
    }
  }

  const follows: { follower_id: string; target_type: string; target_id: string }[] = [];
  const seenFollows = new Set<string>();
  for (const profile of profiles) {
    for (let i = 0; i < intBetween(rng, 0, 8); i++) {
      const target = pick(rng, profiles);
      if (target.id === profile.id) continue;
      const key = `${profile.id}|${target.id}`;
      if (seenFollows.has(key)) continue;
      seenFollows.add(key);
      follows.push({
        follower_id: profile.id,
        target_type: "profile",
        target_id: target.id,
      });
    }
  }

  for (let i = 0; i < follows.length; i += 500) {
    const { error } = await admin
      .from("follows")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(follows.slice(i, i + 500) as any, {
        onConflict: "follower_id,target_type,target_id",
      });
    if (error) throw new Error(`follows: ${error.message}`);
  }

  return {
    likes: likes.length,
    comments: (existingComments ?? 0) === 0 ? comments.length : 0,
    follows: follows.length,
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const admin = adminClient();
  await requireTables(admin, [
    "posts",
    "services",
    "equipment",
    "jobs",
    "events",
    "reviews",
  ]);

  const rng = makeRng(31337);
  const profiles = await loadProfiles(admin);
  const companies = await loadCompanies(admin);

  const posts = await seedPosts(admin, profiles, rng);
  console.log(`Posts: ${posts.inserted} inserted, ${posts.updated} updated.`);

  const services = await seedServices(admin, profiles, rng);
  console.log(`Services: ${services.inserted} inserted, ${services.updated} updated.`);

  const equipment = await seedEquipment(admin, profiles, rng);
  console.log(`Equipment: ${equipment.inserted} inserted, ${equipment.updated} updated.`);

  const jobs = await seedJobs(admin, profiles, companies, rng);
  console.log(`Jobs: ${jobs.inserted} inserted, ${jobs.updated} updated.`);

  const events = await seedEvents(admin, profiles, rng);
  console.log(`Events: ${events.inserted} inserted, ${events.updated} updated.`);

  const reviews = await seedReviews(admin, profiles, rng);
  console.log(`Reviews: ${reviews.inserted}.`);

  const engagement = await seedEngagement(admin, profiles, rng);
  console.log(
    `Engagement: ${engagement.likes} likes, ${engagement.comments} comments, ${engagement.follows} follows.`,
  );

  console.log("Ecosystem seeded. Open /community, /services, /equipment, /jobs, /events.");
}

await main();
