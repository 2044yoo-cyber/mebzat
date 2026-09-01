"use client";

import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  Copy,
  Layers,
  Minus,
  Palette,
  Plus,
  Ruler,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { BOARDS, EDGE_BANDS, findBoard, findEdgeBand } from "../../types/catalogue";
import { KITCHEN_MODULES, MODULE_GROUPS } from "../../services/kitchen-modules";
import {
  MODULE_CONFIGS,
  applyConfig,
  matchConfig,
  moduleConfig,
  type ModuleConfig,
} from "../../services/module-configs";
import {
  addBay,
  addDrawer,
  addModule,
  adjustBayCount,
  duplicateDrawer,
  evenDrawers,
  frontHeightsOf,
  hasCustomFronts,
  moveDrawer,
  openingHeightOf,
  removeDrawer,
  setDrawerHeight,
  duplicateCabinet,
  removeBay,
  removeCabinet,
  renameCabinet,
  resizeCabinet,
  setBayDoor,
  setBayFitting,
  setCabinetKind,
} from "../../services/operations";
import {
  LIMITS,
  cabinetKinds,
  type Bay,
  type Cabinet,
  type DesignSpec,
} from "../../types/spec";

/**
 * Everything you can change, beside the thing you are changing.
 *
 * Glass rather than solid, and on the right, because the design is the subject
 * of this screen and a panel that hides a third of it is a panel that makes
 * people close it. Every control writes straight into the spec and the model
 * re-derives — there is no Generate button here, and there is no state in this
 * component that the 3D view does not already have.
 *
 * The sections are the four questions somebody actually asks, in the order they
 * ask them: how big, what is inside it, what else is there, and what is it made
 * of.
 */

export type ControlPanelProps = {
  spec: DesignSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: DesignSpec) => void;
};

