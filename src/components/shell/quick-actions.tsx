"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  FileSpreadsheet,
  HardHat,
  Home,
  MessageSquare,
  Package,
  Plus,
  Rotate3d,
  Sparkles,
  Tag,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { openPanel, update } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

/**
 * The floating +.
 *
 * One list, shared with the command palette, so "Create Product" means the
 * same thing and goes to the same place whichever way you reached it.
 *
 * `href` is optional for the same reason it is in the navigation manifest: a
 * create flow that does not exist yet is shown greyed with a "Soon" chip
 * rather than as a button that opens nothing.
 */

export type QuickCreate = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  hint?: string;
  keywords?: string;
  /** Opens the AI dock instead of navigating. */
  action?: "ai";
};

export const QUICK_CREATE: (QuickCreate & { href: string })[] = [
  {
    id: "property",
    label: "Create Property",
    icon: Home,
    href: "/property/new",
    hint: "List a property on the city map",
    keywords: "new property listing house land sell rent apartment",
  },
  {
    id: "tour",
    label: "Create 360° Tour",
    icon: Rotate3d,
    href: "/tours/new",
    hint: "Photograph a room and walk people through it",
    keywords: "360 panorama tour virtual walkthrough room sphere",
  },
  {
    id: "product",
    label: "Create Product",
    icon: Package,
    href: "/products/new",
    hint: "List something for sale",
    keywords: "new product listing sell item stock",
  },
  {
    id: "used",
    label: "Sell Used Item",
    icon: Tag,
    href: "/products/new?condition=used",
    hint: "Second-hand materials, tools, fittings",
    keywords: "used second hand salvage surplus reclaimed sell materials",
  },
  {
    id: "project",
    label: "Create Project",
    icon: HardHat,
    href: "/projects/new",
    hint: "Publish a build",
    keywords: "new project build portfolio showcase",
  },
  {
    id: "service",
    label: "Create Service",
    icon: Wrench,
    href: "/dashboard/services/new",
    hint: "Offer a trade or specialism",
    keywords: "new service offer trade profession",
  },
  {
    id: "job",
    label: "Post a Job",
    icon: Briefcase,
    href: "/jobs/new",
    hint: "Hire an engineer, a foreman, a trade",
    keywords: "hire recruit vacancy advertise job work",
  },
  {
    id: "quote",
    label: "Request Quote",
    icon: FileSpreadsheet,
    href: "/hire/new",
    hint: "Post a brief and collect bids",
    keywords: "rfq tender brief bids hire quotation",
  },
  {
    id: "post",
    label: "Write a Post",
    icon: MessageSquare,
    href: "/community",
    hint: "Ask the community, or show what you built",
    keywords: "post community question discussion share write",
  },
];

/** Actions the palette cannot run because the module does not exist yet. */
const PENDING: QuickCreate[] = [
  {
    id: "price",
    label: "Post Price",
    icon: TrendingUp,
    hint: "Publish a rate to the exchange",
  },
];

export function QuickActions() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="pointer-events-auto relative">
      {open && (
        <div className="glass absolute right-0 bottom-14 max-h-[min(70vh,32rem)] w-64 overflow-y-auto overscroll-contain rounded-2xl border p-1.5 shadow-2xl">
          {QUICK_CREATE.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              onClick={(event) => {
                setOpen(false);
                if (action.id === "post" && pathname === "/" && window.matchMedia("(max-width: 1023px)").matches) {
                  event.preventDefault();
                  window.dispatchEvent(new Event("medosha:compose"));
                  document.getElementById("workspace")?.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/12 text-brand">
                <action.icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{action.label}</span>
                {action.hint && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {action.hint}
                  </span>
                )}
              </span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => {
              openPanel();
              update({ aiOpen: true });
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/12 text-brand">
              <Sparkles className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">Ask AI</span>
              <span className="block truncate text-xs text-muted-foreground">
                Without leaving this page
              </span>
            </span>
          </button>

          {PENDING.map((action) => (
            <div
              key={action.id}
              aria-disabled
              title={`${action.label} — not built yet`}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground/50"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <action.icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
              <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4">
                Soon
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-label="Quick actions"
        className={cn(
          "ml-auto flex size-12 items-center justify-center rounded-full shadow-lg transition-all",
          "bg-brand text-brand-foreground hover:-translate-y-0.5 hover:shadow-xl",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          open && "rotate-45",
        )}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}
