"use client";

import { useMemo, useState } from "react";
import { DoorOpen, PanelsTopLeft, Square, Store } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  OPENING_SAMPLES,
  openingSample,
  sampleFor,
  sampleTitle,
  statedSize,
} from "../../services/opening-samples";
import { buildOpening } from "../../services/openings";
import { OpeningPreview } from "./opening-preview";
import { SaveOpening } from "./save-opening-button";
import { packLinear } from "../../services/linear-stock";
import {
  glassTypes,
  openingLabel,
  systemsFor,
  type GlassTypeId,
  type OpeningKind,
  type OpeningSpec,
} from "../../types/openings";

/**
 * Windows and doors, from a sample to a cut list.
 *
 * The wardrobe route has always worked like this — pick a category, get
 * something finished, change what is wrong with it. This is the same route for
 * openings, which had the engine and no door into it.
 *
 * Everything below is arithmetic, computed as you type. No model call, no
 * network, no key: the numbers appear on a phone with one bar of signal, and
 * they are the same numbers every time, which is the only reason a fabricator
 * would ever trust them.
 */

const ICONS: Partial<Record<OpeningKind, typeof Square>> = {
  "sliding-window": PanelsTopLeft,
  "casement-window": PanelsTopLeft,
  "fixed-window": Square,
  "sliding-door": DoorOpen,
  "hinged-door": DoorOpen,
  "interior-door": DoorOpen,
  shopfront: Store,
  "glass-partition": Store,
};

