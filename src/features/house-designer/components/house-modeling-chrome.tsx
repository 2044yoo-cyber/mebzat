"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BoxSelect,
  ChevronDown,
  Columns3,
  Copy,
  DoorOpen,
  Footprints,
  Grid3X3,
  HelpCircle,
  Layers3,
  Lock,
  LockOpen,
  LayoutGrid,
  Magnet,
  MoreHorizontal,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  MousePointer2,
  Move,
  Redo2,
  RectangleHorizontal,
  RotateCw,
  Ruler,
  Search,
  Sofa,
  Sparkles,
  Square,
  Trash2,
  Triangle,
  Undo2,
} from "lucide-react";

import { useHouseUnits } from "./house-units";
import { displayLength, modelLength } from "../services/workspace-options";
import { cn } from "@/lib/utils";

import {
  houseCommand,
  searchHouseCommands,
  type HouseCommandCategory,
  type HouseCommandId,
} from "../services/command-registry";
import type { ColumnProposal } from "../services/column-suggestions";
import { calculateHouseQuantities } from "../services/quantities";
import type { HouseProject, HouseSelection, HouseViewState } from "../types/project";

const ribbonCommands: Record<HouseCommandCategory, HouseCommandId[]> = {
  General: ["select", "undo", "redo", "delete"],
  Architecture: ["wall", "door", "window", "floor", "roof", "ceiling", "room", "room-separator", "stair", "railing", "opening", "component", "furniture", "kitchen", "wardrobe"],
  Structure: ["suggest-columns", "column", "beam", "structural-wall", "structural-slab", "foundation", "isolated-footing", "strip-footing", "foundation-slab", "grid", "level", "reference-plane"],
  Modify: ["move", "copy", "rotate", "align", "offset", "trim", "split", "mirror-pick", "array", "join", "unjoin", "scale", "pin", "unpin", "create-similar", "match-type", "delete"],
  Annotate: ["dimension", "text", "room-tag", "tag", "section", "elevation"],
  View: ["floor-plan", "default-3d", "split-view", "view-top", "view-front", "view-back", "view-left", "view-right", "view-isometric", "view-perspective", "visibility", "zoom-fit", "hide", "isolate", "reset-hide"],
  AI: ["ask-ai", "ai-remodel", "generate-facade", "alternatives", "analyze-plan"],
};

const ribbonCategories: HouseCommandCategory[] = ["Architecture", "Modify", "Structure", "Annotate", "View", "AI"];

const icons: Partial<Record<HouseCommandId, React.ComponentType<{ className?: string }>>> = {
  select: MousePointer2,
  undo: Undo2,
  redo: Redo2,
  delete: Trash2,
  wall: Minus,
  room: LayoutGrid,
  door: DoorOpen,
  window: RectangleHorizontal,
  column: Columns3,
  stair: Footprints,
  floor: Square,
  roof: Triangle,
  dimension: Ruler,
  furniture: Sofa,
  grid: Grid3X3,
  move: Move,
  copy: Copy,
  rotate: RotateCw,
  "ai-remodel": Sparkles,
};

/**
 * The tools a beginner actually needs on a phone — one flat row, not the six
 * ribbon categories a desktop user gets. Everything else (Structure, Annotate
 * beyond Dimension, Modify beyond what the context menu already offers, AI)
 * lives behind More, which opens the same command search the desktop "⌘K"
 * does rather than a second tool list to maintain.
 */
