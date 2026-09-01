"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BOARDS, EDGE_BANDS, findBoard, findEdgeBand } from "../../types/catalogue";
import { LIMITS, doorStyles, type Bay, type DesignSpec } from "../../types/spec";

/**
 * The design, editable without saying a word.
 *
 * Berchuma is conversational, but conversation is a terrible way to say "a bit
 * wider". Every control here writes straight into the spec and the price
 * updates as the slider moves — no request, no waiting, no wondering whether
 * the model understood.
 *
 * The rail and the chat are not two features. They edit the same object, so a
 * dimension typed here is visible to the next thing the customer asks for.
 */

/**
 * Wraps a Select handler so a cleared selection is ignored.
 *
 * Radix reports deselection as null. Every field in this rail is required —
 * there is no such thing as a carcass with no board — so null means "the user
 * dismissed the menu", and the right response is to change nothing rather than
 * to write an undefined into the spec and hand the geometry engine a design
 * with no material.
 */
function picked(handler: (value: string) => void) {
  return (value: string | null) => {
    if (value !== null) handler(value);
  };
}

const FITTINGS = [
  { value: "shelves", label: "Shelves" },
  { value: "hanging", label: "Hanging" },
  { value: "drawers", label: "Drawers" },
  { value: "open", label: "Open" },
] as const;

