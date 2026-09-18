"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BUILT_THROUGH_PHASE,
  WORKSPACE_GROUPS,
  activeSection,
  sectionHref,
} from "@/lib/agenda/workspace-nav";
import { cn } from "@/lib/utils";

/**
 * Getting around one project.
 *
 * Thirty sections, grouped the way a job is run rather than alphabetically.
 * The brief's own instruction — do not put everything on one screen — is the
 * whole design: this is a column on a desktop and a horizontal strip on a
 * phone, and in both cases it is navigation rather than content.
 *
 * A section whose screen is not built yet is rendered as text with a small
 * marker instead of a link. A link to an empty page is a worse answer than an
 * honest "not yet", and it costs somebody a tap to find out.
 */
export function WorkspaceNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const current = activeSection(projectId, pathname);

  return (
    <nav
      aria-label="Project sections"
      className={cn(
        // A strip that scrolls sideways on a phone, a column from lg up.
        "flex gap-1 overflow-x-auto border-b p-2",
        "lg:h-full lg:flex-col lg:gap-4 lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-3",
      )}
    >
      {WORKSPACE_GROUPS.map((group) => (
        <div key={group.id} className="flex gap-1 lg:flex-col lg:gap-0.5">
          <p className="hidden px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:block">
            {group.label}
          </p>
          {group.sections.map((section) => {
            const Icon = section.icon;
            const on = section.id === current;

            if (section.phase > BUILT_THROUGH_PHASE) {
              return (
                <span
                  key={section.id}
                  // Not a button and not a link: there is nothing to press.
                  className="flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm whitespace-nowrap text-muted-foreground/60"
                >
                  <Icon className="size-4 shrink-0" />
                  {section.label}
                  <span className="rounded border px-1 text-[10px]">soon</span>
                </span>
              );
            }

            return (
              <Link
                key={section.id}
                href={sectionHref(projectId, section.segment)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm whitespace-nowrap transition-colors",
                  on
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {section.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
