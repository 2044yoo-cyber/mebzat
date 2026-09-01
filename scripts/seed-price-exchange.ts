// Demo dataset for the Construction Price Exchange. FOR DEV/TESTING/DEMOS ONLY.
//
//   node --env-file=.env.local scripts/seed-price-exchange.ts
//   (or: npm run seed:prices)
//
// Idempotent: listings are matched on (supplier_id, sector, item, unit), so
// re-running updates in place rather than duplicating the market. Requires
// migration 0009_price_exchange.sql (see SETUP.md).
//
// Material and furniture listings mirror the products already in the
// marketplace, so the exchange and the catalogue quote the same figure. Labour
// and project rates have no catalogue equivalent, so they come from the tables
// below — indicative Ethiopian rates, fictional like the rest of the demo.

import { adminClient, requireTables, type Admin } from "./lib/admin.ts";
import { CITIES } from "./lib/fictional.ts";
import { chance, intBetween, makeRng, pick, type Rng } from "./lib/rng.ts";

const HISTORY_DAYS = 365;
const HISTORY_POINTS = 40;
const MAX_PRODUCT_LISTINGS = 120;

type SeedListing = {
  supplier_id: string;
  company_id?: string | null;
  product_id?: string | null;
  sector: "material" | "labor" | "furniture" | "project";
  item: string;
  category: string;
  specification: string | null;
  brand: string | null;
  unit: string;
  current_price: number;
  currency: string;
  location_city: string | null;
  delivery_days: number | null;
  availability: "in_stock" | "made_to_order" | "out_of_stock" | "available" | "booked";
  verified: boolean;
};

// [item, category, specification, unit, low, high]
const LABOR_RATES: [string, string, string, string, number, number][] = [
  ["Mason (skilled)", "Masonry", "HCB and stone walling, per day", "day", 800, 1400],
  ["Mason's assistant", "Masonry", "Mixing, hauling, per day", "day", 400, 700],
  ["Carpenter (formwork)", "Carpentry", "Slab and column formwork, per day", "day", 900, 1600],
  ["Steel fixer", "Reinforcement", "Cutting, bending and tying rebar, per day", "day", 900, 1500],
  ["Concrete finisher", "Concrete", "Screeding and power float, per day", "day", 850, 1400],
  ["Plasterer", "Finishes", "Internal and external render, per m²", "m²", 90, 180],
  ["Tiler", "Finishes", "Floor and wall tiling, per m²", "m²", 120, 260],
  ["Painter", "Finishes", "Two coats plus primer, per m²", "m²", 60, 130],
  ["Electrician", "MEP", "First and second fix, per point", "point", 350, 750],
  ["Plumber", "MEP", "Supply and waste, per fixture", "fixture", 900, 2200],
  ["Welder / metal worker", "Metalwork", "Gates, railings, per day", "day", 1000, 1800],
  ["Site foreman", "Supervision", "Day-to-day site control, per day", "day", 1500, 2800],
  ["General labourer", "General", "Unskilled site labour, per day", "day", 350, 600],
  ["Excavator with operator", "Earthworks", "20-tonne tracked, per hour", "hour", 2200, 3800],
  ["Scaffolder", "Access", "Erect and strike, per m²", "m²", 70, 150],
];

const PROJECT_RATES: [string, string, string, string, number, number][] = [
  ["Residential villa (standard finish)", "Residential", "G+0, block walls, ceramic finishes", "m²", 22000, 34000],
  ["Residential villa (high finish)", "Residential", "G+1, imported finishes, aluminium windows", "m²", 38000, 62000],
  ["Apartment block shell", "Residential", "Frame, slabs and envelope only", "m²", 16000, 24000],
  ["Apartment fit-out", "Residential", "Finishes, MEP and joinery", "m²", 11000, 19000],
  ["Office fit-out", "Commercial", "Partitions, ceilings, lighting, data", "m²", 14000, 26000],
  ["Retail shop fit-out", "Commercial", "Shopfront, flooring, display lighting", "m²", 12000, 23000],
  ["Warehouse (steel frame)", "Industrial", "Portal frame, sheeting, concrete floor", "m²", 9000, 16000],
  ["Boundary wall", "Site works", "HCB with coping and plaster, per metre", "m", 3500, 6500],
  ["Site clearance and levelling", "Site works", "Strip, cut and fill, per m²", "m²", 250, 600],
  ["Reinforced concrete slab", "Structure", "C-25, 150mm, including formwork", "m²", 2200, 3600],
  ["Swimming pool", "Amenity", "Reinforced concrete, tiled, filtration", "m²", 42000, 78000],
  ["Landscaping", "Amenity", "Soft and hard landscape, per m²", "m²", 1400, 3200],
];

