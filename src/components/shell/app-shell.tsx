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
  // The route the navigation drawer was opened on, or null. See the note by
  // the pathname effect below for why this is not a plain boolean.
  const [navOpenedAt, setNavOpenedAt] = useState<string | null>(null);

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
   *
   * The left drawer had the same fault and not the same fix. Below lg the rail
   * is a drawer over the page, and the only thing that closed it was the
   * backdrop — so tapping "Marketplace" navigated underneath a sheet that
   * stayed put, and the reader had to find the dark strip beside it to see
   * where they had arrived. Navigation is the strongest possible signal that a
   * navigation menu is finished with.
   *
   * It is local state rather than the store, so unlike the panel this one did
   * at least clear on a reload. That made it look intermittent rather than
   * broken, which is why it survived.
   *
   * Derived rather than cleared: `mobileNav` is now "the drawer was opened on
   * the page we are still on". Navigating changes the pathname and the drawer
   * is shut by arithmetic, with no effect and no second render. Clearing it in
   * the effect above worked and React says not to — setState in an effect body
   * is a cascading render, and the rule is right here: there is nothing to
   * synchronise, only a value to compute.
   */
  useEffect(() => {
    update({ panelMobile: false });
  }, [pathname]);

  /** Open only while the reader is still on the page they opened it from. */
  const mobileNav = navOpenedAt !== null && navOpenedAt === pathname;

  const bare =
    searchParams?.get("_pane") === "1" ||
    AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (bare) {
    return <div className="min-h-screen">{children}</div>;
  }

  const signedIn = Boolean(profile);
  const navWidth = shell.navCollapsed ? 60 : shell.navWidth;

  return (
    // `h-dvh`, not `h-screen`.
    //
    // `100vh` on a mobile browser is the viewport with the URL bar *hidden* —
    // the largest it ever gets. A shell sized to that is taller than what is
    // actually visible while the bar is showing, so its last rows sit below
    // the fold with no way to scroll to them: the shell itself does not
    // scroll, the column inside it does, and that column believed it had more
    // room than the screen had. `100dvh` tracks the viewport as it changes.
    //
    // Printing is the one time the workspace is not a fixed-height, internally
    // scrolling application. A cut list on paper has to be the whole document,
    // not the 900 pixels that happened to be in view, so `print:` unpicks the
    // shell: the panels go, the height cap goes, and the workspace becomes an
    // ordinary flowing page the browser can paginate.
    <div className="flex h-dvh overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
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
            onClick={() => setNavOpenedAt(null)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          {/* A compact icon rail, always, at about a centimetre across.

              It used to be a flat 280px rendering whatever mode the desktop
              rail was in. With that rail collapsed — which it was — the result
              was 36px icons centred in 280px of panel: three quarters of a
              phone screen covered to show a column of glyphs, and 220px of it
              black. The rail is `w-full` and centres its icons, so it had no
              way to object to the room it was given.

              `collapsed` is forced rather than read from the store. The stored
              value is the desktop rail's, and the control that changes it is
              desktop-only: a reader who expanded it at a desk would get a 5cm
              drawer on their phone, and one who collapsed it would have no way
              to get labels back. Neither should follow you onto a phone.

              The labelled menu is not lost — "More" in the bottom bar opens
              every section with its name — which is what makes the drawer
              affordable as a quick rail rather than the only way through. */}
          <div
            style={{ width: MOBILE_NAV_WIDTH }}
            className="relative h-full border-r bg-sidebar"
          >
            <Sidebar signedIn={signedIn} counts={live} collapsed />
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
          onOpenMobileNav={() => setNavOpenedAt(pathname)}
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
            // This is the element that actually scrolls for nearly every page in
            // the application, so this is where the reservation belongs.
            //
            // It used to clear `--bottom-nav-h` alone, which is the bar and
            // nothing else. The floating buttons sit *above* the bar and are
            // rendered by this same shell, so a page whose last control was
            // full-width ended underneath them — which is what "Save changes
            // is covered" actually was.
            //
            // `scroll-pb-content-safe` is the same reservation again, for the
            // scrolling the *browser* does rather than the reader: tapping an
            // input near the foot of a form makes the browser scroll it into
            // view, and without a scroll-padding it parks it flush against the
            // bottom of the container — behind the bar, with the keyboard
            // open. This is the passive half of the keyboard fix; there is
            // deliberately no scrollIntoView on focus, because automatic
            // scrolling that fires on every tap is its own problem.
            className="@container/ws min-w-0 flex-1 overflow-y-auto overscroll-contain pb-content-safe scroll-pb-content-safe print:overflow-visible print:pb-0"
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
        className="pointer-events-none fixed right-0 bottom-[var(--bottom-nav-h)] z-40 flex flex-col items-end gap-3 p-5 lg:right-[var(--fab-right)] lg:bottom-0 print:hidden"
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

/**
 * The phone drawer's width — about a centimetre of glass.
 *
 * Matches the desktop rail's collapsed width so the icons sit in the same
 * column they always do, and stays a fixed number here because on a phone it
 * is not a preference: there is no handle to drag and no toggle to press.
 */
const MOBILE_NAV_WIDTH = 60;

/** Routes that render without the workspace frame. */
const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/",
];
