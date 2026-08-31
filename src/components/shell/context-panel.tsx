"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Info,
  PanelRightClose,
  Sparkles,
  Star,
  X,
} from "lucide-react";

import { AiChat } from "@/components/ai/ai-chat";
import { PropertyPanel } from "@/components/property/property-panel";
import { MARKER_COLOURS } from "@/lib/map/markers";
import { DEMO_NOTICE_SHORT } from "@/lib/constants/invest";
import { PRICE_SECTORS } from "@/lib/constants/price-exchange";
import { LISTING_KIND, PROPERTY_TYPE } from "@/lib/constants/properties";
import {
  NAV_SECTIONS,
  findItem,
  matchNavItem,
} from "@/lib/workspace/navigation";
import { clearSelection, useSelection } from "@/lib/workspace/selection";
import { closePanel, update } from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";

/**
 * The right column.
 *
 * Two tabs over one column. **Context** is whatever the current route makes
 * sense beside — the selected property on the map, the live filters in the
 * marketplace, the sectors on the exchange. **AI** is the same assistant on
 * every route, so a question never costs you the page you are on.
 *
 * Context is derived from the URL and from the workspace selection store, not
 * from props threaded down through the workspace. That is what lets the panel
 * sit in the shell — outside every module — and still describe what the module
 * is showing.
 */

type Tab = "context" | "ai";

