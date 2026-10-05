"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Layers, Lock, RotateCcw, Scissors, Trash2, Unlock } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthInput } from "../ui/length-field";
import { MIN_HEIGHT_MODULE, heightStackOf, moduleFit, misfitMessage, planHeights } from "../../services/height-modules";
import {
  divideHeight,
  lockHeightPartition,
  moveHeightPartition,
  removeHeightPartition,
  resetHeightModules,
  setHeightAlign,
  setOverallHeight,
  setUpperModuleHeight,
} from "../../services/operations";
import type { Cabinet, DesignSpec } from "../../types/spec";

/**
 * Height modules in the panel: a wardrobe floor to top in one carcass, or a
 * lower module with an upper one on it, and the boundary between them.
 *
 * The overall height, the lower module and the upper module are three boxes
 * over two numbers: change the lower and the upper takes the difference,
 * so the total stays what was measured. What the board allows is said beside
 * them, from the parts, and the same recommendation the start page made is a
 * tap away.
 */
export function HeightModulesPanel({
  spec,
  cabinet,
  onChange,
  selected = false,
  onSelectPartition,
}: {
  spec: DesignSpec;
  cabinet: Cabinet;
  onChange: (next: DesignSpec) => void;
  /** The boundary was tapped in the drawing: the panel opens on it. */
  selected?: boolean;
  onSelectPartition?: (lowerId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  // Worked out from the parts, so once per change rather than per render.
  const facts = useMemo(() => {
    const stack = heightStackOf(spec, cabinet.id);
    if (!stack) return null;
    const { lower, upper } = stack;
    const total = lower.size.height + (upper?.size.height ?? 0);
    const plan = planHeights(spec, lower.id, total);
    const single = upper ? null : moduleFit(spec, lower.id, total);
    const upperFit = upper ? moduleFit(spec, upper.id, upper.size.height, true) : null;
    const lowerFit = moduleFit(spec, lower.id, lower.size.height);
    const problems = [
      ...(single && !single.ok && single.misfit ? [misfitMessage(single.misfit)] : []),
      ...(upper && !lowerFit.ok && lowerFit.misfit ? [`Lower module: ${misfitMessage(lowerFit.misfit)}`] : []),
      ...(upperFit && !upperFit.ok && upperFit.misfit ? [`Upper module: ${misfitMessage(upperFit.misfit)}`] : []),
    ];
    return { lower, upper, total, plan, problems };
  }, [spec, cabinet.id]);
  if (!facts) return null;
  const { lower, upper, total, plan, problems } = facts;
  const locked = lower.heightModules?.locked === true;
  const auto = lower.heightModules?.auto === true;
  const current = upper ? [lower.size.height, upper.size.height] : [lower.size.height];
  const atRecommended = current.map(Math.round).join() === plan.recommended.map(Math.round).join();

  return (
    <section aria-label="Height modules" className={cn("rounded-xl border border-white/10 bg-card/50", selected && "border-brand")} data-height-modules-panel>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Layers className="size-3.5 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide">{selected ? "Height module partition" : "Height modules"}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-2 px-3 pb-3 text-[11px]">
          <Row label="Overall height">
            <LengthInput label="Overall height" value={total} min={600} max={5400} step={50} onChange={(value) => onChange(setOverallHeight(spec, lower.id, value))} />
          </Row>
          {upper ? (
            <>
              <Row label="Lower module">
                <LengthInput label="Lower module" value={lower.size.height} min={MIN_HEIGHT_MODULE} max={total - MIN_HEIGHT_MODULE} step={50} disabled={locked} onChange={(value) => onChange(moveHeightPartition(spec, lower.id, value))} />
                <button
                  type="button"
                  aria-pressed={locked}
                  aria-label={locked ? "Unlock partition" : "Lock partition"}
                  onClick={() => onChange(lockHeightPartition(spec, lower.id, !locked))}
                  className={cn("flex size-8 items-center justify-center rounded-md border", locked ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:border-brand/50")}
                >
                  {locked ? <Lock className="size-3.5" aria-hidden /> : <Unlock className="size-3.5" aria-hidden />}
                </button>
              </Row>
              <Row label="Upper module">
                <LengthInput label="Upper module" value={upper.size.height} min={MIN_HEIGHT_MODULE} max={total - MIN_HEIGHT_MODULE} step={50} disabled={locked} onChange={(value) => onChange(setUpperModuleHeight(spec, lower.id, value))} />
              </Row>
            </>
          ) : (
            <p className="text-muted-foreground">One carcass, {Math.round(total)} mm, floor to top.</p>
          )}

          <p className="text-muted-foreground" data-height-recommendation>
            {auto ? "Auto · " : ""}Recommended for {spec.carcass.board.label} ({spec.carcass.board.sheet.width} × {spec.carcass.board.sheet.length} mm):{" "}
            {plan.recommended.length === 1 ? `single ${Math.round(plan.recommended[0]!)} mm` : plan.recommended.map(Math.round).join(" + ")}
            {atRecommended ? " ✓" : ""}
          </p>
          {problems.map((problem) => (
            <p key={problem} role="alert" className="text-amber-600 dark:text-amber-400">{problem}</p>
          ))}

          <div className="flex flex-wrap gap-1">
            {upper ? null : (
              <Action disabled={total < 2 * MIN_HEIGHT_MODULE} onClick={() => onChange(divideHeight(spec, lower.id))}><Scissors className="size-3" />Divide height</Action>
            )}
            <Action disabled={atRecommended && auto && !locked} onClick={() => onChange(resetHeightModules(spec, lower.id))}><RotateCcw className="size-3" />Reset to Recommended</Action>
            {upper ? (
              <Action
                disabled={!plan.singleFits}
                title={plan.singleFits ? undefined : "One carcass this tall cannot be cut from this board"}
                onClick={() => { onSelectPartition?.(null); onChange(removeHeightPartition(spec, lower.id)); }}
              >
                <Trash2 className="size-3" />Remove Partition
              </Action>
            ) : null}
          </div>
          {upper && !plan.singleFits ? <p className="text-[10px] text-muted-foreground">Remove Partition needs a board long enough for one {Math.round(total)} mm carcass.</p> : null}
          {upper ? (
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <input type="checkbox" checked={lower.heightModules?.align !== false} onChange={(event) => onChange(setHeightAlign(spec, lower.id, event.target.checked))} className="size-3.5 accent-primary" />
              Same division beside it (side shelves, next cabinet)
            </label>
          ) : null}
          <p className="text-[10px] text-muted-foreground">Each module is a complete carcass: the lower module&apos;s top and the upper&apos;s bottom are separate boards, joined on site. Drag the boundary in the elevation to move it.</p>
          {selected ? <button type="button" onClick={() => onSelectPartition?.(null)} className="w-full rounded-md border px-2 py-1 hover:border-brand">Done</button> : null}
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-1">{children}<span className="text-muted-foreground">mm</span></span>
    </div>
  );
}

function Action({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-brand/50 disabled:opacity-40">
      {children}
    </button>
  );
}
