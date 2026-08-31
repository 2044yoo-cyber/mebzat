"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Armchair, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_SECTIONS, type NavItem, type NavSection } from "@/lib/workspace/navigation";

/**
 * The menu bar.
 *
 * A fifth surface reading `NAV_SECTIONS` — the sidebar, the breadcrumb, the
 * command palette and the tab bar are the others. None of them keeps its own
 * list, which is the only reason five surfaces can agree about what this
 * platform contains.
 *
 * Hover opens it, and hover alone would make it unusable, so:
 *
 *   - a click opens and closes it too, because a phone has no hover and a
 *     tablet's is a lie;
 *   - keyboard focus opens it, Escape closes it, and the arrow keys walk it,
 *     because a menu you can only reach with a mouse is a menu some people
 *     cannot reach at all;
 *   - closing is delayed by a moment, because the pointer has to cross a gap
 *     between the label and the panel, and a menu that vanishes in that gap is
 *     a menu nobody can hit.
 *
 * Once one menu is open, moving across the bar switches to its neighbour
 * immediately rather than waiting for another hover — which is how every
 * menu bar has behaved since 1984 and what makes a bar feel like a bar rather
 * than nine unrelated buttons.
 */

/** How long the pointer may be outside both label and panel before it closes. */
const CLOSE_DELAY = 180;