const FURNITURE_RATES: [string, string, string, string, number, number][] = [
  ["Kitchen cabinets (MDF)", "Joinery", "Melamine faced, soft-close, per linear metre", "m", 9000, 18000],
  ["Wardrobe (built-in)", "Joinery", "Full height, sliding doors, per m²", "m²", 7500, 15000],
  ["Interior door (solid core)", "Doors", "Painted, with frame and ironmongery", "unit", 6500, 14000],
  ["Office desk (1.4m)", "Office", "Laminate top, steel frame", "unit", 8000, 19000],
  ["Reception counter", "Office", "Corian top, LED trim, per linear metre", "m", 22000, 45000],
  ["Dining set (6 seat)", "Home", "Solid wood, upholstered chairs", "set", 28000, 70000],
];

function priceIn(rng: Rng, low: number, high: number): number {
  // Rounded to something a supplier would actually quote.
  const raw = low + rng() * (high - low);
  const step = raw > 5000 ? 500 : raw > 500 ? 50 : 10;
  return Math.round(raw / step) * step;
}

function laborAvailability(rng: Rng) {
  return chance(rng, 0.15) ? ("booked" as const) : ("available" as const);
}

function materialAvailability(rng: Rng) {
  if (chance(rng, 0.08)) return "out_of_stock" as const;
  if (chance(rng, 0.15)) return "made_to_order" as const;
  return "in_stock" as const;
}