export function ContextPanel({
  signedIn,
  homeWidget,
}: {
  signedIn: boolean;
  homeWidget?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { aiOpen } = useShell();
  const [chosen, setChosen] = useState<Tab>("context");

  // Derived, not synchronised. Opening the dock from anywhere — the launcher,
  // the palette, the + menu — flips one flag in the store and the panel simply
  // reads it, so there is no effect mirroring one piece of state into another.
  const tab: Tab = aiOpen ? "ai" : chosen;

  function show(next: Tab) {
    setChosen(next);
    update({ aiOpen: next === "ai" });
  }

  const item = useMemo(
    () => matchNavItem(pathname, searchParams),
    [pathname, searchParams],
  );

  return (
    <aside
      aria-label="Context"
      className="flex h-full w-full flex-col overflow-hidden bg-background"
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-2">
        <TabButton active={tab === "context"} onClick={() => show("context")}>
          <Info className="size-3.5" />
          Context
        </TabButton>
        <TabButton active={tab === "ai"} onClick={() => show("ai")}>
          <Sparkles className="size-3.5" />
          AI
        </TabButton>

        <button
          type="button"
          onClick={closePanel}
          aria-label="Collapse context panel"
          title="Collapse panel"
          className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>

      {tab === "ai" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {signedIn ? (
            // Keyed on the route so the assistant starts a fresh thread when
            // the workspace moves — a question about a property should not
            // arrive with a marketplace conversation above it.
            <AiChat key={pathname} compact />
          ) : (
            <SignedOutAi />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ContextBody
            pathname={pathname}
            searchParams={searchParams}
            homeWidget={homeWidget}
          />
        </div>
      )}

      {tab === "context" && item && (
        <div className="shrink-0 border-t p-3">
          <button
            type="button"
            onClick={() => show("ai")}
            className="flex w-full items-center gap-2.5 rounded-xl border border-dashed p-2.5 text-left transition-colors hover:border-brand hover:bg-brand/5"
          >
            <Sparkles className="size-4 shrink-0 text-brand" />
            <span className="min-w-0 text-sm">
              <span className="block font-medium">Ask about {item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                Without leaving this page
              </span>
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Route dispatch
// ---------------------------------------------------------------------------

function ContextBody({
  pathname,
  searchParams,
  homeWidget,
}: {
  pathname: string;
  searchParams: URLSearchParams | null;
  homeWidget?: React.ReactNode;
}) {
  // The homepage's right sidebar. The panel arrives already rendered on the
  // server, so this only decides where it goes.
  //
  // No `BrowseContext` beneath it: that is a list of the same sections the
  // left rail and the phone's bottom bar already carry, and repeating it here
  // was the reason this column read as filler. What belongs beside a feed is
  // what the platform currently holds — prices, products, projects, firms,
  // people — not a third copy of the navigation.
  if (pathname === "/" && homeWidget) {
    return <div className="p-3">{homeWidget}</div>;
  }
  if (pathname.startsWith("/invest")) {
    return <InvestContext />;
  }
  if (pathname.startsWith("/city")) {
    return <CityContext />;
  }
  if (pathname.startsWith("/price-exchange")) {
    return <PriceContext searchParams={searchParams} />;
  }
  return <BrowseContext pathname={pathname} searchParams={searchParams} />;
}

/**
 * On the map, the panel *is* the property panel.
 *
 * The map publishes its selection to the workspace store and this reads it, so
 * there is one right-hand column rather than the shell's panel and the map's
 * panel fighting for the same 400px.
 */
function CityContext() {
  const selection = useSelection();

  if (selection?.kind === "property" && selection.property) {
    return (
      <PropertyPanel
        summary={selection.property}
        onClose={() => clearSelection()}
      />
    );
  }

  return (
    <div className="space-y-5 p-4">
      <Section title="Medosha City">
        <p className="text-sm text-muted-foreground">
          Select a marker to see the property, its photos, any 360° tour and
          what is nearby. The map keeps running underneath — nothing here
          navigates away from it.
        </p>
      </Section>

      <Section title="Marker key">
        <ul className="space-y-1.5">
          {Object.entries(MARKER_COLOURS).map(([key, colour]) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: colour.base }}
              />
              <span className="text-muted-foreground">{colour.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Jump to">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LISTING_KIND).map(([kind, label]) => (
            <Chip key={kind} href={`/city?kind=${kind}`}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["villa", "apartment", "office", "land"] as const).map((type) => (
            <Chip key={type} href={`/city?type=${type}`}>
              {PROPERTY_TYPE[type].label}
            </Chip>
          ))}
        </div>
      </Section>
    </div>
  );
}

/**
 * Beside a development: what the module is, and the parts of Medosha that
 * price, build and staff the thing you are looking at.
 */
function InvestContext() {
  return (
    <div className="space-y-5 p-4">
      <Section title="Medosha Invest">
        <p className="text-sm text-muted-foreground">
          Development projects with their funding, construction progress and
          reporting in one place.
        </p>
        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-muted-foreground">
          {DEMO_NOTICE_SHORT}
        </p>
      </Section>

      <Section title="Behind a development">
        <div className="grid gap-1.5">
          <Tool href="/ai?agent=cost" label="Estimate the build cost" />
          <Tool href="/ai?agent=boq" label="Generate a BOQ" />
          <Tool href="/price-exchange" label="Material prices" />
          <Tool href="/companies" label="Developers and contractors" />
          <Tool href="/directory/individual" label="Architects and engineers" />
          <Tool href="/city" label="See the area on the map" />
        </div>
      </Section>

      <Section title="Browse">
        <div className="flex flex-wrap gap-1.5">
          <Chip href="/invest">All projects</Chip>
          <Chip href="/invest?sort=roi">Highest ROI</Chip>
          <Chip href="/invest?sort=progress">Closest to funded</Chip>
          <Chip href="/invest/investors">Investors</Chip>
        </div>
      </Section>
    </div>
  );
}

function PriceContext({ searchParams }: { searchParams: URLSearchParams | null }) {
  const sector = searchParams?.get("sector") ?? "material";

  return (
    <div className="space-y-5 p-4">
      <Section title="Markets">
        <ul className="space-y-1">
          {PRICE_SECTORS.map((entry) => (
            <li key={entry.value}>
              <Link
                href={`/price-exchange?sector=${entry.value}`}
                aria-current={entry.value === sector ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  entry.value === sector
                    ? "bg-brand/12 font-medium text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {entry.label}
                <ChevronRight className="size-3.5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Reading the table">
        <p className="text-sm text-muted-foreground">
          Prices come from suppliers and are updated live — a new listing or bid
          appears without a reload. The chart on each listing shows how the rate
          has moved, and the lowest bid is the best offer currently standing.
        </p>
      </Section>

      <Section title="Use these prices">
        <div className="grid gap-1.5">
          <Tool href="/ai?agent=cost" label="Estimate a build with them" />
          <Tool href="/ai?agent=boq" label="Price a bill of quantities" />
          <Tool href="/ai?agent=materials" label="Compare material options" />
          <Tool href="/companies" label="Find the suppliers behind them" />
        </div>
      </Section>
    </div>
  );
}

/**
 * The default panel: what you are filtering, where else to look, and the
 * workspace you have pinned. Everything is read out of the URL, so it is
 * always describing the results actually on screen.
 */
function BrowseContext({
  pathname,
  searchParams,
}: {
  pathname: string;
  searchParams: URLSearchParams | null;
}) {
  const item = matchNavItem(pathname, searchParams);
  const { pins } = useShell();

  // Query keys that are page mechanics rather than filters the user chose.
  const IGNORED = new Set(["page", "redirect"]);
  const filters = [...(searchParams?.entries() ?? [])].filter(
    ([key, value]) => !IGNORED.has(key) && value !== "",
  );

  // Narrowed rather than asserted: the filter proves `href` is a string, so
  // the links below need no non-null assertion to read it.
  const siblings =
    item?.section.items.filter(
      (sibling): sibling is typeof sibling & { href: string } =>
        typeof sibling.href === "string" &&
        sibling.href.length > 0 &&
        sibling.id !== item.id,
    ) ?? [];

  const pinned = pins
    .map((id) => findItem(id))
    .filter(
      (entry): entry is NonNullable<typeof entry> & { href: string } =>
        typeof entry?.href === "string" && entry.href.length > 0,
    );

  return (
    <div className="space-y-5 p-4">
      {item ? (
        <Section title={item.label}>
          <p className="text-sm text-muted-foreground">
            {item.hint ?? `Part of ${item.section.label}.`}
          </p>
        </Section>
      ) : (
        <Section title="Workspace">
          <p className="text-sm text-muted-foreground">
            Press{" "}
            <kbd className="rounded border px-1 text-xs">⌘</kbd>
            <kbd className="rounded border px-1 text-xs">K</kbd> to jump
            anywhere, or use the + button to create something.
          </p>
        </Section>
      )}

      {filters.length > 0 && (
        <Section title="Active filters">
          <ul className="flex flex-wrap gap-1.5">
            {filters.map(([key, value]) => (
              <li
                key={`${key}=${value}`}
                className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
              >
                <span className="text-muted-foreground">{key}</span>
                <span className="font-medium">{value}</span>
                <Link
                  href={withoutParam(pathname, searchParams, key)}
                  aria-label={`Clear ${key} filter`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={pathname}
            className="mt-2 inline-block text-xs text-brand hover:underline"
          >
            Clear all
          </Link>
        </Section>
      )}

      {item && siblings.length > 0 && (
        <Section title={`More in ${item.section.label}`}>
          <ul className="space-y-0.5">
            {siblings.slice(0, 7).map((sibling) => (
              <li key={sibling.id}>
                <Link
                  href={sibling.href}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <sibling.icon className="size-3.5 shrink-0" />
                  <span className="truncate">{sibling.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pinned.length > 0 && (
        <Section title="My Workspace">
          <ul className="space-y-0.5">
            {pinned.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Star className="size-3 shrink-0 text-brand" />
                  <span className="truncate">{entry.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!item && (
        <Section title="Sections">
          <ul className="space-y-0.5">
            {NAV_SECTIONS.filter((section) => section.items.length > 0).map(
              (section) => {
                const first = section.items.find(
                  (entry): entry is typeof entry & { href: string } =>
                    typeof entry.href === "string" && entry.href.length > 0,
                );
                if (!first) return null;
                return (
                  <li key={section.id}>
                    <Link
                      href={first.href}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span aria-hidden>{section.emoji}</span>
                      <span className="truncate">{section.label}</span>
                    </Link>
                  </li>
                );
              },
            )}
          </ul>
        </Section>
      )}
    </div>
  );
}

function SignedOutAi() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-brand/12 text-brand">
        <Sparkles className="size-5" />
      </span>
      <p className="text-sm font-medium">Sign in to use Medosha AI</p>
      <p className="text-sm text-muted-foreground">
        The assistant answers with real prices, suppliers and professionals from
        the platform, so it needs to know who is asking.
      </p>
      <Link
        href="/login?redirect=/ai"
        className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function Tool({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors hover:border-brand hover:bg-brand/5"
    >
      {label}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** The current URL with one query key removed, for the filter chips' ✕. */
function withoutParam(
  pathname: string,
  searchParams: URLSearchParams | null,
  key: string,
): string {
  const next = new URLSearchParams(searchParams?.toString() ?? "");
  next.delete(key);
  next.delete("page");
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
