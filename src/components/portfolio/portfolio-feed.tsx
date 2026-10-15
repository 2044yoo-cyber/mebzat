"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Briefcase, FileStack, FolderKanban, Images, Layers, Loader2, Plus, RotateCw, Store, Wrench } from "lucide-react";

import { appendUnique, FILTERS, PAGE_SIZE, PREVIEW_SIZE, SECTIONS, type PortfolioCard, type SectionId } from "@/lib/portfolio/model";
import { cn } from "@/lib/utils";

import { loadPortfolioPage } from "@/app/(dashboard)/projects/portfolio-actions";

import { CardSkeleton, PortfolioCardView, SECTION_GRID } from "./portfolio-card";

/**
 * Everything the signed-in person has made, as one scroll.
 *
 * "All" is the organised portfolio: each section in turn, a preview of its
 * newest work and a link to the rest, each section fetched only when it comes
 * near the screen. A filter shows one section, page after page, as far as it
 * goes. A page is fetched once: the preview and the full list read the same
 * pages, and going back from a card restores what was loaded and where the
 * reader was, rather than starting again from the top.
 */

export type Professional = {
  profession: string | null;
  specialties: string[];
  yearsExperience: number | null;
  languages: string[];
  workStatus: string | null;
  portfolioLink: string | null;
  hasCv: boolean;
};

type View = "all" | SectionId;
type Slice = { cards: PortfolioCard[]; cursor: string | null; done: boolean; status: "idle" | "loading" | "ready" | "error"; error?: string };
type Store = Partial<Record<SectionId, Slice>>;

const ICONS: Record<SectionId, typeof FolderKanban> = { projects: FolderKanban, marketplace: Store, digital: FileStack, designs: Images, services: Wrench, other: Briefcase };

/** Where to make the first one, for an empty section — the same flows the + menu opens. */
const CREATE: Record<SectionId, { label: string; href: string }[]> = {
  projects: [{ label: "Create a project", href: "/projects/new" }],
  marketplace: [{ label: "List a product", href: "/products/new" }, { label: "List a property", href: "/property/new" }],
  digital: [{ label: "Sell a digital product", href: "/products/new?fulfilment=digital" }],
  designs: [{ label: "Design furniture", href: "/studio" }, { label: "Make a 360° tour", href: "/tours/new" }, { label: "Write a post", href: "/community" }],
  services: [{ label: "Offer a service", href: "/dashboard/services/new" }],
  other: [{ label: "Post a job", href: "/jobs/new" }],
};

const SNAPSHOT = (owner: string) => `medosha_portfolio:${owner}`;
const SNAPSHOT_TTL = 15 * 60 * 1000;
const scroller = () => document.getElementById("workspace") ?? document.scrollingElement ?? document.documentElement;

