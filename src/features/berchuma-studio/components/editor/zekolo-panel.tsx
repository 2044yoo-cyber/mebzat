"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Footprints } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthInput } from "../ui/length-field";
import { moduleFit, misfitMessage } from "../../services/height-modules";
import { setAllZekolo, setCornerZekolo, setZekolo, zekoloApplies } from "../../services/operations";
import { resolveDesign } from "../../services/resolve";
import { zekoloBoardOf } from "../../services/wardrobe-materials";
import { BOARDS } from "../../types/catalogue";
import { ZEKOLO_LIMITS, type Cabinet, type DesignSpec } from "../../types/spec";

/**
 * The Zekolo — the plinth a cabinet stands on — as a construction choice.
 *
 * On is the recessed base Medosha has always made: its height, how far it is
 * set back from the front, and the board (and so the thickness) it is cut
 * from, all per cabinet. Off is no base at all: the carcass comes down to the
 * floor and its sides and doors grow by what the plinth took, the overall
 * height kept. Either way the parts are real — they come and go in the 3D,
 * the elevation, the cut list, the sheets and the price.
 */

/** Boards a plinth is made in: the stocked sheets 12 mm and up, not worktops. */
const ZEKOLO_BOARDS = BOARDS.filter((board) => board.thickness >= 12 && !board.id.startsWith("worktop") && !/-\d{4}$/.test(board.id));

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <div className="flex gap-0.5 rounded-md border p-0.5" role="group" aria-label={label}>
      {([true, false] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={on === value}
          disabled={disabled}
          onClick={() => onChange(value)}
          className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40", on === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {value ? "ON" : "OFF"}
        </button>
      ))}
    </div>
  );
}

function Shell({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section aria-label={title} className="rounded-xl border border-white/10 bg-card/50">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Footprints className="size-3.5 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide">{title}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="space-y-2 px-3 pb-3 text-[11px]">{children}</div> : null}
    </section>
  );
}

