import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Material Price Radar — Ethiopian Construction Reference Prices | Medosha",
  description:
    "Search construction material reference prices by material, specification, city and unit. See the source date and verification status before using a rate in your budget.",
  alternates: { canonical: "/material-price-radar" },
  openGraph: {
    title: "Material Price Radar | Medosha",
    description:
      "Compare reference prices for Ethiopian construction materials with clear dates and trust labels.",
    url: "/material-price-radar",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MaterialPriceRadarPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const get = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };

  const q = get("q").trim().slice(0, 60);
  const city = get("city").trim().slice(0, 80);
  const category = get("category").trim().slice(0, 80);
  const unit = get("unit").trim().slice(0, 40);
  const verifiedOnly = get("verified") === "1";

  const supabase = await createClient();
  let query = supabase
    .from("material_prices")
    .select(
      "id, category, subcategory, material, specification, unit, brand, city_region, price_etb, currency, vat_status, supplier, source, price_date, data_status, notes",
    )
    .is("superseded_by", null)
    .neq("data_status", "expired")
    .order("data_status", { ascending: false })
    .order("price_date", { ascending: false })
    .limit(100);

  if (q) query = query.ilike("material", `%${q}%`);
  if (city) query = query.ilike("city_region", `%${city}%`);
  if (category) query = query.ilike("category", `%${category}%`);
  if (unit) query = query.ilike("unit", `%${unit}%`);
  if (verifiedOnly) query = query.eq("data_status", "admin_verified");

  const { data, error } = await query;
  const rows = data ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
        <Link href="/build-intelligence" className="hover:text-foreground">
          Build Intelligence
        </Link>
        <span className="mx-2">/</span>
        <span aria-current="page">Material Price Radar</span>
      </nav>

      <header className="mb-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          Ethiopian construction materials
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Material Price Radar
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Find reference rates by material, city, category and unit. Every result keeps
          its source date and verification status visible, so a planning estimate is
          not mistaken for a confirmed supplier quotation.
        </p>
      </header>

      <form
        action="/material-price-radar"
        className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Material</span>
          <input name="q" defaultValue={q} placeholder="e.g. cement, rebar, MDF" className="h-10 min-w-0 rounded-lg border bg-background px-3" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">City / region</span>
          <input name="city" defaultValue={city} placeholder="e.g. Addis Ababa" className="h-10 min-w-0 rounded-lg border bg-background px-3" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Category</span>
          <input name="category" defaultValue={category} placeholder="e.g. boards, cement" className="h-10 min-w-0 rounded-lg border bg-background px-3" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Unit</span>
          <input name="unit" defaultValue={unit} placeholder="e.g. sheet, bag, m²" className="h-10 min-w-0 rounded-lg border bg-background px-3" />
        </label>
        <div className="flex flex-col justify-end gap-3">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="verified" value="1" defaultChecked={verifiedOnly} className="size-4 accent-primary" />
            Admin-verified only
          </label>
          <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Search prices
          </button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>{error ? "Price data could not be loaded." : `Showing up to ${rows.length} reference prices`}</p>
        <p className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" />
          Verification status is shown for every price
        </p>
      </div>

      {error ? (
        <div role="status" className="mt-4 rounded-xl border border-dashed p-8 text-center">
          <p className="font-semibold">The reference price book is temporarily unavailable.</p>
          <p className="mt-2 text-sm text-muted-foreground">Please try again later. No prices have been changed.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed p-10 text-center">
          <p className="font-semibold">No matching reference prices found.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a shorter material name or remove one of the filters.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Material / specification</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Reference price</th>
                  <th className="px-4 py-3 font-semibold">Unit / VAT</th>
                  <th className="px-4 py-3 font-semibold">Status / date</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-4">
                      <p className="font-semibold">{row.material}</p>
                      {row.specification && <p className="mt-1 text-xs text-muted-foreground">{row.specification}</p>}
                      {row.brand && <p className="mt-1 text-xs text-muted-foreground">Brand: {row.brand}</p>}
                      {row.subcategory && <p className="mt-1 text-xs text-muted-foreground">{row.subcategory}</p>}
                    </td>
                    <td className="px-4 py-4">{row.city_region}</td>
                    <td className="px-4 py-4 font-semibold tabular-nums">
                      {row.currency} {Number(row.price_etb).toLocaleString("en-ET", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-4">
                      <p>{row.unit}</p>
                      <p className="mt-1 text-xs text-muted-foreground">VAT: {row.vat_status.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusLabel status={row.data_status} />
                      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {row.price_date}
                      </p>
                    </td>
                    <td className="max-w-52 px-4 py-4 text-xs text-muted-foreground">
                      {row.source || row.supplier || "Source not provided"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <aside className="mt-6 rounded-xl bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
        <p className="font-semibold text-foreground">How to use these prices</p>
        <p className="mt-1">
          Admin-verified means Medosha reviewed the record. Supplier-submitted and web-sourced
          prices are not independently confirmed; educational estimates are planning baselines,
          not current market quotations. Confirm specification, delivery, VAT and availability
          with the supplier before purchasing.
        </p>
      </aside>

      <div className="mt-6">
        <Link href="/price-exchange" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Compare supplier offers in Price Exchange
        </Link>
      </div>
    </main>
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    admin_verified: "Admin verified",
    supplier_submitted: "Supplier submitted",
    web_sourced: "Web sourced",
    educational_estimate: "Educational estimate",
    expired: "Expired",
  };

  const style =
    status === "admin_verified"
      ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "educational_estimate"
        ? "border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "border-border bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${style}`}>
      {labels[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}
