import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Building2,
  Calculator,
  Check,
  GraduationCap,
  Hospital,
  Landmark,
  Map,
  Rotate3d,
  Search,
  Sofa,
  Sparkles,
  Store,
} from "lucide-react";

import { PropertySearch } from "@/components/home/property-search";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Buy & Sell Properties.
 *
 * Sits directly below the Medosha AI band. Two premium cards, the feature
 * list, and a quick search that deep-links into the map — the search is a link
 * builder rather than a second search implementation.
 */

const FEATURES = [
  { icon: Map, label: "Interactive 3D Map" },
  { icon: Rotate3d, label: "360° Virtual Tours" },
  { icon: Search, label: "Property Search" },
  { icon: Sparkles, label: "AI Property Assistant" },
  { icon: GraduationCap, label: "Nearby Schools" },
  { icon: Hospital, label: "Nearby Hospitals" },
  { icon: Store, label: "Nearby Services" },
  { icon: Landmark, label: "Mortgage Ready", soon: true },
  { icon: Sofa, label: "Interior Design Services" },
  { icon: Calculator, label: "Cost Estimator" },
];

export function PropertySection() {
  return (
    <section className="relative isolate overflow-hidden border-b bg-neutral-950 text-neutral-100">
      {/* The band commits to dark regardless of theme, so the imagery and the
          map preview read the same way for everyone. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_60%_at_20%_0%,color-mix(in_oklch,var(--brand)_28%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:56px_56px]"
      />

      <div className="container-page py-16 sm:py-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300 backdrop-blur">
            <Building2 className="size-3 text-brand" />
            Medosha City
          </span>

          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            🏙 Buy &amp; Sell Properties
          </h2>
          <p className="mt-3 text-balance text-lg text-neutral-400">
            Explore Ethiopian properties in an interactive 3D city experience.
          </p>
        </div>

        {/* Quick search */}
        <div className="mt-8 [&_input]:border-white/15 [&_input]:bg-white/5 [&_input]:text-neutral-100 [&_input]:placeholder:text-neutral-500 [&_select]:border-white/15 [&_select]:bg-neutral-900 [&_select]:text-neutral-100">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur">
            <PropertySearch />
          </div>
        </div>

        {/* The two cards */}
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Card
            emoji="🏠"
            title="Explore Properties"
            description="Browse homes, apartments, commercial buildings, offices, land, and investment opportunities on an interactive 3D city map."
            href="/city"
            cta="Explore 3D City"
            primary
          />
          <Card
            emoji="🏗"
            title="List Property"
            description="List your property, upload photos, floor plans, and optional 360° virtual tours so buyers can explore before visiting."
            href="/property/new"
            cta="List Property"
          />
        </div>

        {/* Features */}
        <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {FEATURES.map((feature) => (
            <li
              key={feature.label}
              className="flex items-center gap-2 text-sm text-neutral-300"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Check className="size-3.5" />
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <feature.icon className="size-3.5 shrink-0 text-neutral-500" />
                <span className="truncate">{feature.label}</span>
                {feature.soon && (
                  <span className="shrink-0 rounded-full border border-white/15 px-1.5 text-[10px] text-neutral-500">
                    soon
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* Every property connects to the rest of the platform. */}
        <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-white/10 pt-6">
          <span className="flex items-center gap-1.5 text-sm text-neutral-400">
            <Boxes className="size-4" />
            Every listing connects to
          </span>
          {[
            { href: "/ai", label: "Medosha AI" },
            { href: "/ai?agent=cost", label: "Cost Estimator" },
            { href: "/ai?agent=boq", label: "BOQ Generator" },
            { href: "/ai?agent=materials", label: "Material Advisor" },
            { href: "/companies", label: "Suppliers" },
            { href: "/directory/individual", label: "Professionals" },
            { href: "/marketplace", label: "Marketplace" },
            { href: "/price-exchange", label: "Price Exchange" },
          ].map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className="rounded-full border border-white/15 px-3 py-1 text-sm text-neutral-300 transition-colors hover:border-brand hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({
  emoji,
  title,
  description,
  href,
  cta,
  primary,
}: {
  emoji: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border p-8 transition-colors",
        primary
          ? "border-brand/40 bg-gradient-to-br from-brand/20 via-white/5 to-transparent hover:border-brand"
          : "border-white/10 bg-white/5 hover:border-white/25",
      )}
    >
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>

      <h3 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 flex-1 text-neutral-400">{description}</p>

      <Link
        href={href}
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-6 w-fit",
          primary
            ? ""
            : "border border-white/20 bg-white/10 text-white hover:bg-white/20",
        )}
      >
        {cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