export function MenuBar({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(null), CLOSE_DELAY);
  }, [cancelClose]);

  // A pending timer outlives the component if the route changes mid-hover.
  useEffect(() => cancelClose, [cancelClose]);

  // Navigating closes it. Adjusted during render rather than in an effect:
  // React supports resetting state when a prop changes this way, and an effect
  // would render the open panel once over the page it just took you to before
  // closing it. A link click closes it directly; this covers the back button.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
  }

  // A click anywhere else closes it, including on the page underneath.
  useEffect(() => {
    if (open === null) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /** Left or right along the bar, wrapping. */
  const step = (from: string, direction: 1 | -1) => {
    const index = NAV_SECTIONS.findIndex((section) => section.id === from);
    const next =
      NAV_SECTIONS[(index + direction + NAV_SECTIONS.length) % NAV_SECTIONS.length];
    if (next) setOpen(next.id);
  };

  return (
    <div
      ref={bar}
      // Below lg the sidebar is a drawer and the bottom bar carries navigation,
      // so a second menu would be a third way to reach the same nine sections.
      // Hidden on paper for the obvious reason.
      // Scrolls when nine sections plus Berchuma do not fit — at 952 px of
      // workspace, which is what a 1600 px screen leaves with both panels open,
      // they do not. The dropdowns are positioned against the viewport rather
      // than against this element precisely because it scrolls: an absolutely
      // positioned panel inside a container with `overflow-x: auto` is clipped
      // vertically too, which is a CSS rule people rediscover once each.
      className="relative hidden h-10 shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b px-2 [scrollbar-width:none] lg:flex print:hidden [&::-webkit-scrollbar]:hidden"
      onMouseLeave={scheduleClose}
      onMouseEnter={cancelClose}
    >
      {/* Not "Sections" — the sidebar already claims that label, and two
          landmarks with the same name is a screen reader announcing the same
          thing twice with no way to tell them apart. */}
      <nav aria-label="Main menu" className="flex items-center gap-0.5">
        {/* Berchuma has its own place on the bar rather than only a row inside
            the Medosha AI menu. It is the thing on this platform that exists
            nowhere else, and two hovers deep is where features go to be never
            found. */}
        <Link
          href="/studio"
          aria-current={isActive(pathname, "/studio") ? "page" : undefined}
          className={cn(
            "mr-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap",
            isActive(pathname, "/studio")
              ? "bg-brand text-brand-foreground"
              : "text-brand hover:bg-brand/10",
          )}
          onMouseEnter={() => setOpen(null)}
        >
          <Armchair className="size-3.5" aria-hidden />
          Berchuma Studio
        </Link>

        <span className="mr-1 h-4 w-px shrink-0 bg-border" aria-hidden />

        {NAV_SECTIONS.map((section) => (
          <Section
            key={section.id}
            section={section}
            open={open === section.id}
            anyOpen={open !== null}
            signedIn={signedIn}
            pathname={pathname}
            onOpen={() => {
              cancelClose();
              setOpen(section.id);
            }}
            onToggle={(pointer) =>
              setOpen((current) => {
                // A mouse has already opened this by hovering, so a click that
                // toggled would close the menu the user just reached for. On
                // touch there is no hover and a tap has to do both jobs.
                if (pointer === "mouse") return section.id;
                return current === section.id ? null : section.id;
              })
            }
            onLeave={scheduleClose}
            onStep={(direction) => step(section.id, direction)}
            onClose={() => setOpen(null)}
          />
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  section,
  open,
  anyOpen,
  signedIn,
  pathname,
  onOpen,
  onToggle,
  onLeave,
  onStep,
  onClose,
}: {
  section: NavSection;
  open: boolean;
  anyOpen: boolean;
  signedIn: boolean;
  pathname: string;
  onOpen: () => void;
  onToggle: (pointer: string) => void;
  onLeave: () => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const active =
    section.items.some((item) => item.href && isActive(pathname, item.href)) ||
    (section.href === "/" && pathname === "/") ||
    (section.href !== undefined && section.href !== "/" && isActive(pathname, section.href));

  // A section with no children is a destination, not a menu. Home is the one
  // that matters, and a dropdown containing nothing would be a trap.
  //
  // The two shapes are two components rather than one with a branch, because
  // the menu needs hooks and a component may not call them after an early
  // return.
  if (section.items.length === 0 && section.href) {
    return (
      <Link
        href={section.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap",
          active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
        )}
        onMouseEnter={onClose}
      >
        <span aria-hidden>{section.emoji}</span>
        {section.label}
      </Link>
    );
  }

  return (
    <SectionMenu
      section={section}
      open={open}
      anyOpen={anyOpen}
      signedIn={signedIn}
      pathname={pathname}
      active={active}
      onOpen={onOpen}
      onToggle={onToggle}
      onLeave={onLeave}
      onStep={onStep}
      onClose={onClose}
    />
  );
}

function SectionMenu({
  section,
  open,
  anyOpen,
  signedIn,
  pathname,
  active,
  onOpen,
  onToggle,
  onLeave,
  onStep,
  onClose,
}: {
  section: NavSection;
  open: boolean;
  anyOpen: boolean;
  signedIn: boolean;
  pathname: string;
  active: boolean;
  onOpen: () => void;
  onToggle: (pointer: string) => void;
  onLeave: () => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);

  // Measured when the menu opens, not during render: reading a DOM rectangle
  // while rendering is reading something React has not finished writing.
  const [anchor, setAnchor] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      // 352 px is the panel's own max width; clamped so a section at the right
      // edge of a narrow workspace opens inwards instead of off the screen.
      const width = Math.min(352, window.innerWidth * 0.8);
      setAnchor({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: rect.bottom + 4,
      });
    };

    place();
    window.addEventListener("resize", place);
    // The bar itself scrolls, so the trigger moves under an open panel.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap",
          open || active
            ? "bg-muted font-medium"
            : "text-muted-foreground hover:bg-muted/60",
        )}
        // The first hover has to be intentional; once the bar is open, sliding
        // along it switches menus at once.
        onMouseEnter={onOpen}
        onMouseLeave={onLeave}
        onClick={(event) =>
          // `event.detail === 0` means the keyboard raised it, and a keyboard
          // press should toggle rather than only open.
          onToggle(
            event.detail === 0
              ? "keyboard"
              : ((event.nativeEvent as PointerEvent).pointerType ?? "mouse"),
          )
        }
        onFocus={() => {
          if (anyOpen) onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onStep(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onStep(-1);
          }
        }}
      >
        <span aria-hidden>{section.emoji}</span>
        {section.label}
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={section.label}
          onMouseEnter={onOpen}
          onMouseLeave={onLeave}
          style={anchor}
          // Fixed, not absolute. The bar scrolls horizontally, and an absolute
          // child of a scrolling container is clipped on both axes — the panel
          // would be cut off at the bar's own 40 px height. Positioning it
          // against the viewport also lets it be pushed back inside the screen
          // when the section it belongs to is near the right edge.
          //
          // z-60 rather than z-50: the context panel is z-50 and comes later in
          // the document, so an equal z-index would put the panel on top.
          className="glass fixed z-60 w-[min(22rem,80vw)] overflow-hidden rounded-xl border p-1.5 shadow-2xl"
        >
          <ul className="max-h-[70vh] overflow-y-auto">
            {section.items.map((item) => (
              <li key={item.id}>
                {item.href ? (
                  <MenuLink
                    item={item}
                    href={item.href}
                    active={isActive(pathname, item.href)}
                    signedIn={signedIn}
                    onSelect={onClose}
                  />
                ) : (
                  <SoonItem item={item} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  item,
  href,
  active,
  signedIn,
  onSelect,
}: {
  item: NavItem;
  href: string;
  active: boolean;
  signedIn: boolean;
  onSelect: () => void;
}) {
  // Signed out, a members-only destination still shows — it is part of what
  // this platform is — but dimmed, and the login page it lands on says why.
  const gated = item.private && !signedIn;

  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm",
        active ? "bg-muted font-medium" : "hover:bg-muted/60",
        gated && "opacity-60",
      )}
    >
      <item.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.hint ? (
          <span className="block truncate text-xs text-muted-foreground">
            {item.hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Specified but not built. Plainly disabled beats a link that goes nowhere. */
function SoonItem({ item }: { item: NavItem }) {
  return (
    <div
      aria-disabled
      title={`${item.label} — not built yet`}
      className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground/50"
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4">
        Soon
      </span>
    </div>
  );
}

/**
 * Whether a path is the one on screen.
 *
 * A prefix match, so `/designs/three-bay-wardrobe` lights up `/designs` — but
 * only on a segment boundary, or `/city` would also claim `/citymap`. The
 * query string is dropped first: several items differ only by `?tool=`, and
 * comparing those against a pathname never matches anything.
 */
function isActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}
