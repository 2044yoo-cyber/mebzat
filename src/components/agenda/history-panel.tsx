"use client";

import { Empty, whenTime } from "@/components/agenda/shared";
import type { AuditEntry } from "@/lib/data/agenda";
import { cn } from "@/lib/utils";

/**
 * Every change ever made.
 *
 * The reason Agenda can be trusted. A site log rewritten a month later looks
 * identical to one written on the day — unless the rewrite itself is on the
 * record, which is what this is. Written by a database trigger that nobody can
 * bypass, and readable but not writable by anyone.
 */

const LABELS: Record<string, string> = {
  agenda_daily_logs: "Site log",
  agenda_tasks: "Task",
  agenda_ledger: "Ledger entry",
  agenda_meetings: "Meeting",
  agenda_decisions: "Decision",
};

function fieldName(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") {
    return value.length > 80 ? `${value.slice(0, 80)}…` : value || "empty";
  }
  return String(value);
}

export function HistoryPanel({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <Empty>Nothing has been changed yet.</Empty>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every edit to this Agenda, in order. Records are never deleted — the
        most a member can do is withdraw one, and that is recorded too.
      </p>

      <ol className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-2xl border p-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  entry.action === "insert" &&
                    "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                  entry.action === "archive" &&
                    "border-rose-500/40 text-rose-600 dark:text-rose-400",
                )}
              >
                {entry.action === "insert"
                  ? "Created"
                  : entry.action === "archive"
                    ? "Withdrawn"
                    : "Edited"}
              </span>
              <span className="font-medium">
                {LABELS[entry.table_name] ?? entry.table_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {whenTime(entry.created_at)}
                {entry.actor?.full_name && ` · ${entry.actor.full_name}`}
              </span>
            </div>

            {entry.changes && Object.keys(entry.changes).length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {Object.entries(entry.changes)
                  .filter(([key]) => key !== "archived_at")
                  .map(([key, change]) => (
                    <li key={key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {fieldName(key)}
                      </span>{" "}
                      <span className="line-through">{show(change.from)}</span>{" "}
                      → <span className="text-foreground">{show(change.to)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
