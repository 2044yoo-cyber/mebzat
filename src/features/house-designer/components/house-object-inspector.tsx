"use client";

import { pitchedRise } from "./house-preview";
import { useHouseUnits } from "./house-units";
import { displayLength, modelLength, unitScale } from "../services/workspace-options";

import { useState, type ReactNode } from "react";

import { patchHouseObject, type HousePatch } from "../services/project-edit";
import { duplicateHouseType, setHouseObjectType, updateHouseType } from "../services/model-commands";
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
  selections = selected ? [selected] : [],
  onSelect,
  onChange,
}: {
  project: HouseProject;
  activeLevelId: string;
  selected: HouseSelection | null;
  selections?: readonly HouseSelection[];
  onSelect: (selection: HouseSelection | null) => void;
  onChange: (project: HouseProject) => void;
}) {
  const options = objectOptions(project, activeLevelId);
  const value = selected ? selectionValue(selected) : "";
  const patch = (change: HousePatch) => {
    if (selected) onChange(patchHouseObject(project, selected, change));
  };

  return (
    <aside id="house-properties" className="min-w-0 space-y-3 rounded-xl border bg-card p-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand">Properties</p>
        <h3 className="mt-0.5 font-semibold">{selections.length > 1 ? "Common Properties" : selected ? `${propertyTitle(selected.kind)} Properties` : "View Properties"}</h3>
        {selections.length > 1 ? <p className="text-xs text-muted-foreground">{selections.length} objects selected</p> : null}
      </div>

      <label className="block space-y-1.5 text-xs text-muted-foreground">
        <span>Object</span>
        <select
          value={value}
          onChange={(event) => onSelect(parseSelection(event.target.value))}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
        >
          <option value="">Select a model object</option>
          {options.map((option) => (
            <option key={selectionValue(option.selection)} value={selectionValue(option.selection)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {selected ? (
        selections.length > 1 ? <MultiSelectionFields project={project} selections={selections} onChange={onChange} /> : <><TypeInstanceFields project={project} selected={selected} selections={selections} onChange={onChange} /><InspectorFields project={project} selected={selected} onPatch={patch} /></>
      ) : (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3 text-xs"><span className="text-muted-foreground">View</span><strong>Floor Plan</strong><span className="text-muted-foreground">Level</span><strong>{project.levels.find((item) => item.id === activeLevelId)?.name ?? "—"}</strong><span className="text-muted-foreground">Units</span><strong>{project.units}</strong><span className="text-muted-foreground">Detail</span><strong>Medium</strong></div>
      )}
    </aside>
  );
}

function MultiSelectionFields({ project, selections, onChange }: { project: HouseProject; selections: readonly HouseSelection[]; onChange: (project: HouseProject) => void }) {
  const commonKind = selections.every((item) => item.kind === selections[0]?.kind) ? selections[0]?.kind : null;
  const types = commonKind ? project.objectTypes.filter((item) => item.kind === commonKind) : [];
  const typeIds = new Set(selections.map((item) => project.objectInstances[item.id]?.typeId ?? null));
  const allPinned = selections.every((item) => project.objectInstances[item.id]?.pinned);
  function pin(pinned: boolean) {
    const objectInstances = { ...project.objectInstances };
    for (const selection of selections) objectInstances[selection.id] = { ...(objectInstances[selection.id] ?? { typeId: null, mark: "", pinned: false, groupId: null, flipped: false, properties: {} }), pinned };
    onChange({ ...project, objectInstances });
  }
  return <div className="space-y-2 border-t pt-3"><p className="text-xs text-muted-foreground">Editing {selections.length} selected objects{commonKind ? ` · ${propertyTitle(commonKind)}` : ""}</p>{types.length ? <label className="block space-y-1 text-[11px] text-muted-foreground"><span>Common type</span><select value={typeIds.size === 1 ? [...typeIds][0] ?? "" : ""} onChange={(event) => onChange(setHouseObjectType(project, selections, event.target.value))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"><option value="" disabled>{typeIds.size === 1 ? "Choose type" : "Multiple types"}</option>{types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<label className="flex items-center gap-2 rounded-lg border p-2 text-xs"><input type="checkbox" checked={allPinned} onChange={(event) => pin(event.target.checked)} />Pinned</label></div>;
}

function propertyTitle(kind: HouseSelection["kind"]) {
  return kind.split("-").map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}

function TypeInstanceFields({ project, selected, selections, onChange }: { project: HouseProject; selected: HouseSelection; selections: readonly HouseSelection[]; onChange: (project: HouseProject) => void }) {
  const [showType, setShowType] = useState(false);
  const instance = project.objectInstances[selected.id];
  const available = project.objectTypes.filter((item) => item.kind === selected.kind);
  const type = available.find((item) => item.id === instance?.typeId) ?? null;

  function patchInstance(change: Partial<NonNullable<typeof instance>>) {
    const current = project.objectInstances[selected.id] ?? { typeId: null, mark: "", pinned: false, groupId: null, flipped: false, properties: {} };
    onChange({ ...project, objectInstances: { ...project.objectInstances, [selected.id]: { ...current, ...change } } });
  }

  function duplicateType() {
    if (!type) return;
    const name = window.prompt("New type name", `${type.name} Copy`);
    if (name === null) return;
    const result = duplicateHouseType(project, type.id, name);
    onChange(setHouseObjectType(result.project, selections, result.typeId));
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Type + Instance</p>{type ? <button type="button" onClick={() => setShowType((value) => !value)} className="text-[11px] font-medium text-brand">{showType ? "Hide type" : "Edit type"}</button> : null}</div>
      {available.length ? <label className="block space-y-1 text-[11px] text-muted-foreground"><span>Type</span><select value={type?.id ?? ""} onChange={(event) => onChange(setHouseObjectType(project, selections, event.target.value))} className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground">{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <p className="text-[11px] text-muted-foreground">This object has instance properties only.</p>}
      {type ? <button type="button" onClick={duplicateType} className="w-full rounded-lg border px-3 py-2 text-xs hover:bg-muted">Duplicate Type</button> : null}
      <label className="block space-y-1 text-[11px] text-muted-foreground"><span>Instance mark</span><input value={instance?.mark ?? ""} onChange={(event) => patchInstance({ mark: event.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" /></label>
      <div className="grid grid-cols-2 gap-2 text-xs"><label className="flex items-center gap-2 rounded-lg border p-2"><input type="checkbox" checked={instance?.pinned ?? false} onChange={(event) => patchInstance({ pinned: event.target.checked })} />Pinned</label><label className="flex items-center gap-2 rounded-lg border p-2"><input type="checkbox" checked={instance?.flipped ?? false} onChange={(event) => patchInstance({ flipped: event.target.checked })} />Flipped</label></div>
      {showType && type ? <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2">{Object.entries(type.properties).map(([key, value]) => typeof value === "boolean" ? <label key={key} className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={value} onChange={(event) => onChange(updateHouseType(project, type.id, { [key]: event.target.checked }))} />{labelProperty(key)}</label> : typeof value === "number" ? <NumberInput key={key} label={labelProperty(key)} value={value} min={0} max={100000} onChange={(next) => onChange(updateHouseType(project, type.id, { [key]: next }))} /> : <TextInput key={key} label={labelProperty(key)} value={value} onChange={(next) => onChange(updateHouseType(project, type.id, { [key]: next }))} />)}</div> : null}
    </div>
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

  if (selected.kind === "foundation") {
    const item = project.foundations.find((entry) => entry.id === selected.id);
    if (!item) return <Missing />;
    return <FieldGrid title="Foundation · preliminary"><NumberInput label="X" value={item.x} min={-100000} max={100000} onChange={(x) => onPatch({ x })} /><NumberInput label="Y" value={item.y} min={-100000} max={100000} onChange={(y) => onPatch({ y })} /><NumberInput label="Width" value={item.width} min={200} max={10000} onChange={(width) => onPatch({ width })} /><NumberInput label="Depth" value={item.depth} min={200} max={10000} onChange={(depth) => onPatch({ depth })} /><NumberInput label="Thickness" value={item.thickness} min={100} max={3000} onChange={(thickness) => onPatch({ thickness })} /><NumberInput label="Elevation" value={item.elevation} min={-10000} max={50000} onChange={(elevation) => onPatch({ elevation })} /><TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide /></FieldGrid>;
  }

  if (selected.kind === "component") {
    const item = project.components.find((entry) => entry.id === selected.id);
    if (!item) return <Missing />;
    return <FieldGrid title={item.name}><TextInput label="Name" value={item.name} onChange={(name) => onPatch({ name })} wide /><NumberInput label="X" value={item.x} min={-100000} max={100000} onChange={(x) => onPatch({ x })} /><NumberInput label="Y" value={item.y} min={-100000} max={100000} onChange={(y) => onPatch({ y })} /><NumberInput label="Width" value={item.width} min={10} max={50000} onChange={(width) => onPatch({ width })} /><NumberInput label="Depth" value={item.depth} min={10} max={50000} onChange={(depth) => onPatch({ depth })} /><NumberInput label="Height" value={item.height} min={10} max={50000} onChange={(height) => onPatch({ height })} /><NumberInput label="Rotation" value={item.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => onPatch({ rotation })} /><TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide /></FieldGrid>;
  }

  if (selected.kind === "railing") {
    const item = project.railings.find((entry) => entry.id === selected.id);
    if (!item) return <Missing />;
    return <FieldGrid title="Railing"><NumberInput label="Start X" value={item.start.x} min={-100000} max={100000} onChange={(startX) => onPatch({ startX })} /><NumberInput label="Start Y" value={item.start.y} min={-100000} max={100000} onChange={(startY) => onPatch({ startY })} /><NumberInput label="End X" value={item.end.x} min={-100000} max={100000} onChange={(endX) => onPatch({ endX })} /><NumberInput label="End Y" value={item.end.y} min={-100000} max={100000} onChange={(endY) => onPatch({ endY })} /><NumberInput label="Height" value={item.height} min={100} max={3000} onChange={(height) => onPatch({ height })} /><TextInput label="Material" value={item.material} onChange={(material) => onPatch({ material })} wide /></FieldGrid>;
  }

  if (selected.kind === "reference-plane") {
    const item = project.referencePlanes.find((entry) => entry.id === selected.id);
    if (!item) return <Missing />;
    return <FieldGrid title="Reference Plane"><TextInput label="Name" value={item.name} onChange={(name) => onPatch({ name })} wide /><NumberInput label="Start X" value={item.start.x} min={-100000} max={100000} onChange={(startX) => onPatch({ startX })} /><NumberInput label="Start Y" value={item.start.y} min={-100000} max={100000} onChange={(startY) => onPatch({ startY })} /><NumberInput label="End X" value={item.end.x} min={-100000} max={100000} onChange={(endX) => onPatch({ endX })} /><NumberInput label="End Y" value={item.end.y} min={-100000} max={100000} onChange={(endY) => onPatch({ endY })} /></FieldGrid>;
  }

  if (selected.kind === "annotation") {
    const item = project.annotations.find((entry) => entry.id === selected.id);
    if (!item) return <Missing />;
    return <FieldGrid title={`${labelProperty(item.kind)} annotation`}><TextInput label="Text" value={item.text} onChange={(text) => onPatch({ text })} wide /><NumberInput label="Start X" value={item.start.x} min={-100000} max={100000} onChange={(startX) => onPatch({ startX })} /><NumberInput label="Start Y" value={item.start.y} min={-100000} max={100000} onChange={(startY) => onPatch({ startY })} />{item.value !== null ? <NumberInput label="Value" value={item.value} min={0} max={1000000} onChange={(value) => onPatch({ value })} /> : null}</FieldGrid>;
  }

  if (selected.kind !== "roof") return <Missing />;
  const item = project.roofs.find((roof) => roof.id === selected.id);
  if (!item) return <Missing />;
  // A pitched roof's height follows from its slope; keep the number shown
  // the one the 3D view draws.
  const xs = item.boundary.map((point) => point.x);
  const ys = item.boundary.map((point) => point.y);
  const riseFor = (type: string, slope: number) => type === "flat" ? Math.min(item.height, 450) : Math.round(pitchedRise({ slope, height: item.height }, Math.max(...xs) - Math.min(...xs) + item.overhang * 2, Math.max(...ys) - Math.min(...ys) + item.overhang * 2));
  return (
    <FieldGrid title="Roof">
      <SelectInput
        label="Type"
        value={item.type}
        options={roofTypes}
        onChange={(type) => { const slope = type === "flat" ? 0 : item.slope || 25; onPatch({ type, slope, height: riseFor(type, slope) }); }}
        wide
      />
      <NumberInput label="Elevation" value={item.elevation} min={0} max={50000} onChange={(elevation) => onPatch({ elevation })} />
      <NumberInput label="Height" value={item.height} min={100} max={8000} onChange={(height) => onPatch({ height })} />
      <NumberInput label="Slope" value={item.slope} min={0} max={60} suffix="°" onChange={(slope) => onPatch({ slope, height: item.type === "flat" ? item.height : riseFor(item.type, slope) })} />
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
  const unit = useHouseUnits();
  const factor = suffix === "mm" ? unitScale(unit) : 1;
  return (
    <label className="space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="flex rounded-lg border bg-background px-2">
        <input type="number" value={suffix === "mm" ? displayLength(value, unit) : value} min={min / factor} max={max / factor} step={step / factor} onChange={(event) => { const next = suffix === "mm" ? modelLength(Number(event.target.value), unit) : Number(event.target.value); if (Number.isFinite(next)) onChange(clamp(next, min, max)); }} className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm tabular-nums text-foreground outline-none" />
        {suffix ? <span className="ml-1 self-center">{suffix === "mm" ? unit : suffix}</span> : null}
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
  addOptions(options, project.foundations.filter((item) => item.levelId === levelId), "foundation", "Foundation");
  addOptions(options, project.railings.filter((item) => item.levelId === levelId), "railing", "Railing");
  addOptions(options, project.referencePlanes.filter((item) => item.levelId === levelId), "reference-plane", "Reference plane");
  addOptions(options, project.annotations.filter((item) => item.levelId === levelId), "annotation", "Annotation");
  addOptions(options, project.components.filter((item) => item.levelId === levelId), "component", "Component");
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

function labelProperty(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function boundaryBounds(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