export function PortfolioFeed({
  owner, counts, professional, initialView, initialSlice,
}: {
  owner: string;
  counts: Record<SectionId, number>;
  professional: Professional;
  initialView: View;
  /** The first page of the first section to show, read with the page so it is not a second round trip. */
  initialSlice: { section: SectionId; cards: PortfolioCard[]; cursor: string | null; done: boolean } | null;
}) {
  const [view, setView] = useState<View>(initialView);
  const [store, setStore] = useState<Store>(() => (initialSlice ? { [initialSlice.section]: { ...initialSlice, status: "ready" } } : {}));
  const storeRef = useRef(store);
  const viewRef = useRef(view);
  const top = useRef<HTMLDivElement>(null);
  const restoring = useRef<number | null>(null);
  useEffect(() => { storeRef.current = store; viewRef.current = view; }, [store, view]);

  // Back from a card: what was loaded, and where the reader was.
  useLayoutEffect(() => {
    let saved: { view: View; store: Store; scroll: number; at: number } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(SNAPSHOT(owner)) ?? "null"); } catch { saved = null; }
    if (!saved || Date.now() - saved.at > SNAPSHOT_TTL || saved.view !== initialView) return;
    const kept: Store = {};
    for (const [key, slice] of Object.entries(saved.store) as [SectionId, Slice][]) if (slice?.status === "ready") kept[key] = slice;
    restoring.current = saved.scroll;
    // Restoring a snapshot taken before navigating away is a one-off sync from storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore((current) => ({ ...current, ...kept }));
  }, [owner, initialView]);
  useEffect(() => {
    if (restoring.current === null) return;
    const target = restoring.current;
    restoring.current = null;
    requestAnimationFrame(() => { scroller().scrollTop = target; });
  });

  const remember = useCallback(() => {
    try {
      sessionStorage.setItem(SNAPSHOT(owner), JSON.stringify({ view: viewRef.current, store: storeRef.current, scroll: scroller().scrollTop, at: Date.now() }));
    } catch { /* storage full or blocked: coming back starts at the top */ }
  }, [owner]);

  const load = useCallback(async (section: SectionId) => {
    const slice = storeRef.current[section];
    if (slice?.status === "loading" || slice?.done) return;
    const cursor = slice?.status === "ready" || slice?.status === "error" ? slice.cursor : null;
    const shown = slice?.cards ?? [];
    setStore((current) => ({ ...current, [section]: { cards: shown, cursor, done: false, status: "loading" } }));
    storeRef.current = { ...storeRef.current, [section]: { cards: shown, cursor, done: false, status: "loading" } };
    const page = await loadPortfolioPage(section, cursor, PAGE_SIZE).catch(() => ({ ok: false as const, error: "Your work could not be loaded. Check the connection and try again." }));
    setStore((current) => {
      const before = current[section]?.cards ?? shown;
      const next: Slice = page.ok
        ? { cards: appendUnique(before, page.cards), cursor: page.cursor, done: page.done, status: "ready" }
        : { cards: before, cursor, done: false, status: "error", error: page.error };
      storeRef.current = { ...current, [section]: next };
      return storeRef.current;
    });
  }, []);

  // A section coming near loads, and so does any section above it not loaded
  // yet: a fling or End jumps past the middle ones without their ever being
  // "near", and an observer only speaks when that changes.
  const near = useCallback((section: SectionId) => {
    if (viewRef.current !== "all") { void load(section); return; }
    for (const entry of SECTIONS) {
      const slice = storeRef.current[entry.id];
      if (counts[entry.id] > 0 && (!slice || (slice.status === "idle"))) void load(entry.id);
      if (entry.id === section) break;
    }
  }, [counts, load]);

  const choose = (next: View) => {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
    top.current?.scrollIntoView({ block: "start" });
  };

  const sections = view === "all" ? SECTIONS.filter((section) => section.id !== "other" || counts.other > 0) : SECTIONS.filter((section) => section.id === view);

  return (
    <div ref={top} className="scroll-mt-4 space-y-5">
      <nav aria-label="Show" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {FILTERS.map((filter) => {
          const meta = SECTIONS.find((section) => section.id === filter);
          const Icon = filter === "all" ? Layers : ICONS[filter as SectionId];
          return (
            <button key={filter} type="button" onClick={() => choose(filter)} aria-pressed={view === filter}
              className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors", view === filter ? "border-brand bg-brand text-brand-foreground" : "bg-card text-muted-foreground hover:border-brand/60 hover:text-foreground")}>
              {filter === "all" ? null : <Icon className="size-4" aria-hidden />}
              {filter === "all" ? "All" : meta?.short}
            </button>
          );
        })}
      </nav>

      {view === "all" ? <h2 className="text-xl font-semibold tracking-tight">My work</h2> : (
        <button type="button" onClick={() => choose("all")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All my work</button>
      )}

      {sections.map((section) => (
        <Section key={section.id} id={section.id} total={counts[section.id]} full={view !== "all"} slice={store[section.id]}
          load={load} near={near} onOpen={remember} onViewAll={() => choose(section.id)} professional={section.id === "services" ? professional : null} />
      ))}
    </div>
  );
}

