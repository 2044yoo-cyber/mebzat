"use client";

import Link from "next/link";

import { AGENDA_PROJECT_FILTERS } from "@/lib/agenda/projects";
import { cn } from "@/lib/utils";

/**
 * The project list's filter.
 *
 * Links rather than buttons with state, so a filtered list has a URL: "look at
 * the on-hold ones" is a thing somebody says to a colleague, and it should be
 * a message they can send rather than an instruction they have to give.
 */
export function ProjectFilter({ active }: { active: string }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {AGENDA_PROJECT_FILTERS.map((filter) => (
        <Link
          key={filter.value}
          href={
            filter.value === "all"
              ? "/agenda/projects"
              : `/agenda/projects?status=${filter.value}`
          }
          aria-current={filter.value === active ? "true" : undefined}
          className={cn(
            "flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm transition-colors",
            filter.value === active
              ? "border-brand bg-brand text-brand-foreground"
              : "hover:bg-muted",
          )}
        >
          {filter.label}
        </Link>
      ))}
    </div>
  );
}