export function ConfigRail({
  spec,
  onEdit,
  cabinetId,
}: {
  spec: DesignSpec;
  onEdit: (mutate: (draft: DesignSpec) => void) => void;
  /** Which cabinet the size and bay controls act on. Defaults to the first. */
  cabinetId?: string | null;
}) {
  const t = spec.carcass.board.thickness;

  // A design is a list of cabinets now, and this rail edits one of them. The
  // index rather than the object, because every edit runs against a fresh
  // clone of the spec and an object captured from this render would be a
  // different object by the time the mutation runs.
  const index = Math.max(
    0,
    spec.cabinets.findIndex((entry) => entry.id === cabinetId),
  );
  const cabinet = spec.cabinets[index] ?? spec.cabinets[0]!;

  /** The same cabinet inside a draft. */
  const target = (draft: DesignSpec) => draft.cabinets[index] ?? draft.cabinets[0]!;

  /**
   * Bay widths are rewritten whenever the carcass changes size, because they
   * are a division of the interior rather than independent numbers. Leaving
   * them alone would let the validator's rescale fight the slider on every
   * frame.
   */
  const redistribute = (draft: DesignSpec) => {
    const thickness = draft.carcass.board.thickness;
    const unit = target(draft);
    const interior =
      unit.size.width -
      2 * thickness -
      Math.max(0, unit.bays.length - 1) * thickness;
    const each = Math.max(1, Math.round(interior / unit.bays.length));
    for (const bay of unit.bays) bay.width = each;
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <Heading>Size</Heading>
        <Dimension
          label="Width"
          value={cabinet.size.width}
          min={LIMITS.minWidth}
          max={6000}
          step={10}
          onChange={(width) =>
            onEdit((draft) => {
              target(draft).size.width = width;
              redistribute(draft);
            })
          }
        />
        <Dimension
          label="Height"
          value={cabinet.size.height}
          min={300}
          max={LIMITS.maxHeight}
          step={10}
          onChange={(height) =>
            onEdit((draft) => {
              target(draft).size.height = height;
            })
          }
        />
        <Dimension
          label="Depth"
          value={cabinet.size.depth}
          min={200}
          max={900}
          step={10}
          onChange={(depth) =>
            onEdit((draft) => {
              target(draft).size.depth = depth;
            })
          }
        />
        <Dimension
          label="Plinth"
          value={cabinet.plinthHeight}
          min={0}
          max={250}
          step={5}
          onChange={(plinthHeight) =>
            onEdit((draft) => {
              target(draft).plinthHeight = plinthHeight;
            })
          }
        />
      </section>

      <section className="space-y-3">
        <Heading>Materials</Heading>

        <Field label="Carcass and doors">
          <Select
            value={spec.carcass.board.id}
            onValueChange={picked((id) =>
              onEdit((draft) => {
                const board = findBoard(id);
                if (!board) return;
                draft.carcass.board = board;
                // The thickness may have changed, and every bay width is
                // measured between panels of it.
                redistribute(draft);
              }),
            )}
          >
            <SelectTrigger className="w-full">
              {/* The label, explicitly. The menu is portalled and unmounted
                  until it is opened, so an empty SelectValue has nothing to
                  read and falls back to printing the raw id at the user. */}
              <SelectValue>{spec.carcass.board.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BOARDS.filter((board) => board.thickness >= 12).map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Back panel">
          <Select
            value={spec.carcass.backBoard.id}
            onValueChange={picked((id) =>
              onEdit((draft) => {
                const board = findBoard(id);
                if (board) draft.carcass.backBoard = board;
              }),
            )}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{spec.carcass.backBoard.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BOARDS.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Edge banding">
          <Select
            value={spec.carcass.edgeBand.id}
            onValueChange={picked((id) =>
              onEdit((draft) => {
                const band = findEdgeBand(id);
                if (band) draft.carcass.edgeBand = band;
              }),
            )}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{spec.carcass.edgeBand.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {EDGE_BANDS.map((band) => (
                <SelectItem key={band.id} value={band.id}>
                  {band.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Colour">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Finish colour"
              value={spec.finish.hex}
              onChange={(event) => {
                const hex = event.target.value;
                onEdit((draft) => {
                  draft.finish.hex = hex;
                });
              }}
              className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
            />
            <input
              type="text"
              aria-label="Finish name"
              value={spec.finish.colour}
              onChange={(event) => {
                const colour = event.target.value;
                onEdit((draft) => {
                  draft.finish.colour = colour || "Unnamed";
                });
              }}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            />
          </div>
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Heading>Bays</Heading>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              onEdit((draft) => {
                const unit = target(draft);
                if (unit.bays.length >= 24) return;
                unit.bays.push({
                  id: `bay-${Date.now()}`,
                  width: 600,
                  fitting: { kind: "shelves", count: 4, adjustable: true },
                  door: unit.bays[0]?.door ?? "hinged",
                  doorLeaves: 1,
                });
                redistribute(draft);
              })
            }
          >
            <Plus className="size-3" aria-hidden />
            Add
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {cabinet.bays.length} bays of{" "}
          {Math.round(cabinet.bays[0]?.width ?? 0)} mm inside a{" "}
          {Math.round(cabinet.size.width)} mm carcass in {t} mm board.
        </p>

        <ul className="space-y-2">
          {cabinet.bays.map((bay, bayIndex) => (
            <BayRow
              key={bay.id}
              bay={bay}
              index={bayIndex}
              cabinetIndex={index}
              removable={cabinet.bays.length > 1}
              onEdit={onEdit}
              redistribute={redistribute}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function BayRow({
  bay,
  index,
  cabinetIndex,
  removable,
  onEdit,
  redistribute,
}: {
  bay: Bay;
  index: number;
  cabinetIndex: number;
  removable: boolean;
  onEdit: (mutate: (draft: DesignSpec) => void) => void;
  redistribute: (draft: DesignSpec) => void;
}) {
  /** Finds this bay in a fresh draft. Indices are stable; the objects are not. */
  const at = (draft: DesignSpec) =>
    draft.cabinets[cabinetIndex]?.bays[index];

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Bay {index + 1}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(bay.width)} mm
          </span>
          {removable ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label={`Remove bay ${index + 1}`}
              onClick={() =>
                onEdit((draft) => {
                  draft.cabinets[cabinetIndex]?.bays.splice(index, 1);
                  redistribute(draft);
                })
              }
            >
              <Trash2 className="size-3" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Select
          value={bay.fitting.kind}
          onValueChange={picked((kind) =>
            onEdit((draft) => {
              const target = at(draft);
              if (!target) return;
              target.fitting =
                kind === "shelves"
                  ? { kind: "shelves", count: 4, adjustable: true }
                  : kind === "hanging"
                    ? { kind: "hanging", rails: 1, shelfAbove: true }
                    : kind === "drawers"
                      ? { kind: "drawers", count: 4 }
                      : { kind: "open" };
            }),
          )}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>
              {FITTINGS.find((entry) => entry.value === bay.fitting.kind)?.label ??
                bay.fitting.kind}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FITTINGS.map((fitting) => (
              <SelectItem key={fitting.value} value={fitting.value}>
                {fitting.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={bay.door}
          onValueChange={picked((door) =>
            onEdit((draft) => {
              const target = at(draft);
              // Cast is safe: the options below are exactly `doorStyles`.
              if (target) target.door = door as Bay["door"];
            }),
          )}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>
              {bay.door === "none" ? "No door" : capitalise(bay.door)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {doorStyles.map((style) => (
              <SelectItem key={style} value={style}>
                {style === "none" ? "No door" : capitalise(style)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* A count only exists for the fittings that have one, so the control
          appears with the fitting rather than sitting there disabled. */}
      {bay.fitting.kind === "shelves" || bay.fitting.kind === "drawers" ? (
        <div className="mt-2">
          <Dimension
            label={bay.fitting.kind === "shelves" ? "Shelves" : "Drawers"}
            value={bay.fitting.count}
            min={bay.fitting.kind === "drawers" ? 1 : 0}
            max={bay.fitting.kind === "drawers" ? 8 : 12}
            step={1}
            unit=""
            onChange={(count) =>
              onEdit((draft) => {
                const target = at(draft);
                if (!target) return;
                if (
                  target.fitting.kind === "shelves" ||
                  target.fitting.kind === "drawers"
                ) {
                  target.fitting.count = count;
                }
              })
            }
          />
        </div>
      ) : null}

      {bay.fitting.kind === "hanging" ? (
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={bay.fitting.rails === 2}
            onChange={(event) => {
              const double = event.target.checked;
              onEdit((draft) => {
                const target = at(draft);
                if (target?.fitting.kind === "hanging") {
                  target.fitting.rails = double ? 2 : 1;
                }
              });
            }}
            className="size-3.5 accent-primary"
          />
          Two rails (short hanging over short hanging)
        </label>
      ) : null}

      {bay.door === "hinged" ? (
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={bay.doorLeaves === 2}
            onChange={(event) => {
              const pair = event.target.checked;
              onEdit((draft) => {
                const target = at(draft);
                if (target) target.doorLeaves = pair ? 2 : 1;
              });
            }}
            className="size-3.5 accent-primary"
          />
          Pair of doors
          {bay.width > LIMITS.hingedLeafWidth ? (
            <span className="text-muted-foreground">(required at this width)</span>
          ) : null}
        </label>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/**
 * A slider and a number box over the same value.
 *
 * Both, not one: the slider is how somebody explores and the box is how they
 * type the measurement they took off the wall. A studio with only a slider
 * cannot accept 2437.
 */
function Dimension({
  label,
  value,
  min,
  max,
  step,
  unit = "mm",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
        <div className="flex items-baseline gap-1">
          <input
            type="number"
            aria-label={`${label} in ${unit || "units"}`}
            value={Math.round(value)}
            min={min}
            max={max}
            step={step}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onChange(clamp(next));
            }}
            className="h-7 w-20 rounded-md border bg-background px-2 text-right text-xs tabular-nums"
          />
          {unit ? (
            <span className="text-[11px] text-muted-foreground">{unit}</span>
          ) : null}
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </div>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
