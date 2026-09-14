"use client";

import Link from "next/link";
import { Bell, Menu, PanelLeft, PanelRight, Search, Sparkles } from "lucide-react";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { LanguageSelector } from "@/components/i18n/language-selector";
import { useLanguage } from "@/components/i18n/language-provider";
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

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-3 print:hidden">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t("common.openNavigation")}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
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

      <div className="hidden min-w-0 flex-1 sm:block">
        <Breadcrumbs />
      </div>

      {/* One search box for the whole platform. Below sm it gives way to the
          icon beside it — a 200px field is worse than a link to /search. */}
      <div className="hidden flex-1 sm:block md:max-w-md">
        <GlobalSearch placeholder={t("common.searchEverything")} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <Link
          href="/search"
          aria-label={t("navigation.search")}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
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
            "flex size-8 items-center justify-center rounded-lg transition-colors",
            aiOpen
              ? "bg-brand/15 text-brand"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Sparkles className="size-4.5" />
        </button>

        {profile && (
          <Link
            href="/notifications"
            aria-label={
              notifications > 0
                ? t("common.notificationsUnread").replace("{count}", String(notifications))
                : t("navigation.notifications")
            }
            className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Bell className="size-4.5" />
            {notifications > 0 && (
              <span className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium text-brand-foreground">
                {notifications > 99 ? "99+" : notifications}
              </span>
            )}
          </Link>
        )}

        <LanguageSelector />

        <ThemeToggle />
        <UserNav initialProfile={profile} />

        <button
          type="button"
          onClick={onTogglePanel}
          aria-label={panelOpen ? t("common.hidePanel") : t("common.showPanel")}
          aria-pressed={panelOpen}
          title={panelOpen ? t("common.hidePanel") : t("common.showPanel")}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRight className="size-4.5" />
        </button>
      </div>
    </header>
  );
}
