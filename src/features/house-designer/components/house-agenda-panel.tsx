"use client";

import { ExternalLink, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

import type { PlanLink } from "../services/plan-store";
import type { Pin } from "../services/sketch-store";

/**
 * What this plan has on the project's Agenda: its pins, each with the task
 * made from it and the task's state. Opening one goes to the exact place on
 * the drawing or photo it was dropped on.
 */
export function HouseAgendaPanel({ link, pins, statuses, onOpen, where }: {
  link: PlanLink;
  pins: Pin[];
  statuses: Record<string, string>;
  onOpen: (pin: Pin) => void;
  where: (pin: Pin) => string;
}) {
  const open = pins.filter((pin) => pin.status === "open");
  const resolved = pins.filter((pin) => pin.status === "resolved");
  return (
    <section aria-label="Agenda" className="space-y-3">
      <a href={`/agenda/projects/${link.projectId}/plan`} className="flex min-h-12 items-center justify-between rounded-xl border bg-card px-3 text-sm font-medium hover:bg-muted">
        <span>Open {link.projectName} in Agenda</span>
        <ExternalLink className="size-4 text-muted-foreground" />
      </a>
      {pins.length === 0 ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No pins yet. Select something on the plan and choose Add to Agenda, or drop a Pin on a sketch.</p> : null}
      {[["Open", open], ["Resolved", resolved]].map(([heading, items]) => (items as Pin[]).length ? (
        <div key={heading as string}>
          <p className="pb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{heading as string}</p>
          <ul className="divide-y rounded-xl border bg-card">
            {(items as Pin[]).map((pin) => (
              <li key={pin.id}>
                <button type="button" onClick={() => onOpen(pin)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", pin.status === "resolved" ? "bg-emerald-600" : "bg-rose-600")}>{pin.number.replace(/^PIN-0*/, "")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{pin.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground"><MapPin className="mr-0.5 inline size-3" />{where(pin)}{pin.measurement ? ` · ${pin.measurement}` : ""}</span>
                  </span>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{pin.taskId ? (statuses[pin.taskId] ?? "on Agenda").replace("_", " ") : "not on Agenda"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null)}
    </section>
  );
}
