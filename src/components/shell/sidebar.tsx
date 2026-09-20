"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight, Pin, PinOff, Star } from "lucide-react";

import { BrandIcon, Logo } from "@/components/layout/logo";
import { I18nText } from "@/components/i18n/i18n-text";
import { useLanguage } from "@/components/i18n/language-provider";
import { navigationKey } from "@/lib/i18n/translations";
import {
  NAV_SECTIONS,
  findItem,
  matchNavItem,
  type NavItem,
} from "@/lib/workspace/navigation";
import { toggleSection, togglePin } from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";
import { NavPending, NavPendingTint } from "@/components/shell/nav-pending";

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
  collapsed,
  onPickSection,
}: {
  signedIn: boolean;
  counts: { messages: number; notifications: number };
  /**
   * Overrides the stored collapse state.
   *
   * The phone's drawer sets this. The stored value belongs to the desktop
   * rail, where collapsing is a deliberate trade of labels for room and there
   * is a control to undo it; on a phone there is no such control, so a reader
   * who collapsed the rail at a desk would otherwise be stuck with an
   * unlabelled drawer and no way back.
   */
  collapsed?: boolean;
  /**
   * Turns each section in the collapsed rail from a link into a request to
   * see what is inside it.
   *
   * The phone's drawer passes this. A rail of icons is a fine shortcut once
   * you know the place; on a site nobody has learned yet it is a row of
   * shapes, and jumping straight to a section's first page hides the other
   * thirteen things in it. With this, the rail names the section and opening
   * one lists what it holds.
   */
  onPickSection?: (id: string) => void;
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { navCollapsed: storedCollapsed, collapsedSections, pins } = useShell();
  const { t } = useLanguage();
  const navCollapsed = collapsed ?? storedCollapsed;

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
        aria-label={t("navigation.allMedosha")}
        className="flex h-full w-full flex-col items-center gap-1 overflow-y-auto py-3"
      >
        <Link
          href="/"
          aria-label={`${t("navigation.home")} — Medosha`}
          className="mb-2 flex size-11 items-center justify-center rounded-xl bg-blue-50 shadow-sm ring-1 ring-blue-100 dark:bg-blue-950 dark:ring-blue-900"
        >
          <BrandIcon />
        </Link>
        {NAV_SECTIONS.map((section) => {
          const target =
            section.href ?? section.items.find((item) => item.href)?.href;
          const isActive =
            active?.section.id === section.id ||
            (section.href === "/" && pathname === "/");
          if (!target) return null;

          // A word under the glyph. The rail is 72px, which is under a
          // centimetre and a half and still leaves room for two short lines
          // at 9px — enough for "Berchuma Studio" to wrap rather than be
          // guessed at.
          const body = (
            <>
              <section.icon className="size-4.5" />
              <span className="line-clamp-2 text-center text-[9px] leading-[1.15] font-medium">
                <I18nText textKey={navigationKey(section.id)} />
              </span>
            </>
          );

          const shellClass = cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition-colors",
            isActive
              ? "bg-brand/15 text-brand"
              : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground",
          );

          // Sections with something in them open; Home and anything empty
          // still go straight there, because a panel listing nothing is a
          // worse answer than the page itself.
          if (onPickSection && section.items.length > 0) {
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onPickSection(section.id)}
                aria-label={`${t(navigationKey(section.id))} — ${section.items.length}`}
                className={shellClass}
              >
                {body}
              </button>
            );
          }

          return (
            <Link
              key={section.id}
              href={target}
              title={t(navigationKey(section.id))}
              aria-label={t(navigationKey(section.id))}
              aria-current={isActive ? "page" : undefined}
              className={shellClass}
            >
              {body}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label={t("navigation.allMedosha")}
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
              <I18nText textKey="navigation.myWorkspace" secondary />
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
                    : "text-foreground/80 hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground",
                )}
              >
                <span aria-hidden className="text-base leading-none">
                  {section.emoji}
                </span>
                <I18nText textKey={navigationKey(section.id)} secondary={section.id === "home"} />
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
                <I18nText textKey={navigationKey(section.id)} />
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
  const { t } = useLanguage();
  const label = t(navigationKey(item.id));
  return (
    <div className="group/row relative">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          // `active:` is the half that works on a phone. `hover:` never fires
          // on a touchscreen, so without it a tap changed nothing at all until
          // the next page painted — which is why people were tapping twice.
          // `has-[[data-nav-pending]]` carries the tint through the wait.
          "flex items-center gap-2.5 rounded-lg py-1.5 pr-9 pl-8 text-sm transition-colors",
          "active:bg-muted has-[[data-nav-pending]]:bg-muted",
          active
            ? "bg-brand/12 font-medium text-brand"
            : "text-foreground/75 hover:bg-muted hover:text-foreground active:text-foreground",
        )}
      >
        <NavPendingTint />
        <item.icon
          className={cn(
            "size-4 shrink-0",
            active ? "text-brand" : "text-muted-foreground",
          )}
        />
        <I18nText textKey={navigationKey(item.id)} className="min-w-0 flex-1 truncate" />

        <NavPending />

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
            ? `Unpin ${label}`
            : `Pin ${label}`
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
  const { t } = useLanguage();
  const label = t(navigationKey(item.id));
  return (
    <div
      aria-disabled
      title={`${label} — ${t("navigation.soon")}`}
      className="flex cursor-not-allowed items-center gap-2.5 rounded-lg py-1.5 pr-3 pl-8 text-sm text-muted-foreground/50"
    >
      <item.icon className="size-4 shrink-0" />
      <I18nText textKey={navigationKey(item.id)} className="min-w-0 flex-1 truncate" />
      <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4">
        {t("navigation.soon")}
      </span>
    </div>
  );
}
