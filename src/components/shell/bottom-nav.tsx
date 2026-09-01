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
import { cn } from "@/lib/utils";

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
  href: string;
  label: string;
  icon: LucideIcon;
  /** Also active for URLs beneath this one. */
  prefix?: string;
};

const PRIMARY: Destination[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ai", label: "AI", icon: Bot, prefix: "/ai" },
  { href: "/marketplace", label: "Market", icon: Store, prefix: "/marketplace" },
  { href: "/city", label: "Property", icon: Building2, prefix: "/city" },
  { href: "/community", label: "Community", icon: MessagesSquare, prefix: "/community" },
];

/** Shown in the sheet above the full module list, because they are the ones
 *  people look for first and would otherwise be four scrolls down. */
const QUICK: Destination[] = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/price-exchange", label: "Price Exchange", icon: TrendingUp },
  { href: "/equipment", label: "Equipment", icon: Truck },
  { href: "/events", label: "Events", icon: CalendarDays },
];

export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);

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
        aria-label="Main"
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
                  isActive(item)
                    ? "text-brand"
                    : "text-muted-foreground active:text-foreground",
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          ))}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-label="More sections"
              className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors active:text-foreground"
            >
              <LayoutGrid className="size-5" />
              More
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
  return (
    <div className="fixed inset-0 z-60 lg:hidden">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />

      <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {/* The grab handle. Nothing drags it — it is the affordance that says
            this panel came from the bottom and closes downwards. */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-background px-4 pt-3 pb-2">
          <span className="text-sm font-semibold text-foreground">
            All of Medosha
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-[11px] font-medium text-foreground active:bg-muted"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-brand">
                <item.icon className="size-5" />
              </span>
              <span className="line-clamp-2 leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>

        {NAV_SECTIONS.filter((section) => section.items.length > 0).map(
          (section) => (
            <section key={section.id} className="px-3 pb-2">
              <h3 className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <span aria-hidden>{section.emoji}</span>
                {section.label}
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
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                            Soon
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
                          "flex h-11 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors active:bg-muted",
                          active
                            ? "bg-brand/10 font-medium text-brand"
                            : "text-foreground",
                        )}
                      >
                        <item.icon className="size-4.5 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
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
