"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, PanelsTopLeft, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthInput } from "../ui/length-field";
import { closureBoardOf } from "../../services/closure-panels";
import {
  cabinetGripOf,
  resetClosurePanelSize,
  setCabinetGrip,
  setClosurePanel,
  setClosureSettings,
  setDesignGrip,
  setFingerPull,
} from "../../services/closure-operations";
import { fingerPullOf } from "../../services/door-grip";
import { CLEARANCE_LIMITS, HINGE_LABELS, doorSizingOf, hingeTypes, reachAt } from "../../services/door-sizing";
import { manualDoorCount, resetAllDoorSizes, setDoorClearance, setHingeType } from "../../services/door-sizing-operations";
import { closureReport } from "../../services/geometry";
import { constructionMaterials } from "../../services/wardrobe-materials";
import { BOARDS } from "../../types/catalogue";
import { FRONT_GRIP_LABELS, frontGrips, type DesignSpec, type FrontGrip, type HingeType } from "../../types/spec";

/**
 * Door hardware and Smart Closure Panels, for the whole design and for the
 * selected cabinet.
 *
 * The grip sets what is cut, fitted and ordered — a profile door is cut
 * shorter, a channel door leaves a gap a rail closes, a handleless door orders
 * no handle. The panel list is what the geometry worked out, with each panel
 * switched on or off, shown or hidden, and in manual sizing given its own
 * size; a size that would hit a door or another part is refused with a
 * reason, as a door size is.
 */

/** In the order the options are asked for; the two older styles last. */
const GRIP_ORDER: FrontGrip[] = ["handle", "push-to-open", "groove", "g-profile", "j-profile", "channel", "recessed-pull", "finger-gap"];
/** The stocked boards a closure panel is made in: not worktops, not the long sheets. */
const CLOSURE_BOARDS = BOARDS.filter((board) => !board.id.startsWith("worktop") && !/-\d{4}$/.test(board.id) && board.thickness >= 6);

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <div className="flex gap-0.5 rounded-md border p-0.5" role="group" aria-label={label}>
      {([true, false] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={on === value}
          onClick={() => onChange(value)}
          className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition-colors", on === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {value ? "ON" : "OFF"}
        </button>
      ))}
    </div>
  );
}

