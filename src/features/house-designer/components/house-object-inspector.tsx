"use client";

import type { ReactNode } from "react";

import { patchHouseObject, type HousePatch } from "../services/project-edit";
import {
  facadeElementTypes,
  roofTypes,
  stairTypes,
  type HouseProject,
  type HouseSelection,
} from "../types/project";

export function HouseObjectInspector({
  project,
  activeLevelId,
  selected,
  onSelect,
  onChange,
}: {
  project: HouseProject;
  activeLevelId: string;
  selected: HouseSelection | null;
  onSelect: (selection: HouseSelection | null) => void;
  onChange: (project: HouseProject) => void;
}) {
  const options = objectOptions(project, activeLevelId);
  const value = selected ? selectionValue(selected) : "";
  const patch = (change: HousePatch) => {
    if (selected) onChange(patchHouseObject(project, selected, change));
  };

  return (
    <aside className="min-w-0 space-y-3 rounded-xl border bg-card p-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand">Object inspector</p>
        <h3 className="mt-0.5 font-semibold">Exact dimensions</h3>
      </div>

      <label className="block space-y-1.5 text-xs text-muted-foreground">
        <span>Object</span>
        <select
          value={value}
          onChange={(event) => onSelect(parseSelection(event.target.value))}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
        >
          <option value="">Tap an object in 3D</option>
          {options.map((option) => (
            <option key={selectionValue(option.selection)} value={selectionValue(option.selection)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        <InspectorFields project={project} selected={selected} onPatch={patch} />
      ) : (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          Tap a wall, opening, stair, slab, roof or exterior object—or choose one above—to edit its exact millimetre values.
        </p>
      )}
    </aside>
  );
}

function InspectorFields({
  project,
  selected,
  onPatch,
}: {
  project: HouseProject;
  selected: HouseSelection;
  onPatch: (patch: HousePatch) => void;
}) {
  if (selected.kind === "level") {
    const item = project.levels.find((level) => level.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title={item.name}>
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <NumberInput label="Floor height" value={item.floorToFloorHeight} min={1800} max={8000} onChange={(floorToFloorHeight) => onPatch({ floorToFloorHeight })} />
      </FieldGrid>
    );
  }

  if (selected.kind === "wall") {
    const item = project.walls.find((wall) => wall.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Wall">
        <NumberInput label="Length" value={Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y)} min={200} max={100000} onChange={(length) => onPatch({ length })} />
        <NumberInput label="Start X" value={item.start.x} min={-100000} max={100000} onChange={(startX) => onPatch({ startX })} />
        <NumberInput label="Start Y" value={item.start.y} min={-100000} max={100000} onChange={(startY) => onPatch({ startY })} />
        <NumberInput label="End X" value={item.end.x} min={-100000} max={100000} onChange={(endX) => onPatch({ endX })} />
        <NumberInput label="End Y" value={item.end.y} min={-100000} max={100000} onChange={(endY) => onPatch({ endY })} />
        <NumberInput label="Thickness" value={item.thickness} min={50} max={1000} onChange={(thickness) => onPatch({ thickness })} />
        <NumberInput label="Height" value={item.height} min={1200} max={8000} onChange={(height) => onPatch({ height })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "room") {
    const item = project.rooms.find((room) => room.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Room / interior finishes">
        <TextInput label="Name" value={item.name} onChange={(name) => onPatch({ name })} wide />
        <TextInput label="Floor material" value={item.floorMaterial} onChange={(floorMaterial) => onPatch({ floorMaterial })} wide />
        <TextInput label="Wall finish" value={item.wallMaterial} onChange={(wallMaterial) => onPatch({ wallMaterial })} wide />
        <TextInput label="Ceiling finish" value={item.ceilingMaterial} onChange={(ceilingMaterial) => onPatch({ ceilingMaterial })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "door" || selected.kind === "window") {
    const items = selected.kind === "door" ? project.doors : project.windows;
    const item = items.find((opening) => opening.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title={selected.kind === "door" ? "Door" : "Window"}>
        <NumberInput label="Width" value={item.width} min={200} max={6000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Height" value={item.height} min={200} max={5000} onChange={(height) => onPatch({ height })} />
        <NumberInput label="Wall offset" value={item.offset} min={0} max={100000} onChange={(offset) => onPatch({ offset })} />
        <NumberInput label="Sill height" value={item.sillHeight} min={0} max={5000} onChange={(sillHeight) => onPatch({ sillHeight })} />
        <TextInput label="Style" value={item.style} onChange={(style) => onPatch({ style })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} />
      </FieldGrid>
    );
  }

  if (selected.kind === "stair") {
    const item = project.stairs.find((stair) => stair.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Stair">
        <SelectInput label="Type" value={item.type} options={stairTypes} onChange={(type) => onPatch({ type })} wide />
        <NumberInput label="X" value={item.x} min={-100000} max={100000} onChange={(x) => onPatch({ x })} />
        <NumberInput label="Y" value={item.y} min={-100000} max={100000} onChange={(y) => onPatch({ y })} />
        <NumberInput label="Width" value={item.width} min={500} max={5000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Length" value={item.length} min={800} max={15000} onChange={(length) => onPatch({ length })} />
        <NumberInput label="Rise" value={item.height} min={1000} max={10000} onChange={(height) => onPatch({ height })} />
        <NumberInput label="Rotation" value={item.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => onPatch({ rotation })} />
        <NumberInput label="Steps" value={item.steps} min={3} max={40} step={1} suffix="" onChange={(steps) => onPatch({ steps: Math.round(steps) })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "column") {
    const item = project.structuralColumns.find((column) => column.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Preliminary column">
        <NumberInput label="X" value={item.x} min={-100000} max={100000} onChange={(x) => onPatch({ x })} />
        <NumberInput label="Y" value={item.y} min={-100000} max={100000} onChange={(y) => onPatch({ y })} />
        <NumberInput label="Width" value={item.width} min={100} max={3000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Depth" value={item.depth} min={100} max={3000} onChange={(depth) => onPatch({ depth })} />
        <NumberInput label="Height" value={item.height} min={500} max={12000} onChange={(height) => onPatch({ height })} />
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <TextInput label="Type" value={item.type} onChange={(type) => onPatch({ type })} wide />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "beam") {
    const item = project.structuralBeams.find((beam) => beam.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Preliminary beam">
        <NumberInput label="Start X" value={item.start.x} min={-100000} max={100000} onChange={(startX) => onPatch({ startX })} />
        <NumberInput label="Start Y" value={item.start.y} min={-100000} max={100000} onChange={(startY) => onPatch({ startY })} />
        <NumberInput label="End X" value={item.end.x} min={-100000} max={100000} onChange={(endX) => onPatch({ endX })} />
        <NumberInput label="End Y" value={item.end.y} min={-100000} max={100000} onChange={(endY) => onPatch({ endY })} />
        <NumberInput label="Width" value={item.width} min={100} max={3000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Depth" value={item.depth} min={100} max={3000} onChange={(depth) => onPatch({ depth })} />
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "grid") {
    const item = project.structuralGrid.find((grid) => grid.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title={`Structural grid · ${item.axis.toUpperCase()} axis`}>
        <TextInput label="Label" value={item.label} onChange={(label) => onPatch({ label })} wide />
        <NumberInput label="Position" value={item.position} min={-100000} max={100000} onChange={(position) => onPatch({ position })} />
        <NumberInput label="Start X" value={item.start.x} min={-100000} max={100000} onChange={(startX) => onPatch({ startX })} />
        <NumberInput label="Start Y" value={item.start.y} min={-100000} max={100000} onChange={(startY) => onPatch({ startY })} />
        <NumberInput label="End X" value={item.end.x} min={-100000} max={100000} onChange={(endX) => onPatch({ endX })} />
        <NumberInput label="End Y" value={item.end.y} min={-100000} max={100000} onChange={(endY) => onPatch({ endY })} />
      </FieldGrid>
    );
  }

  if (selected.kind === "facade") {
    const item = project.facadeElements.find((element) => element.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Façade element">
        <SelectInput label="Type" value={item.type} options={facadeElementTypes} onChange={(type) => onPatch({ type })} wide />
        <NumberInput label="Wall offset" value={item.offset} min={0} max={100000} onChange={(offset) => onPatch({ offset })} />
        <NumberInput label="Elevation" value={item.elevation} min={0} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <NumberInput label="Width" value={item.width} min={20} max={100000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Height" value={item.height} min={20} max={20000} onChange={(height) => onPatch({ height })} />
        <NumberInput label="Depth" value={item.depth} min={10} max={5000} onChange={(depth) => onPatch({ depth })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
        <TextInput label="Colour" value={item.color} onChange={(color) => onPatch({ color })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "slab") {
    const item = project.slabs.find((slab) => slab.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Slab">
        <NumberInput label="Thickness" value={item.thickness} min={50} max={1000} onChange={(thickness) => onPatch({ thickness })} />
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "balcony") {
    const item = project.balconies.find((balcony) => balcony.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Balcony">
        <NumberInput label="X" value={item.x} min={-100000} max={100000} onChange={(x) => onPatch({ x })} />
        <NumberInput label="Y" value={item.y} min={-100000} max={100000} onChange={(y) => onPatch({ y })} />
        <NumberInput label="Width" value={item.width} min={300} max={20000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Depth" value={item.depth} min={300} max={10000} onChange={(depth) => onPatch({ depth })} />
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <NumberInput label="Thickness" value={item.thickness} min={50} max={1000} onChange={(thickness) => onPatch({ thickness })} />
        <NumberInput label="Rotation" value={item.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => onPatch({ rotation })} />
        <NumberInput label="Railing height" value={item.railingHeight} min={0} max={3000} onChange={(railingHeight) => onPatch({ railingHeight })} />
        <TextInput label="Railing material" value={item.railingMaterial} onChange={(railingMaterial) => onPatch({ railingMaterial })} wide />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "veranda") {
    const item = project.verandas.find((veranda) => veranda.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Veranda">
        <NumberInput label="X" value={item.x} min={-100000} max={100000} onChange={(x) => onPatch({ x })} />
        <NumberInput label="Y" value={item.y} min={-100000} max={100000} onChange={(y) => onPatch({ y })} />
        <NumberInput label="Width" value={item.width} min={300} max={20000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Depth" value={item.depth} min={300} max={10000} onChange={(depth) => onPatch({ depth })} />
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <NumberInput label="Thickness" value={item.thickness} min={50} max={1000} onChange={(thickness) => onPatch({ thickness })} />
        <NumberInput label="Rotation" value={item.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => onPatch({ rotation })} />
        <NumberInput label="Canopy height" value={item.canopyHeight} min={1800} max={6000} onChange={(canopyHeight) => onPatch({ canopyHeight })} />
        <TextInput label="Canopy material" value={item.canopyMaterial} onChange={(canopyMaterial) => onPatch({ canopyMaterial })} wide />
        <TextInput label="Post material" value={item.postMaterial} onChange={(postMaterial) => onPatch({ postMaterial })} wide />
        <TextInput label="Floor material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "ceiling") {
    const item = project.ceilings.find((ceiling) => ceiling.id === selected.id);
    if (!item) return <Missing />;
    return (
      <FieldGrid title="Ceiling">
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <NumberInput label="Thickness" value={item.thickness} min={3} max={500} onChange={(thickness) => onPatch({ thickness })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  if (selected.kind === "site") {
    const item = project.site?.id === selected.id ? project.site : null;
    if (!item) return <Missing />;
    const bounds = boundaryBounds(item.boundary);
    return (
      <FieldGrid title="Site / ground">
        <NumberInput label="Centre X" value={(bounds.minX + bounds.maxX) / 2} min={-100000} max={100000} onChange={(x) => onPatch({ x })} />
        <NumberInput label="Centre Y" value={(bounds.minY + bounds.maxY) / 2} min={-100000} max={100000} onChange={(y) => onPatch({ y })} />
        <NumberInput label="Width" value={bounds.maxX - bounds.minX} min={1000} max={200000} onChange={(width) => onPatch({ width })} />
        <NumberInput label="Depth" value={bounds.maxY - bounds.minY} min={1000} max={200000} onChange={(depth) => onPatch({ depth })} />
        <NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} />
        <NumberInput label="Thickness" value={item.thickness} min={20} max={5000} onChange={(thickness) => onPatch({ thickness })} />
        <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
      </FieldGrid>
    );
  }

  const item = project.roofs.find((roof) => roof.id === selected.id);
  if (!item) return <Missing />;
  return (
    <FieldGrid title="Roof">
      <SelectInput
        label="Type"
        value={item.type}
        options={roofTypes}
        onChange={(type) => onPatch({ type, slope: type === "flat" ? 0 : item.slope || 25 })}
        wide
      />
      <NumberInput label="Elevation" value={item.elevation} min={0} max={50000} onChange={(elevation) => onPatch({ elevation })} />
      <NumberInput label="Height" value={item.height} min={100} max={8000} onChange={(height) => onPatch({ height })} />
      <NumberInput label="Slope" value={item.slope} min={0} max={60} suffix="°" onChange={(slope) => onPatch({ slope })} />
      <NumberInput label="Overhang" value={item.overhang} min={0} max={3000} onChange={(overhang) => onPatch({ overhang })} />
      <NumberInput label="Thickness" value={item.thickness} min={30} max={1000} onChange={(thickness) => onPatch({ thickness })} />
      <TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide />
    </FieldGrid>
  );
}

function FieldGrid({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function NumberInput({ label, value, min, max, step = 0.1, suffix = "mm", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="flex rounded-lg border bg-background px-2">
        <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(clamp(next, min, max)); }} className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm tabular-nums text-foreground outline-none" />
        {suffix ? <span className="ml-1 self-center">{suffix}</span> : null}
      </span>
    </label>
  );
}

function TextInput({ label, value, onChange, wide = false }: { label: string; value: string; onChange: (value: string) => void; wide?: boolean }) {
  return (
    <label className={wide ? "col-span-2 space-y-1 text-[11px] text-muted-foreground" : "space-y-1 text-[11px] text-muted-foreground"}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand" />
    </label>
  );
}

function SelectInput<T extends string>({ label, value, options, onChange, wide = false }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void; wide?: boolean }) {
  return (
    <label className={wide ? "col-span-2 space-y-1 text-[11px] text-muted-foreground" : "space-y-1 text-[11px] text-muted-foreground"}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm capitalize text-foreground outline-none focus:border-brand">
        {options.map((option) => <option key={option} value={option}>{option.replace("-", " ")}</option>)}
      </select>
    </label>
  );
}

function Missing() {
  return <p className="text-xs text-muted-foreground">This object is no longer available.</p>;
}

function objectOptions(project: HouseProject, levelId: string) {
  const options: { label: string; selection: HouseSelection }[] = [];
  const level = project.levels.find((item) => item.id === levelId);
  if (level) options.push({ label: level.name, selection: { kind: "level", id: level.id } });
  addOptions(options, project.rooms.filter((item) => item.levelId === levelId), "room", "Room");
  addOptions(options, project.walls.filter((item) => item.levelId === levelId), "wall", "Wall");
  addOptions(options, project.doors.filter((item) => item.levelId === levelId), "door", "Door");
  addOptions(options, project.windows.filter((item) => item.levelId === levelId), "window", "Window");
  addOptions(options, project.stairs.filter((item) => item.levelId === levelId), "stair", "Stair");
  addOptions(options, project.structuralColumns.filter((item) => item.levelId === levelId), "column", "Column");
  addOptions(options, project.structuralBeams.filter((item) => item.levelId === levelId), "beam", "Beam");
  addOptions(options, project.structuralGrid.filter((item) => item.levelId === levelId), "grid", "Grid");
  addOptions(options, project.slabs.filter((item) => item.levelId === levelId), "slab", "Slab");
  addOptions(options, project.roofs.filter((item) => item.levelId === levelId), "roof", "Roof");
  addOptions(options, project.balconies.filter((item) => item.levelId === levelId), "balcony", "Balcony");
  addOptions(options, project.verandas.filter((item) => item.levelId === levelId), "veranda", "Veranda");
  addOptions(options, project.ceilings.filter((item) => item.levelId === levelId), "ceiling", "Ceiling");
  addOptions(options, project.facadeElements.filter((item) => item.levelId === levelId), "facade", "Façade element");
  if (project.site?.levelId === levelId) options.push({ label: "Site / ground", selection: { kind: "site", id: project.site.id } });
  return options;
}

function addOptions(options: { label: string; selection: HouseSelection }[], items: { id: string }[], kind: HouseSelection["kind"], label: string) {
  items.forEach((item, index) => options.push({ label: `${label} ${index + 1}`, selection: { kind, id: item.id } }));
}

function selectionValue(selection: HouseSelection) {
  return `${selection.kind}|${selection.id}`;
}

function parseSelection(value: string): HouseSelection | null {
  if (!value) return null;
  const separator = value.indexOf("|");
  if (separator < 0) return null;
  return { kind: value.slice(0, separator) as HouseSelection["kind"], id: value.slice(separator + 1) };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function boundaryBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
