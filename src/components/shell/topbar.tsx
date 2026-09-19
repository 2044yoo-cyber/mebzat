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
      {home && <div className="contents lg:hidden">
        <Link href="/" aria-label="Medosha" className="relative mr-auto h-12 w-32 min-w-20 overflow-hidden rounded-lg bg-white sm:w-44">
          <Image src="/medosha_full_logo.jpg" alt="Medosha — Build, Manage, Grow" fill sizes="176px" className="object-cover" />
        </Link>
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
            <button type="button" onClick={onOpenMobileNav} aria-label={t("common.openNavigation")} className="flex size-10 items-center justify-center rounded-lg hover:bg-muted"><Menu className="size-4" /></button>
            <button type="button" onClick={onTogglePanel} aria-label={panelOpen ? t("common.hidePanel") : t("common.showPanel")} className="flex size-10 items-center justify-center rounded-lg hover:bg-muted"><PanelRight className="size-4" /></button>
          </div>
        </details>}
      </div>
    </header>
  );
}
