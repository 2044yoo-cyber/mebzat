"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, Heart, ImageOff, MessageSquare, ShoppingCart } from "lucide-react";

import type { PortfolioCard, SectionId } from "@/lib/portfolio/model";
import { cn } from "@/lib/utils";

/**
 * Hosts the image optimiser is configured for (next.config.ts). Anything else
 * is shown as a plain lazy image rather than handed to `next/image`, which
 * would refuse it and take the card down with it.
 */
const OPTIMISED = new Set(
  [process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null, "image.pollinations.ai", "api.dicebear.com"].filter(Boolean) as string[],
);
function optimisable(src: string) {
  try { return OPTIMISED.has(new URL(src).host); } catch { return false; }
}

function Thumb({ src, alt, sizes, className }: { src: string | null; alt: string; sizes: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {src ? (
        optimisable(src) ? (
          <Image src={src} alt={alt} fill sizes={sizes} className="object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a host the optimiser is not configured for
          <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        )
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground"><ImageOff className="size-6" aria-hidden /></div>
      )}
    </div>
  );
}

function Stats({ stats }: { stats: PortfolioCard["stats"] }) {
  const items = [
    stats.likes !== undefined ? { icon: Heart, value: stats.likes, label: "likes" } : null,
    stats.comments !== undefined ? { icon: MessageSquare, value: stats.comments, label: "comments" } : null,
    stats.views !== undefined ? { icon: Eye, value: stats.views, label: "views" } : null,
  ].filter(Boolean) as { icon: typeof Heart; value: number; label: string }[];
  if (!items.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
      {items.map((item) => <span key={item.label} className="inline-flex items-center gap-1" aria-label={`${item.value} ${item.label}`}><item.icon className="size-3.5" aria-hidden />{item.value}</span>)}
    </span>
  );
}

const format = (price: NonNullable<PortfolioCard["price"]>) =>
  `${price.currency} ${price.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${price.per ? ` / ${price.per}` : ""}`;

function Badge({ text }: { text: string | null }) {
  return text ? <span className="absolute left-2 top-2 z-10 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">{text}</span> : null;
}

/** How a section's cards are laid out: wide pictures, listings, files, or text. */
export const SECTION_GRID: Record<SectionId, string> = {
  // Container queries on the workspace (`/ws`), not the viewport: the column
  // is narrower than the screen whenever the rail or the side panel is open.
  projects: "grid grid-cols-1 gap-3 @sm/ws:grid-cols-2 @4xl/ws:grid-cols-3",
  marketplace: "grid grid-cols-1 gap-3 @2xl/ws:grid-cols-2",
  digital: "grid grid-cols-2 gap-3 @2xl/ws:grid-cols-3",
  designs: "grid grid-cols-2 gap-3 @2xl/ws:grid-cols-3 @5xl/ws:grid-cols-4",
  services: "grid grid-cols-1 gap-3 @2xl/ws:grid-cols-2",
  other: "grid grid-cols-1 gap-3 @2xl/ws:grid-cols-2",
};

export function PortfolioCardView({ card, section, onOpen }: { card: PortfolioCard; section: SectionId; onOpen: () => void }) {
  const base = "group relative block min-w-0 overflow-hidden rounded-2xl border bg-card transition-colors hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-brand";

  // Words first: posts and jobs carry no picture, and an empty grey box above
  // them would be most of the card.
  if (!card.image && (card.source === "post" || card.source === "job")) {
    return (
      <Link href={card.href} onClick={onOpen} className={cn(base, "p-3")} aria-label={card.title}>
        {card.badge ? <span className="mb-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{card.badge}</span> : null}
        <p className="line-clamp-2 text-sm font-semibold">{card.title}</p>
        {card.excerpt ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{card.excerpt}</p> : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{card.subtitle}</span>
          <Stats stats={card.stats} />
        </div>
      </Link>
    );
  }

  if (section === "marketplace" || section === "services" || section === "other") {
    return (
      <Link href={card.href} onClick={onOpen} className={cn(base, "flex")} aria-label={card.title}>
        <div className="relative w-28 shrink-0 sm:w-36">
          <Badge text={card.badge} />
          <Thumb src={card.image} alt={card.title} sizes="144px" className="absolute inset-0" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-3">
          <p className="line-clamp-2 text-sm font-semibold">{card.title}</p>
          {card.subtitle ? <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p> : null}
          {card.price ? <p className="mt-auto pt-1 text-sm font-semibold text-brand">{format(card.price)}</p> : <span className="mt-auto" />}
          <Stats stats={card.stats} />
        </div>
      </Link>
    );
  }

  if (section === "digital") {
    return (
      <Link href={card.href} onClick={onOpen} className={cn(base, "flex flex-col")} aria-label={card.title}>
        <div className="relative p-1.5 pb-0">
          <Badge text={card.badge} />
          <Thumb src={card.image} alt={card.title} sizes="(max-width: 768px) 50vw, 33vw" className="aspect-[4/3] rounded-xl" />
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-2 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold">{card.title}</p>
            <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p>
            {card.price ? <p className="text-sm font-semibold text-brand">{format(card.price)}</p> : <p className="text-xs text-muted-foreground">Free</p>}
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/50 text-brand" aria-hidden><ShoppingCart className="size-4" /></span>
        </div>
      </Link>
    );
  }

  // Pictures: projects, designs, tours.
  return (
    <Link href={card.href} onClick={onOpen} className={cn(base, "flex flex-col")} aria-label={card.title}>
      <div className="relative">
        <Badge text={card.badge} />
        <Thumb src={card.image} alt={card.title} sizes={section === "projects" ? "(max-width: 420px) 100vw, (max-width: 1024px) 50vw, 33vw" : "(max-width: 768px) 50vw, 25vw"} className={section === "projects" ? "aspect-[16/10]" : "aspect-square"} />
      </div>
      <div className="flex min-w-0 items-end justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{card.title}</p>
          {card.subtitle ? <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p> : null}
        </div>
        <Stats stats={card.stats} />
      </div>
    </Link>
  );
}

export function CardSkeleton({ section }: { section: SectionId }) {
  const wide = section === "marketplace" || section === "services" || section === "other";
  return <div className={cn("animate-pulse rounded-2xl border bg-muted/50", wide ? "h-28" : section === "projects" ? "aspect-[16/12]" : "aspect-[4/5]")} aria-hidden />;
}
