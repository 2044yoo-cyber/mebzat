"use client";

import { useMemo, useState } from "react";
import {
  BoxSelect,
  Columns3,
  Copy,
  DoorOpen,
  Grid3X3,
  HelpCircle,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  MousePointer2,
  Move,
  Redo2,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  houseCommand,
  searchHouseCommands,
  type HouseCommandCategory,
  type HouseCommandId,
} from "../services/command-registry";
import { calculateHouseQuantities } from "../services/quantities";
import type { HouseProject, HouseSelection, HouseViewState } from "../types/project";

const ribbonCommands: Record<HouseCommandCategory, HouseCommandId[]> = {
  General: ["select", "undo", "redo", "delete"],
  Architecture: ["wall", "door", "window", "floor", "roof", "ceiling", "room", "room-separator", "stair", "railing", "opening", "component", "furniture", "kitchen", "wardrobe"],
  Structure: ["column", "beam", "structural-wall", "structural-slab", "foundation", "isolated-footing", "strip-footing", "foundation-slab", "grid", "level", "reference-plane"],
  Modify: ["move", "copy", "rotate", "align", "offset", "trim", "split", "mirror-pick", "array", "join", "unjoin", "scale", "pin", "unpin", "create-similar", "match-type", "delete"],
  Annotate: ["dimension", "text", "room-tag", "tag", "section", "elevation"],
  View: ["floor-plan", "default-3d", "split-view", "view-top", "view-front", "view-back", "view-left", "view-right", "view-isometric", "view-perspective", "visibility", "zoom-fit", "hide", "isolate", "reset-hide"],
  AI: ["ask-ai", "ai-remodel", "generate-facade", "alternatives", "generate-structure", "analyze-plan"],
};

const ribbonCategories: HouseCommandCategory[] = ["Architecture", "Modify", "Structure", "Annotate", "View", "AI"];

const icons: Partial<Record<HouseCommandId, React.ComponentType<{ className?: string }>>> = {
  select: MousePointer2,
  undo: Undo2,
  redo: Redo2,
  delete: Trash2,
  wall: Square,
  door: DoorOpen,
  window: Columns3,
  column: Columns3,
  grid: Grid3X3,
  move: Move,
  copy: Copy,
  rotate: RotateCw,
  "ai-remodel": Sparkles,
};