/** Suppliers to hang the labour, project and furniture rates on. */
async function loadSuppliers(admin: Admin) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, verification_status, location_city")
    .not("username", "is", null)
    .limit(60);
  if (error) throw new Error(`profiles: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("No profiles found. Run `npm run seed` first.");
  }
  return data;
}

/** Marketplace products become material and furniture listings. */
async function listingsFromProducts(admin: Admin, rng: Rng): Promise<SeedListing[]> {
  const { data, error } = await admin
    .from("products")
    .select(
      "id, owner_id, title, brand, price, currency, unit, stock_status, location_city, category:product_categories(name, slug)",
    )
    .eq("status", "published")
    .not("price", "is", null)
    .limit(MAX_PRODUCT_LISTINGS);
  if (error) throw new Error(`products: ${error.message}`);

  const rows: SeedListing[] = [];
  for (const product of data ?? []) {
    const category = (product as { category?: { name?: string; slug?: string } })
      .category;
    const slug = category?.slug ?? "";
    // Only the sectors the exchange trades; services and the rest stay out.
    const sector = slug.includes("furniture") ? "furniture" : "material";

    rows.push({
      supplier_id: product.owner_id,
      product_id: product.id,
      sector,
      item: product.title,
      category: category?.name ?? "General",
      specification: null,
      brand: product.brand,
      unit: product.unit ?? "unit",
      current_price: Number(product.price),
      currency: product.currency,
      location_city: product.location_city,
      delivery_days: intBetween(rng, 1, 14),
      availability:
        product.stock_status === "out_of_stock"
          ? "out_of_stock"
          : product.stock_status === "made_to_order"
            ? "made_to_order"
            : "in_stock",
      verified: chance(rng, 0.45),
    });
  }
  return rows;
}

function ratesToListings(
  rates: [string, string, string, string, number, number][],
  sector: SeedListing["sector"],
  suppliers: { id: string; location_city: string | null }[],
  rng: Rng,
  quotesPerRate: number,
): SeedListing[] {
  const rows: SeedListing[] = [];
  for (const [item, category, specification, unit, low, high] of rates) {
    // Several suppliers quote the same line, which is what makes it a market.
    const used = new Set<string>();
    for (let i = 0; i < quotesPerRate; i++) {
      const supplier = pick(rng, suppliers);
      if (used.has(supplier.id)) continue;
      used.add(supplier.id);

      rows.push({
        supplier_id: supplier.id,
        sector,
        item,
        category,
        specification,
        brand: null,
        unit,
        current_price: priceIn(rng, low, high),
        currency: "ETB",
        location_city: supplier.location_city ?? pick(rng, CITIES),
        delivery_days: sector === "labor" ? null : intBetween(rng, 2, 30),
        availability:
          sector === "labor" || sector === "project"
            ? laborAvailability(rng)
            : materialAvailability(rng),
        verified: chance(rng, 0.4),
      });
    }
  }
  return rows;
}

/**
 * Upserts listings and returns their ids.
 *
 * There is no unique constraint on (supplier_id, sector, item, unit) — the
 * table allows a supplier to quote the same line twice — so idempotence is
 * done by reading what is already there and updating it, rather than by
 * `on conflict`.
 */
async function upsertListings(admin: Admin, rows: SeedListing[]) {
  const { data: existing, error } = await admin
    .from("price_listings")
    .select("id, supplier_id, sector, item, unit")
    .limit(5000);
  if (error) throw new Error(`price_listings read: ${error.message}`);

  const key = (r: { supplier_id: string; sector: string; item: string; unit: string }) =>
    `${r.supplier_id}|${r.sector}|${r.item}|${r.unit}`;
  const byKey = new Map((existing ?? []).map((row) => [key(row), row.id]));

  const inserts: SeedListing[] = [];
  const ids: string[] = [];

  for (const row of rows) {
    const id = byKey.get(key(row));
    if (id) {
      const { error: updateError } = await admin
        .from("price_listings")
        .update({
          current_price: row.current_price,
          specification: row.specification,
          brand: row.brand,
          location_city: row.location_city,
          delivery_days: row.delivery_days,
          availability: row.availability,
          published: true,
        })
        .eq("id", id);
      if (updateError) throw new Error(`price_listings update: ${updateError.message}`);
      ids.push(id);
    } else {
      inserts.push(row);
    }
  }

  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { data, error: insertError } = await admin
      .from("price_listings")
      .insert(chunk)
      .select("id");
    if (insertError) throw new Error(`price_listings insert: ${insertError.message}`);
    ids.push(...(data ?? []).map((row) => row.id));
  }

  return { ids, inserted: inserts.length, updated: rows.length - inserts.length };
}

/**
 * Back-fills a year of price points so the charts have a shape.
 *
 * Written straight to price_history rather than by moving current_price a
 * hundred times, which would fire the notification trigger for every step.
 */
async function seedHistory(admin: Admin, listingIds: string[], rng: Rng) {
  const { data: listings, error } = await admin
    .from("price_listings")
    .select("id, current_price, currency")
    .in("id", listingIds.slice(0, 400));
  if (error) throw new Error(`price_listings read: ${error.message}`);

  const rows: { listing_id: string; price: number; currency: string; recorded_at: string }[] = [];

  for (const listing of listings ?? []) {
    // Walk backwards from today so the series ends on the live price.
    let price = Number(listing.current_price);
    const points: { price: number; at: Date }[] = [];
    for (let step = 0; step < HISTORY_POINTS; step++) {
      const at = new Date(
        Date.now() - (step * HISTORY_DAYS * 86_400_000) / HISTORY_POINTS,
      );
      points.push({ price, at });
      // Construction prices drift up over time, so going back means going down.
      const drift = 1 - (rng() * 0.03 + 0.002);
      price = Math.max(1, Math.round(price * drift));
    }
    for (const point of points) {
      rows.push({
        listing_id: listing.id,
        price: point.price,
        currency: listing.currency,
        recorded_at: point.at.toISOString(),
      });
    }
  }

  // Replace rather than append, so re-running does not stack a second series.
  for (let i = 0; i < listingIds.length; i += 100) {
    const chunk = listingIds.slice(i, i + 100);
    const { error: deleteError } = await admin
      .from("price_history")
      .delete()
      .in("listing_id", chunk);
    if (deleteError) throw new Error(`price_history delete: ${deleteError.message}`);
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await admin
      .from("price_history")
      .insert(rows.slice(i, i + 500));
    if (insertError) throw new Error(`price_history insert: ${insertError.message}`);
  }

  return rows.length;
}

/** Competing offers, so the market shows a spread rather than one number. */
async function seedBids(
  admin: Admin,
  listingIds: string[],
  suppliers: { id: string }[],
  rng: Rng,
) {
  const { data: listings, error } = await admin
    .from("price_listings")
    .select("id, supplier_id, current_price, currency, unit")
    .in("id", listingIds.slice(0, 300));
  if (error) throw new Error(`price_listings read: ${error.message}`);

  const rows: {
    listing_id: string;
    bidder_id: string;
    price: number;
    currency: string;
    unit: string;
    delivery_days: number | null;
    note: string | null;
  }[] = [];

  for (const listing of listings ?? []) {
    if (!chance(rng, 0.55)) continue;

    const bidders = new Set<string>();
    for (let i = 0; i < intBetween(rng, 1, 4); i++) {
      const bidder = pick(rng, suppliers);
      // The unique constraint is one bid per bidder, and self-bids are rejected
      // by the action, so the demo data respects both.
      if (bidder.id === listing.supplier_id || bidders.has(bidder.id)) continue;
      bidders.add(bidder.id);

      // Mostly undercutting, occasionally above on a premium offer.
      const factor = chance(rng, 0.8)
        ? 1 - (rng() * 0.18 + 0.02)
        : 1 + rng() * 0.1;

      rows.push({
        listing_id: listing.id,
        bidder_id: bidder.id,
        price: Math.max(1, Math.round(Number(listing.current_price) * factor)),
        currency: listing.currency,
        unit: listing.unit,
        delivery_days: chance(rng, 0.6) ? intBetween(rng, 1, 21) : null,
        note: chance(rng, 0.4)
          ? pick(rng, [
              "Price holds for 14 days.",
              "Minimum order of 10 units.",
              "Delivery within Addis Ababa included.",
              "Payment 50% up front, balance on delivery.",
              "Ex-works; transport quoted separately.",
            ])
          : null,
      });
    }
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error: upsertError } = await admin
      .from("price_bids")
      .upsert(rows.slice(i, i + 200), { onConflict: "listing_id,bidder_id" });
    if (upsertError) throw new Error(`price_bids upsert: ${upsertError.message}`);
  }

  return rows.length;
}

async function main() {
  const admin = adminClient();
  await requireTables(admin, ["price_listings", "price_bids", "price_history"]);

  const rng = makeRng(9009);
  const suppliers = await loadSuppliers(admin);

  const rows: SeedListing[] = [
    ...(await listingsFromProducts(admin, rng)),
    ...ratesToListings(LABOR_RATES, "labor", suppliers, rng, 4),
    ...ratesToListings(PROJECT_RATES, "project", suppliers, rng, 3),
    ...ratesToListings(FURNITURE_RATES, "furniture", suppliers, rng, 3),
  ];

  const { ids, inserted, updated } = await upsertListings(admin, rows);
  console.log(`Listings: ${inserted} inserted, ${updated} updated.`);

  const historyRows = await seedHistory(admin, ids, rng);
  console.log(`History: ${historyRows} points.`);

  const bidRows = await seedBids(admin, ids, suppliers, rng);
  console.log(`Bids: ${bidRows}.`);

  console.log("Price Exchange seeded. Open /price-exchange.");
}

await main();
