"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  Building2,
  CalendarDays,
  ChevronRight,
  Home,
  LayoutGrid,
  MessagesSquare,
  Store,
  TrendingUp,
  Truck,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

import { NAV_SECTIONS } from "@/lib/workspace/navigation";
import { navigationKey } from "@/lib/i18n/translations";
import { I18nText } from "@/components/i18n/i18n-text";
import { useLanguage } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";
import { NavPending, NavPendingTint } from "@/components/shell/nav-pending";

/**
 * The phone's navigation.
 *
 * Below `lg` the desktop rail is a drawer, which means every move between
 * modules costs two taps and a look for the hamburger. This is the same
 * navigation as a thumb-height bar at the bottom of the screen, where the
 * thumb already is.
 *
 * Six destinations, because seven is where a 360px screen starts truncating
 * labels, and everything else lives behind "More" — which opens a sheet built
 * from the same `NAV_SECTIONS` manifest the sidebar and the command palette
 * read, so a module added there appears here without another edit.
 */

type Destination = {
  id: string;
  href: string;
  icon: LucideIcon;
  /** Also active for URLs beneath this one. */
  prefix?: string;
};

const PRIMARY: Destination[] = [
  { id: "home", href: "/", icon: Home },
  { id: "ai", href: "/ai", icon: Bot, prefix: "/ai" },
  { id: "market", href: "/marketplace", icon: Store, prefix: "/marketplace" },
  { id: "property", href: "/city", icon: Building2, prefix: "/city" },
  { id: "community", href: "/community", icon: MessagesSquare, prefix: "/community" },
];

/** Shown in the sheet above the full module list, because they are the ones
 *  people look for first and would otherwise be four scrolls down. */
const QUICK: Destination[] = [
  { id: "profile", href: "/profile", icon: User },
  { id: "price-exchange", href: "/price-exchange", icon: TrendingUp },
  { id: "equipment", href: "/equipment", icon: Truck },
  { id: "events", href: "/events", icon: CalendarDays },
];

export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const { t } = useLanguage();

  function isActive(item: Destination): boolean {
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.prefix ?? item.href}/`);
  }

  return (
    <>
      {moreOpen && (
        <MoreSheet
          signedIn={signedIn}
          pathname={pathname}
          onClose={() => setMoreOpen(false)}
        />
      )}

      <nav
        aria-label={t("common.mainNavigation")}
        // Named so a page can measure what this covers.
        //
        // It is `fixed`, so it sits on top of the scrolling column rather than
        // inside it, and the column has no idea its last 3.5rem are behind a
        // bar. The studio's 3D viewport sticks to the top of that column and
        // has to know how much of it is actually visible; measuring this
        // element's box is the only answer that does not involve re-deriving
        // `--bottom-nav-h` and its `env()` by hand somewhere else.
        data-bottom-nav=""
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur lg:hidden print:hidden",
          // Clears the home indicator on an iPhone. Without it the bar's
          // bottom row of pixels sits under the system gesture area.
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <ul className="flex items-stretch">
          {PRIMARY.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive(item) ? "page" : undefined}
                className={cn(
                  // 56px is comfortably above the 44px minimum and leaves
                  // room for a label a thumb can read without a second look.
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  // A colour shift alone is easy to miss on a bright screen
                  // outdoors. The background is what reads as "pressed", and
                  // the tint holds through the wait so the gap between lifting
                  // a finger and the page arriving is not silent.
                  "active:bg-muted has-[[data-nav-pending]]:bg-muted",
                  isActive(item)
                    ? "text-brand"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <NavPendingTint />
                <span className="relative">
                  <item.icon className="size-5" />
                  <span className="absolute -top-1 -right-2.5">
                    <NavPending className="size-3" />
                  </span>
                </span>
                <I18nText textKey={navigationKey(item.id)} secondary />
              </Link>
            </li>
          ))}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-label={t("navigation.more")}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors active:bg-muted active:text-foreground"
            >
              <LayoutGrid className="size-5" />
              <I18nText textKey="navigation.more" secondary />
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function MoreSheet({
  signedIn,
  pathname,
  onClose,
}: {
  signedIn: boolean;
  pathname: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-60 lg:hidden">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />

      <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {/* The grab handle. Nothing drags it — it is the affordance that says
            this panel came from the bottom and closes downwards. */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-background px-4 pt-3 pb-2">
          <I18nText textKey="navigation.allMedosha" secondary className="text-sm font-semibold text-foreground" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 px-3 pb-3">
          {QUICK.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11px] font-medium text-foreground active:bg-muted has-[[data-nav-pending]]:bg-muted"
            >
              <NavPendingTint />
              <span className="relative flex size-11 items-center justify-center rounded-full bg-muted text-brand">
                <item.icon className="size-5" />
                <span className="absolute -top-0.5 -right-0.5">
                  <NavPending className="size-3" />
                </span>
              </span>
              <I18nText textKey={navigationKey(item.id)} className="line-clamp-2 leading-tight" />
            </Link>
          ))}
        </div>

        {NAV_SECTIONS.filter((section) => section.items.length > 0).map(
          (section) => (
            <section key={section.id} className="px-3 pb-2">
              <h3 className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <span aria-hidden>{section.emoji}</span>
                <I18nText textKey={navigationKey(section.id)} />
              </h3>
              <ul>
                {section.items.map((item) => {
                  const active = item.href
                    ? pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                    : false;

                  // An item with no href is a module that is specified but
                  // not built. It renders as a disabled row rather than a
                  // link that goes nowhere.
                  if (!item.href) {
                    return (
                      <li key={item.id}>
                        <span className="flex h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-muted-foreground/60">
                          <item.icon className="size-4.5 shrink-0" />
                          <I18nText textKey={navigationKey(item.id)} className="flex-1 truncate" />
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                            {t("navigation.soon")}
                          </span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.id}>
                      <Link
                        href={
                          item.private && !signedIn
                            ? `/login?redirect=${encodeURIComponent(item.href)}`
                            : item.href
                        }
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-11 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors active:bg-muted has-[[data-nav-pending]]:bg-muted",
                          active
                            ? "bg-brand/10 font-medium text-brand"
                            : "text-foreground",
                        )}
                      >
                        <NavPendingTint />
                        <item.icon className="size-4.5 shrink-0" />
                        <I18nText textKey={navigationKey(item.id)} className="flex-1 truncate" />
                        <NavPending />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
