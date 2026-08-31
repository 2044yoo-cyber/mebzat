"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Gavel,
  HardHat,
  MapPin,
  Package,
  Star,
  Store,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatPrice } from "@/lib/utils";

/**
 * Everything the old homepage showed, in a 300px column.
 *
 * Built in the same language as the Invest widget below it, because that is
 * the one part of this panel people actually read: a headline stat block, a
 * bar you can compare at a glance, two or three real rows, and one button
 * that goes somewhere. A list of text links carries the same information and
 * nobody looks at it twice.
 *
 * Every bar here measures something real and says what it is measuring. A
 * price row's bar is the best bid against the asking price; a company's is
 * its rating out of five; an equipment row's is its day rate against the
 * dearest machine on the list. None of them are decoration.
 *
 * Three tabs rather than one long scroll: Market is what things cost and who
 * sells them, Build is the work and the firms doing it, People is who to talk
 * to.
 */

export type PanelData = {
  prices: {
    id: string;
    item: string;
    unit: string;
    price: number;
    currency: string;
    bidCount: number;
    highestBid: number | null;
    verified: boolean;
    city: string | null;
  }[];
  companies: {
    id: string;
    slug: string;
    name: string;
    category: string | null;
    logoUrl: string | null;
    verified: boolean;
    rating: number;
    city: string | null;
  }[];
  equipment: {
    id: string;
    title: string;
    dailyRate: number | null;
    currency: string;
    city: string | null;
    imageUrl: string | null;
  }[];
  products: {
    id: string;
    title: string;
    price: number | null;
    currency: string;
    unit: string | null;
    brand: string | null;
    imageUrl: string | null;
  }[];
  projects: {
    id: string;
    title: string;
    coverUrl: string | null;
    buildingType: string | null;
    city: string | null;
  }[];
  professionals: {
    username: string;
    name: string;
    accountType: string | null;
    avatarUrl: string | null;
    city: string | null;
  }[];
};

type TabId = "market" | "build" | "people";

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: "market", label: "Market", emoji: "📈" },
  { id: "build", label: "Build", emoji: "🏗" },
  { id: "people", label: "People", emoji: "👥" },
];

