"use client";

import { useMemo, useState } from "react";
import { Star, X } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  COLUMN_SHAPES,
  COLUMN_SIZES,
  DOOR_TYPES,
  OBJECT_CATEGORIES,
  OBJECT_LIBRARY,
  WINDOW_TYPES,
  objectDefinition,
  searchObjects,
  type ColumnShape,
  type ObjectCategory,
  type ObjectDefinition,
} from "../services/object-library";
import { STAIR_TYPES, fitStairs, stairGeometry, stairPreset, type StairParams } from "../services/stair-geometry";
import { DoorSymbol, ObjectSymbol, StairSymbol, WindowSymbol } from "./plan-symbols";

export type LibraryKind = "furniture" | "stair" | "door" | "window" | "column";
export type LibraryChoice =
  | { kind: "object"; definition: ObjectDefinition }
  | { kind: "stair"; params: StairParams; rotation: number; at?: { x: number; y: number } }
  | { kind: "door"; style: string; width: number }
  | { kind: "window"; style: string; width: number; height: number; sill: number }
  | { kind: "column"; shape: ColumnShape; width: number; depth: number };

const TITLES: Record<LibraryKind, string> = { furniture: "Furniture", stair: "Stairs", door: "Doors", window: "Windows", column: "Columns" };
const STORE = "medosha:house:objects";

/** Recently used and favourites live on this device: a convenience, not project data. */
function readStore(): { recent: string[]; favourites: string[] } {
  try { const value = JSON.parse(window.localStorage.getItem(STORE) ?? "{}"); return { recent: Array.isArray(value.recent) ? value.recent : [], favourites: Array.isArray(value.favourites) ? value.favourites : [] }; } catch { return { recent: [], favourites: [] }; }
}
function writeStore(value: { recent: string[]; favourites: string[] }) { try { window.localStorage.setItem(STORE, JSON.stringify(value)); } catch { /* private window: nothing kept */ } }

export function rememberObject(id: string) {
  const store = readStore();
  writeStore({ ...store, recent: [id, ...store.recent.filter((item) => item !== id)].slice(0, 8) });
}

/**
 * The object library, as a bottom sheet over the plan: chosen, it closes and
 * the object follows the finger until it is put down.
 */
/** A space for a stair: typed, a selected room's, or drawn on the plan (then it has a centre). */
export type StairSpace = { width: number; length: number; x?: number; y?: number };

export function ObjectLibrarySheet({ kind, floorHeight, space, onChoose, onClose, onDrawSpace }: { kind: LibraryKind; floorHeight: number; space?: StairSpace | null; onChoose: (choice: LibraryChoice) => void; onClose: () => void; onDrawSpace?: () => void }) {
  return (
    <section role="dialog" aria-label={`${TITLES[kind]} library`} className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[70vh] w-full max-w-2xl flex-col rounded-t-2xl border bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl">
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
      </div>
      <div className="flex items-center gap-2 px-3 pb-1">
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-widest">{TITLES[kind]}</h3>
        <button type="button" onClick={onClose} aria-label="Close library" className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {kind === "furniture" ? <FurniturePanel onChoose={onChoose} />
          : kind === "stair" ? <StairPanel floorHeight={floorHeight} space={space ?? null} onChoose={onChoose} onDrawSpace={onDrawSpace} />
            : kind === "door" ? <Cards items={DOOR_TYPES.map((item) => ({ id: item.id, name: item.name, size: `${item.width} wide`, preview: <DoorPreview style={item.id} />, choose: () => onChoose({ kind: "door", style: item.id, width: item.width }) }))} />
              : kind === "window" ? <Cards items={WINDOW_TYPES.map((item) => ({ id: item.id, name: item.name, size: `${item.width} × ${item.height}`, preview: <WindowPreview style={item.id} />, choose: () => onChoose({ kind: "window", style: item.id, width: item.width, height: item.height, sill: item.sill }) }))} />
                : <ColumnPanel onChoose={onChoose} />}
      </div>
    </section>
  );
}

type Card = { id: string; name: string; size: string; preview: React.ReactNode; choose: () => void; favourite?: { on: boolean; toggle: () => void } };

function Cards({ items }: { items: Card[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.id} className="relative">
          <button type="button" onClick={item.choose} aria-label={item.name} className="flex w-full flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-center text-[11px] leading-tight hover:bg-muted/50">
            <span className="flex h-12 w-full items-center justify-center text-slate-700 dark:text-slate-200">{item.preview}</span>
            <span className="line-clamp-2 font-medium">{item.name}</span>
            <span className="text-[10px] text-muted-foreground">{item.size}</span>
          </button>
          {item.favourite ? <button type="button" onClick={item.favourite.toggle} aria-label={`${item.favourite.on ? "Remove" : "Add"} ${item.name} ${item.favourite.on ? "from" : "to"} favourites`} aria-pressed={item.favourite.on} className="absolute right-0 top-0 flex size-8 items-center justify-center"><Star className={cn("size-3.5", item.favourite.on ? "fill-amber-400 text-amber-500" : "text-muted-foreground/50")} /></button> : null}
        </div>
      ))}
    </div>
  );
}