export function HouseRibbon({ activeCategory, activeTool, selectionCount, canUndo, canRedo, onCategory, onCommand, onSearch, onHelp }: {
  activeCategory: HouseCommandCategory;
  activeTool: HouseCommandId | null;
  selectionCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onCategory: (category: HouseCommandCategory) => void;
  onCommand: (command: HouseCommandId) => void;
  onSearch: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b px-2 pt-1.5">
        {ribbonCategories.map((category) => (
          <button key={category} type="button" onClick={() => onCategory(category)} className={cn("shrink-0 border-b-2 px-2 py-2 text-xs font-medium", activeCategory === category ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground")}>{category}</button>
        ))}
        <span className="ml-auto flex shrink-0 gap-1 pb-1">
          <button type="button" onClick={onSearch} aria-label="Command search" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Search className="size-4" /></button>
          <button type="button" onClick={onHelp} aria-label="Keyboard shortcuts" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><HelpCircle className="size-4" /></button>
        </span>
      </div>
      <div className="flex min-w-0 gap-1 overflow-x-auto p-2">
        {(["select", "undo", "redo", ...ribbonCommands[activeCategory]] as HouseCommandId[])
          .filter((id, index, items) => items.indexOf(id) === index)
          .map((id) => {
          const item = houseCommand(id);
          const Icon = icons[id] ?? BoxSelect;
          const disabled = item.selection && selectionCount === 0 || id === "undo" && !canUndo || id === "redo" && !canRedo;
          return (
            <button key={id} type="button" disabled={disabled} onClick={() => onCommand(id)} title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`} className={cn("flex min-w-[58px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35", activeTool === id && "bg-brand/10 text-brand")}>
              <Icon className="size-4" />
              <span className="max-w-20 whitespace-nowrap">{item.label}</span>
              {item.shortcut ? <kbd className="text-[9px] leading-none text-muted-foreground">{item.shortcut}</kbd> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type HouseToolSettings = {
  wallType: string;
  locationLine: string;
  height: number;
  chain: boolean;
  offset: number;
  width: number;
  depth: number;
  sillHeight: number;
  constrain: boolean;
  disjoin: boolean;
  multiple: boolean;
};

export function HouseToolOptions({ activeTool, project, levelId, settings, onChange }: {
  activeTool: HouseCommandId | null;
  project: HouseProject;
  levelId: string;
  settings: HouseToolSettings;
  onChange: (change: Partial<HouseToolSettings>) => void;
}) {
  const level = project.levels.find((item) => item.id === levelId);
  const numeric = (label: string, key: keyof Pick<HouseToolSettings, "height" | "offset" | "width" | "depth" | "sillHeight">) => (
    <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><span>{label}</span><input type="number" step="0.1" value={settings[key]} onChange={(event) => onChange({ [key]: Number(event.target.value) })} className="w-24 rounded-md border bg-background px-2 py-1 text-right text-xs text-foreground" /><span>mm</span></label>
  );
  let controls: React.ReactNode = <span className="text-xs text-muted-foreground">Select objects to edit their instance properties.</span>;
  if (activeTool === "wall" || activeTool === "structural-wall" || activeTool === "room-separator") controls = <><label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">Wall Type<select value={settings.wallType} onChange={(event) => onChange({ wallType: event.target.value })} className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"><option>200 mm Exterior</option><option>120 mm Interior</option><option>Structural RC</option></select></label><label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">Location Line<select value={settings.locationLine} onChange={(event) => onChange({ locationLine: event.target.value })} className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"><option>Wall Centerline</option><option>Finish Face: Exterior</option><option>Finish Face: Interior</option></select></label><span className="shrink-0 text-[11px] text-muted-foreground">Base: <strong className="text-foreground">{level?.name ?? "—"}</strong></span><span className="shrink-0 text-[11px] text-muted-foreground">Top: <strong className="text-foreground">{project.levels[project.levels.findIndex((item) => item.id === levelId) + 1]?.name ?? "Unconnected"}</strong></span>{numeric("Height", "height")}<label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={settings.chain} onChange={(event) => onChange({ chain: event.target.checked })} />Chain</label>{numeric("Offset", "offset")}</>;
  else if (activeTool === "door" || activeTool === "window") controls = <><span className="shrink-0 text-xs font-medium capitalize">{activeTool} Type: Standard</span>{numeric("Width", "width")}{numeric("Height", "height")}{activeTool === "window" ? numeric("Sill", "sillHeight") : null}<span className="shrink-0 text-[11px] text-muted-foreground">Level: {level?.name ?? "—"}</span></>;
  else if (activeTool === "move") controls = <>{["constrain", "disjoin", "multiple"].map((key) => <label key={key} className="flex shrink-0 items-center gap-1 text-xs capitalize"><input type="checkbox" checked={settings[key as "constrain" | "disjoin" | "multiple"]} onChange={(event) => onChange({ [key]: event.target.checked })} />{key}</label>)}</>;
  else if (activeTool && activeTool !== "select") controls = <><span className="shrink-0 text-xs font-medium">{houseCommand(activeTool).label}</span>{["column", "beam", "stair", "component", "furniture", "kitchen", "wardrobe", "foundation", "isolated-footing", "strip-footing", "foundation-slab"].includes(activeTool) ? <>{numeric("Width", "width")}{numeric("Depth", "depth")}{numeric("Height", "height")}</> : null}</>;
  return <div className="flex min-w-0 items-center gap-3 overflow-x-auto rounded-xl border bg-card px-3 py-2 whitespace-nowrap"><span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand">Options</span>{controls}</div>;
}

export function HouseProjectBrowser({ project, activeLevelId, activeViewId, onLevel, onView, onSchedule }: {
  project: HouseProject;
  activeLevelId: string;
  activeViewId: string | null;
  onLevel: (id: string) => void;
  onView: (view: HouseViewState) => void;
  onSchedule: (kind: "doors" | "windows" | "rooms" | "quantities") => void;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return <button type="button" onClick={() => setOpen(true)} title="Open Project Browser" className="flex h-10 items-center justify-center rounded-xl border bg-card text-muted-foreground hover:text-foreground xl:sticky xl:top-3"><PanelLeftOpen className="size-4" /></button>;
  return (
    <aside className="min-w-0 rounded-xl border bg-card p-2 text-xs xl:sticky xl:top-3 xl:max-h-[75dvh] xl:w-[210px] xl:overflow-y-auto">
      <div className="mb-2 flex items-center gap-2 px-1"><Layers3 className="size-4 text-brand" /><strong>Project Browser</strong><button type="button" onClick={() => setOpen(false)} aria-label="Collapse Project Browser" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"><PanelLeftClose className="size-3.5" /></button></div>
      <BrowserGroup label="Floor Plans">
        {project.levels.map((level) => <BrowserButton key={level.id} active={activeLevelId === level.id} onClick={() => onLevel(level.id)}>{level.name}</BrowserButton>)}
      </BrowserGroup>
      <BrowserGroup label="3D Views">
        {project.views.filter((item) => item.kind === "3d").map((item) => <BrowserButton key={item.id} active={activeViewId === item.id} onClick={() => onView(item)}>{item.name}</BrowserButton>)}
      </BrowserGroup>
      <BrowserGroup label="Elevations">
        {project.views.filter((item) => item.kind === "elevation").map((item) => <BrowserButton key={item.id} active={activeViewId === item.id} onClick={() => onView(item)}>{item.name === "Rear" ? "Back" : item.name}</BrowserButton>)}
      </BrowserGroup>
      <BrowserGroup label="Sections">
        {project.views.filter((item) => item.kind === "section").map((item) => <BrowserButton key={item.id} active={activeViewId === item.id} onClick={() => onView(item)}>{item.name}</BrowserButton>)}
        {project.views.every((item) => item.kind !== "section") ? <p className="px-2 py-1 text-muted-foreground">Create with Section (SE)</p> : null}
      </BrowserGroup>
      <BrowserGroup label="Schedules">
        <BrowserButton onClick={() => onSchedule("doors")}>Door Schedule</BrowserButton>
        <BrowserButton onClick={() => onSchedule("windows")}>Window Schedule</BrowserButton>
        <BrowserButton onClick={() => onSchedule("rooms")}>Room Schedule</BrowserButton>
        <BrowserButton onClick={() => onSchedule("quantities")}>Preliminary Quantities</BrowserButton>
      </BrowserGroup>
      <BrowserGroup label="Families / Components">
        <p className="px-2 py-1 text-muted-foreground">{project.components.length} placed · {project.objectTypes.length} types</p>
      </BrowserGroup>
    </aside>
  );
}

export function HouseSelectionActions({ selected, onCommand }: { selected: HouseSelection | null; onCommand: (id: HouseCommandId) => void }) {
  if (!selected) return null;
  const commands: HouseCommandId[] = selected.kind === "window" || selected.kind === "door"
    ? ["move", "copy", "flip", "match-type", "delete"]
    : ["move", "copy", "rotate", "align", "offset", "split", "delete"];
  return <div className="flex min-w-0 gap-1 overflow-x-auto rounded-lg border bg-background/95 p-1 shadow-sm">{commands.map((id) => <button key={id} type="button" onClick={() => onCommand(id)} className="shrink-0 rounded-md px-2 py-1 text-[10px] hover:bg-muted">{id === "match-type" ? "Change Type" : houseCommand(id).label}</button>)}<button type="button" onClick={() => document.getElementById("house-properties")?.scrollIntoView({ behavior: "smooth", block: "nearest" })} className="shrink-0 rounded-md px-2 py-1 text-[10px] hover:bg-muted">Properties</button></div>;
}

export function HouseStatusBar({ selectionCount, snap, snapEnabled = true, onToggleSnap, level, units, mode, saveState }: { selectionCount: number; snap: string; snapEnabled?: boolean; onToggleSnap?: () => void; level: string; units: string; mode: string; saveState: string }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex min-w-0 items-center gap-3 overflow-x-auto rounded-lg border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur md:bottom-2">
      <span className="shrink-0">Selected: <strong className="text-foreground">{selectionCount}</strong></span>
      <button type="button" onClick={onToggleSnap} className="shrink-0 rounded px-1 hover:bg-muted">Snap: <strong className={snapEnabled ? "text-foreground" : "text-muted-foreground line-through"}>{snap}</strong></button>
      <span className="shrink-0">Level: <strong className="text-foreground">{level}</strong></span>
      <span className="shrink-0">Units: <strong className="text-foreground">{units}</strong></span>
      <span className="shrink-0">Mode: <strong className="text-foreground">{mode}</strong></span>
      <span className="ml-auto shrink-0 text-emerald-600 dark:text-emerald-400">{saveState}</span>
    </div>
  );
}

export function HouseCommandPalette({ open, onClose, onCommand }: { open: boolean; onClose: () => void; onCommand: (id: HouseCommandId) => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHouseCommands(query).slice(0, 24), [query]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/45 px-3 pt-[12dvh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Command search" className="w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <label className="flex items-center gap-2 border-b px-4"><Search className="size-4 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands…" className="min-w-0 flex-1 bg-transparent py-4 text-sm outline-none" /></label>
        <div className="max-h-[55dvh] overflow-y-auto p-2">
          {results.map((item) => <button key={item.id} type="button" onClick={() => { onCommand(item.id); onClose(); setQuery(""); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"><span><strong>{item.label}</strong><span className="ml-2 text-xs text-muted-foreground">{item.category}</span></span>{item.shortcut ? <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">{item.shortcut}</kbd> : null}</button>)}
        </div>
      </div>
    </div>
  );
}

export function HouseShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const items = searchHouseCommands(query).filter((item) => item.shortcut);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="w-full max-w-2xl rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Keyboard Shortcuts</h2><p className="text-xs text-muted-foreground">Revit-style commands, available outside input fields.</p></div><button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs">Close</button></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shortcuts" className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none" />
        <div className="grid max-h-[58dvh] gap-2 overflow-y-auto sm:grid-cols-2">
          {items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs"><span>{item.label}</span><kbd className="rounded border bg-background px-1.5 py-0.5">{item.shortcut}</kbd></div>)}
        </div>
      </div>
    </div>
  );
}

export type HouseContextMenuState = { x: number; y: number } | null;

export function HouseContextMenu({ state, selectionCount, onClose, onCommand }: { state: HouseContextMenuState; selectionCount: number; onClose: () => void; onCommand: (id: HouseCommandId) => void }) {
  if (!state || selectionCount === 0) return null;
  const commands: HouseCommandId[] = ["move", "copy", "rotate", "mirror-pick", "duplicate", "create-similar", "match-type", "hide", "isolate", "delete", "ai-remodel", "alternatives", "estimate", "boq"];
  return (
    <div className="fixed inset-0 z-[90]" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div role="menu" style={{ left: Math.min(state.x, window.innerWidth - 230), top: Math.min(state.y, window.innerHeight - 430) }} className="fixed w-56 rounded-xl border bg-card p-1.5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        {commands.map((id) => <button key={id} role="menuitem" type="button" onClick={() => { onCommand(id); onClose(); }} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-muted", id === "delete" && "text-destructive")}><span>{houseCommand(id).label}</span>{houseCommand(id).shortcut ? <kbd className="text-[10px] text-muted-foreground">{houseCommand(id).shortcut}</kbd> : null}</button>)}
      </div>
    </div>
  );
}

export function HouseSchedulePanel({ project, kind, onClose }: { project: HouseProject; kind: "doors" | "windows" | "rooms" | "quantities"; onClose: () => void }) {
  const rows = kind === "quantities" ? calculateHouseQuantities(project).map((item) => [item.code, item.description, item.unit, item.quantity.toFixed(3)])
    : kind === "rooms" ? project.rooms.map((item) => [item.id, item.name, item.floorMaterial, `${polygonArea(item.boundary).toFixed(2)} m²`])
      : (kind === "doors" ? project.doors : project.windows).map((item) => [item.id, item.style, `${item.width} × ${item.height}`, item.material]);
  const headers = kind === "quantities" ? ["Code", "Description", "Unit", "Quantity"] : kind === "rooms" ? ["ID", "Room", "Finish", "Area"] : ["ID", "Type", "Size (mm)", "Material"];
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-3"><div><p className="text-[11px] uppercase tracking-wide text-brand">Live schedule</p><h3 className="font-semibold capitalize">{kind}</h3></div><button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs">Close</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-muted/60"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t">{row.map((value, cell) => <td key={cell} className="px-3 py-2">{value}</td>)}</tr>)}</tbody></table></div>
    </section>
  );
}

function BrowserGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <details open className="border-t py-1 first:border-0"><summary className="cursor-pointer px-2 py-1 font-medium text-muted-foreground">{label}</summary><div className="space-y-0.5">{children}</div></details>;
}

function BrowserButton({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted", active && "bg-brand/10 text-brand")}>{children}</button>;
}

function polygonArea(points: { x: number; y: number }[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) { const a = points[index]!; const b = points[(index + 1) % points.length]!; sum += a.x * b.y - b.x * a.y; }
  return Math.abs(sum) / 2_000_000;
}
