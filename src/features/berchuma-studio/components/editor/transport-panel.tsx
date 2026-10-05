"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, Lock, Magnet, Plus, RotateCcw, Scissors, Trash2, Truck, Unlock } from "lucide-react";

import { cn } from "@/lib/utils";

import { LengthInput } from "../ui/length-field";
import {
  addJoint,
  balanceLastModules,
  divideForTransport,
  jointOwnerOf,
  lockJoint,
  moveJoint,
  partitionCentresOf,
  removeJoint,
  removeTransport,
  setAlignTop,
  setConnector,
  snapJointToPartition,
  transportProposal,
  transportWarnings,
} from "../../services/operations";
import { MAX_MODULE, defaultJoints, modulesOf } from "../../services/transport-modules";
import { isSideDisplay } from "../../services/geometry";
import type { Cabinet, DesignSpec } from "../../types/spec";

/**
 * Transport modules in the panel: how a wardrobe is made, carried and put
 * together — separate carcasses joined by a double wall — and where the
 * joints are. Structure only; the doors are laid out on their own.
 */

export type JointRef = { cabinetId: string; index: number };
type Change = (next: DesignSpec) => void;

const CONNECTORS = [
  { id: "confirmat", label: "Confirmat screws" },
  { id: "bolt", label: "Connector bolts" },
  { id: "dowel_screw", label: "Dowel + screw" },
  { id: "cam", label: "Cam connectors" },
] as const;

function Chip({ active, onClick, children, label, disabled }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
        active ? "border-brand bg-brand text-brand-foreground" : "text-muted-foreground hover:border-brand/50",
      )}
    >
      {children}
    </button>
  );
}

function Panel({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section aria-label={title} className="rounded-xl border border-white/10 bg-card/50">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Truck className="size-3.5 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-medium uppercase tracking-wide">{title}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <div className="space-y-2 px-3 pb-3">{children}</div> : null}
    </section>
  );
}

const name = (cabinet: Cabinet, index: number) => `${cabinet.stackedOn ? "Top module" : "Module"} ${index + 1}`;

/** One joint: where it is, the modules either side, and what can be done to it. */
function JointRow({ spec, owner, index, onChange, onSelectJoint, selected }: { spec: DesignSpec; owner: Cabinet; index: number; onChange: Change; onSelectJoint: (joint: JointRef | null) => void; selected: boolean }) {
  const joint = owner.transport!.joints[index]!;
  const modules = modulesOf(owner);
  const left = modules[index];
  const right = modules[index + 1];
  return (
    <div className={cn("space-y-1 rounded-md border p-1.5", selected && "border-brand")} aria-label={`Joint ${index + 1}`}>
      <div className="flex items-center justify-between gap-1">
        <button type="button" className="text-[11px] font-medium" onClick={() => onSelectJoint({ cabinetId: owner.id, index })}>Joint {index + 1}</button>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Position
          <LengthInput label={`Joint ${index + 1} position`} value={joint.at} min={1} max={99999} step={10} disabled={joint.locked} onChange={(at) => onChange(moveJoint(spec, owner.id, index, at))} className="h-7 w-16 px-1 text-[11px]" />
          mm
        </span>
      </div>
      <p className="text-[10px] tabular-nums text-muted-foreground">Left module {Math.round(left?.width ?? 0)} mm · Right module {Math.round(right?.width ?? 0)} mm</p>
      <div className="flex flex-wrap gap-1">
        <Chip label={`Move joint ${index + 1} left`} disabled={joint.locked} onClick={() => onChange(moveJoint(spec, owner.id, index, joint.at - 50))}><ArrowLeft className="size-3" /></Chip>
        <Chip label={`Move joint ${index + 1} right`} disabled={joint.locked} onClick={() => onChange(moveJoint(spec, owner.id, index, joint.at + 50))}><ArrowRight className="size-3" /></Chip>
        <Chip disabled={joint.locked} onClick={() => onChange(snapJointToPartition(spec, owner.id, index))}><Magnet className="size-3" />Snap to partition</Chip>
        <Chip active={joint.locked} onClick={() => onChange(lockJoint(spec, owner.id, index, !joint.locked))}>{joint.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}{joint.locked ? "Locked" : "Lock"}</Chip>
        <Chip disabled={joint.locked} onClick={() => { onSelectJoint(null); onChange(removeJoint(spec, owner.id, index)); }}><Trash2 className="size-3" />Delete</Chip>
      </div>
    </div>
  );
}

