"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarPlus,
  Check,
  ChevronDown,
  Columns2,
  Columns3,
  Copy,
  DoorOpen,
  FlipHorizontal2,
  FlipVertical2,
  Footprints,
  Grid3X3,
  LayoutGrid,
  Link2,
  Unlink2,
  Loader2,
  Lock,
  LockOpen,
  Magnet,
  Merge,
  Minus,
  MoreHorizontal,
  MoreVertical,
  MousePointer2,
  Move,
  Pencil,
  RectangleHorizontal,
  Redo2,
  RotateCw,
  Rows2,
  Ruler,
  Scissors,
  SlidersHorizontal,
  Sofa,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { displayLength, modelLength, type DisplayUnits } from "../services/workspace-options";
import { FURNITURE_CATALOG, type FurnitureItem } from "../services/furniture-catalog";
import { COLUMN_SHAPES, COLUMN_SIZES, DOOR_TYPES, WINDOW_TYPES, columnShape, doorType, windowType } from "../services/object-library";
import { STAIR_TYPES, stairGeometry, stairParams, stairWarnings } from "../services/stair-geometry";
import { formatArea, formatLength, formatSize, polygonArea, polygonPerimeter, wallLabels, wallRooms } from "../services/measurements";
import type { HouseCommandId } from "../services/command-registry";
import type { HousePatch } from "../services/project-edit";
import type { HouseProject, HouseSelection } from "../types/project";

/**
 * The plan screen's chrome, kept deliberately small.
 *
 * Nine tools a person recording a building actually reaches for, and nothing
 * that only makes sense in Revit. Move, Rotate, Duplicate and Delete are not
 * tools: they belong to the thing selected, and appear with it.
 */
export const PLAN_TOOLS: { id: HouseCommandId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "wall", label: "Wall", icon: Minus },
  { id: "room", label: "Room", icon: LayoutGrid },
  { id: "door", label: "Door", icon: DoorOpen },
  { id: "window", label: "Window", icon: RectangleHorizontal },
  { id: "column", label: "Column", icon: Columns3 },
  { id: "stair", label: "Stair", icon: Footprints },
  { id: "furniture", label: "Furniture", icon: Sofa },
  { id: "dimension", label: "Measure", icon: Ruler },
  { id: "split", label: "Split", icon: SplitSquareHorizontal },
];