function Preview({ width, depth, children }: { width: number; depth: number; children: React.ReactNode }) {
  const pad = Math.max(width, depth) * 0.12;
  return <svg aria-hidden viewBox={`${-width / 2 - pad} ${-depth / 2 - pad} ${width + 2 * pad} ${depth + 2 * pad}`} className="size-12">{children}</svg>;
}

const objectPreview = (definition: ObjectDefinition) => <Preview width={definition.width * (definition.symbol === "dining-table" || definition.symbol === "meeting-table" || definition.symbol === "round-table" ? 1.6 : 1)} depth={definition.depth * (definition.symbol === "dining-table" || definition.symbol === "meeting-table" || definition.symbol === "round-table" ? 2 : 1)}><ObjectSymbol definition={definition} width={definition.width} depth={definition.depth} /></Preview>;

function FurniturePanel({ onChoose }: { onChoose: (choice: LibraryChoice) => void }) {
  const [query, setQuery] = useState("");
  const [store, setStore] = useState(readStore);
  const [category, setCategory] = useState<ObjectCategory | "recent" | "favourites">(() => (readStore().recent.length ? "recent" : "living"));
  const toggle = (id: string) => { const next = { ...store, favourites: store.favourites.includes(id) ? store.favourites.filter((item) => item !== id) : [...store.favourites, id] }; writeStore(next); setStore(next); };
  const items = useMemo(() => {
    if (query.trim()) return searchObjects(query);
    if (category === "recent") return store.recent.map(objectDefinition).filter((item): item is ObjectDefinition => Boolean(item));
    if (category === "favourites") return store.favourites.map(objectDefinition).filter((item): item is ObjectDefinition => Boolean(item));
    return OBJECT_LIBRARY.filter((item) => item.category === category);
  }, [query, category, store]);
  const tabs: { id: typeof category; name: string }[] = [{ id: "recent", name: "Recently used" }, { id: "favourites", name: "Favourites" }, ...OBJECT_CATEGORIES];
  return (
    <div className="space-y-2">
      <input aria-label="Search objects" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search objects…" className="min-h-10 w-full rounded-lg border bg-background px-3 text-sm" />
      {!query.trim() ? (
        <div role="tablist" aria-label="Categories" className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5">
          {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={category === tab.id} onClick={() => setCategory(tab.id)} className={cn("min-h-9 shrink-0 rounded-full border px-3 text-xs", category === tab.id ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/50")}>{tab.name}</button>)}
        </div>
      ) : null}
      {items.length ? <Cards items={items.map((item) => ({ id: item.id, name: item.name, size: `${item.width} × ${item.depth}`, preview: objectPreview(item), choose: () => { rememberObject(item.id); onChoose({ kind: "object", definition: item }); }, favourite: { on: store.favourites.includes(item.id), toggle: () => toggle(item.id) } }))} />
        : <p className="py-4 text-center text-xs text-muted-foreground">{category === "favourites" ? "Tap ☆ on an object to keep it here." : category === "recent" ? "Objects you place show here." : "Nothing matches."}</p>}
    </div>
  );
}

function StairPanel({ floorHeight, space, onChoose, onDrawSpace }: { floorHeight: number; space: StairSpace | null; onChoose: (choice: LibraryChoice) => void; onDrawSpace?: () => void }) {
  const [width, setWidth] = useState(String(space?.width ?? 2800));
  const [length, setLength] = useState(String(space?.length ?? 4500));
  const [height, setHeight] = useState(String(floorHeight));
  // A space just drawn on the plan is answered straight away.
  const drawn = space && space.x !== undefined && space.y !== undefined ? { x: space.x, y: space.y } : null;
  const [fits, setFits] = useState<ReturnType<typeof fitStairs> | null>(() => (drawn && space ? fitStairs(space, floorHeight) : null));
  const read = (value: string) => Number(value.replace(",", "."));
  return (
    <div className="space-y-3">
      <Cards items={STAIR_TYPES.map((type) => {
        const params = stairPreset(type.id, floorHeight);
        const geometry = stairGeometry(params);
        return { id: type.id, name: type.name, size: `${geometry.width} × ${geometry.length}`, preview: <Preview width={geometry.width} depth={geometry.length}><StairSymbol geometry={geometry} label={false} /></Preview>, choose: () => onChoose({ kind: "stair", params, rotation: 0 }) };
      })} />
      <form aria-label="Auto fit stair" className="space-y-2 rounded-xl border p-2" onSubmit={(event) => { event.preventDefault(); const h = read(height); if (read(width) > 0 && read(length) > 0 && h > 0) setFits(fitStairs({ width: read(width), length: read(length) }, h)); }}>
        <p className="text-xs font-semibold">Auto fit stair</p>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground">
          <label>Space width (mm)<input aria-label="Space width" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} className="mt-0.5 min-h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" /></label>
          <label>Space length (mm)<input aria-label="Space length" inputMode="decimal" value={length} onChange={(event) => setLength(event.target.value)} className="mt-0.5 min-h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" /></label>
          <label>Floor height (mm)<input aria-label="Floor-to-floor height" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} className="mt-0.5 min-h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" /></label>
        </div>
        <div className="flex gap-1.5">
          <button type="submit" className="min-h-10 flex-1 rounded-lg bg-brand text-sm font-semibold text-brand-foreground">Find stairs that fit</button>
          {onDrawSpace ? <button type="button" onClick={onDrawSpace} className="min-h-10 rounded-lg border px-3 text-sm">Draw the space</button> : null}
        </div>
        {drawn ? <p className="text-[11px] text-muted-foreground">Drawn on the plan: {space!.width} × {space!.length} mm. A stair chosen here is placed in it.</p> : null}
        {fits ? (fits.length ? (
          <div role="list" aria-label="Stairs that fit" className="space-y-1">
            {fits.map((fit) => {
              const name = STAIR_TYPES.find((type) => type.id === fit.params.type)!.name;
              return <button key={fit.params.type} type="button" role="listitem" onClick={() => onChoose({ kind: "stair", params: fit.params, rotation: fit.rotated ? 90 : 0, at: drawn && Number(width) === space!.width && Number(length) === space!.length ? drawn : undefined })} className="flex w-full items-center gap-2 rounded-lg border p-1.5 text-left text-xs hover:bg-muted/50">
                <span className="text-slate-700 dark:text-slate-200"><Preview width={fit.width} depth={fit.length}><StairSymbol geometry={stairGeometry(fit.params)} label={false} /></Preview></span>
                <span><strong>{name}</strong><br />{fit.width} × {fit.length} mm{fit.rotated ? " · turned 90°" : ""} · {fit.params.risers} risers of {(fit.params.height / fit.params.risers).toFixed(1)} · treads {fit.params.treadDepth} · {fit.params.stairWidth} wide</span>
              </button>;
            })}
          </div>
        ) : <p role="status" className="text-xs text-muted-foreground">No stair fits that space for this floor height.</p>) : null}
      </form>
    </div>
  );
}

function ColumnPanel({ onChoose }: { onChoose: (choice: LibraryChoice) => void }) {
  const [shape, setShape] = useState<ColumnShape>("square");
  const [width, setWidth] = useState("300");
  const [depth, setDepth] = useState("300");
  const read = (value: string) => Number(value.replace(",", "."));
  const place = (w: number, d: number) => onChoose({ kind: "column", shape, width: w, depth: shape === "rectangular" ? d : w });
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Column shape" className="flex gap-1">
        {COLUMN_SHAPES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={shape === item.id} onClick={() => setShape(item.id)} className={cn("min-h-10 flex-1 rounded-lg border px-2 text-xs", shape === item.id ? "border-brand bg-brand/10 text-brand" : "")}>{item.name}</button>)}
      </div>
      <div className="flex flex-wrap gap-1">
        {COLUMN_SIZES.filter(([w, d]) => shape === "rectangular" || w === d).map(([w, d]) => <button key={`${w}x${d}`} type="button" onClick={() => place(w, d)} className="min-h-10 rounded-lg border px-3 text-xs">{shape === "circular" ? `Ø ${w}` : `${w}×${d}`}</button>)}
      </div>
      <form aria-label="Custom column" className="flex items-end gap-1.5 text-[10px] text-muted-foreground" onSubmit={(event) => { event.preventDefault(); if (read(width) > 0 && read(depth) > 0) place(read(width), read(depth)); }}>
        <label className="flex-1">{shape === "circular" ? "Diameter" : "Width"} (mm)<input aria-label={shape === "circular" ? "Column diameter" : "Column width"} inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} className="mt-0.5 min-h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" /></label>
        {shape === "rectangular" ? <label className="flex-1">Depth (mm)<input aria-label="Column depth" inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} className="mt-0.5 min-h-10 w-full rounded-lg border bg-background px-2 text-sm text-foreground" /></label> : null}
        <button type="submit" className="min-h-10 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground">Place</button>
      </form>
    </div>
  );
}

function DoorPreview({ style }: { style: string }) {
  return <svg aria-hidden viewBox="-200 -1100 1400 1300" className="size-12"><line x1={-200} y1={0} x2={0} y2={0} stroke="currentColor" strokeWidth={100} /><line x1={1000} y1={0} x2={1200} y2={0} stroke="currentColor" strokeWidth={100} /><DoorSymbol from={{ x: 0, y: 0 }} to={{ x: 1000, y: 0 }} side={{ x: 0, y: -1 }} hingeAtFrom style={style} thickness={100} /></svg>;
}

function WindowPreview({ style }: { style: string }) {
  return <svg aria-hidden viewBox="-200 -700 1400 900" className="size-12"><line x1={-200} y1={0} x2={0} y2={0} stroke="currentColor" strokeWidth={150} /><line x1={1000} y1={0} x2={1200} y2={0} stroke="currentColor" strokeWidth={150} /><WindowSymbol from={{ x: 0, y: 0 }} to={{ x: 1000, y: 0 }} side={{ x: 0, y: 1 }} style={style} thickness={150} /></svg>;
}
