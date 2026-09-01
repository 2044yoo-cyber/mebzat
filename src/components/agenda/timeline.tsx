"use client";

import { useState } from "react";
import {
  Banknote,
  CalendarClock,
  ClipboardList,
  Gavel,
  ListChecks,
  Lock,
  Paperclip,
  Users,
} from "lucide-react";

import { Empty, whenTime } from "@/components/agenda/shared";
import type { AgendaEvent, Reminder } from "@/lib/data/agenda";
import type { EventKind } from "@/lib/agenda/constants";
import { cn } from "@/lib/utils";

/**
 * Everything, in the order it happened.
 *
 * The whole point of Agenda in one column: steel delivered, foundation
 * finished, client approved the kitchen, payment received, inspection passed.
 * A finance event only appears here for a reader with finance access — the
 * database filters it out of the query, so there is nothing to hide in the
 * browser.
 */

const ICONS: Record<EventKind, typeof ClipboardList> = {
  log: ClipboardList,
  task_created: ListChecks,
  task_started: ListChecks,
  task_completed: ListChecks,
  ledger: Banknote,
  meeting: Users,
  decision: Gavel,
  attachment: Paperclip,
  member: Users,
  reminder: CalendarClock,
  milestone: Gavel,
};

export function AgendaTimeline({
  events,
  reminders,
}: {
  events: AgendaEvent[];
  reminders: Reminder[];
}) {
  // The clock is read once, not on every render: a component that re-renders
  // must not quietly change which reminders it calls overdue.
  const [now] = useState(() => Date.now());
  const upcoming = reminders.slice(0, 5);

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Coming up</h2>
          <ul className="space-y-1.5">
            {upcoming.map((reminder) => {
              const late = new Date(reminder.due_at).getTime() < now;
              return (
                <li
                  key={reminder.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-xl border p-2.5 text-sm",
                    late && "border-amber-500/40 bg-amber-500/5",
                  )}
                >
                  <CalendarClock
                    className={cn(
                      "size-3.5 shrink-0",
                      late ? "text-amber-600 dark:text-amber-400" : "text-brand",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{reminder.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {late ? "overdue · " : ""}
                    {whenTime(reminder.due_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          History
          <span className="ml-1.5 font-normal text-muted-foreground">
            {events.length}
          </span>
        </h2>

        {events.length === 0 ? (
          <Empty>
            Nothing recorded yet. Add today&rsquo;s site log and it will appear
            here.
          </Empty>
        ) : (
          <ol className="relative space-y-3 border-l pl-5">
            {events.map((event) => {
              const Icon = ICONS[event.kind] ?? ClipboardList;
              return (
                <li key={event.id} className="relative">
                  <span className="absolute top-1 -left-[1.65rem] flex size-5 items-center justify-center rounded-full border bg-background">
                    <Icon className="size-2.5 text-brand" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium">{event.title}</p>
                    {event.confidentiality !== "members" && (
                      <span
                        title="Only members with the matching permission see this"
                        className="inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[10px] text-muted-foreground"
                      >
                        <Lock className="size-2.5" />
                        {event.confidentiality === "finance"
                          ? "Finance"
                          : "Meetings"}
                      </span>
                    )}
                  </div>
                  {event.detail && (
                    <p className="text-sm text-muted-foreground">
                      {event.detail}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {whenTime(event.occurred_at)}
                    {event.actor?.full_name && ` · ${event.actor.full_name}`}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
