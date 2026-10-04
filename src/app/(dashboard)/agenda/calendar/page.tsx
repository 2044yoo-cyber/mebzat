import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarRange,
  ClipboardList,
  Diamond,
  ListChecks,
  MessageCircleQuestion,
  Receipt,
  Users,
} from "lucide-react";

import { Empty, when } from "@/components/agenda/shared";
import { getDiary, type DiaryEntry } from "@/lib/data/agenda-projects";
import { requireViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendar · Agenda" };

/** How many days ahead the diary looks, and how far back it still shows. */
const LOOK_BACK_DAYS = 7;
const LOOK_AHEAD_DAYS = 60;

const ICONS: Record<DiaryEntry["kind"], typeof ListChecks> = {
  task: ListChecks,
  meeting: Users,
  inspection: ClipboardList,
  milestone: Diamond,
  rfi: MessageCircleQuestion,
  invoice: Receipt,
};

const LABELS: Record<DiaryEntry["kind"], string> = {
  task: "Task",
  meeting: "Meeting",
  inspection: "Inspection",
  milestone: "Milestone",
  rfi: "RFI answer",
  invoice: "Invoice due",
};

/**
 * Where each kind of entry lives, so a row opens the thing rather than a list.
 *
 * Whole paths rather than a section fragment joined on at the call site. Two
 * interpolations in one template is a link `scripts/check-routes.mjs` cannot
 * resolve — it reported this one as pointing at nothing — and a link checker
 * that has to be worked around is a link checker that stops finding dead
 * links.
 */
const HREF: Record<DiaryEntry["kind"], (projectId: string) => string> = {
  task: (id) => `/agenda/projects/${id}/tasks`,
  meeting: (id) => `/agenda/projects/${id}/meetings`,
  inspection: (id) => `/agenda/projects/${id}/inspections`,
  milestone: (id) => `/agenda/projects/${id}/schedule`,
  rfi: (id) => `/agenda/projects/${id}/rfis`,
  invoice: (id) => `/agenda/projects/${id}/invoices`,
};

function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Everything dated, across every project.
 *
 * A week back as well as forward, because what was due on Tuesday and did not
 * happen is more useful on a Thursday than a clean forward-only list that
 * makes it disappear.
 *
 * Each kind is read from its own table under its own policy, so an invoice due
 * date is absent for somebody without finance access rather than the page
 * refusing to load.
 */
export default async function AgendaCalendarPage() {
  await requireViewer("/agenda/calendar");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/agenda/calendar");

  const today = day(0);
  const entries = await getDiary(
    user.id,
    day(-LOOK_BACK_DAYS),
    day(LOOK_AHEAD_DAYS),
  );

  const days = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    const bucket = days.get(entry.on);
    if (bucket) bucket.push(entry);
    else days.set(entry.on, [entry]);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Deadlines, inspections, meetings and milestones from every project
          you are on.
        </p>
      </header>

      {days.size === 0 ? (
        <Empty>
          Nothing is dated in the next {LOOK_AHEAD_DAYS} days on any project
          you are on.
        </Empty>
      ) : (
        [...days.entries()].map(([date, dayEntries]) => (
          <section key={date} className="space-y-2">
            <h2
              className={cn(
                "flex items-center gap-2 text-sm font-medium",
                date < today && "text-destructive",
                date === today && "text-brand",
              )}
            >
              <CalendarRange className="size-3.5" />
              {when(date)}
              {date === today && " · today"}
              {date < today && " · passed"}
            </h2>
            <ul className="space-y-1.5">
              {dayEntries.map((entry) => {
                const Icon = ICONS[entry.kind];
                return (
                  <li key={entry.id}>
                    <Link
                      href={HREF[entry.kind](entry.projectId)}
                      className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{entry.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[LABELS[entry.kind], entry.projectName]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