/** The selected cabinet's own Zekolo. */
export function ZekoloPanel({ spec, cabinet, onChange }: { spec: DesignSpec; cabinet: Cabinet; onChange: (next: DesignSpec) => void }) {
  const on = cabinet.plinthHeight > 0;
  const board = zekoloBoardOf(spec, cabinet);
  // What the floor gives a wardrobe's sides once the plinth is gone: they
  // grow by its height, and a board has a length.
  const offProblem = useMemo(() => {
    if (!on || spec.furnitureType !== "wardrobe") return null;
    const draft = structuredClone(spec);
    const target = draft.cabinets.find((entry) => entry.id === cabinet.id)!;
    target.plinthHeight = 0;
    const fit = moduleFit(draft, cabinet.id, cabinet.size.height);
    return fit.ok || !fit.misfit ? null : misfitMessage(fit.misfit);
  }, [spec, cabinet.id, cabinet.size.height, on]);

  if (cabinet.stackedOn || cabinet.kind === "wall" || cabinet.position.y > 0) {
    // Not a choice: an upper module stands on the one below, a wall unit on
    // nothing — neither on a plinth.
    return (
      <Shell title="Zekolo / plinth">
        <p className="text-muted-foreground">{cabinet.stackedOn ? "OFF — an upper module stands on the module below it, with no Zekolo between." : "OFF — this cabinet is hung, not standing on the floor."}</p>
      </Shell>
    );
  }
  const recessed = spec.furnitureType === "wardrobe" || spec.furnitureType === "kitchen";
  const setback = cabinet.zekolo?.setback ?? (spec.furnitureType === "kitchen" ? 40 : 20);
  const thicknesses = [...new Set(ZEKOLO_BOARDS.map((entry) => entry.thickness))].sort((a, b) => a - b);
  return (
    <Shell title="Zekolo / plinth" defaultOpen>
      <div className="flex items-center justify-between gap-2">
        <span>{on ? `Standing on a ${Math.round(cabinet.plinthHeight)} mm Zekolo` : "On the floor, no Zekolo"}</span>
        <Toggle label="Zekolo" on={on} onChange={(next) => onChange(setZekolo(spec, cabinet.id, { on: next }))} />
      </div>
      {on ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>Height</span>
            <span className="flex items-center gap-1">
              <LengthInput label="Zekolo height" value={cabinet.plinthHeight} min={ZEKOLO_LIMITS.minHeight} max={ZEKOLO_LIMITS.maxHeight} step={10} onChange={(height) => onChange(setZekolo(spec, cabinet.id, { height }))} />
              <span className="text-muted-foreground">mm</span>
            </span>
          </div>
          {recessed ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span>Setback from the front</span>
                <span className="flex items-center gap-1">
                  <LengthInput label="Zekolo setback" value={setback} min={0} max={ZEKOLO_LIMITS.maxSetback} step={5} onChange={(value) => onChange(setZekolo(spec, cabinet.id, { setback: value }))} />
                  <span className="text-muted-foreground">mm</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Thickness</span>
                <div className="flex gap-1" role="group" aria-label="Zekolo thickness">
                  {thicknesses.map((thickness) => (
                    <button
                      key={thickness}
                      type="button"
                      aria-pressed={board.thickness === thickness}
                      onClick={() => {
                        if (board.thickness === thickness) return;
                        // The same colour in the new thickness where there is one.
                        const choice = ZEKOLO_BOARDS.filter((entry) => entry.thickness === thickness);
                        const next = choice.find((entry) => entry.appearance?.colour === board.appearance?.colour) ?? choice[0]!;
                        onChange(setZekolo(spec, cabinet.id, { boardId: next.id }));
                      }}
                      className={cn("rounded-md border px-2 py-1 tabular-nums", board.thickness === thickness ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:border-brand/50")}
                    >
                      {thickness} mm
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-2">
                <span>Material</span>
                <select aria-label="Zekolo material" value={board.id} onChange={(event) => onChange(setZekolo(spec, cabinet.id, { boardId: event.target.value }))} className="h-8 max-w-[60%] rounded-md border bg-background/60 px-1.5 text-[11px]">
                  {ZEKOLO_BOARDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground">It stands on legs; their kind and size are under Materials.</p>
          )}
          {offProblem ? <p className="text-[10px] text-amber-600 dark:text-amber-400">Turning it off lengthens the sides to the floor. {offProblem} The wardrobe would be made shorter, or its height divided into modules.</p> : null}
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground">The bottom panel is on the floor: sides and doors run to it. Turn it back on to stand the cabinet on a Zekolo again.</p>
      )}
    </Shell>
  );
}

/** Every Zekolo in the design at once, or each one. */
export function ZekoloDesignPanel({ spec, onChange }: { spec: DesignSpec; onChange: (next: DesignSpec) => void }) {
  const [customize, setCustomize] = useState(false);
  const cabinets = spec.cabinets.filter(zekoloApplies);
  const corners = resolveDesign(spec).layout.corners.filter((corner) => !corner.baseY && corner.plinthHeight === undefined && !(spec.furnitureType === "wardrobe" && corner.ownerRunId));
  const states = [...cabinets.map((cabinet) => cabinet.plinthHeight > 0), ...corners.map((corner) => spec.cornerSettings?.[corner.id]?.zekolo !== false)];
  if (!states.length) return null;
  const allOn = states.every(Boolean);
  const allOff = states.every((value) => !value);
  return (
    <Shell title="Zekolo">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Zekolo for the whole design">
        <button type="button" aria-pressed={allOn} onClick={() => onChange(setAllZekolo(spec, true))} className={cn("rounded-md border px-2.5 py-1", allOn ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:border-brand/50")}>All ON</button>
        <button type="button" aria-pressed={allOff} onClick={() => onChange(setAllZekolo(spec, false))} className={cn("rounded-md border px-2.5 py-1", allOff ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:border-brand/50")}>All OFF</button>
        <button type="button" aria-pressed={customize || (!allOn && !allOff)} onClick={() => setCustomize(!customize)} className={cn("rounded-md border px-2.5 py-1", customize || (!allOn && !allOff) ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:border-brand/50")}>Customize</button>
      </div>
      {customize ? (
        <ul className="space-y-1" aria-label="Zekolo by cabinet">
          {cabinets.map((cabinet) => (
            <li key={cabinet.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{cabinet.label}</span>
              <Toggle label={`Zekolo, ${cabinet.label}`} on={cabinet.plinthHeight > 0} onChange={(next) => onChange(setZekolo(spec, cabinet.id, { on: next }))} />
            </li>
          ))}
          {corners.map((corner) => (
            <li key={corner.id} className="flex items-center justify-between gap-2">
              <span className="truncate">Corner unit</span>
              <Toggle label={`Zekolo, ${corner.id}`} on={spec.cornerSettings?.[corner.id]?.zekolo !== false} onChange={(next) => onChange(setCornerZekolo(spec, corner.id, next))} />
            </li>
          ))}
          {spec.cabinets.some((cabinet) => cabinet.stackedOn) ? <li className="text-[10px] text-muted-foreground">Upper modules stand on the modules below them: no Zekolo between.</li> : null}
        </ul>
      ) : null}
    </Shell>
  );
}