export function PlanToolbar({ activeTool, onTool, onUndo, canUndo }: { activeTool: HouseCommandId | null; onTool: (id: HouseCommandId) => void; onUndo: () => void; canUndo: boolean }) {
  return (
    <nav aria-label="Modeling tools" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border bg-card p-1">
      {PLAN_TOOLS.map(({ id, label, icon: Icon }) => {
        const on = (activeTool ?? "select") === id;
        return (
          <div key={id} className="contents">
            <button type="button" aria-label={label} aria-pressed={on} onClick={() => onTool(id)} className={cn("flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-[10px] text-muted-foreground active:bg-brand/20", on && "bg-brand/15 text-brand")}>
              <Icon className="size-[18px]" />
              <span className="leading-none">{label}</span>
            </button>
            {id === "select" ? (
              <button type="button" aria-label="Undo" title="Undo last change" onClick={onUndo} disabled={!canUndo} className="flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-[10px] text-muted-foreground hover:bg-muted active:bg-brand/20 disabled:opacity-30">
                <Undo2 className="size-[18px]" />
                <span className="leading-none">Undo</span>
              </button>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export type MoreItem = { id: string; label: string; onSelect: () => void; disabled?: boolean };

export function PlanSecondaryBar({ canRedo, onRedo, snap, onSnap, grid, onGrid, more }: {
  canRedo: boolean; onRedo: () => void;
  snap: boolean; onSnap: () => void; grid: boolean; onGrid: () => void; more: MoreItem[];
}) {
  const [open, setOpen] = useState(false);
  const button = "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs disabled:opacity-30";
  return (
    <div className="relative flex min-w-0 items-center gap-1 rounded-xl border bg-card p-1">
      <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" className={cn(button, "hover:bg-muted")}><Redo2 className="size-4" /><span className="hidden sm:inline">Redo</span></button>
      <button type="button" onClick={onSnap} aria-pressed={snap} aria-label="Snap" className={cn(button, snap ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted")}><Magnet className="size-4" /><span>Snap</span></button>
      <button type="button" onClick={onGrid} aria-pressed={grid} aria-label="Grid" className={cn(button, grid ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted")}><Grid3X3 className="size-4" /><span>Grid</span></button>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="More" className={cn(button, "ml-auto hover:bg-muted", open && "bg-muted")}><MoreHorizontal className="size-4" /><span>More</span></button>
      {open ? (
        <div role="menu" aria-label="More tools" className="absolute bottom-full right-0 z-40 mb-1 w-56 rounded-xl border bg-card p-1 shadow-xl">
          {more.map((item) => <button key={item.id} type="button" role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-40">{item.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}

export function FurniturePicker({ chosen, onChoose, onClose }: { chosen: string; onChoose: (item: FurnitureItem) => void; onClose: () => void }) {
  return (
    <div role="radiogroup" aria-label="Furniture" className="absolute inset-x-2 top-12 z-20 grid grid-cols-3 gap-1 rounded-xl border bg-card/95 p-1.5 text-xs shadow-lg backdrop-blur sm:grid-cols-4">
      {FURNITURE_CATALOG.map((item) => (
        <button key={item.id} type="button" role="radio" aria-checked={chosen === item.id} onClick={() => onChoose(item)} className={cn("rounded-lg px-2 py-2 text-left", chosen === item.id ? "bg-brand/15 text-brand" : "hover:bg-muted")}>
          <span className="block font-medium">{item.name}</span>
          <span className="text-[10px] text-muted-foreground">{item.width} × {item.depth}</span>
        </button>
      ))}
      <button type="button" onClick={onClose} className="col-span-full rounded-lg border px-2 py-1.5 text-muted-foreground">Done</button>
    </div>
  );
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "device" | "error" | "conflict";

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: "Saved ✓",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  device: "Not in a project yet",
  error: "Not saved — retry",
  conflict: "Changed elsewhere",
};

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  return (
    <button type="button" onClick={onRetry} disabled={!onRetry || status === "saving" || status === "saved"} aria-live="polite" aria-label={`Save status: ${SAVE_LABEL[status]}`} className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", status === "saved" ? "text-emerald-600 dark:text-emerald-400" : status === "error" || status === "conflict" ? "bg-destructive/10 text-destructive" : "text-muted-foreground")}>
      {status === "saving" ? <Loader2 className="size-3 animate-spin" /> : null}
      {SAVE_LABEL[status]}
    </button>
  );
}

export function EditorHeader({ onBack, levels, activeLevelId, onLevel, onAddFloor, status, onRetry, menu }: {
  onBack: () => void;
  levels: { id: string; name: string }[];
  activeLevelId: string;
  onLevel: (id: string) => void;
  onAddFloor: () => void;
  status: SaveStatus;
  onRetry?: () => void;
  menu: MoreItem[];
}) {
  const [floorOpen, setFloorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeLevel = levels.find((level) => level.id === activeLevelId);
  return (
    <div className="relative z-30 flex min-w-0 items-center gap-1 rounded-xl border bg-card p-1">
      <button type="button" onClick={onBack} aria-label="Back" className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft className="size-4" /></button>
      <div className="relative min-w-0">
        <button type="button" onClick={() => setFloorOpen((value) => !value)} aria-expanded={floorOpen} aria-label={`Floor: ${activeLevel?.name ?? "none"}`} className="flex min-h-10 min-w-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-muted">
          <span className="truncate">{activeLevel?.name ?? "Floor"}</span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
        {floorOpen ? (
          <div role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-40 rounded-xl border bg-card p-1 shadow-lg">
            {levels.map((level) => <button key={level.id} type="button" role="menuitem" onClick={() => { onLevel(level.id); setFloorOpen(false); }} className={cn("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted", level.id === activeLevelId && "bg-brand/10 text-brand")}>{level.name}</button>)}
            <button type="button" role="menuitem" onClick={() => { onAddFloor(); setFloorOpen(false); }} className="mt-1 block w-full rounded-lg border-t px-3 py-2 text-left text-sm text-brand hover:bg-muted">+ Add floor</button>
          </div>
        ) : null}
      </div>
      <span className="ml-auto" />
      <SaveIndicator status={status} onRetry={onRetry} />
      <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Project menu" className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><MoreVertical className="size-4" /></button>
      {menuOpen ? (
        <div role="menu" aria-label="Project menu" className="absolute right-1 top-full z-40 mt-1 w-60 rounded-xl border bg-card p-1 shadow-xl">
          {menu.map((item) => <button key={item.id} type="button" role="menuitem" disabled={item.disabled} onClick={() => { setMenuOpen(false); item.onSelect(); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-40">{item.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}

export type WorkspaceTab = "plan" | "sketch" | "3d" | "files" | "agenda";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "sketch", label: "Sketch" },
  { id: "3d", label: "3D" },
  { id: "files", label: "Files" },
  { id: "agenda", label: "Agenda" },
];

export function WorkspaceTabs({ tab, onTab }: { tab: WorkspaceTab; onTab: (tab: WorkspaceTab) => void }) {
  return (
    <div role="tablist" aria-label="Project sections" className="flex min-w-0 gap-0.5 overflow-x-auto rounded-xl bg-muted p-1">
      {TABS.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => onTab(item.id)} className={cn("min-h-9 flex-1 shrink-0 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide", tab === item.id ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>{item.label}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The selected object: its measurements, editable, and what can be done to it.
// ---------------------------------------------------------------------------

export type SheetAction = "move" | "delete" | "flip" | "rotate" | "duplicate" | "merge" | "lock" | "agenda" | "properties";

export function SelectionSheet({ project, selection, onPatch, onAction, onClose, showActions = true, autoFocus }: {
  project: HouseProject;
  selection: HouseSelection;
  /** Off when the actions are already beside the selection. */
  showActions?: boolean;
  /** The field to start typing in — Rename opens the sheet on the name. */
  autoFocus?: string;
  onPatch: (patch: HousePatch) => void;
  onAction: (action: SheetAction) => void;
  onClose: () => void;
}) {
  const unit = project.displayUnits ?? "mm";
  const content = sheetContent(project, selection, unit);
  const locked = Boolean(project.objectInstances[selection.id]?.pinned);
  if (!content) return null;
  return (
    <section aria-label={`${content.title} properties`} className="absolute inset-x-1.5 bottom-1.5 z-20 max-h-[48%] overflow-y-auto rounded-2xl border bg-card/95 px-2.5 py-2 shadow-xl backdrop-blur">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm"><span className="mr-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand">{content.kind}</span><strong>{content.title}</strong>{content.subtitle ? <span className="text-xs text-muted-foreground"> · {content.subtitle}</span> : null}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      {content.fields.length ? (
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {content.fields.map((field) => field.choice ? (
            <div key={field.label} role="radiogroup" aria-label={field.label} className="col-span-3 min-w-0">
              <span className="block text-[10px] text-muted-foreground">{field.label}</span>
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {field.choice.options.map(([value, text]) => <button key={value} type="button" role="radio" aria-checked={String(field.choice!.value) === value} onClick={() => onPatch({ [field.choice!.key]: field.choice!.numeric ? Number(value) : value })} className={cn("min-h-9 shrink-0 rounded-lg border px-2.5 text-xs", String(field.choice!.value) === value ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted")}>{text}</button>)}
              </div>
            </div>
          ) : field.buttons ? (
            <div key={field.label} className="col-span-3 flex flex-wrap gap-1">
              {field.buttons.map((button) => <button key={button.label} type="button" onClick={() => onPatch(button.patch)} className="min-h-9 rounded-lg border px-2.5 text-xs hover:bg-muted">{button.label}</button>)}
            </div>
          ) : (
            <label key={field.label} className={cn("min-w-0 rounded-lg bg-muted/50 px-2 py-1", (field.edit?.text || field.wide) && "col-span-3")}>
              <span className="block truncate text-[10px] text-muted-foreground">{field.label}{field.edit && !field.edit.text ? ` (${field.edit.plain ?? unit})` : ""}</span>
              {field.edit ? <SheetNumber key={`${selection.id}:${field.edit.key}:${field.edit.value}`} label={field.label} value={field.edit.value} unit={field.edit.text || field.edit.plain ? null : unit} text={field.edit.text} plain={Boolean(field.edit.plain)} signed={field.edit.signed} autoFocus={autoFocus === field.label} onCommit={(value) => onPatch({ [field.edit!.key]: value })} /> : <span className={cn("block text-xs font-medium tabular-nums", field.wide ? "whitespace-normal" : "truncate")}>{field.value}</span>}
            </label>
          ))}
        </div>
      ) : null}
      {showActions ? <div className="mt-1.5 flex gap-1.5 overflow-x-auto">
        {content.actions.map((action) => (
          <button key={action} type="button" onClick={() => onAction(action)} aria-pressed={action === "lock" ? locked : undefined} className={cn("min-h-10 shrink-0 rounded-lg border px-3 text-xs font-medium hover:bg-muted", action === "delete" && "border-destructive/30 text-destructive", action === "lock" && locked && "border-brand/40 text-brand")}>{action === "lock" && locked ? "Unlock" : ACTION_LABEL[action]}</button>
        ))}
      </div> : null}
    </section>
  );
}

const ACTION_LABEL: Record<SheetAction, string> = {
  move: "Move",
  delete: "Delete",
  flip: "Flip",
  rotate: "Rotate",
  duplicate: "Duplicate",
  merge: "Merge rooms",
  lock: "Lock",
  agenda: "Add to Agenda",
  properties: "More properties",
};

type SheetField = {
  label: string;
  value?: string;
  wide?: boolean;
  /** `plain` names a unit of its own (°, risers) — not a length; `signed` lets a position be zero or less. */
  edit?: { key: string; value: number | string; text?: boolean; plain?: string; signed?: boolean };
  choice?: { key: string; value: string | number; options: [string, string][]; numeric?: boolean };
  buttons?: { label: string; patch: HousePatch }[];
};

const ROTATIONS: [string, string][] = [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]];
const round1 = (value: number) => Math.round(value * 10) / 10;

function sheetContent(project: HouseProject, selection: HouseSelection, unit: DisplayUnits): { kind: string; title: string; subtitle?: string; fields: SheetField[]; actions: SheetAction[] } | null {
  switch (selection.kind) {
    case "wall": {
      const wall = project.walls.find((item) => item.id === selection.id);
      if (!wall) return null;
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      const rooms = wallRooms(project, wall.id);
      return {
        kind: "Wall", title: wallLabels(project, wall.levelId).get(wall.id) ?? "Wall", subtitle: rooms.join(" / ") || undefined,
        fields: [
          { label: "Length", edit: { key: "length", value: length } },
          { label: "Thickness", edit: { key: "thickness", value: wall.thickness } },
          { label: "Height", edit: { key: "height", value: wall.height } },
        ],
        actions: ["move", "lock", "delete", "agenda", "properties"],
      };
    }
    case "door":
    case "window": {
      const opening = [...project.doors, ...project.windows].find((item) => item.id === selection.id);
      if (!opening) return null;
      const list = (selection.kind === "door" ? project.doors : project.windows).filter((item) => item.levelId === opening.levelId);
      const number = `${selection.kind === "door" ? "D" : "W"}${list.findIndex((item) => item.id === opening.id) + 1}`;
      return {
        kind: selection.kind === "door" ? "Door" : "Window", title: `${selection.kind === "door" ? "Door" : "Window"} ${number}`, subtitle: formatSize(opening.width, opening.height, unit),
        fields: selection.kind === "door" ? [
          { label: "Type", choice: { key: "style", value: doorType(opening.style), options: DOOR_TYPES.map((item) => [item.id, item.name] as [string, string]) } },
          { label: "Width", edit: { key: "width", value: opening.width } },
          { label: "Height", edit: { key: "height", value: opening.height } },
          { label: "Position along wall", edit: { key: "offset", value: opening.offset, signed: true } },
          { label: "Swing", choice: { key: "swing", value: opening.swing, options: [["in-left", "In · left"], ["in-right", "In · right"], ["out-left", "Out · left"], ["out-right", "Out · right"]] } },
          { label: "Flip", buttons: [
            { label: "Flip inside / outside", patch: { swing: `${opening.swing.startsWith("out") ? "in" : "out"}-${opening.swing.endsWith("left") ? "left" : "right"}` } },
            { label: "Flip left / right", patch: { swing: `${opening.swing.startsWith("out") ? "out" : "in"}-${opening.swing.endsWith("left") ? "right" : "left"}` } },
          ] },
        ] : [
          { label: "Type", choice: { key: "style", value: windowType(opening.style), options: WINDOW_TYPES.map((item) => [item.id, item.name] as [string, string]) } },
          { label: "Width", edit: { key: "width", value: opening.width } },
          { label: "Height", edit: { key: "height", value: opening.height } },
          { label: "Sill height", edit: { key: "sillHeight", value: opening.sillHeight, signed: true } },
          { label: "Position along wall", edit: { key: "offset", value: opening.offset, signed: true } },
        ],
        actions: selection.kind === "door" ? ["flip", "move", "delete", "agenda"] : ["move", "delete", "agenda"],
      };
    }
    case "component": {
      const item = project.components.find((entry) => entry.id === selection.id);
      if (!item) return null;
      return {
        kind: "Furniture", title: item.name,
        fields: [
          { label: "Width", edit: { key: "width", value: item.width } },
          { label: "Depth", edit: { key: "depth", value: item.depth } },
          { label: "Height", edit: { key: "height", value: item.height } },
          { label: "Position X", edit: { key: "x", value: item.x, signed: true } },
          { label: "Position Y", edit: { key: "y", value: item.y, signed: true } },
          { label: "Rotation", edit: { key: "rotation", value: item.rotation, plain: "°", signed: true } },
          { label: "Turn to", choice: { key: "rotation", value: ((Math.round(item.rotation) % 360) + 360) % 360, options: ROTATIONS, numeric: true } },
        ],
        actions: ["rotate", "move", "duplicate", "delete", "agenda"],
      };
    }
    case "room": {
      const room = project.rooms.find((item) => item.id === selection.id);
      if (!room) return null;
      const xs = room.boundary.map((point) => point.x);
      const ys = room.boundary.map((point) => point.y);
      return {
        kind: "Room", title: room.name,
        fields: [
          { label: "Name", edit: { key: "name", value: room.name, text: true } },
          { label: "Size", value: formatSize(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), unit, 2) },
          { label: "Area", value: formatArea(polygonArea(room.boundary)) },
          { label: "Perimeter", value: formatLength(polygonPerimeter(room.boundary), unit, 2) },
        ],
        actions: ["merge", "delete", "agenda"],
      };
    }
    case "column": {
      const column = project.structuralColumns.find((item) => item.id === selection.id);
      if (!column) return null;
      return {
        kind: "Column", title: COLUMN_SHAPES.find((item) => item.id === columnShape(column.type))!.name,
        fields: [
          { label: "Shape", choice: { key: "type", value: columnShape(column.type), options: COLUMN_SHAPES.map((item) => [item.id, item.name.replace(" column", "")] as [string, string]) } },
          ...(column.type === "circular" ? [{ label: "Diameter", edit: { key: "width", value: column.width } }] : [
            { label: "Width", edit: { key: "width", value: column.width } },
            ...(column.type === "square" ? [] : [{ label: "Depth", edit: { key: "depth", value: column.depth } }]),
            { label: "Rotation", edit: { key: "rotation", value: column.rotation ?? 0, plain: "°", signed: true } },
          ]),
          { label: "Position X", edit: { key: "x", value: column.x, signed: true } },
          { label: "Position Y", edit: { key: "y", value: column.y, signed: true } },
          { label: "Quick sizes", buttons: COLUMN_SIZES.filter(([w, d]) => column.type !== "circular" && column.type !== "square" ? true : w === d).map(([w, d]) => ({ label: column.type === "circular" ? `Ø ${w}` : `${w}×${d}`, patch: { width: w, depth: d } })) },
        ],
        actions: ["move", "delete", "agenda"],
      };
    }
    case "stair": {
      const stair = project.stairs.find((item) => item.id === selection.id);
      if (!stair) return null;
      const params = stairParams(stair);
      const geometry = stairGeometry(params);
      return {
        kind: "Stair", title: STAIR_TYPES.find((item) => item.id === stair.type)?.name ?? "Stair", subtitle: `${stair.steps} risers`,
        fields: [
          { label: "Stair type", choice: { key: "type", value: stair.type, options: STAIR_TYPES.map((item) => [item.id, item.name.replace(" stair", "")] as [string, string]) } },
          { label: "Total width", edit: { key: "width", value: stair.width } },
          { label: "Total length", edit: { key: "length", value: stair.length } },
          { label: "Floor-to-floor height", edit: { key: "height", value: params.height } },
          { label: "Stair width", edit: { key: "stairWidth", value: params.stairWidth } },
          { label: "Riser height", edit: { key: "riserHeight", value: round1(params.height / params.risers) } },
          { label: "Tread depth", edit: { key: "treadDepth", value: params.treadDepth } },
          { label: "Number of risers", edit: { key: "risers", value: params.risers, plain: "risers" } },
          { label: "Number of treads", edit: { key: "treads", value: geometry.treads, plain: "treads" } },
          ...(["l-shaped", "u-shaped", "dog-legged", "switchback"].includes(stair.type) ? [{ label: "Landing length", edit: { key: "landing", value: params.landing } }, { label: "Landing width", value: formatLength(stair.type === "l-shaped" ? params.stairWidth : stair.width, unit) }] : []),
          { label: "Direction", value: params.reversed ? "UP from the other end" : "UP from the start" },
          { label: "Rotation", edit: { key: "rotation", value: stair.rotation, plain: "°", signed: true } },
          { label: "Turn to", choice: { key: "rotation", value: ((Math.round(stair.rotation) % 360) + 360) % 360, options: ROTATIONS, numeric: true } },
          { label: "Reverse", buttons: [{ label: "Reverse direction", patch: { reversed: "toggle" } }] },
          ...stairWarnings(params).map((warning) => ({ label: "Check", value: warning, wide: true })),
        ],
        actions: ["rotate", "move", "delete", "agenda"],
      };
    }
    case "annotation": {
      const item = project.annotations.find((entry) => entry.id === selection.id);
      if (!item) return null;
      const length = item.end ? Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y) : null;
      return {
        kind: item.kind === "dimension" ? "Measurement" : "Label", title: length !== null && item.kind === "dimension" ? formatLength(length, unit) : item.text,
        fields: [], actions: ["delete", "agenda"],
      };
    }
    case "level":
      return null;
    default:
      return { kind: selection.kind, title: selection.kind.replace("-", " "), fields: [], actions: ["delete", "properties"] };
  }
}

/** A number edited in the sheet: typed in the project's units, saved in millimetres on Enter or leaving the field. */
function SheetNumber({ label, value, unit, text, plain = false, signed = false, autoFocus, onCommit }: { label: string; value: number | string; unit: DisplayUnits | null; text?: boolean; plain?: boolean; signed?: boolean; autoFocus?: boolean; onCommit: (value: number | string) => void }) {
  const shown = typeof value === "number" && unit ? String(displayLength(Math.round(value * 1000) / 1000, unit)) : typeof value === "number" ? String(Math.round(value * 1000) / 1000) : String(value);
  const [draft, setDraft] = useState(shown);
  const commit = () => {
    if (draft === shown) return;
    if (text) { if (draft.trim()) onCommit(draft.trim()); return; }
    const number = Number(draft.replace(",", "."));
    // A rotation or a position may be 0 or below; a size may not.
    if (!Number.isFinite(number) || (number <= 0 && !signed) || (!unit && !plain)) { setDraft(shown); return; }
    onCommit(plain ? number : modelLength(number, unit!));
  };
  return (
    <span className="relative block">
      <input aria-label={label} autoFocus={autoFocus} value={draft} inputMode={text ? "text" : "decimal"} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); } if (event.key === "Escape") setDraft(shown); }} className="min-h-8 w-full rounded-md border bg-background px-1.5 text-sm tabular-nums" />
      {draft !== shown ? <Check className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-brand" /> : null}
    </span>
  );
}

export type QuickAction = { id: string; label: string; onSelect: () => void; pressed?: boolean };

/** Each action's icon: the bar shows icons only, as Revit does; the name is the button's label and tooltip. */
const ACTION_ICONS: Record<string, typeof Copy> = {
  duplicate: Copy,
  rotate: RotateCw,
  split: Scissors,
  divide: SplitSquareHorizontal,
  move: Move,
  junction: Link2,
  "junction-start": Link2,
  "junction-end": Link2,
  lock: Lock,
  delete: Trash2,
  agenda: CalendarPlus,
  properties: SlidersHorizontal,
  merge: Merge,
  rename: Pencil,
  vertical: Columns2,
  horizontal: Rows2,
  cancel: X,
  flip: FlipHorizontal2,
  "door-hinge": FlipHorizontal2,
  "door-swing": FlipVertical2,
  "door-type": DoorOpen,
  mirror: FlipHorizontal2,
  reverse: ArrowUpDown,
};

function ActionIcon({ action }: { action: QuickAction }) {
  const Icon = (action.id === "lock" && action.label === "Unlock"
    ? LockOpen
    : action.id.startsWith("junction") && !action.pressed
      ? Unlink2
      : ACTION_ICONS[action.id]) ?? MoreHorizontal;
  if (action.id === "junction-start" || action.id === "junction-end") {
    return <span className="relative inline-flex size-5 items-center justify-center">
      <Icon className="size-4" aria-hidden />
      <span aria-hidden className="absolute -bottom-1 -right-1 rounded-full bg-card px-0.5 text-[9px] font-bold leading-3">
        {action.id === "junction-start" ? "S" : "E"}
      </span>
    </span>;
  }
  return <Icon className="size-4" aria-hidden />;
}

/**
 * The selection's own actions, small and beside it — not a bar across the
 * screen, and not over what is being edited: icons only, 36 px, each named
 * by its label for touch, screen readers and the tooltip. The common few are
 * on the bar; the rest open under ⋮ as a second row of icons.
 */
export function QuickActionBar({ label, actions, more }: { label: string; actions: QuickAction[]; more: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="toolbar" aria-label={label} className="relative flex items-center gap-0.5 rounded-full border bg-card/95 p-0.5 shadow-lg backdrop-blur">
      {actions.map((action) => (
        <button key={action.id} type="button" aria-label={action.label} title={action.label} onClick={() => { setOpen(false); action.onSelect(); }} aria-pressed={action.pressed} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted", action.pressed && "bg-brand/15 text-brand")}><ActionIcon action={action} /></button>
      ))}
      {more.length ? <button type="button" aria-label="More actions" title="More actions" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted", open && "bg-muted")}><MoreVertical className="size-4" aria-hidden /></button> : null}
      {open ? (
        <div role="menu" aria-label={`${label}: more`} className="absolute right-0 top-full z-30 mt-1 flex gap-0.5 rounded-full border bg-card p-0.5 shadow-xl">
          {more.map((action) => <button key={action.id} type="button" role="menuitem" aria-label={action.label} title={action.label} onClick={() => { setOpen(false); action.onSelect(); }} className={cn("flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted", action.id === "delete" && "text-destructive")}><ActionIcon action={action} /></button>)}
        </div>
      ) : null}
    </div>
  );
}