export function HomePanelClient({
  data,
  children,
}: {
  data: PanelData;
  /** Medosha Invest, rendered on the server and slotted into the Build tab. */
  children?: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("market");

  return (
    <div className="space-y-4">
      {/* Sticky, because the panel scrolls and losing the way back to the
          other two tabs three sections down is how a column like this stops
          being used. */}
      <div
        role="tablist"
        aria-label="Panel sections"
        className="sticky top-0 z-10 -mx-1 flex gap-1 bg-background/90 px-1 pb-2 backdrop-blur"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors",
              tab === entry.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden>{entry.emoji}</span>
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "market" && (
        <>
          <Prices rows={data.prices} />
          <Products items={data.products} />
          <Equipment items={data.equipment} />
        </>
      )}

      {tab === "build" && (
        <>
          <Projects items={data.projects} />
          <Companies items={data.companies} />
          {children}
        </>
      )}

      {tab === "people" && <Professionals items={data.professionals} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The shape every section shares — the Invest widget's shape
// ---------------------------------------------------------------------------

function Panel({
  title,
  icon: Icon,
  blurb,
  stats,
  meter,
  children,
  href,
  cta,
  ctaIcon: CtaIcon,
}: {
  title: string;
  icon: LucideIcon;
  blurb: string;
  stats: { label: string; value: string; icon?: React.ReactNode }[];
  meter?: { label: string; pct: number; note?: string };
  children?: React.ReactNode;
  href: string;
  cta: string;
  ctaIcon: LucideIcon;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-4 text-brand" />
        {title}
      </h2>

      <p className="text-sm text-muted-foreground">{blurb}</p>

      <div className="rounded-2xl border p-3">
        <dl className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <Stat key={stat.label} {...stat} />
          ))}
        </dl>

        {meter && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">{meter.label}</span>
              <span className="font-semibold text-brand tabular-nums">
                {meter.note ?? `${Math.round(meter.pct)}%`}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(meter.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={meter.label}
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(0, meter.pct))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {children}

      <Link
        href={href}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
      >
        <CtaIcon className="size-3.5" />
        {cta}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-lg leading-tight font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * One row: a bordered card with a headline, a sub-line, a figure and a bar.
 *
 * The same card the Invest widget uses for a project, because the reason it
 * reads well there is that the bar gives you the comparison before you have
 * read a word.
 */
function MeterRow({
  href,
  title,
  subtitle,
  figure,
  figureTone = "brand",
  pct,
  thumb,
}: {
  href: string;
  title: React.ReactNode;
  subtitle: string;
  figure: string;
  figureTone?: "brand" | "good" | "warn" | "plain";
  pct: number;
  thumb?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-xl border p-2.5 transition-colors hover:border-brand"
      >
        {/* The title gets the full width of its own line. A 300px column
            cannot hold "Porcelain floor tile, 60×60 polished" and a price
            side by side, and trying pushed the price off the card. */}
        <span className="flex min-w-0 items-center gap-1.5">
          {thumb}
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        </span>

        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
          <span
            className={cn(
              "shrink-0 text-xs font-semibold tabular-nums",
              figureTone === "good" && "text-emerald-600 dark:text-emerald-400",
              figureTone === "warn" && "text-amber-600 dark:text-amber-400",
              figureTone === "brand" && "text-brand",
              figureTone === "plain" && "text-foreground",
            )}
          >
            {figure}
          </span>
        </div>

        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              figureTone === "good"
                ? "bg-emerald-500"
                : figureTone === "warn"
                  ? "bg-amber-500"
                  : "bg-brand",
            )}
            style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
          />
        </div>
      </Link>
    </li>
  );
}

/** A 20px square thumbnail, inline with a row's title. */
function Thumb({ src, icon: Icon }: { src: string | null; icon: LucideIcon }) {
  if (!src) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Icon className="size-3" />
      </span>
    );
  }
  return (
    <span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted">
      <Image src={src} alt="" fill sizes="20px" className="object-cover" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

function Prices({ rows }: { rows: PanelData["prices"] }) {
  if (rows.length === 0) return null;

  const verified = rows.filter((row) => row.verified).length;
  const bids = rows.reduce((total, row) => total + row.bidCount, 0);
  const cities = new Set(rows.map((row) => row.city).filter(Boolean)).size;
  const busiest = rows.reduce((top, row) => Math.max(top, row.bidCount), 0);

  return (
    <Panel
      title="Material prices"
      icon={TrendingUp}
      blurb="What materials are going for, and what buyers are bidding"
      stats={[
        { label: "Listings", value: String(rows.length) },
        { label: "Open bids", value: String(bids), icon: <Gavel className="size-3" /> },
        {
          label: "Verified",
          value: String(verified),
          icon: <BadgeCheck className="size-3" />,
        },
        { label: "Cities", value: String(cities), icon: <MapPin className="size-3" /> },
      ]}
      meter={{
        label: "Verified suppliers",
        pct: (verified / rows.length) * 100,
        note: `${verified} of ${rows.length}`,
      }}
      href="/price-exchange?sector=material"
      cta="Open Price Exchange"
      ctaIcon={TrendingUp}
    >
      <ul className="space-y-2">
        {rows.slice(0, 3).map((row) => {
          // The best bid against the asking price. Above zero means buyers
          // are bidding over the ask, which is the interesting case.
          const spread =
            row.highestBid != null && row.price > 0
              ? ((row.highestBid - row.price) / row.price) * 100
              : null;

          return (
            <MeterRow
              key={row.id}
              href={`/price-exchange/${row.id}`}
              title={row.item}
              subtitle={
                `${formatPrice(row.price, row.currency)} per ${row.unit}` +
                (row.bidCount > 0
                  ? ` · ${row.bidCount === 1 ? "1 bid" : `${row.bidCount} bids`}`
                  : "")
              }
              figure={
                spread != null
                  ? `${spread >= 0 ? "+" : ""}${spread.toFixed(1)}%`
                  : row.bidCount > 0
                    ? "Bidding"
                    : "No bids"
              }
              figureTone={
                spread == null ? "plain" : spread >= 0 ? "good" : "warn"
              }
              // One meaning for every bar in this section: how much bidding
              // interest this listing has, against the busiest one on screen.
              // Mixing that with a price spread on the same bar made three
              // full bars that all meant something different.
              pct={busiest === 0 ? 0 : (row.bidCount / busiest) * 100}
            />
          );
        })}
      </ul>
    </Panel>
  );
}

function Products({ items }: { items: PanelData["products"] }) {
  if (items.length === 0) return null;

  const priced = items.filter(
    (item): item is (typeof items)[number] & { price: number } =>
      item.price != null,
  );
  const dearest = priced.reduce((top, item) => Math.max(top, item.price), 0);
  const cheapest = priced.reduce(
    (low, item) => Math.min(low, item.price),
    Number.POSITIVE_INFINITY,
  );
  const currency = items[0]?.currency ?? "ETB";

  return (
    <Panel
      title="Marketplace"
      icon={Store}
      blurb="What is selling on Medosha right now"
      stats={[
        { label: "Products", value: String(items.length) },
        { label: "With photos", value: String(items.filter((i) => i.imageUrl).length) },
        {
          label: "From",
          value: priced.length > 0 ? formatPrice(cheapest, currency) : "—",
        },
        {
          label: "Up to",
          value: priced.length > 0 ? formatPrice(dearest, currency) : "—",
        },
      ]}
      href="/marketplace"
      cta="Browse the marketplace"
      ctaIcon={Store}
    >
      <ul className="space-y-2">
        {items.slice(0, 3).map((item) => (
          <MeterRow
            key={item.id}
            href={`/marketplace/${item.id}`}
            title={item.title}
            subtitle={
              [item.brand, item.unit ? `per ${item.unit}` : null]
                .filter(Boolean)
                .join(" · ") || "In the marketplace"
            }
            figure={
              item.price == null
                ? "—"
                : formatPrice(item.price, item.currency)
            }
            figureTone="plain"
            // Where this sits against the dearest thing on the list.
            pct={item.price == null || dearest === 0 ? 0 : (item.price / dearest) * 100}
            thumb={<Thumb src={item.imageUrl} icon={Package} />}
          />
        ))}
      </ul>
    </Panel>
  );
}

function Equipment({ items }: { items: PanelData["equipment"] }) {
  if (items.length === 0) return null;

  const rates = items
    .map((item) => item.dailyRate)
    .filter((rate): rate is number => rate != null);
  const dearest = rates.reduce((top, rate) => Math.max(top, rate), 0);
  const cities = new Set(items.map((item) => item.city).filter(Boolean)).size;
  const currency = items[0]?.currency ?? "ETB";

  return (
    <Panel
      title="Equipment for hire"
      icon={Truck}
      blurb="Plant and machinery available this week"
      stats={[
        { label: "Machines", value: String(items.length) },
        { label: "Cities", value: String(cities), icon: <MapPin className="size-3" /> },
        {
          label: "From",
          value:
            rates.length > 0
              ? formatPrice(Math.min(...rates), currency)
              : "—",
        },
        {
          label: "Per day up to",
          value: rates.length > 0 ? formatPrice(dearest, currency) : "—",
        },
      ]}
      href="/equipment"
      cta="All equipment"
      ctaIcon={Truck}
    >
      <ul className="space-y-2">
        {items.slice(0, 3).map((item) => (
          <MeterRow
            key={item.id}
            href={`/equipment/${item.id}`}
            title={item.title}
            subtitle={item.city ?? "Location on request"}
            figure={
              item.dailyRate == null
                ? "—"
                : `${formatPrice(item.dailyRate, item.currency)}/day`
            }
            figureTone="plain"
            pct={
              item.dailyRate == null || dearest === 0
                ? 0
                : (item.dailyRate / dearest) * 100
            }
            thumb={<Thumb src={item.imageUrl} icon={Truck} />}
          />
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function Projects({ items }: { items: PanelData["projects"] }) {
  if (items.length === 0) return null;

  const cities = new Set(items.map((item) => item.city).filter(Boolean)).size;
  const types = new Set(
    items.map((item) => item.buildingType).filter(Boolean),
  ).size;

  return (
    <Panel
      title="Recent projects"
      icon={HardHat}
      blurb="Work being built and finished across the country"
      stats={[
        { label: "Published", value: String(items.length) },
        { label: "Cities", value: String(cities), icon: <MapPin className="size-3" /> },
        { label: "Building types", value: String(types) },
        { label: "With photos", value: String(items.filter((i) => i.coverUrl).length) },
      ]}
      href="/projects"
      cta="All projects"
      ctaIcon={HardHat}
    >
      {/* Projects get pictures, not bars. A building described in one line of
          text is nothing; the strip fits six covers into the height of two
          rows and swipes on a touchpad or a phone. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="group w-28 shrink-0"
          >
            <span className="relative block aspect-4/3 w-full overflow-hidden rounded-xl border bg-muted transition-colors group-hover:border-brand">
              {project.coverUrl && (
                <Image
                  src={project.coverUrl}
                  alt=""
                  fill
                  sizes="112px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </span>
            <span className="mt-1 block truncate text-xs font-medium">
              {project.title}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {project.city ?? project.buildingType ?? ""}
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function Companies({ items }: { items: PanelData["companies"] }) {
  if (items.length === 0) return null;

  const verified = items.filter((item) => item.verified).length;
  const rated = items.filter((item) => item.rating > 0);
  const average =
    rated.length > 0
      ? rated.reduce((total, item) => total + item.rating, 0) / rated.length
      : 0;
  const cities = new Set(items.map((item) => item.city).filter(Boolean)).size;

  return (
    <Panel
      title="Companies"
      icon={Building2}
      blurb="Suppliers, contractors and consultancies on Medosha"
      stats={[
        { label: "Companies", value: String(items.length) },
        {
          label: "Verified",
          value: String(verified),
          icon: <BadgeCheck className="size-3" />,
        },
        {
          label: "Average rating",
          value: average > 0 ? average.toFixed(1) : "—",
          icon: <Star className="size-3" />,
        },
        { label: "Cities", value: String(cities), icon: <MapPin className="size-3" /> },
      ]}
      meter={{
        label: "Verified companies",
        pct: (verified / items.length) * 100,
        note: `${verified} of ${items.length}`,
      }}
      href="/companies"
      cta="All companies"
      ctaIcon={Building2}
    >
      <ul className="space-y-2">
        {items.slice(0, 3).map((company) => (
          <MeterRow
            key={company.id}
            href={`/companies/${company.slug}`}
            title={
              <span className="flex items-center gap-1">
                <span className="truncate">{company.name}</span>
                {company.verified && (
                  <BadgeCheck className="size-3 shrink-0 text-brand" />
                )}
              </span>
            }
            subtitle={`${company.category ?? "Company"}${
              company.city ? ` · ${company.city}` : ""
            }`}
            figure={company.rating > 0 ? `★ ${company.rating.toFixed(1)}` : "New"}
            figureTone={company.rating >= 4.5 ? "good" : "brand"}
            // Rating out of five.
            pct={(company.rating / 5) * 100}
            thumb={<Thumb src={company.logoUrl} icon={Building2} />}
          />
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function Professionals({ items }: { items: PanelData["professionals"] }) {
  if (items.length === 0) return null;

  const cities = new Set(items.map((item) => item.city).filter(Boolean)).size;
  const roles = new Set(
    items.map((item) => item.accountType).filter(Boolean),
  ).size;

  return (
    <Panel
      title="Professionals"
      icon={Users}
      blurb="Architects, engineers, designers and trades"
      stats={[
        { label: "Professionals", value: String(items.length) },
        { label: "Cities", value: String(cities), icon: <MapPin className="size-3" /> },
        { label: "Disciplines", value: String(roles) },
        { label: "With photos", value: String(items.filter((i) => i.avatarUrl).length) },
      ]}
      href="/directory/individual"
      cta="Browse professionals"
      ctaIcon={Users}
    >
      <ul className="space-y-2">
        {items.slice(0, 4).map((person) => (
          <li key={person.username}>
            <Link
              href={`/u/${person.username}`}
              className="flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors hover:border-brand"
            >
              <Avatar className="shrink-0">
                {person.avatarUrl && (
                  <AvatarImage src={person.avatarUrl} alt="" />
                )}
                <AvatarFallback>{initials(person.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {person.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {label(person.accountType)}
                  {person.city && ` · ${person.city}`}
                </span>
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** account_type is stored snake_case; nobody wants to read "mixed_use". */
function label(accountType: string | null): string {
  if (!accountType) return "Member";
  return accountType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