/** The joint tapped in the drawing, first in the panel. */
export function JointPanel({ spec, joint, onChange, onSelectJoint }: { spec: DesignSpec; joint: JointRef; onChange: Change; onSelectJoint: (joint: JointRef | null) => void }) {
  const owner = jointOwnerOf(spec, joint.cabinetId);
  if (!owner?.transport?.joints[joint.index]) return null;
  return (
    <Panel title="Module joint" defaultOpen>
      <JointRow spec={spec} owner={owner} index={joint.index} onChange={onChange} onSelectJoint={onSelectJoint} selected />
      <p className="text-[10px] text-muted-foreground">Drag the joint&apos;s handle in the elevation; it snaps to partitions, door boundaries and the centre line. The bays either side are refitted — real side panels move.</p>
      <button type="button" onClick={() => onSelectJoint(null)} className="w-full rounded-md border px-2 py-1 text-[11px] hover:border-brand">Done</button>
    </Panel>
  );
}

export function TransportPanel({ spec, cabinet, onChange, onSelectJoint, selectedJoint }: { spec: DesignSpec; cabinet: Cabinet; onChange: Change; onSelectJoint: (joint: JointRef | null) => void; selectedJoint: JointRef | null }) {
  if (spec.furnitureType !== "wardrobe" || isSideDisplay(cabinet)) return null;
  const owner = jointOwnerOf(spec, cabinet.id) ?? cabinet;
  const transport = owner.transport;
  const modules = modulesOf(cabinet);
  const top = spec.cabinets.find((entry) => entry.stackedOn === owner.id);
  const following = owner.id !== cabinet.id;
  const warnings = transportWarnings(spec, owner.id);
  const proposal = transportProposal(spec, owner.id);
  const joints = transport?.joints ?? [];

  return (
    <Panel title="Transport modules" defaultOpen={Boolean(transport && joints.length) || owner.size.width > MAX_MODULE}>
      <ul className="space-y-0.5 text-[11px]" aria-label="Modules">
        {modules.map((module) => (
          <li key={module.index} className="flex justify-between tabular-nums"><span>{name(cabinet, module.index)}</span><span>{Math.round(module.width)} mm</span></li>
        ))}
      </ul>
      {following ? <p className="text-[10px] text-muted-foreground">A separate cabinet above, its joints over the wardrobe&apos;s below. Changes here move both.</p> : null}

      {!joints.length ? (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">
            One carcass, {Math.round(owner.size.width)} mm.{" "}
            {owner.size.width > MAX_MODULE ? `By the ${MAX_MODULE} mm rule: ${proposal.widths.map(Math.round).join(" + ")}.` : `Within one ${MAX_MODULE} mm module.`}
          </p>
          {proposal.offPartition.length ? (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">The joint at {proposal.offPartition.map(Math.round).join(", ")} mm is not on a partition: the bays either side are refitted to the modules.</p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {owner.size.width > MAX_MODULE ? <Chip onClick={() => onChange(divideForTransport(spec, owner.id))}><Scissors className="size-3" />Divide {proposal.widths.map(Math.round).join(" + ")}</Chip> : null}
            {owner.size.width > MAX_MODULE && proposal.offPartition.length ? <Chip onClick={() => onChange(divideForTransport(spec, owner.id, proposal.snapped))}><Magnet className="size-3" />On partitions</Chip> : null}
            {owner.size.width <= MAX_MODULE ? (
              <Chip onClick={() => {
                // By hand: a joint on the partition nearest the middle, to be moved where the site needs it.
                const middle = owner.size.width / 2;
                const partitions = partitionCentresOf(spec, owner.id);
                const at = partitions.length ? partitions.reduce((a, b) => (Math.abs(b - middle) < Math.abs(a - middle) ? b : a)) : middle;
                onChange(divideForTransport(spec, owner.id, [at]));
              }}><Scissors className="size-3" />Divide for Transport</Chip>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {joints.map((_, index) => (
            <JointRow key={index} spec={spec} owner={owner} index={index} onChange={onChange} onSelectJoint={onSelectJoint} selected={selectedJoint?.index === index && (selectedJoint.cabinetId === owner.id || selectedJoint.cabinetId === cabinet.id)} />
          ))}
          {warnings.map((warning) => (
            <div key={warning} className="space-y-1 rounded-md border border-amber-500/40 p-1.5" role="alert">
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{warning}</p>
              <div className="flex flex-wrap gap-1">
                <Chip onClick={() => onChange(lockJoint(spec, owner.id, joints.length - 1, true))}>Keep {modulesOf(owner).map((module) => Math.round(module.width)).join(" + ")}</Chip>
                <Chip onClick={() => onChange(balanceLastModules(spec, owner.id))}>Adjust division</Chip>
                <Chip onClick={() => onChange(snapJointToPartition(spec, owner.id, joints.length - 1))}>Snap to partition</Chip>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-1">
            <Chip onClick={() => onChange(addJoint(spec, owner.id, ((modulesOf(owner).reduce((a, b) => (b.width > a.width ? b : a)).from + modulesOf(owner).reduce((a, b) => (b.width > a.width ? b : a)).to) / 2)))}><Plus className="size-3" />Add joint</Chip>
            <Chip active={transport?.auto !== false} onClick={() => onChange(transport?.auto !== false ? divideForTransport(spec, owner.id, joints.map((joint) => joint.at)) : divideForTransport(spec, owner.id))}>{MAX_MODULE} mm rule {transport?.auto !== false ? "ON" : "OFF"}</Chip>
            {/* Back to the workshop's rule — 1600 mm from the left, the rest
                last — with every lock released. Shown only when something
                differs from it, so it never offers to do nothing. */}
            {transport?.auto === false || joints.some((joint) => joint.locked) || defaultJoints(owner.size.width).join() !== joints.map((joint) => Math.round(joint.at)).join() ? (
              <Chip onClick={() => onChange(divideForTransport(spec, owner.id))}><RotateCcw className="size-3" />Reset to Recommended</Chip>
            ) : null}
            <Chip onClick={() => { onSelectJoint(null); onChange(removeTransport(spec, owner.id)); }}><Trash2 className="size-3" />One carcass</Chip>
          </div>
        </>
      )}

      {transport ? (
        <>
          {top ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">Align Top Modules</span>
              <Chip active={transport.alignTop !== false} label="Align Top Modules" onClick={() => onChange(setAlignTop(spec, owner.id, transport.alignTop === false))}>{transport.alignTop !== false ? "ON" : "OFF"}</Chip>
            </div>
          ) : null}
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            Joined with
            <select aria-label="Joined with" value={transport.connector ?? "confirmat"} onChange={(event) => onChange(setConnector(spec, owner.id, event.target.value as (typeof CONNECTORS)[number]["id"]))} className="h-8 rounded-md border bg-background/60 px-1.5 text-[11px]">
              {CONNECTORS.map((connector) => <option key={connector.id} value={connector.id}>{connector.label}</option>)}
            </select>
          </label>
          <p className="text-[10px] text-muted-foreground">Each module is a complete cabinet — its own sides, top, bottom and back — joined through a double side panel, screwed together from inside. The doors are laid out separately.</p>
        </>
      ) : null}
    </Panel>
  );
}