function GripSelect({ value, onChange, label, inherit }: { value: FrontGrip | null; onChange: (grip: FrontGrip | null) => void; label: string; inherit?: string }) {
  return (
    <label className="block space-y-1">
      <span className="font-medium">{label}</span>
      <select
        aria-label={label}
        className="w-full rounded-md border bg-background px-2 py-2 text-xs"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? (event.target.value as FrontGrip) : null)}
      >
        {inherit ? <option value="">{inherit}</option> : null}
        {GRIP_ORDER.filter((grip) => frontGrips.includes(grip)).map((grip) => (
          <option key={grip} value={grip}>{FRONT_GRIP_LABELS[grip]}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * How the doors hang: the hinge type, and the gap between doors. Choosing one
 * resizes every door that is sized automatically, at once, in the drawing and
 * the cut list; a door sized by hand keeps its size, and Reset to Auto — on a
 * door, or for all of them here — gives it the size this hinge makes.
 */
export function DoorFitting({ spec, onChange }: { spec: DesignSpec; onChange: (spec: DesignSpec) => void }) {
  const sizing = doorSizingOf(spec);
  const t = spec.carcass.board.thickness;
  const manual = manualDoorCount(spec);
  const edge = reachAt(sizing, { kind: "outer", board: t });
  const shared = reachAt(sizing, { kind: "shared", board: t });
  const mm = (value: number) => `${Math.round(Math.abs(value) * 10) / 10} mm`;
  const summary = sizing.legacy
    ? `Sized as this design was saved: ${mm(sizing.clearance)} gap. Choose a hinge type to size doors from the opening.`
    : sizing.hinge === "inset"
      ? `Doors sit ${mm(sizing.clearance)} inside the opening, flush with the carcass front, ${mm(sizing.clearance)} apart.`
      : sizing.hinge === "half"
        ? `Each door reaches ${mm(edge)} over a side panel, shared or not; ${mm(sizing.clearance)} between doors.`
        : `Doors cover ${mm(edge)} of the side panel at a cabinet's edge and ${mm(shared)} of a shared divider; ${mm(sizing.clearance)} between doors.`;
  return (
    <fieldset className="space-y-2" data-door-fitting>
      <legend className="font-medium">Door fitting</legend>
      <label className="block space-y-1">
        <span className="text-muted-foreground">Hinge type</span>
        <select
          aria-label="Hinge type"
          className="w-full rounded-md border bg-background px-2 py-2 text-xs"
          value={sizing.legacy ? "original" : sizing.hinge}
          onChange={(event) => onChange(setHingeType(spec, event.target.value as HingeType))}
        >
          {sizing.legacy ? <option value="original" disabled>As originally sized</option> : null}
          {hingeTypes.map((hinge) => <option key={hinge} value={hinge}>{HINGE_LABELS[hinge]}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-muted-foreground">Gap between doors</span>
        <LengthInput
          label="Door clearance"
          value={sizing.clearance}
          min={CLEARANCE_LIMITS.min}
          max={CLEARANCE_LIMITS.max}
          step={0.5}
          disabled={sizing.legacy}
          onChange={(clearance) => onChange(setDoorClearance(spec, clearance))}
        />
      </label>
      <p className="text-muted-foreground" data-door-fitting-summary>{summary}</p>
      {manual > 0 ? (
        <button type="button" onClick={() => onChange(resetAllDoorSizes(spec))} className="rounded-md border px-2.5 py-1.5 text-[11px] font-medium">
          Reset {manual === 1 ? "the door sized by hand" : `all ${manual} doors sized by hand`} to Auto
        </button>
      ) : null}
    </fieldset>
  );
}

export function ClosurePanelSection({
  spec,
  selectedCabinetId,
  selectedClosureId,
  onSelectClosure,
  onChange,
}: {
  spec: DesignSpec;
  selectedCabinetId: string | null;
  selectedClosureId: string | null;
  onSelectClosure: (id: string | null) => void;
  onChange: (spec: DesignSpec) => void;
}) {
  const [open, setOpen] = useState(Boolean(selectedClosureId));
  const report = useMemo(() => closureReport(spec), [spec]);
  const settings = spec.closurePanels;
  const enabled = settings?.enabled === true;
  const manual = settings?.sizing === "manual";
  const grip = spec.doorHardware?.grip ?? "handle";
  const profile = fingerPullOf(spec, grip, constructionMaterials(spec).fronts.thickness);
  const hasProfile = ["groove", "g-profile", "j-profile", "channel"].includes(grip);
  const board = closureBoardOf(spec);
  const selected = spec.cabinets.find((cabinet) => cabinet.id === selectedCabinetId) ?? null;
  const panels = selected ? report.panels.filter((panel) => panel.cabinetId === selected.id) : report.panels;
  const warnings = selected ? report.warnings.filter((warning) => warning.startsWith(selected.label || "Cabinet")) : report.warnings;

  return (
    <section aria-label="Doors and closure panels" className="rounded-xl border border-white/10 bg-card/50">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <PanelsTopLeft className="size-3.5 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide">Doors &amp; closure panels</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-3 px-3 pb-3 text-[11px]">
          <DoorFitting spec={spec} onChange={onChange} />
          <GripSelect label="Handle type" value={grip} onChange={(next) => onChange(setDesignGrip(spec, next ?? "handle"))} />
          {selected ? (
            <GripSelect
              label={`This cabinet (${selected.label})`}
              value={cabinetGripOf(spec, selected.id)}
              inherit="Same as the design"
              onChange={(next) => onChange(setCabinetGrip(spec, selected.id, next))}
            />
          ) : null}

          {hasProfile ? (
            <fieldset className="space-y-1.5">
              <legend className="font-medium">Finger-pull profile</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-muted-foreground">{grip === "channel" ? "Channel height" : grip === "groove" ? "Groove height" : "Profile height"}</span>
                  <LengthInput label="Finger-pull height" value={profile.height} min={10} max={60} step={1} onChange={(height) => onChange(setFingerPull(spec, { height }))} />
                </label>
                {grip === "groove" || grip === "channel" ? (
                  <label className="space-y-1">
                    <span className="text-muted-foreground">{grip === "channel" ? "Rail set back" : "Groove depth"}</span>
                    <LengthInput label="Finger-pull depth" value={profile.depth} min={0} max={40} step={1} onChange={(depth) => onChange(setFingerPull(spec, { depth }))} />
                  </label>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                {grip === "channel"
                  ? "Doors are cut shorter by the channel height; an MDF rail closes the gap behind."
                  : grip === "groove"
                    ? "Routed into the back of each door along its grip edge. Doors keep their size."
                    : "Doors are cut shorter by the profile height; the profile fills the rest."}
              </p>
            </fieldset>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <span className="font-medium">Smart Closure Panels</span>
            <Toggle label="Smart Closure Panels" on={enabled} onChange={(on) => onChange(setClosureSettings(spec, { enabled: on }))} />
          </div>

          {enabled ? (
            <>
              <label className="block space-y-1">
                <span className="font-medium">Panel thickness</span>
                <select
                  aria-label="Panel thickness"
                  className="w-full rounded-md border bg-background px-2 py-2 text-xs"
                  value={board.id}
                  onChange={(event) => onChange(setClosureSettings(spec, { boardId: event.target.value }))}
                >
                  {[board, ...CLOSURE_BOARDS.filter((option) => option.id !== board.id)].map((option) => (
                    <option key={option.id} value={option.id}>{option.thickness} mm — {option.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Sizing</span>
                <div className="flex gap-0.5 rounded-md border p-0.5" role="group" aria-label="Closure panel sizing">
                  {(["auto", "manual"] as const).map((mode) => (
                    <button key={mode} type="button" aria-pressed={(settings?.sizing ?? "auto") === mode}
                      onClick={() => onChange(setClosureSettings(spec, { sizing: mode }))}
                      className={cn("rounded px-2.5 py-1 text-[11px] font-medium capitalize", (settings?.sizing ?? "auto") === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                      {mode === "auto" ? "Automatic" : "Manual"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <p className="font-medium">
              {panels.length === 0
                ? "Nothing to close here."
                : `${panels.length} ${panels.length === 1 ? "panel" : "panels"} ${selected ? "on this cabinet" : "in the design"}${enabled ? "" : " — turn on to add"}`}
            </p>
            <ul className="space-y-1" aria-label="Closure panels">
              {panels.map((panel) => {
                const chosen = panel.id === selectedClosureId;
                return (
                  <li key={panel.id} data-closure-panel={panel.id} className={cn("rounded-lg border p-2", chosen ? "border-[#f4a63a]" : "border-white/10", !panel.enabled && "opacity-60")}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Make ${panel.label}`}
                        checked={panel.enabled}
                        disabled={!enabled}
                        onChange={(event) => onChange(setClosurePanel(spec, panel.id, { enabled: event.target.checked }))}
                        className="size-3.5 accent-primary"
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelectClosure(chosen ? null : panel.id)} aria-pressed={chosen}>
                        <span className="block truncate font-medium">{panel.label.split(" — ")[0]}</span>
                        <span className="block text-muted-foreground tabular-nums">
                          {Math.round(panel.width)} × {Math.round(panel.height)} × {board.thickness} mm{panel.manual ? " · manual" : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={panel.hidden ? `Show ${panel.label}` : `Hide ${panel.label}`}
                        aria-pressed={panel.hidden}
                        disabled={!enabled}
                        onClick={() => onChange(setClosurePanel(spec, panel.id, { hidden: !panel.hidden }))}
                        className="flex size-7 items-center justify-center rounded-md border disabled:opacity-40"
                      >
                        {panel.hidden ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                      </button>
                    </div>
                    {chosen && enabled && manual && panel.enabled ? (
                      <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                        <label className="space-y-1">
                          <span className="text-muted-foreground">{panel.axis === "x" ? "Depth" : "Width"}</span>
                          <LengthInput label="Closure panel width" value={Math.round(panel.width)} min={5} max={3000} step={1} onChange={(width) => onChange(setClosurePanel(spec, panel.id, { width }))} />
                        </label>
                        <label className="space-y-1">
                          <span className="text-muted-foreground">Height</span>
                          <LengthInput label="Closure panel height" value={Math.round(panel.height)} min={5} max={3000} step={1} onChange={(height) => onChange(setClosurePanel(spec, panel.id, { height }))} />
                        </label>
                        <button type="button" aria-label="Reset to automatic size" onClick={() => onChange(resetClosurePanelSize(spec, panel.id))} className="flex size-8 items-center justify-center rounded-md border">
                          <RotateCcw className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                    {chosen ? <p className="mt-1 text-muted-foreground">{panel.reason}</p> : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {warnings.length ? (
            <ul className="space-y-1" role="status" aria-label="Closure panel warnings">
              {warnings.map((warning) => <li key={warning} className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