export function ControlPanel({
  spec,
  selectedId,
  onSelect,
  onChange,
}: ControlPanelProps) {
  const selected =
    spec.cabinets.find((cabinet) => cabinet.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
      {/*
        The glass. `backdrop-blur` over a translucent card rather than an opaque
        one, so the design stays visible behind the panel — which is the whole
        argument for putting the controls on top of the scene instead of beside
        it on a screen this size.
      */}
      <div className="space-y-3 border-l border-white/10 bg-background/70 p-3 backdrop-blur-xl">
        <CabinetPicker
          spec={spec}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={onChange}
        />

        {selected ? (
          <>
            <Dimensions
              spec={spec}
              cabinet={selected}
              onChange={onChange}
            />
            <Structure spec={spec} cabinet={selected} onChange={onChange} />
            <Components
              spec={spec}
              cabinet={selected}
              onSelect={onSelect}
              onChange={onChange}
            />
          </>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Click a cabinet to change it, or add one below.
          </p>
        )}

        <Materials spec={spec} onChange={onChange} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Which cabinet
// ---------------------------------------------------------------------------

function CabinetPicker({
  spec,
  selectedId,
  onSelect,
  onChange,
}: {
  spec: DesignSpec;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: DesignSpec) => void;
}) {
  const selected =
    spec.cabinets.find((cabinet) => cabinet.id === selectedId) ?? null;

  return (
    <Section title="Cabinet" icon={Boxes} defaultOpen>
      <div className="flex flex-wrap gap-1">
        {spec.cabinets.map((cabinet) => (
          <button
            key={cabinet.id}
            type="button"
            aria-pressed={cabinet.id === selectedId}
            onClick={() => onSelect(cabinet.id)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] transition-colors",
              cabinet.id === selectedId
                ? "border-brand bg-brand text-brand-foreground"
                : "hover:border-brand hover:bg-brand/5",
            )}
          >
            {cabinet.label}
          </button>
        ))}
      </div>

      {selected ? (
        <>
          <input
            aria-label="Cabinet name"
            value={selected.label}
            onChange={(event) =>
              onChange(renameCabinet(spec, selected.id, event.target.value))
            }
            className="h-8 w-full rounded-md border bg-background/60 px-2 text-sm"
          />

          <div className="flex flex-wrap gap-1">
            {cabinetKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={selected.kind === kind}
                onClick={() => onChange(setCabinetKind(spec, selected.id, kind))}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] capitalize transition-colors",
                  selected.kind === kind
                    ? "border-brand bg-brand/10 text-brand"
                    : "text-muted-foreground hover:border-brand/50",
                )}
              >
                {kind}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <SmallButton
              icon={Copy}
              label="Duplicate"
              onClick={() => onChange(duplicateCabinet(spec, selected.id))}
            />
            <SmallButton
              icon={Trash2}
              label="Delete"
              tone="danger"
              disabled={spec.cabinets.length <= 1}
              onClick={() => {
                onChange(removeCabinet(spec, selected.id));
                onSelect(null);
              }}
            />
          </div>
        </>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

function Dimensions({
  spec,
  cabinet,
  onChange,
}: {
  spec: DesignSpec;
  cabinet: Cabinet;
  onChange: (next: DesignSpec) => void;
}) {
  return (
    <Section title="Dimensions" icon={Ruler} defaultOpen>
      <Slider
        label="Width"
        value={cabinet.size.width}
        min={LIMITS.minWidth}
        max={3000}
        step={10}
        onChange={(width) => onChange(resizeCabinet(spec, cabinet.id, { width }))}
      />
      <Slider
        label="Height"
        value={cabinet.size.height}
        min={200}
        max={LIMITS.maxHeight}
        step={10}
        onChange={(height) => onChange(resizeCabinet(spec, cabinet.id, { height }))}
      />
      <Slider
        label="Depth"
        value={cabinet.size.depth}
        min={150}
        max={900}
        step={10}
        onChange={(depth) => onChange(resizeCabinet(spec, cabinet.id, { depth }))}
      />

      <p className="pt-1 text-[11px] text-muted-foreground">
        Whole design: {spec.envelope.width} × {spec.envelope.height} ×{" "}
        {spec.envelope.depth} mm
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Structure — what is inside this cabinet
// ---------------------------------------------------------------------------

const FITTINGS: { id: Bay["fitting"]["kind"]; label: string }[] = [
  { id: "shelves", label: "Shelves" },
  { id: "drawers", label: "Drawers" },
  { id: "hanging", label: "Hanging" },
  { id: "open", label: "Open" },
  { id: "appliance", label: "Appliance" },
];

function Structure({
  spec,
  cabinet,
  onChange,
}: {
  spec: DesignSpec;
  cabinet: Cabinet;
  onChange: (next: DesignSpec) => void;
}) {
  return (
    <Section title="Structure" icon={Layers} defaultOpen>
      {cabinet.bays.map((bay, index) => (
        <div key={bay.id} className="space-y-1.5 rounded-lg border p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium">
              Section {index + 1}
              <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                {Math.round(bay.width)} mm
              </span>
            </span>
            {cabinet.bays.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove section ${index + 1}`}
                onClick={() => onChange(removeBay(spec, cabinet.id, bay.id))}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1">
            {FITTINGS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={bay.fitting.kind === entry.id}
                onClick={() =>
                  onChange(
                    setBayFitting(spec, cabinet.id, bay.id, fittingFor(entry.id)),
                  )
                }
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                  bay.fitting.kind === entry.id
                    ? "border-brand bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:border-brand/50",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <ModulePicker
            bay={bay}
            onPick={(config) =>
              onChange(
                setBayFitting(
                  spec,
                  cabinet.id,
                  bay.id,
                  applyConfig(bay, config).fitting,
                ),
              )
            }
          />

          {countOf(bay) !== null ? (
            <Stepper
              label={countLabel(bay)}
              value={countOf(bay)!}
              onStep={(delta) =>
                onChange(adjustBayCount(spec, cabinet.id, bay.id, delta))
              }
            />
          ) : null}

          {bay.fitting.kind === "drawers" ? (
            <DrawerList
              spec={spec}
              cabinet={cabinet}
              bay={bay}
              onChange={onChange}
            />
          ) : null}

          <div className="flex flex-wrap gap-1">
            {(["hinged", "sliding", "none"] as const).map((door) => (
              <button
                key={door}
                type="button"
                aria-pressed={bay.door === door}
                onClick={() => onChange(setBayDoor(spec, cabinet.id, bay.id, door))}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[11px] capitalize transition-colors",
                  bay.door === door
                    ? "border-brand bg-brand/10 text-brand"
                    : "text-muted-foreground hover:border-brand/50",
                )}
              >
                {door === "none" ? "No door" : door}
              </button>
            ))}
          </div>
        </div>
      ))}

      <SmallButton
        icon={Plus}
        label="Add a section"
        onClick={() => onChange(addBay(spec, cabinet.id))}
      />
    </Section>
  );
}

/**
 * One row per drawer, and the things you can do to it.
 *
 * The spec has carried per-drawer heights from the beginning and nothing ever
 * wrote them, so every chest of drawers Medosha made came out as equal fronts.
 * Real ones are not equal: the bottom drawer is deeper because that is where
 * the jumpers go.
 *
 * ## What is not here, and why
 *
 * No width field and no thickness field. A front is as wide as the bay it
 * closes and as thick as the board it is cut from — a "width" box that let
 * somebody type 400 into a 600 bay would produce a wardrobe with a 200 mm hole
 * in it. The honest control for that is the bay width, which is already above
 * this. Material is the carcass front board, one control for the design, which
 * is how these are bought: nobody orders a sheet of walnut for the third
 * drawer.
 *
 * Heights are millimetres and absolute. Typing one makes the others give way
 * proportionally, so the fronts always add up to the opening and nobody has to
 * do the arithmetic.
 */
function DrawerList({
  spec,
  cabinet,
  bay,
  onChange,
}: {
  spec: DesignSpec;
  cabinet: Cabinet;
  bay: Bay;
  onChange: (next: DesignSpec) => void;
}) {
  if (bay.fitting.kind !== "drawers") return null;

  const opening = openingHeightOf(cabinet, spec.carcass.board.thickness);
  const heights = frontHeightsOf(bay.fitting, opening);
  const custom = hasCustomFronts(spec, cabinet.id, bay.id);

  return (
    <div className="space-y-1 rounded-md border border-dashed p-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium">Drawers</span>
        {custom ? (
          <button
            type="button"
            onClick={() => onChange(evenDrawers(spec, cabinet.id, bay.id))}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Even them out
          </button>
        ) : null}
      </div>

      {heights.map((height, index) => (
        // Index is the identity here and legitimately so: a drawer *is* its
        // position in the stack, and moving one is defined as swapping heights
        // rather than moving an object with a name.
        <div key={index} className="flex items-center gap-1">
          <span className="w-3 text-[10px] tabular-nums text-muted-foreground">
            {index + 1}
          </span>

          <input
            type="number"
            value={height}
            min={LIMITS.minDrawerFront}
            max={opening}
            step={10}
            aria-label={`Drawer ${index + 1} front height in millimetres`}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                onChange(
                  setDrawerHeight(spec, cabinet.id, bay.id, index, next),
                );
              }
            }}
            className="w-14 rounded border bg-background px-1 py-0.5 text-[11px] tabular-nums"
          />
          <span className="text-[10px] text-muted-foreground">mm</span>

          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              label={`Move drawer ${index + 1} up`}
              disabled={index === 0}
              onClick={() =>
                onChange(moveDrawer(spec, cabinet.id, bay.id, index, -1))
              }
            >
              <ChevronUp className="size-3" />
            </IconButton>
            <IconButton
              label={`Move drawer ${index + 1} down`}
              disabled={index === heights.length - 1}
              onClick={() =>
                onChange(moveDrawer(spec, cabinet.id, bay.id, index, 1))
              }
            >
              <ChevronDown className="size-3" />
            </IconButton>
            <IconButton
              label={`Duplicate drawer ${index + 1}`}
              disabled={heights.length >= 8}
              onClick={() =>
                onChange(duplicateDrawer(spec, cabinet.id, bay.id, index))
              }
            >
              <Copy className="size-3" />
            </IconButton>
            <IconButton
              label={`Remove drawer ${index + 1}`}
              disabled={heights.length <= 1}
              onClick={() =>
                onChange(removeDrawer(spec, cabinet.id, bay.id, index))
              }
            >
              <Trash2 className="size-3" />
            </IconButton>
          </div>
        </div>
      ))}

      {heights.length < 8 ? (
        <SmallButton
          icon={Plus}
          label="Add a drawer"
          onClick={() => onChange(addDrawer(spec, cabinet.id, bay.id))}
        />
      ) : null}
    </div>
  );
}

/** A small square button that dims rather than disappears when unavailable. */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-5 items-center justify-center rounded border transition-colors",
        disabled
          ? "cursor-not-allowed opacity-30"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The module configuration this section is fitted out as.
 *
 * The row of buttons above it sets *one* thing — shelves, or drawers, or
 * hanging. Most real wardrobe modules are several at once, and the commonest
 * of all is hanging over a shelf over two drawers. This is where those are
 * chosen.
 *
 * "Custom" is not selectable. It is what the list says when the section no
 * longer matches any configuration, which is what happens the moment somebody
 * adds a drawer or drags a share — and saying "2 drawers + shelf + hanging" at
 * that point would be a lie about what is going to be cut.
 */
function ModulePicker({
  bay,
  onPick,
}: {
  bay: Bay;
  onPick: (config: ModuleConfig) => void;
}) {
  const current = matchConfig(bay);

  return (
    <label className="block">
      <span className="sr-only">Module for this section</span>
      <select
        value={current?.id ?? ""}
        onChange={(event) => {
          const config = moduleConfig(event.target.value);
          if (config) onPick(config);
        }}
        className="w-full rounded-md border bg-background px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-brand/50"
      >
        {current === null ? <option value="">Custom</option> : null}
        {MODULE_CONFIGS.map((config) => (
          <option key={config.id} value={config.id} title={config.blurb}>
            {config.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function fittingFor(kind: Bay["fitting"]["kind"]): Bay["fitting"] {
  switch (kind) {
    case "drawers":
      return { kind: "drawers", count: 3 };
    case "hanging":
      return { kind: "hanging", rails: 1, shelfAbove: true };
    case "open":
      return { kind: "open" };
    case "appliance":
      return { kind: "appliance", appliance: "oven", openingHeight: 600 };
    default:
      return { kind: "shelves", count: 3, adjustable: true };
  }
}

function countOf(bay: Bay): number | null {
  if (bay.fitting.kind === "shelves") return bay.fitting.count;
  if (bay.fitting.kind === "drawers") return bay.fitting.count;
  if (bay.fitting.kind === "hanging") return bay.fitting.rails;
  return null;
}

function countLabel(bay: Bay): string {
  if (bay.fitting.kind === "drawers") return "Drawers";
  if (bay.fitting.kind === "hanging") return "Rails";
  return "Shelves";
}

// ---------------------------------------------------------------------------
// Components — what else is in the design
// ---------------------------------------------------------------------------

function Components({
  spec,
  cabinet,
  onSelect,
  onChange,
}: {
  spec: DesignSpec;
  cabinet: Cabinet;
  onSelect: (id: string | null) => void;
  onChange: (next: DesignSpec) => void;
}) {
  const add = (moduleId: string) => {
    const next = addModule(spec, moduleId, cabinet.id);
    onChange(next);
    // Select what was just added, because the next thing anybody does is size
    // it or move it.
    const added = next.cabinets.find(
      (candidate) => !spec.cabinets.some((existing) => existing.id === candidate.id),
    );
    if (added) onSelect(added.id);
  };

  return (
    <Section title="Components" icon={Plus} defaultOpen>
      <p className="text-[11px] text-muted-foreground">
        Added to its own row, beside {cabinet.label}. Everything after it moves
        along.
      </p>

      {MODULE_GROUPS.map((group) => (
        <div key={group} className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {group}
          </span>
          <div className="grid grid-cols-2 gap-1">
            {KITCHEN_MODULES.filter((module) => module.group === group).map(
              (module) => (
                <button
                  key={module.id}
                  type="button"
                  title={module.note}
                  onClick={() => add(module.id)}
                  className="rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight transition-colors hover:border-brand hover:bg-brand/5"
                >
                  {module.label}
                  <span className="block tabular-nums text-muted-foreground">
                    {module.width} mm
                  </span>
                </button>
              ),
            )}
          </div>
        </div>
      ))}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function Materials({
  spec,
  onChange,
}: {
  spec: DesignSpec;
  onChange: (next: DesignSpec) => void;
}) {
  const set = (mutate: (draft: DesignSpec) => void) => {
    const draft = structuredClone(spec);
    mutate(draft);
    onChange(draft);
  };

  return (
    <Section title="Materials" icon={Palette}>
      <Picker
        label="Carcass and doors"
        value={spec.carcass.board.id}
        options={BOARDS.filter((board) => board.thickness >= 12 && !board.id.startsWith("worktop"))}
        onChange={(id) =>
          set((draft) => {
            const board = findBoard(id);
            if (board) draft.carcass.board = board;
          })
        }
      />

      <Picker
        label="Back panel"
        value={spec.carcass.backBoard.id}
        options={BOARDS}
        onChange={(id) =>
          set((draft) => {
            const board = findBoard(id);
            if (board) draft.carcass.backBoard = board;
          })
        }
      />

      {spec.worktop ? (
        <Picker
          label="Worktop"
          value={spec.worktop.board.id}
          options={BOARDS.filter((board) => board.id.startsWith("worktop"))}
          onChange={(id) =>
            set((draft) => {
              const board = findBoard(id);
              if (board && draft.worktop) draft.worktop.board = board;
            })
          }
        />
      ) : null}

      <Picker
        label="Edge banding"
        value={spec.carcass.edgeBand.id}
        options={EDGE_BANDS}
        onChange={(id) =>
          set((draft) => {
            const band = findEdgeBand(id);
            if (band) draft.carcass.edgeBand = band;
          })
        }
      />

      <div className="space-y-1">
        <span className="text-[11px] text-muted-foreground">Colour</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Finish colour"
            value={spec.finish.hex}
            onChange={(event) => {
              const hex = event.target.value;
              set((draft) => {
                draft.finish.hex = hex;
              });
            }}
            className="h-8 w-11 cursor-pointer rounded border bg-transparent p-0.5"
          />
          <input
            aria-label="Finish name"
            value={spec.finish.colour}
            onChange={(event) => {
              const colour = event.target.value;
              set((draft) => {
                draft.finish.colour = colour || "Unnamed";
              });
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background/60 px-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["matt", "satin", "gloss"] as const).map((sheen) => (
          <button
            key={sheen}
            type="button"
            aria-pressed={spec.finish.sheen === sheen}
            onClick={() =>
              set((draft) => {
                draft.finish.sheen = sheen;
              })
            }
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] capitalize transition-colors",
              spec.finish.sheen === sheen
                ? "border-brand bg-brand/10 text-brand"
                : "text-muted-foreground hover:border-brand/50",
            )}
          >
            {sheen}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Ruler;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-white/10 bg-card/50">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Icon className="size-3.5 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide">
          {title}
        </span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-2 px-3 pb-3">{children}</div> : null}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">{Math.round(value)} mm</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-brand"
      />
    </div>
  );
}

function Stepper({
  label,
  value,
  onStep,
}: {
  label: string;
  value: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`One fewer ${label.toLowerCase()}`}
          onClick={() => onStep(-1)}
          className="flex size-6 items-center justify-center rounded border transition-colors hover:bg-muted"
        >
          <Minus className="size-3" />
        </button>
        <span className="w-5 text-center text-xs tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`One more ${label.toLowerCase()}`}
          onClick={() => onStep(1)}
          className="flex size-6 items-center justify-center rounded border transition-colors hover:bg-muted"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border bg-background/60 px-2 text-xs"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SmallButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40",
        tone === "danger"
          ? "hover:border-destructive hover:text-destructive"
          : "hover:border-brand hover:bg-brand/5",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </button>
  );
}
