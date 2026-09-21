"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Ellipsis, Menu, PanelLeft, PanelRight, Search, Sparkles } from "lucide-react";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { LanguageSelector } from "@/components/i18n/language-selector";
import { useLanguage } from "@/components/i18n/language-provider";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav } from "@/components/layout/user-nav";
import { GlobalSearch } from "@/components/search/global-search";
import type { NavProfile } from "@/components/layout/user-nav";
import { closePanel, openPanel, update } from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";

/**
 * One of the three lines drawn over the logo on the home page.
 *
 * Translucent, because the tile exists to show a wordmark and a solid glyph
 * over it would be a logo with a menu icon stamped on it. Dark enough to read
 * as a control, and darker again while it is held.
 */
const MENU_LINE =
  "h-[2px] w-4 rounded-full bg-neutral-900/25 transition-colors group-hover:bg-neutral-900/60 group-active:bg-neutral-900/60";

/**
 * The workspace header.
 *
 * Breadcrumbs on the left, one search box in the middle, the panel controls on
 * the right. It stays put while the workspace under it changes, so the search
 * box keeps its query and focus across a navigation.
 */
export function Topbar({
  profile,
  notifications,
  panelOpen,
  onTogglePanel,
  onOpenMobileNav,
}: {
  profile: NavProfile | null;
  notifications: number;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onOpenMobileNav: () => void;
}) {
  const { navCollapsed, aiOpen } = useShell();
  const { t } = useLanguage();
  const home = usePathname() === "/";

  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2 border-b px-2 sm:px-3 print:hidden",
        home ? "h-16 border-blue-100/60" : "h-14",
      )}
    >
      {/* On the home page the logo is the menu.

          It used to be a link to "/" sitting on the page it linked to, which
          did nothing, while the way into navigation was two taps away behind
          the ellipsis. So the biggest target in the header now opens the
          navigation and the ellipsis no longer carries a duplicate of it.

          The three lines are drawn over the logo rather than beside it: they
          have to say "this opens something" without covering a wordmark the
          tile exists to show, so they are translucent, sit in the corner the
          mark leaves empty, and darken on press. */}
      {home && <div className="contents lg:hidden">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label={t("common.openNavigation")}
          className="group relative mr-auto h-12 w-32 min-w-20 overflow-hidden rounded-lg bg-white sm:w-44"
        >
          <Image src="/medosha_full_logo.jpg" alt="Medosha — Build, Manage, Grow" fill sizes="176px" className="object-cover" />
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 flex w-9 flex-col items-center justify-center gap-[3px] bg-gradient-to-l from-white/70 to-transparent transition-colors group-hover:from-white/90 group-active:from-white/90"
          >
            {/* Written once and rendered three times. Three copies of the
                same class list is three places for one of them to drift, and
                a check looking for the class would still find the other two. */}
            {[0, 1, 2].map((index) => (
              <span key={index} className={MENU_LINE} />
            ))}
          </span>
        </button>
      </div>}

      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t("common.openNavigation")}
        className={cn(
          "size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden",
          home ? "hidden" : "flex",
        )}
      >
        <Menu className="size-4.5" />
      </button>

      <button
        type="button"
        onClick={() => update({ navCollapsed: !navCollapsed })}
        aria-label={navCollapsed ? t("common.expandNavigation") : t("common.collapseNavigation")}
        aria-pressed={navCollapsed}
        title={navCollapsed ? t("common.expandNavigation") : t("common.collapseNavigation")}
        className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
      >
        <PanelLeft className="size-4.5" />
      </button>

      <div className={cn("min-w-0 flex-1", home ? "hidden lg:block" : "hidden sm:block")}>
        <Breadcrumbs />
      </div>

      {/* One search box for the whole platform. Below sm it gives way to the
          icon beside it — a 200px field is worse than a link to /search. */}
      <div className={cn("flex-1 md:max-w-md", home ? "hidden lg:block" : "hidden sm:block")}>
        <GlobalSearch placeholder={t("common.searchEverything")} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Link
          href="/search"
          aria-label={t("navigation.search")}
          className={cn(
            "size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden",
            home ? "hidden" : "flex",
          )}
        >
          <Search className="size-4.5" />
        </Link>

        <button
          type="button"
          onClick={() => {
            if (aiOpen && panelOpen) {
              closePanel();
              return;
            }
            openPanel();
            update({ aiOpen: true });
          }}
          aria-pressed={aiOpen}
          aria-label={t("navigation.ai-home")}
          title={t("ai.ask")}
          className={cn(
            "size-8 items-center justify-center rounded-lg transition-colors",
            home ? "hidden lg:flex" : "flex",
            aiOpen
              ? "bg-brand/15 text-brand"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Sparkles className="size-4.5" />
        </button>

        {/* The bell opens the tray here rather than navigating to it. The
            page at /notifications is still there and still linked from the
            panel's footer — what changed is that glancing at what arrived no
            longer means leaving whatever you were doing. */}
        {profile && (
          <NotificationPanel
            viewerId={profile.id}
            initialCount={notifications}
          />
        )}

        <div className={cn(home && "rounded-full border border-blue-100 text-blue-600")}>
          <LanguageSelector />
        </div>

        <div className={cn(home && "hidden lg:block")}><ThemeToggle /></div>
        <UserNav initialProfile={profile} />

        <button
          type="button"
          onClick={onTogglePanel}
          aria-label={panelOpen ? t("common.hidePanel") : t("common.showPanel")}
          aria-pressed={panelOpen}
          title={panelOpen ? t("common.hidePanel") : t("common.showPanel")}
          className={cn(
            "size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            home ? "hidden lg:flex" : "flex",
          )}
        >
          <PanelRight className="size-4.5" />
        </button>

        {home && <details className="relative lg:hidden">
          <summary aria-label={t("navigation.more")} className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground [&::-webkit-details-marker]:hidden"><Ellipsis className="size-4" /></summary>
          <div className="absolute top-full right-0 z-60 mt-2 flex items-center gap-2 rounded-xl border bg-background p-2 shadow-lg">
            <ThemeToggle />
            <button type="button" onClick={onTogglePanel} aria-label={panelOpen ? t("common.hidePanel") : t("common.showPanel")} className="flex size-10 items-center justify-center rounded-lg hover:bg-muted"><PanelRight className="size-4" /></button>
          </div>
        </details>}
      </div>
    </header>
  );
}