const MOBILE_PRIMARY_TOOLS: HouseCommandId[] = [
  "select", "room", "wall", "door", "window", "column", "stair", "floor", "roof", "dimension", "furniture",
];

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
      <div className="hidden min-w-0 items-center gap-1 overflow-x-auto border-b px-2 pt-1.5 lg:flex">
        {ribbonCategories.map((category) => (
          <button key={category} type="button" onClick={() => onCategory(category)} className={cn("shrink-0 border-b-2 px-2 py-2 text-xs font-medium", activeCategory === category ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground")}>{category}</button>
        ))}
        <span className="ml-auto flex shrink-0 gap-1 pb-1">
          <button type="button" onClick={onSearch} aria-label="Command search" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Search className="size-4" /></button>
          <button type="button" onClick={onHelp} aria-label="Keyboard shortcuts" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><HelpCircle className="size-4" /></button>
        </span>
      </div>
      <div className="flex items-center gap-2 p-2 lg:hidden"><select aria-label="Tool category" value={activeCategory} onChange={(event) => onCategory(event.target.value as HouseCommandCategory)} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-xs">{ribbonCategories.map((category) => <option key={category}>{category}</option>)}</select><span className="truncate text-xs text-brand">{houseCommand(activeTool ?? "select").label}</span><button type="button" onClick={onSearch} aria-label="All tools" className="p-2"><Search className="size-4" /></button></div>
      <div className="hidden min-w-0 gap-1 overflow-x-auto p-2 lg:flex">
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

export function HouseMobileTools({ activeTool, selectionCount, onCommand, onMore }: {
  activeTool: HouseCommandId | null; selectionCount: number; onCommand: (id: HouseCommandId) => void; onMore: () => void;
}) {
  return <nav aria-label="Modeling tools" className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] flex max-h-[calc(100dvh-10rem)] w-11 shrink-0 flex-col gap-1 self-start overflow-y-auto rounded-lg border bg-card p-0.5 lg:hidden">{MOBILE_PRIMARY_TOOLS.map((id) => {
    const command = houseCommand(id); const Icon = icons[id] ?? BoxSelect;
    return <button key={id} type="button" aria-label={command.label} title={command.label} aria-pressed={activeTool === id} disabled={Boolean(command.selection && !selectionCount)} onClick={() => onCommand(id)} className={cn("flex min-h-11 shrink-0 flex-col items-center justify-center rounded-md text-muted-foreground active:bg-brand/20 disabled:opacity-30", activeTool === id && "bg-brand/15 text-brand")}><Icon className="size-4" /><span className="text-[8px] leading-3">{command.shortcut ?? command.label.slice(0, 5)}</span></button>;
  })}
  <button type="button" aria-label="More tools" title="More tools" onClick={onMore} className="flex min-h-11 shrink-0 flex-col items-center justify-center rounded-md text-muted-foreground active:bg-brand/20"><MoreHorizontal className="size-4" /><span className="text-[8px] leading-3">More</span></button>
  </nav>;
}

/**
 * The ~48px mobile editing bar from the brief: floor switch, 2D/3D/Split,
 * undo/redo, and a "more" toggle that reveals the secondary rows (units,
 * snap, save, level visibility, tool options) the caller already renders —
 * this component only orchestrates, it does not duplicate that chrome.
 */
export function HouseMobileTopBar({ onBack, backLabel, levels, activeLevelId, onLevel, onAddFloor, view, onView, canUndo, canRedo, onUndo, onRedo, moreOpen, onToggleMore }: {
  onBack?: () => void;
  backLabel?: string;
  levels: { id: string; name: string }[];
  activeLevelId: string;
  onLevel: (id: string) => void;
  onAddFloor?: () => void;
  view: "2d" | "3d" | "split";
  onView: (view: "2d" | "3d" | "split") => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
}) {
  const [floorOpen, setFloorOpen] = useState(false);
  const activeLevel = levels.find((level) => level.id === activeLevelId);
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+0.25rem)] z-30 flex min-w-0 items-center gap-1 rounded-xl border bg-card p-1.5 lg:hidden">
      {onBack ? <button type="button" onClick={onBack} aria-label={backLabel ?? "Back"} title={backLabel ?? "Back"} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft className="size-4" /></button> : null}
      <div className="relative shrink-0">
        <button type="button" onClick={() => setFloorOpen((value) => !value)} aria-expanded={floorOpen} className="flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-muted">
          <span className="max-w-20 truncate">{activeLevel?.name ?? "Floor"}</span>
          <ChevronDown className="size-3.5" />
        </button>
        {floorOpen ? (
          <div role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-32 rounded-lg border bg-card p-1 shadow-lg">
            {levels.map((level) => (
              <button key={level.id} type="button" role="menuitem" onClick={() => { onLevel(level.id); setFloorOpen(false); }} className={cn("block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted", level.id === activeLevelId && "bg-brand/10 text-brand")}>{level.name}</button>
            ))}
            {onAddFloor ? <button type="button" role="menuitem" onClick={() => { onAddFloor(); setFloorOpen(false); }} className="mt-1 block w-full rounded-md border-t px-2 py-1.5 text-left text-xs text-brand hover:bg-muted">+ Add floor</button> : null}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 rounded-lg bg-muted p-0.5 text-[10px] font-medium uppercase">
        {(["2d", "3d", "split"] as const).map((item) => (
          <button key={item} type="button" onClick={() => onView(item)} className={cn("rounded px-2 py-1", view === item ? "bg-background text-brand shadow-sm" : "text-muted-foreground")}>{item === "split" ? "Both" : item}</button>
        ))}
      </div>
      <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><Undo2 className="size-4" /></button>
      <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><Redo2 className="size-4" /></button>
      <button type="button" onClick={onToggleMore} aria-pressed={moreOpen} aria-label="More actions" className={cn("ml-auto shrink-0 rounded-lg p-1.5", moreOpen ? "bg-brand/15 text-brand" : "text-muted-foreground hover:bg-muted")}><MoreHorizontal className="size-4" /></button>
    </div>
  );
}

