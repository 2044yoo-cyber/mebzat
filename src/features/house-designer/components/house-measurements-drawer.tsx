"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardCopy, Send } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { levelMeasurements, measurementText, type Measurement, type MeasurementGroup } from "../services/measurements";
import type { HouseProject, HouseSelection } from "../types/project";

const ORDER: MeasurementGroup[] = ["Rooms", "Walls", "Doors", "Windows", "Furniture", "Columns", "Stairs", "Measurements"];

/**
 * Every measurement on the floor, ready to copy into a message, a spreadsheet
 * or a professional's model. Collapsed by default so the drawing keeps the
 * screen; one tap opens it.
 */
export function HouseMeasurementsDrawer({ project, levelId, onSelect, onSendToAgenda }: {
  project: HouseProject;
  levelId: string;
  onSelect: (selection: HouseSelection) => void;
  /** Absent until the plan is in a project: there is no Agenda to send to. */
  onSendToAgenda?: (text: string, items: Measurement[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => levelMeasurements(project, levelId), [levelId, project]);
  const level = project.levels.find((item) => item.id === levelId);
  const heading = `${project.metadata.title} — ${level?.name ?? "Floor"}`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("This browser would not copy. Select the text and copy it instead.");
    }
  }

  return (
    <section aria-label="Measurements" className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-semibold">
        <span>Measurements <span className="font-normal text-muted-foreground">· {items.length}</span></span>
        {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
      {open ? (
        <div className="border-t px-2 pb-2">
          <div className="flex gap-1.5 py-2">
            <button type="button" disabled={!items.length} onClick={() => void copy(measurementText(items, heading), "All measurements")} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-muted disabled:opacity-40"><ClipboardCopy className="size-3.5" /> Copy all</button>
            <button type="button" disabled={!items.length || !onSendToAgenda} title={onSendToAgenda ? undefined : "Save the project first"} onClick={() => onSendToAgenda?.(measurementText(items, heading), items)} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium hover:bg-muted disabled:opacity-40"><Send className="size-3.5" /> Send to Agenda</button>
          </div>
          {!items.length ? <p className="px-1 py-3 text-xs text-muted-foreground">Nothing measured on this floor yet. Draw a room or a wall, or use Measure.</p> : null}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {ORDER.map((group) => {
              const rows = items.filter((item) => item.group === group);
              if (!rows.length) return null;
              return (
                <div key={group}>
                  <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group}</p>
                  <ul className="divide-y rounded-lg border">
                    {rows.map((item) => (
                      <li key={item.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => onSelect(item.selection)} className="min-w-0 flex-1 px-2 py-1.5 text-left">
                          <span className="block truncate text-xs font-medium">{item.label}</span>
                          <span className={cn("block truncate text-xs tabular-nums text-muted-foreground")}>{item.value}</span>
                        </button>
                        <button type="button" aria-label={`Copy ${item.label}`} onClick={() => void copy(`${item.label}: ${item.value}`, item.label)} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ClipboardCopy className="size-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
