"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelRight } from "lucide-react";

import { AiLauncher } from "@/components/ai/ai-launcher";
import { BottomNav } from "@/components/shell/bottom-nav";
import { CommandPalette } from "@/components/shell/command-palette";
import { ContextPanel } from "@/components/shell/context-panel";
import { MenuBar } from "@/components/shell/menu-bar";
import { QuickActions } from "@/components/shell/quick-actions";
import { ResizeHandle } from "@/components/shell/resize-handle";
import { Sidebar } from "@/components/shell/sidebar";
import { SplitPane } from "@/components/shell/split-pane";
import { TabBar } from "@/components/shell/tab-bar";
import { Topbar } from "@/components/shell/topbar";
import type { NavProfile } from "@/components/layout/user-nav";
import { useLiveCounts } from "@/lib/workspace/use-live-counts";
import { useMediaQuery } from "@/lib/workspace/use-media-query";
import {
  NAV_WIDTH,
  PANEL_WIDTH,
  SPLIT_RATIO,
  clamp,
  closePanel,
  openPanel,
  update,
} from "@/lib/workspace/store";
import { useShell } from "@/lib/workspace/use-shell";
import { cn } from "@/lib/utils";

/**
 * The desktop frame: navigation, workspace, context.
 *
 * This component is mounted once, in the root layout, and never unmounts.
 * Navigating replaces `children` — the workspace — and nothing else, which is
 * what lets the city map keep its camera, the AI dock keep its conversation
 * and the sidebar keep its scroll position across a page change. That is the
 * whole point of the layout: the page does not reload, the middle column does.
 *
 * Two routes opt out. Auth pages render bare, because a sign-in screen behind
 * a workspace chrome the visitor cannot yet use is noise. And any URL carrying
 * `_pane=1` renders bare because it is the inside of a split view, where the
 * outer shell is already on screen.
 */