export function OpeningPanel() {
  const [spec, setSpec] = useState<OpeningSpec | null>(null);

  if (!spec) {
    return <SamplePicker onPick={setSpec} />;
  }

  return (
    <OpeningBreakdownView
      spec={spec}
      onChange={setSpec}
      onBack={() => setSpec(null)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Choosing                                                                    */
/* -------------------------------------------------------------------------- */

function SamplePicker({ onPick }: { onPick: (spec: OpeningSpec) => void }) {
  const [kind, setKind] = useState<OpeningKind | null>(null);
  const chosen = kind ? sampleFor(kind) : undefined;

  // No height of its own: the parent owns the column and this scrolls inside
  // whatever is left after the tab strip.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Windows and doors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick one and every profile length, pane and fitting is worked out.
          Change the size afterwards — nothing here is fixed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 @lg/ws:grid-cols-4">
        {OPENING_SAMPLES.map((sample) => {
          const Icon = ICONS[sample.kind] ?? Square;
          return (
            <button
              key={sample.kind}
              type="button"
              aria-pressed={kind === sample.kind}
              onClick={() => setKind(sample.kind)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                kind === sample.kind
                  ? "border-brand bg-brand/5"
                  : "hover:border-brand/50 hover:bg-muted/40",
              )}
            >
              <Icon className="size-5 text-brand" aria-hidden />
              <span className="mt-1.5 block text-sm font-medium">
                {sample.label}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                {sample.hint}
              </span>
            </button>
          );
        })}
      </div>

      {chosen ? (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">
            What size? These are the standard ones.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {chosen.sizes.map((size) => (
              <button
                key={`${size.width}x${size.height}`}
                type="button"
                onClick={() =>
                  onPick(
                    openingSample(chosen.kind, {
                      width: size.width,
                      height: size.height,
                    }),
                  )
                }
                className="rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors hover:border-brand hover:bg-brand/5"
              >
                {size.width} × {size.height}
              </button>
            ))}
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            A standard size is a place to start, not a measurement. Type your own
            on the next screen and it is treated as the real opening.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The breakdown                                                               */
/* -------------------------------------------------------------------------- */

function OpeningBreakdownView({
  spec,
  onChange,
  onBack,
}: {
  spec: OpeningSpec;
  onChange: (spec: OpeningSpec) => void;
  onBack: () => void;
}) {
  const breakdown = useMemo(() => buildOpening(spec), [spec]);
  const stock = useMemo(() => packLinear(breakdown.profiles), [breakdown]);

  const systems = systemsFor(spec.kind);
  const estimated = !spec.given.width || !spec.given.height;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {spec.reference} · {sampleTitle(spec)}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {breakdown.profiles.length} cuts ·{" "}
            {breakdown.glazedArea.toFixed(2)} m² glazed of{" "}
            {breakdown.openingArea.toFixed(2)} m²
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted"
        >
          Another opening
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {/* ---- The opening itself ---------------------------------------- */}
        {/*
          Above the controls rather than beside them: on a phone this column is
          the whole screen, and a drawing under three sections of fields is a
          drawing nobody scrolls to. Every field below feeds the same spec, so
          the picture is never out of step with the numbers.
        */}
        <OpeningPreview spec={spec} />

        <SaveOpening spec={spec} />

        {/* ---- Size ------------------------------------------------------ */}
        <section className="space-y-2 rounded-xl border p-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Structural opening
          </h2>

          <div className="grid grid-cols-2 gap-2">
            <DimensionField
              label="Width"
              value={spec.width}
              stated={spec.given.width}
              onChange={(value) => onChange(statedSize(spec, "width", value))}
            />
            <DimensionField
              label="Height"
              value={spec.height}
              stated={spec.given.height}
              onChange={(value) => onChange(statedSize(spec, "height", value))}
            />
          </div>

          {estimated ? (
            // The engine puts this in `notes` too. It is repeated here beside
            // the numbers it is about, because a warning at the bottom of a
            // cut list is a warning nobody reads before cutting.
            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-900 dark:text-amber-200">
              Standard size, not measured. Type the real opening and these
              become your dimensions.
            </p>
          ) : null}
        </section>

        {/* ---- What it is made of ---------------------------------------- */}
        <section className="space-y-2 rounded-xl border p-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Specification
          </h2>

          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Glass</span>
            <select
              value={spec.glass}
              onChange={(event) =>
                onChange({ ...spec, glass: event.target.value as GlassTypeId })
              }
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs"
            >
              {Object.entries(glassTypes).map(([id, glass]) => (
                <option key={id} value={id}>
                  {glass.label}
                </option>
              ))}
            </select>
          </label>

          {/* Hidden when there is only one, because a control that cannot
              change anything reads as broken. */}
          {systems.length > 1 ? (
            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">System</span>
              <select
                value={spec.system}
                onChange={(event) =>
                  onChange({
                    ...spec,
                    system: event.target.value as OpeningSpec["system"],
                  })
                }
                className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs"
              >
                {systems.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              How many of this opening
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={spec.quantity}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 1 && value <= 500) {
                  onChange({ ...spec, quantity: Math.round(value) });
                }
              }}
              className="w-20 rounded-md border bg-background px-2 py-1 text-right text-xs tabular-nums"
            />
          </label>

          {spec.quantity > 1 ? (
            // Worth saying out loud: this is the reason the bar count is not
            // simply six times the bar count for one.
            <p className="text-[11px] leading-snug text-muted-foreground">
              {spec.quantity} frames are cut from the same bars, so the waste is
              lower than {spec.quantity} separate orders.
            </p>
          ) : null}
        </section>

        {/* ---- Cuts ------------------------------------------------------ */}
        <section className="space-y-2 rounded-xl border p-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Profile cuts
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">Piece</th>
                  <th className="py-1 pr-2 font-medium">Profile</th>
                  <th className="py-1 pr-2 text-right font-medium">Length</th>
                  <th className="py-1 pr-2 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Ends</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {breakdown.profiles.map((cut, index) => (
                  <tr key={`${cut.profileId}-${cut.label}-${index}`} className="border-t">
                    <td className="py-1 pr-2">{cut.label}</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {cut.profileLabel}
                    </td>
                    <td className="py-1 pr-2 text-right">{cut.length} mm</td>
                    <td className="py-1 pr-2 text-right">{cut.quantity}</td>
                    <td className="py-1 text-right text-muted-foreground">
                      {/* A mitred piece cut square is scrap. It belongs on the
                          cut list, not in somebody's head. */}
                      {cut.angles ? `${cut.angles[0]}° / ${cut.angles[1]}°` : "90°"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Bars ------------------------------------------------------ */}
        <section className="space-y-2 rounded-xl border p-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Bars to buy
          </h2>

          <ul className="space-y-1.5 text-xs">
            {stock.map((entry) => (
              <li key={entry.profileId} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">
                  {entry.bars} × {entry.stockLength / 1000} m
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {entry.profileLabel}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {entry.requiredMetres.toFixed(2)} m needed ·{" "}
                  {(entry.wasteFraction * 100).toFixed(0)}% waste
                </span>
                {entry.unplaced.length > 0 ? (
                  <span className="w-full text-[11px] text-destructive">
                    {entry.unplaced.length} piece
                    {entry.unplaced.length === 1 ? "" : "s"} longer than a bar —
                    these have to be joined or ordered specially.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Whole bars, because a bar is what a supplier sells. The offcut is
            paid for whether or not anything is cut from it.
          </p>
        </section>

        {/* ---- Glass ----------------------------------------------------- */}
        {breakdown.glass.length > 0 ? (
          <section className="space-y-2 rounded-xl border p-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Glass
            </h2>

            <ul className="space-y-1 text-xs tabular-nums">
              {breakdown.glass.map((pane, index) => (
                <li key={`${pane.label}-${index}`} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">
                    {pane.width} × {pane.height} mm
                  </span>
                  <span>× {pane.quantity}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {pane.typeLabel}
                  </span>
                  <span className="text-muted-foreground">
                    {pane.totalArea.toFixed(2)} m²
                  </span>
                  {pane.madeToSize ? (
                    <span className="w-full text-[11px] text-muted-foreground">
                      Toughened — ordered to this size and not cut afterwards, so
                      check it before the order goes in.
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---- Hardware -------------------------------------------------- */}
        {breakdown.hardware.length > 0 ? (
          <section className="space-y-2 rounded-xl border p-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Hardware
            </h2>

            <ul className="space-y-1 text-xs">
              {breakdown.hardware.map((item) => (
                <li key={item.id} className="flex flex-wrap gap-x-2">
                  <span className="tabular-nums font-medium">
                    {item.quantity} {item.unit}
                  </span>
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {/* The basis is why this many. A fabricator checks it before
                      they trust the number. */}
                  <span className="w-full text-[11px] text-muted-foreground">
                    {item.basis}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---- Notes ----------------------------------------------------- */}
        {breakdown.notes.length > 0 ? (
          <section className="space-y-1 rounded-xl border border-dashed p-3">
            {breakdown.notes.map((note, index) => (
              <p key={index} className="text-[11px] leading-snug text-muted-foreground">
                {note}
              </p>
            ))}
          </section>
        ) : null}

        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          {openingLabel(spec.kind)} · every length above is arithmetic from the
          opening size and the profile system, so it is the same answer every
          time.
        </p>
      </div>
    </div>
  );
}

/**
 * A dimension, and whether it is the customer's.
 *
 * Typing in it is the act that makes it theirs — see `statedSize`. The badge
 * says which state it is in, because "estimated" and "measured" produce the
 * same number on screen and very different consequences at the saw.
 */
function DimensionField({
  label,
  value,
  stated,
  onChange,
}: {
  label: string;
  value: number;
  stated: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-[10px]",
            stated ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
          )}
        >
          {stated ? "yours" : "standard"}
        </span>
      </span>
      <input
        type="number"
        min={200}
        max={12_000}
        step={10}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          // The schema's own bounds. Rejecting out of range here rather than
          // letting a 0 through keeps the breakdown from flashing a frame with
          // negative sashes while somebody is mid-keystroke.
          if (Number.isFinite(next) && next >= 200 && next <= 12_000) {
            onChange(Math.round(next));
          }
        }}
        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm tabular-nums"
      />
    </label>
  );
}
