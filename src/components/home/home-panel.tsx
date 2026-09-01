import { InvestWidget } from "@/components/invest/invest-widget";
import { HomePanelClient, type PanelData } from "@/components/home/home-panel-client";
import { getCompanies } from "@/lib/data/companies";
import { getEquipment } from "@/lib/data/equipment";
import { getPrices } from "@/lib/data/price-exchange";
import { getMarketplaceProducts } from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";

/**
 * The homepage's right-hand column.
 *
 * The old homepage was twelve full-width bands — featured products, featured
 * companies, trending materials, featured projects, professionals, equipment.
 * The feed replaced the page, but that content was never worthless; it was
 * worthless *as a wall*. So it lives here instead: the same six things, at a
 * glance, beside the feed rather than instead of it.
 *
 * A server component. Six queries in parallel, rendered once, handed to a
 * client component that owns only the interaction — the tabs, the collapsing,
 * the scrolling. Nothing here is fetched in the browser.
 *
 * Every section is skipped rather than shown empty, so a database with no
 * equipment simply has no equipment section instead of a frame around
 * nothing.
 */
export async function HomePanel() {
  const supabase = await createClient();

  const [prices, companiesResult, equipmentResult, productsResult, projects] =
    await Promise.all([
      getPrices({ sector: "material", sort: "popular", page: 1 }),
      getCompanies({ pageSize: 6 }),
      getEquipment({ availableOnly: true, sort: "rating", pageSize: 6 }),
      getMarketplaceProducts({ sort: "popular", pageSize: 8 }),
      supabase
        .from("projects")
        .select("id, title, cover_image_url, building_type, location_city")
        .eq("status", "published")
        .not("cover_image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const professionals = await supabase
    .from("profiles")
    .select("username, full_name, company_name, avatar_url, account_type, location_city")
    .not("account_type", "is", null)
    .not("username", "is", null)
    .order("reputation_points", { ascending: false })
    .limit(6);

  const data: PanelData = {
    prices: prices.rows.slice(0, 6).map((row) => ({
      id: row.id,
      item: row.item,
      unit: row.unit,
      price: Number(row.current_price),
      currency: row.currency,
      // A listing with bids carries its own spread; the gap between the
      // highest bid and the asking price is the closest thing this table has
      // to a direction, and it is more honest than inventing a trend.
      bidCount: row.bid_count,
      highestBid: row.highest_bid == null ? null : Number(row.highest_bid),
      verified: row.verified,
      city: row.location_city,
    })),

    companies: companiesResult.companies.slice(0, 5).map((company) => ({
      id: company.id,
      slug: company.slug,
      name: company.name,
      category: company.category,
      logoUrl: company.logo_url,
      verified: company.verified,
      rating: Number(company.rating ?? 0),
      city: company.city,
    })),

    equipment: equipmentResult.items.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      dailyRate: item.daily_rate == null ? null : Number(item.daily_rate),
      currency: item.currency ?? "ETB",
      city: item.location_city,
      imageUrl: item.cover_image_url,
    })),

    products: productsResult.products.slice(0, 6).map((product) => ({
      id: product.id,
      title: product.title,
      price: product.price == null ? null : Number(product.price),
      currency: product.currency ?? "ETB",
      unit: product.unit,
      brand: product.brand,
      imageUrl: product.cover_image_url,
    })),

    projects: (projects.data ?? []).slice(0, 6).map((project) => ({
      id: project.id,
      title: project.title,
      coverUrl: project.cover_image_url,
      buildingType: project.building_type,
      city: project.location_city,
    })),

    professionals: (professionals.data ?? []).slice(0, 5).map((person) => ({
      username: person.username ?? "",
      name: person.full_name ?? person.company_name ?? "Medosha member",
      accountType: person.account_type,
      avatarUrl: person.avatar_url,
      city: person.location_city,
    })),
  };

  return (
    <HomePanelClient data={data}>
      {/* Invest stays a server component of its own — it reads an RPC this
          panel has no business knowing about, and it renders nothing until
          the module is set up. */}
      <InvestWidget />
    </HomePanelClient>
  );
}