function Section({
  id, total, full, slice, load, near, onOpen, onViewAll, professional,
}: {
  id: SectionId;
  total: number;
  full: boolean;
  slice: Slice | undefined;
  load: (section: SectionId) => Promise<void>;
  near: (section: SectionId) => void;
  onOpen: () => void;
  onViewAll: () => void;
  professional: Professional | null;
}) {
  const meta = SECTIONS.find((section) => section.id === id)!;
  const Icon = ICONS[id];
  const sentinel = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLElement>(null);
  const empty = total === 0;
  const cards = slice?.cards ?? [];
  const shown = full ? cards : cards.slice(0, PREVIEW_SIZE);

  // Fetch when near the screen: a preview when the section's top comes near,
  // the full list whenever its end does, page after page.
  useEffect(() => {
    if (empty) return;
    const node = full ? sentinel.current : start.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (!full && (cards.length > 0 || slice?.status === "loading")) return;
      if (slice?.status === "error") return;
      if (full) void load(id); else near(id);
      // The workspace is what scrolls; measured against the window, anything
      // below its edge is clipped and the margin would never start early.
    }, { root: document.getElementById("workspace"), rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [empty, full, cards.length, slice?.status, load, near, id]);

  return (
    <section ref={start} aria-labelledby={`section-${id}`} className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-5 shrink-0 text-brand" aria-hidden />
        <h3 id={`section-${id}`} className="min-w-0 flex-1 truncate text-lg font-semibold">{meta.title}{total > 0 ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">{total}</span> : null}</h3>
        {!full && total > 0 ? (
          <button type="button" onClick={onViewAll} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline" aria-label={`View all ${meta.short}`}>View all<ArrowRight className="size-4" /></button>
        ) : null}
      </div>

      {professional ? <ProfessionalSummary professional={professional} /> : null}

      {empty ? (
        // Small, so an empty section does not push the next one off the screen.
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-dashed px-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1 text-muted-foreground">{meta.empty}</span>
          {CREATE[id].map((action) => <Link key={action.href} href={action.href} className="inline-flex items-center gap-1 font-medium text-brand hover:underline"><Plus className="size-3.5" />{action.label}</Link>)}
        </div>
      ) : (
        <>
          <div className={SECTION_GRID[id]}>
            {shown.map((card) => <PortfolioCardView key={card.key} card={card} section={id} onOpen={onOpen} />)}
            {slice?.status === "loading" || (!slice && !empty) ? Array.from({ length: shown.length ? 2 : Math.min(total, full ? 4 : PREVIEW_SIZE, 4) }, (_, index) => <CardSkeleton key={`s${index}`} section={id} />) : null}
          </div>
          {slice?.status === "error" ? (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {slice.error}
              <button type="button" onClick={() => void load(id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-foreground"><RotateCw className="size-3.5" />Try again</button>
            </p>
          ) : null}
          {full && slice?.done && cards.length > 0 ? <p className="py-2 text-center text-xs text-muted-foreground">That is everything — {cards.length} {cards.length === 1 ? "item" : "items"}.</p> : null}
          {full && slice?.status === "loading" && cards.length > 0 ? <p className="flex items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Loading more…</p> : null}
        </>
      )}
      <div ref={sentinel} aria-hidden className="h-px" />
    </section>
  );
}

function ProfessionalSummary({ professional }: { professional: Professional }) {
  const facts = [
    professional.profession,
    professional.yearsExperience ? `${professional.yearsExperience} years' experience` : null,
    ({ available: "Available for work", limited: "Limited availability", busy: "Busy", fully_booked: "Fully booked" } as Record<string, string>)[professional.workStatus ?? ""] ?? null,
    professional.languages.length ? professional.languages.join(", ") : null,
  ].filter(Boolean);
  const nothing = !facts.length && !professional.specialties.length && !professional.portfolioLink && !professional.hasCv;
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">Professional profile</p>
        <Link href="/profile/edit" className="text-xs font-medium text-brand hover:underline">Edit</Link>
      </div>
      {nothing ? <p className="text-xs text-muted-foreground">Add your profession, skills and experience so clients know what you do.</p> : null}
      {facts.length ? <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p> : null}
      {professional.specialties.length ? (
        <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
          {professional.specialties.map((skill) => <li key={skill} className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand">{skill}</li>)}
        </ul>
      ) : null}
      {professional.portfolioLink || professional.hasCv ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {professional.portfolioLink ? <a href={professional.portfolioLink} target="_blank" rel="noreferrer noopener" className="font-medium text-brand hover:underline">Portfolio link</a> : null}
          {professional.hasCv ? <Link href="/profile/edit" className="font-medium text-brand hover:underline">CV on file</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
