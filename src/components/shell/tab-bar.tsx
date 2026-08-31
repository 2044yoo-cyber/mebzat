"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Columns2, Plus, X } from "lucide-react";

import { matchNavItem } from "@/lib/workspace/navigation";
import { closeTab, openTab, update } from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";

/**
 * Open workspaces, as tabs.
 *
 * Each tab is a URL. Switching is a client navigation into a layout that is
 * already mounted, so the sidebar, the panel and any live map underneath keep
 * running — the only thing that changes is the workspace. Next prefetches the
 * hrefs, which is what makes the switch feel instant rather than merely fast.
 *
 * Tabs persist across reloads, so closing the browser and coming back restores
 * the set of things you were working on.
 */
export function TabBar() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tabs, splitHref } = useShell();

  const current = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const label = useMemo(() => {
    const item = matchNavItem(pathname, searchParams);
    if (item) return item.label;
    if (pathname === "/") return "Home";
    const last = pathname.split("/").filter(Boolean).pop() ?? "Workspace";
    return last.charAt(0).toUpperCase() + last.slice(1);
  }, [pathname, searchParams]);

  // The tab for the route you are on is always present. Writing to the store
  // rather than to component state keeps this out of React's update cycle.
  useEffect(() => {
    openTab({ href: current, label });
  }, [current, label]);

  function onClose(event: React.MouseEvent, href: string) {
    event.preventDefault();
    event.stopPropagation();

    const remaining = tabs.filter((tab) => tab.href !== href);
    closeTab(href);
    // Closing the tab you are looking at has to move you somewhere.
    if (href === current) {
      router.push(remaining[remaining.length - 1]?.href ?? "/");
    }
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b px-2 print:hidden">
      {tabs.map((tab) => {
        const active = tab.href === current;
        return (
          <div
            key={tab.href}
            className={cn(
              "group/tab flex h-7 shrink-0 items-center rounded-md text-xs transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Link
              href={tab.href}
              className={cn(
                "max-w-44 truncate py-1 pl-2.5",
                // The last tab has no close button, so it keeps its padding.
                tabs.length > 1 ? "pr-1" : "pr-2.5",
              )}
            >
              {tab.label}
            </Link>
            {/* Closing the only tab would leave the workspace with nothing to
                show, so the control is not offered. */}
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={(event) => onClose(event, tab.href)}
                aria-label={`Close ${tab.label}`}
                className="mr-1 flex size-4.5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/tab:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}

      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        <button
          type="button"
          onClick={() =>
            update({ splitHref: splitHref ? null : current })
          }
          aria-pressed={Boolean(splitHref)}
          title={splitHref ? "Close split view" : "Split the workspace"}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
            splitHref
              ? "bg-brand/12 text-brand"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Columns2 className="size-3.5" />
          Split
        </button>
        <Link
          href="/"
          aria-label="Open a new workspace tab"
          title="New tab"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