/** Suggested columns, over the plan: nothing here changes the model until
 * Accept, and nothing at all touches a wall, door or window. */
export function HouseColumnSuggestions({ items, chosen, maxSpan, onSpan, onRegenerate, onAccept, onRemove, onClear }: {
  items: ColumnProposal[];
  chosen: string | null;
  maxSpan: number;
  onSpan: (maxSpan: number) => void;
  onRegenerate: () => void;
  onAccept: (items: ColumnProposal[]) => void;
  onRemove: (item: ColumnProposal) => void;
  onClear: () => void;
}) {
  const picked = items.find((item) => item.id === chosen);
  return (
    <div role="region" aria-label="Suggested columns" className="absolute inset-x-2 bottom-2 z-20 space-y-1.5 rounded-xl border bg-card/95 p-2 text-xs shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <strong>{items.length} column{items.length === 1 ? "" : "s"} suggested</strong>
        <label className="flex items-center gap-1 text-muted-foreground">Max span<select aria-label="Maximum span" value={maxSpan} onChange={(event) => onSpan(Number(event.target.value))} className="rounded-md border bg-background px-1 py-1 text-xs text-foreground">{[3000, 4500, 6000].map((span) => <option key={span} value={span}>{span / 1000} m</option>)}</select></label>
      </div>
      {picked
        ? <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 p-1.5"><span className="min-w-0 flex-1 truncate">Column {items.indexOf(picked) + 1} · {picked.reason}</span><button type="button" onClick={() => onAccept([picked])} className="rounded-md bg-brand px-2 py-1 font-medium text-brand-foreground">Accept</button><button type="button" onClick={() => onRemove(picked)} className="rounded-md border px-2 py-1">Remove</button></div>
        : <p className="text-muted-foreground">Tap one to choose it, drag to move it. Nothing changes until you accept.</p>}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onAccept(items)} className="flex-1 rounded-md bg-brand px-2 py-1.5 font-medium text-brand-foreground">Accept all</button>
        <button type="button" onClick={onRegenerate} className="rounded-md border px-2 py-1.5">Regenerate</button>
        <button type="button" onClick={onClear} className="rounded-md border px-2 py-1.5">Clear</button>
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
  const unit = useHouseUnits();
  const level = project.levels.find((item) => item.id === levelId);
  const numeric = (label: string, key: keyof Pick<HouseToolSettings, "height" | "offset" | "width" | "depth" | "sillHeight">) => (
    <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><span>{label}</span><input type="number" step="any" value={displayLength(settings[key], unit)} onChange={(event) => onChange({ [key]: modelLength(Number(event.target.value), unit) })} className="w-24 rounded-md border bg-background px-2 py-1 text-right text-xs text-foreground" /><span>{unit}</span></label>
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

export function HouseSelectionActions({ selected, locked = false, onToggleLock, onCommand, onMore }: { selected: HouseSelection | null; locked?: boolean; onToggleLock?: () => void; onCommand: (id: HouseCommandId) => void; onMore?: () => void }) {
  if (!selected) return null;
  const commands: HouseCommandId[] = selected.kind === "window" || selected.kind === "door"
    ? ["move", "copy", "flip", "match-type", "delete"]
    : selected.kind === "room" ? ["merge-rooms", "move", "copy", "delete"]
      : ["move", "copy", "rotate", "align", "offset", "split", "delete"];
  return <div className="flex min-w-0 gap-1 overflow-x-auto rounded-lg border bg-background/95 p-1 shadow-sm">{commands.map((id) => <button key={id} type="button" onClick={() => onCommand(id)} className="shrink-0 rounded-md px-2.5 py-2 text-xs hover:bg-muted lg:px-2 lg:py-1 lg:text-[10px]">{id === "match-type" ? "Change Type" : houseCommand(id).label}</button>)}<button type="button" onClick={() => document.getElementById("house-properties")?.scrollIntoView({ behavior: "smooth", block: "nearest" })} className="shrink-0 rounded-md px-2.5 py-2 text-xs hover:bg-muted lg:px-2 lg:py-1 lg:text-[10px]">Properties</button>{onToggleLock ? <button type="button" onClick={onToggleLock} aria-pressed={locked} className={cn("flex shrink-0 items-center gap-1 rounded-md px-2.5 py-2 text-xs hover:bg-muted lg:px-2 lg:py-1 lg:text-[10px]", locked && "text-brand")}>{locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}{locked ? "Unlock" : "Lock"}</button> : null}{onMore ? <button type="button" onClick={onMore} aria-label="More actions for selection" className="shrink-0 rounded-md px-2.5 py-2 text-xs hover:bg-muted lg:px-2 lg:py-1 lg:text-[10px]"><MoreHorizontal className="size-3.5" /></button> : null}</div>;
}

export function HouseStatusBar({ selectionCount, snap, snapEnabled = true, onToggleSnap, level, units, mode, saveState }: { selectionCount: number; snap: string; snapEnabled?: boolean; onToggleSnap?: () => void; level: string; units: string; mode: string; saveState: string }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex min-w-0 items-center gap-3 overflow-x-auto rounded-lg border bg-card/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur md:bottom-2">
      <span className="shrink-0">Selected: <strong className="text-foreground">{selectionCount}</strong></span>
      <button type="button" onClick={onToggleSnap} aria-pressed={snapEnabled} title="Toggle snap to grid, endpoints and intersections" className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5", snapEnabled ? "border-brand/40 bg-brand/10 text-brand" : "border-transparent hover:bg-muted")}><Magnet className="size-3" /> Snap: <strong className={snapEnabled ? "" : "text-muted-foreground line-through"}>{snap}</strong></button>
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
  const commands: HouseCommandId[] = ["move", "delete", "copy", "rotate", "mirror-pick", "duplicate", "create-similar", "match-type", "hide", "isolate", "ai-remodel", "alternatives", "estimate", "boq"];
  return (
    <div className="fixed inset-0 z-[90]" onPointerDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div role="menu" style={window.innerWidth >= 1024 ? { left: Math.max(8, Math.min(state.x, window.innerWidth - 240)), top: Math.max(8, Math.min(state.y, window.innerHeight - 460)) } : undefined} className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+88px)] grid max-h-[48dvh] grid-cols-2 gap-1 overflow-y-auto rounded-xl border bg-card p-2 shadow-xl lg:inset-x-auto lg:bottom-auto lg:block lg:w-56 lg:max-h-[80dvh]" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} className="col-span-2 w-full rounded-lg border p-2 text-xs lg:mb-1">Close actions</button>
        <button type="button" role="menuitem" onClick={() => { onClose(); document.getElementById("house-properties")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="rounded-lg px-3 py-2 text-left text-xs hover:bg-muted">Properties</button>
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
