"use client";

import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/workspace/navigation";

/**
 * What is inside one section, named.
 *
 * The phone's drawer is a 72px rail — small, which is what was asked for, and
 * enough for an icon and a word. A word is not enough to *choose* by on a site
 * nobody has learned yet: "Construction" holds eleven pages and "Business"
 * fourteen, and following the rail took you to the first of them without ever
 * showing the rest.
 *
 * So the rail names the section and this lists what it holds. Two narrow
 * panels rather than one wide one: the rail stays where it was, and the list
 * is dismissed by the same tap that dismisses the drawer.
 */
export function SectionPanel({
  sectionId,
  pathname,
  signedIn,
  onBack,
  onNavigate,
}: {
  sectionId: string;
  pathname: string;
  signedIn: boolean;
  onBack: () => void;
  onNavigate: () => void;
}) {
  const section = NAV_SECTIONS.find((one) => one.id === sectionId);
  if (!section) return null;

  return (
    <div className="flex h-full w-[13.5rem] flex-col border-r bg-sidebar">
      <button
        type="button"
        onClick={onBack}
        className="flex h-12 shrink-0 items-center gap-1.5 border-b px-3 text-left text-sm font-semibold transition-colors active:bg-muted"
      >
        <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
        <span aria-hidden className="text-base leading-none">
          {section.emoji}
        </span>
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
      </button>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {section.items.map((item) => {
          const active = item.href
            ? pathname === item.href || pathname.startsWith(`${item.href}/`)
            : false;

          // A module that is specified but not built is a disabled row with a
          // chip, not a link into nothing. The sidebar has always said so and
          // this says the same.
          if (!item.href) {
            return (
              <li key={item.id}>
                <span className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground/60">
                  <item.icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4">
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
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // 44px tall, like everything else a thumb has to hit.
                  "flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors active:bg-muted",
                  active ? "bg-brand/12 font-medium text-brand" : "text-foreground/85",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{item.label}</span>
                  {/* The one line the manifest already carries about each
                      page. On a site nobody has used, the name alone is
                      often not enough to pick by. */}
                  {item.hint && (
                    <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                      {item.hint}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
