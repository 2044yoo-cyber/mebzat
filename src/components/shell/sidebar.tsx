"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight, Pin, PinOff, Star } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import {
  NAV_SECTIONS,
  findItem,
  matchNavItem,
  type NavItem,
} from "@/lib/workspace/navigation";
import { toggleSection, togglePin } from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";

/**
 * The left rail. Visible on every route, and the only thing in the shell that
 * never swaps — navigating replaces the workspace beside it, so this component
 * keeps its scroll position and its open sections across pages.
 *
 * Collapsed, it becomes a 60px icon rail: section icons only, each linking to
 * its first available item, so the sidebar stays useful rather than decorative.
 */
export function Sidebar({
  signedIn,
  counts,
}: {
  signedIn: boolean;
  counts: { messages: number; notifications: number };
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { navCollapsed, collapsedSections, pins } = useShell();

  const active = useMemo(
    () => matchNavItem(pathname, searchParams),
    [pathname, searchParams],
  );

  const pinned = pins
    .map((id) => findItem(id))
    // Narrows `href` too, not just the item — a predicate that only removes
    // `undefined` from the wrapper still leaves the link asserting.
    .filter(
      (item): item is NonNullable<typeof item> & { href: string } =>
        typeof item?.href === "string" && item.href.length > 0,
    );

  function badgeFor(id: string) {
    if (id === "messages") return counts.messages;
    if (id === "notifications") return counts.notifications;
    return 0;
  }

  if (navCollapsed) {
    return (
      <nav
        aria-label="Sections"
        className="flex h-full w-full flex-col items-center gap-1 overflow-y-auto py-3"
      >
        <Link
          href="/"
          aria-label="Medosha home"
          className="mb-2 flex size-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground"
        >
          M
        </Link>
        {NAV_SECTIONS.map((section) => {
          const target =
            section.href ?? section.items.find((item) => item.href)?.href;
          const isActive =
            active?.section.id === section.id ||
            (section.href === "/" && pathname === "/");
          if (!target) return null;
          return (
            <Link
              key={section.id}
              href={target}
              title={section.label}
              aria-label={section.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors",
                isActive
                  ? "bg-brand/15 text-brand"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <section.icon className="size-4.5" />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Sections"
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="flex h-14 shrink-0 items-center px-4">
        <Logo />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {pinned.length > 0 && (
          <section className="mb-1">
            <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <Star className="size-3" />
              My Workspace
            </p>
            <ul>
              {pinned.map((item) => (
                <li key={`pin-${item.id}`}>
                  <Row
                    item={item}
                    href={item.href}
                    active={active?.id === item.id}
                    badge={badgeFor(item.id)}
                    pinned
                    signedIn={signedIn}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {NAV_SECTIONS.map((section) => {
          // Home has no children; it renders as a single row.
          if (section.items.length === 0 && section.href) {
            return (
              <Link
                key={section.id}
                href={section.href}
                aria-current={pathname === section.href ? "page" : undefined}
                className={cn(
                  "mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === section.href
                    ? "bg-brand/12 text-brand"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {section.emoji}
                </span>
                {section.label}
              </Link>
            );
          }

          const folded = collapsedSections.includes(section.id);
          const sectionActive = active?.section.id === section.id;

          return (
            <section key={section.id} className="mt-2">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={!folded}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors",
                  sectionActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-3 transition-transform duration-150",
                    !folded && "rotate-90",
                  )}
                />
                <span aria-hidden className="text-sm leading-none">
                  {section.emoji}
                </span>
                {section.label}
              </button>

              {!folded && (
                <ul className="mt-0.5">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      {item.href ? (
                        <Row
                          item={item}
                          href={item.href}
                          active={active?.id === item.id}
                          badge={badgeFor(item.id)}
                          pinned={pins.includes(item.id)}
                          signedIn={signedIn}
                        />
                      ) : (
                        <SoonRow item={item} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}

function Row({
  item,
  href,
  active,
  badge,
  pinned,
  signedIn,
}: {
  item: NavItem;
  href: string;
  active: boolean;
  badge: number;
  pinned: boolean;
  signedIn: boolean;
}) {
  return (
    <div className="group/row relative">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg py-1.5 pr-9 pl-8 text-sm transition-colors",
          active
            ? "bg-brand/12 font-medium text-brand"
            : "text-foreground/75 hover:bg-muted hover:text-foreground",
        )}
      >
        <item.icon
          className={cn(
            "size-4 shrink-0",
            active ? "text-brand" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>

        {/* Live counts. Only meaningful signed in, where the number exists. */}
        {signedIn && badge > 0 && (
          <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] leading-4 font-medium text-brand-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>

      {/* Pinning sits outside the link so it cannot swallow a navigation. */}
      <button
        type="button"
        onClick={() => togglePin(item.id)}
        aria-label={
          pinned
            ? `Unpin ${item.label} from My Workspace`
            : `Pin ${item.label} to My Workspace`
        }
        className={cn(
          "absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md",
          "text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground",
          "group-hover/row:opacity-100 focus-visible:opacity-100",
          pinned && "opacity-60",
        )}
      >
        {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
      </button>
    </div>
  );
}

/**
 * A module in the manifest that has no destination yet.
 *
 * Rendered as a plainly disabled row rather than a link: a button that looks
 * live and does nothing is worse than one that says it is not ready.
 */
function SoonRow({ item }: { item: NavItem }) {
  return (
    <div
      aria-disabled
      title={`${item.label} — not built yet`}
      className="flex cursor-not-allowed items-center gap-2.5 rounded-lg py-1.5 pr-3 pl-8 text-sm text-muted-foreground/50"
    >
      <item.icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4">
        Soon
      </span>
    </div>
  );
}
