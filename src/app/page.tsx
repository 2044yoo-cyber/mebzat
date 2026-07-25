import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

import { CompanyCard } from "@/components/companies/company-card";
import type { CompanyCardData } from "@/components/companies/company-card";
import { HeroSearch } from "@/components/home/hero-search";
import { TrendingCategories } from "@/components/home/trending-categories";
import { Reveal } from "@/components/layout/reveal";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ProductCard } from "@/components/products/product-card";
import { ProfileCard } from "@/components/profile/profile-card";
import type { ProfileCardData } from "@/components/profile/profile-card";
import { ProjectCard } from "@/components/projects/project-card";
import type { ProjectCardData } from "@/components/projects/project-card";
import { buttonVariants } from "@/components/ui/button";
import { getCompanies } from "@/lib/data/companies";
import { getMarketplaceProducts, getProductCategories, withFavorites } from "@/lib/data/products";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const QUICK_FILTERS = [
  { label: "Architecture", href: "/directory/individual" },
  { label: "Interior Design", href: "/directory/individual" },
  { label: "Construction", href: "/directory/contractor" },
  { label: "Furniture", href: "/marketplace?category=furniture" },
  { label: "Materials", href: "/marketplace?category=construction-materials" },
  { label: "Landscape", href: "/directory/individual" },
  { label: "Commercial", href: "/directory/developer" },
  { label: "Residential", href: "/directory/contractor" },
];

const VALUE_PROPS = [
  {
    icon: Store,
    title: "One marketplace",
    description:
      "Source materials, furniture, and fixtures from suppliers across the network.",
  },
  {
    icon: Sparkles,
    title: "Real portfolios",
    description:
      "Professionals showcase completed projects with photos, materials, and detail.",
  },
  {
    icon: MapPin,
    title: "Discover nearby",
    description:
      "Find architects, contractors, and suppliers by trade and location.",
  },
  {
    icon: MessageSquare,
    title: "Direct connections",
    description:
      "Reach out to suppliers and professionals — no middlemen, no noise.",
  },
];

export default async function Home() {
  const supabase = await createClient();

  const [
    categories,
    featuredProductsResult,
    featuredCompaniesResult,
    { data: projectsData },
    { data: professionalsData },
    { data: auth },
  ] = await Promise.all([
    getProductCategories(),
    getMarketplaceProducts({ sort: "popular", pageSize: 8 }),
    getCompanies({ pageSize: 6 }),
    supabase
      .from("projects")
      .select(
        "id, title, cover_image_url, building_type, location_city, location_country, status",
      )
      .eq("status", "published")
      .not("cover_image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("profiles")
      .select(
        "username, full_name, company_name, avatar_url, account_type, location_city, location_country",
      )
      .not("account_type", "is", null)
      .not("username", "is", null)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.auth.getUser(),
  ]);

  const featuredProducts = await withFavorites(
    featuredProductsResult.products,
    auth.user?.id,
  );
  const projects = (projectsData ?? []) as ProjectCardData[];
  const professionals = (professionalsData ?? []) as ProfileCardData[];
  const companies = featuredCompaniesResult.companies as CompanyCardData[];

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_-10%,color-mix(in_oklch,var(--brand)_22%,transparent),transparent)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-[0.04] [background-image:linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] [background-size:44px_44px]"
          />
          <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              The professional network for construction
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
              Connect homeowners, architects, contractors, suppliers, and
              developers in one intelligent platform — discover professionals,
              showcase projects, and source materials.
            </p>
            <div className="mx-auto mt-8 max-w-2xl">
              <HeroSearch />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {QUICK_FILTERS.map((filter) => (
                <Link
                  key={filter.label}
                  href={filter.href}
                  className="rounded-full border bg-background/60 px-3 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur transition-colors hover:border-brand hover:text-foreground"
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Trending categories */}
        {categories.length > 0 && (
          <Section>
            <SectionHeader
              title="Shop by category"
              href="/marketplace"
              linkLabel="All products"
            />
            <TrendingCategories categories={categories} />
          </Section>
        )}

        {/* Featured products */}
        {featuredProducts.length > 0 && (
          <Section muted>
            <SectionHeader
              title="Featured products"
              href="/marketplace"
              linkLabel="Browse marketplace"
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </Section>
        )}

        {/* Featured projects */}
        {projects.length > 0 && (
          <Section>
            <SectionHeader title="Featured projects" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </Section>
        )}

        {/* Featured professionals */}
        {professionals.length > 0 && (
          <Section muted>
            <SectionHeader
              title="Featured professionals"
              href="/directory/individual"
              linkLabel="Browse professionals"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {professionals.map((professional) => (
                <ProfileCard key={professional.username} profile={professional} />
              ))}
            </div>
          </Section>
        )}

        {/* Featured companies */}
        {companies.length > 0 && (
          <Section>
            <SectionHeader
              title="Featured companies"
              href="/companies"
              linkLabel="All companies"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
          </Section>
        )}

        {/* Value props */}
        <Section>
          <Reveal>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
                <div key={title} className="space-y-2">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-brand/10">
                    <Icon className="size-5 text-brand" />
                  </div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <div className="flex flex-col items-center gap-6 rounded-3xl border bg-brand/5 px-6 py-14 text-center">
                <div className="flex items-center gap-2 text-sm text-brand">
                  <ShieldCheck className="size-4" /> Free to join
                </div>
                <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight">
                  Build your presence in construction
                </h2>
                <p className="max-w-xl text-muted-foreground">
                  Create your profile, showcase your work, and list your
                  products in minutes.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/signup"
                    className={cn(buttonVariants({ size: "lg" }))}
                  >
                    Join Medosha <ArrowRight className="size-4" />
                  </Link>
                  <Link
                    href="/marketplace"
                    className={cn(
                      buttonVariants({ size: "lg", variant: "outline" }),
                    )}
                  >
                    Explore the marketplace
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={muted ? "border-b bg-muted/30" : "border-b"}>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Reveal>{children}</Reveal>
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {href && linkLabel && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          {linkLabel} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
