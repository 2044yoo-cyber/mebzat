"use client";

import { useState } from "react";

import {
  Box, Boxes, Copy, Cuboid, Eraser, Maximize2, MousePointer2,
  Move3d, Orbit, Pencil, Redo2, Rotate3d, Ruler, Scaling, Trash2, Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { BOARDS } from "../../types/catalogue";
import {
  addSketchObject, createSketchObject, duplicateSketchObject,
  pushPullSketchObject, removeSketchObject, updateSketchObject,
  type SketchTool,
} from "../../services/sketch";
import type { DesignSpec, SketchObject } from "../../types/spec";

export function SketchToolbar({
  spec, selectedId, tool, onTool, onSelect, onChange,
  onUndo, onRedo, canUndo, canRedo,
}: {
  spec: DesignSpec;
  selectedId: string | null;
  tool: SketchTool;
  onTool: (tool: SketchTool) => void;
  onSelect: (id: string | null) => void;
  onChange: (spec: DesignSpec) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}) {
  const selected = spec.sketchObjects.find((object) => object.id === selectedId) ?? null;
  const [menu, setMenu] = useState<"draw" | "more" | null>(null);

  function quickBox() {
    const object = createSketchObject(spec, "box", {
      x: spec.envelope.width + 350,
      y: 200,
      z: spec.envelope.depth / 2,
    });
    onChange(addSketchObject(spec, object));
    onSelect(object.id);
    onTool("select");
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 w-full min-w-0 max-w-full overflow-x-hidden px-2 pb-2">
      <div className="pointer-events-auto mx-auto w-full min-w-0 max-w-xl overflow-x-hidden rounded-xl border bg-background/90 p-2 shadow-lg backdrop-blur-xl">
        <div className="flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Tool active={tool === "select"} label="Select" icon={MousePointer2} onClick={() => { onTool("select"); setMenu(null); }} />
          <Tool active={menu === "draw" || tool === "rectangle" || tool === "line" || tool === "box"} label="Draw" icon={Pencil} onClick={() => setMenu(menu === "draw" ? null : "draw")} />
          <Tool active={tool === "push-pull"} label="Push/Pull" icon={Boxes} onClick={() => { onTool("push-pull"); setMenu(null); }} />
          <Tool active={tool === "move"} label="Move" icon={Move3d} onClick={() => { onTool("move"); setMenu(null); }} />
          <Tool active={menu === "more"} label="More" icon={Cuboid} onClick={() => setMenu(menu === "more" ? null : "more")} />
        </div>

        {menu === "draw" ? (
          <div className="mt-1 flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap border-t pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Tool active={tool === "rectangle"} label="Rectangle" icon={Maximize2} onClick={() => { onTool("rectangle"); setMenu(null); }} />
            <Tool active={tool === "line"} label="Line" icon={Pencil} onClick={() => { onTool("line"); setMenu(null); }} />
            <Tool label="Box" icon={Cuboid} onClick={() => { quickBox(); setMenu(null); }} />
          </div>
        ) : null}

        {menu === "more" ? (
          <div className="mt-1 flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap border-t pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Tool active={tool === "rotate"} label="Rotate" icon={Rotate3d} onClick={() => { onTool("rotate"); setMenu(null); }} />
            <Tool active={tool === "scale"} label="Scale" icon={Scaling} onClick={() => { onTool("scale"); setMenu(null); }} />
            <Tool active={tool === "measure"} label="Measure" icon={Ruler} onClick={() => { onTool("measure"); setMenu(null); }} />
            <Tool active={tool === "orbit"} label="Orbit" icon={Orbit} onClick={() => { onTool("orbit"); setMenu(null); }} />
            <Tool active={tool === "pan"} label="Pan" icon={Box} onClick={() => { onTool("pan"); setMenu(null); }} />
            <Tool label="Duplicate" icon={Copy} disabled={!selected} onClick={() => selected && onChange(duplicateSketchObject(spec, selected.id))} />
            <Tool label="Delete" icon={Trash2} disabled={!selected} onClick={() => { if (selected) { onChange(removeSketchObject(spec, selected.id)); onSelect(null); } }} />
            <Tool label="Undo" icon={Undo2} disabled={!canUndo} onClick={() => onUndo?.()} />
            <Tool label="Redo" icon={Redo2} disabled={!canRedo} onClick={() => onRedo?.()} />
          </div>
        ) : null}

        {selected ? (
          <SketchInspector
            object={selected}
            spec={spec}
            onChange={onChange}
            onPushPull={(distance) => onChange(pushPullSketchObject(spec, selected.id, distance))}
            onDuplicate={() => {
              const next = duplicateSketchObject(spec, selected.id);
              onChange(next);
              onSelect(next.sketchObjects.at(-1)?.id ?? null);
            }}
            onDelete={() => {
              onChange(removeSketchObject(spec, selected.id));
              onSelect(null);
            }}
          />
        ) : (
          <p className="px-1 pt-1 text-[11px] text-muted-foreground">
            {tool === "rectangle" || tool === "line"
              ? "Tap the ground or any cabinet face. Grid snap: 10 mm."
              : "Select an object to edit exact dimensions, position, rotation, and material."}
          </p>
        )}
      </div>
    </div>
  );
}

function SketchInspector({ object, spec, onChange, onPushPull, onDuplicate, onDelete }: {
  object: SketchObject;
  spec: DesignSpec;
  onChange: (spec: DesignSpec) => void;
  onPushPull: (distance: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const update = (patch: Partial<SketchObject>) => onChange(updateSketchObject(spec, object.id, patch));
  const number = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  return (
    <div className="max-h-[30dvh] overflow-y-auto border-t pt-2 text-[11px]">
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <NumberField key={`p-${axis}`} label={axis.toUpperCase()} value={object.position[axis]}
            onChange={(value) => update({ position: { ...object.position, [axis]: number(value, object.position[axis]) } })} />
        ))}
        {(["width", "height", "depth"] as const).map((axis) => (
          <NumberField key={axis} label={axis[0].toUpperCase()} value={object.size[axis]}
            onChange={(value) => update({ size: { ...object.size, [axis]: Math.max(0.1, number(value, object.size[axis])) } })} />
        ))}
        {(["x", "y", "z"] as const).map((axis) => (
          <NumberField key={`r-${axis}`} label={`R${axis.toUpperCase()}`} value={object.rotation[axis]}
            onChange={(value) => update({ rotation: { ...object.rotation, [axis]: number(value, object.rotation[axis]) } })} />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <select value={object.objectType} onChange={(event) => update({ objectType: event.target.value as SketchObject["objectType"] })}
          className="h-8 rounded-md border bg-background px-2">
          <option value="generic">Generic</option><option value="board">Board / MDF</option>
        </select>
        <select value={object.boardId ?? spec.carcass.board.id} onChange={(event) => {
          const board = BOARDS.find((entry) => entry.id === event.target.value);
          if (board) update({ boardId: board.id, thickness: board.thickness, materialHex: board.appearance?.hex });
        }} className="h-8 rounded-md border bg-background px-2">
          {BOARDS.map((board) => <option key={board.id} value={board.id}>{board.label}</option>)}
        </select>
      </div>
      {object.objectType === "board" ? (
        <div className="mt-1">
          <NumberField label="Thickness" value={object.thickness ?? spec.carcass.board.thickness}
            onChange={(value) => update({ thickness: Math.max(0.1, number(value, object.thickness ?? spec.carcass.board.thickness)) })} />
        </div>
      ) : null}
      <div className="mt-1 flex gap-1 overflow-x-auto">
        {object.shape === "face" ? <Action icon={Boxes} label="Extrude" onClick={() => onPushPull(400)} /> : null}
        <Action icon={Copy} label="Duplicate" onClick={onDuplicate} />
        <Action icon={Eraser} label="Clear rotation" onClick={() => update({ rotation: { x: 0, y: 0, z: 0 } })} />
        <Action icon={Trash2} label="Delete" onClick={onDelete} />
      </div>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {object.size.width} × {object.size.height} × {object.size.depth} mm
      </p>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return <label className="flex h-8 items-center gap-1 rounded-md border px-1.5"><span className="text-muted-foreground">{label}</span><input type="number" step="0.25" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none" /></label>;
}

function Tool({ active = false, label, icon: Icon, onClick, disabled }: { active?: boolean; label: string; icon: typeof Box; onClick: () => void; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={cn("flex min-w-14 flex-1 shrink-0 flex-col items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-1 text-[10px]", active ? "bg-primary text-primary-foreground" : "hover:bg-muted", "disabled:opacity-35")}><Icon className="size-4" />{label}</button>;
}

function Action({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof Box; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 disabled:opacity-35"><Icon className="size-3.5" />{label}</button>;
}