export function AppShell({
  children,
  profile,
  counts,
  homeWidget,
}: {
  children: React.ReactNode;
  profile: NavProfile | null;
  counts: { messages: number; notifications: number };
  /** Server-rendered content for the context panel on the homepage. */
  homeWidget?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const shell = useShell();
  const [mobileNav, setMobileNav] = useState(false);

  const live = useLiveCounts(counts, Boolean(profile));

  // The panel is a column from lg up and a sheet below it, and the two want
  // opposite defaults — open beside a wide workspace, shut over a narrow one.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const panelOpen = desktop ? !shell.panelCollapsed : shell.panelMobile;

  /**
   * The mobile panel does not follow you off the page that opened it.
   *
   * openPanel() sets panelMobile, the store persists to localStorage, and
   * nothing was clearing it — so tapping one property on the map left a
   * full-height sheet over every page afterwards, across reloads, until
   * somebody happened to press the topbar toggle.
   *
   * Only panelMobile is reset. closePanel() would also set panelCollapsed and
   * so would fold the desktop panel away on every navigation, which is a
   * different product decision and not this bug.
   */
  useEffect(() => {
    update({ panelMobile: false });
  }, [pathname]);

  const bare =
    searchParams?.get("_pane") === "1" ||
    AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (bare) {
    return <div className="min-h-screen">{children}</div>;
  }

  const signedIn = Boolean(profile);
  const navWidth = shell.navCollapsed ? 60 : shell.navWidth;

  return (
    // Printing is the one time the workspace is not a fixed-height, internally
    // scrolling application. A cut list on paper has to be the whole document,
    // not the 900 pixels that happened to be in view, so `print:` unpicks the
    // shell: the panels go, the height cap goes, and the workspace becomes an
    // ordinary flowing page the browser can paginate.
    <div className="flex h-screen overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
      {/* ---- Navigation ---------------------------------------------- */}
      <div
        style={{ width: navWidth }}
        className="hidden shrink-0 border-r bg-sidebar lg:block print:hidden"
      >
        <Sidebar signedIn={signedIn} counts={live} />
      </div>

      {!shell.navCollapsed && (
        <div className="hidden lg:block">
          <ResizeHandle
            label="Resize navigation"
            value={shell.navWidth}
            min={NAV_WIDTH.min}
            max={NAV_WIDTH.max}
            grow="right"
            onChange={(next) => update({ navWidth: next })}
          />
        </div>
      )}

      {/* Below lg the rail is a drawer, so the workspace keeps the screen. */}
      {mobileNav && (
        <div className="fixed inset-0 z-60 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="relative h-full w-[280px] border-r bg-sidebar">
            <Sidebar signedIn={signedIn} counts={live} />
          </div>
        </div>
      )}

      {/* ---- Workspace ----------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <Topbar
          profile={profile}
          notifications={live.notifications}
          panelOpen={panelOpen}
          onTogglePanel={() => (panelOpen ? closePanel() : openPanel())}
          onOpenMobileNav={() => setMobileNav(true)}
        />
        {/* Between the top bar and the tabs: the bar names what this platform
            contains, the tabs name what you have open in it. */}
        <MenuBar signedIn={signedIn} />
        <TabBar />

        <div className="flex min-h-0 flex-1 print:block">
          <main
            id="workspace"
            style={
              shell.splitHref
                ? { flex: `0 0 ${(shell.splitRatio * 100).toFixed(2)}%` }
                : undefined
            }
            // A named container query context.
            //
            // Collapsing the rail or closing the context panel changes how
            // much room this column has, but not the viewport — so a layout
            // built on `lg:` breakpoints does not notice, and the page stays
            // the narrow shape it had when both panels were open. Pages that
            // want to reflow use `@…/ws:` variants and respond to the space
            // they actually have.
            className="@container/ws min-w-0 flex-1 overflow-y-auto overscroll-contain pb-14 lg:pb-0 print:overflow-visible print:pb-0"
          >
            {children}
          </main>

          {shell.splitHref && (
            <>
              <ResizeHandle
                label="Resize split"
                value={Math.round(shell.splitRatio * 1000)}
                min={Math.round(SPLIT_RATIO.min * 1000)}
                max={Math.round(SPLIT_RATIO.max * 1000)}
                grow="right"
                onChange={(next) =>
                  update({
                    splitRatio: clamp(
                      next / 1000,
                      SPLIT_RATIO.min,
                      SPLIT_RATIO.max,
                    ),
                  })
                }
              />
              <div className="hidden min-w-0 flex-1 md:block">
                <SplitPane href={shell.splitHref} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- Context ------------------------------------------------- */}
      {panelOpen && (
        <>
          <div className="hidden lg:block">
            <ResizeHandle
              label="Resize context panel"
              value={shell.panelWidth}
              min={PANEL_WIDTH.min}
              max={PANEL_WIDTH.max}
              grow="left"
              onChange={(next) => update({ panelWidth: next })}
            />
          </div>
          <div
            style={{ width: shell.panelWidth }}
            className={cn(
              // bg-background on the wrapper, not only on ContextPanel inside
              // it. Without it a panel with little to show was a transparent
              // sheet over 90% of the screen — present to touch, invisible to
              // look at, which is why this took so long to find.
              "shrink-0 border-l bg-background print:hidden",
              // Below lg it floats over the workspace rather than squeezing it.
              // z-40, not z-50: BottomNav is also fixed at z-50, and with equal
              // z-index the winner was decided by which rendered later in the
              // file. Navigation worked and nothing else did, by accident.
              "fixed inset-y-0 right-0 z-40 max-w-[90vw] shadow-2xl",
              "lg:static lg:z-auto lg:max-w-none lg:shadow-none",
            )}
          >
            <ContextPanel signedIn={signedIn} homeWidget={homeWidget} />
          </div>
        </>
      )}

      {/* The panel's own collapse button disappears with it, so bringing it
          back needs a control that does not. */}
      {!panelOpen && desktop && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Show context panel"
          title="Show context panel"
          className="fixed top-1/2 right-0 z-40 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground print:hidden"
        >
          <PanelRight className="size-3.5" />
        </button>
      )}

      {/* The floating controls belong to the workspace, so they clear the
          context panel instead of sitting on top of its footer. */}
      <div
        style={
          {
            // Below lg the panel floats over the workspace, so the buttons
            // stay at the screen edge; from lg up they step aside for it.
            "--fab-right": panelOpen ? `${shell.panelWidth}px` : "0px",
          } as React.CSSProperties
        }
        className="pointer-events-none fixed right-0 bottom-14 z-40 flex flex-col items-end gap-3 p-5 lg:right-[var(--fab-right)] lg:bottom-0 print:hidden"
      >
        <AiLauncher />
        <QuickActions />
      </div>

      {/* The phone's navigation. Hidden from lg up, where the rail is a
          permanent column and a second nav would be a duplicate. */}
      <BottomNav signedIn={signedIn} />

      <CommandPalette />
    </div>
  );
}

/** Routes that render without the workspace frame. */
const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/",
];
