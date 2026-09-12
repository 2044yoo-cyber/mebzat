"use client";

import { useState } from "react";
import { createKitchenDesign } from "../services/kitchen-setup";
import { DEFAULT_KITCHEN_SETUP, kitchenSetupError, type KitchenSetup as Settings } from "../types/kitchen";
import type { DesignSpec } from "../types/spec";

const SHAPES: { value: Settings["shape"]; label: string; path: string }[] = [
  { value: "straight", label: "Straight", path: "M12 12H68" },
  { value: "l_shaped", label: "L shape", path: "M12 12H68V48" },
  { value: "u_shaped", label: "U shape", path: "M12 48V12H68V48" },
  { value: "g_shaped", label: "G shape", path: "M12 48V12H68V48M12 48H40" },
  { value: "island", label: "With island", path: "M12 12H68M28 42H52" },
];

export function KitchenSetup({ initial, onStart, submitLabel = "Create my kitchen" }: {
  initial?: Partial<Settings>; onStart: (spec: DesignSpec) => void; submitLabel?: string;
}) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_KITCHEN_SETUP, ...initial });
  const error = kitchenSetupError(settings);
  function dimension(key: "roomWidth" | "roomDepth" | "roomHeight" | "wallHeight" | "islandWidth", label: string) {
    return <label className="block space-y-1 text-xs">
      <span>{label} (cm)</span>
      <input type="number" required min={key === "wallHeight" ? 40 : key === "islandWidth" ? 60 : key === "roomHeight" ? 210 : 180}
        max={key === "wallHeight" ? 120 : key === "islandWidth" ? 400 : key === "roomHeight" ? 500 : 1200}
        step={1} value={settings[key] / 10 || ""}
        onChange={(event) => setSettings({ ...settings, [key]: Number(event.target.value) * 10 })}
        className="w-full rounded-md border bg-background px-3 py-2 tabular-nums" />
    </label>;
  }
  return <form className="space-y-4 rounded-xl border p-4" onSubmit={(event) => {
    event.preventDefault();
    if (!error) onStart(createKitchenDesign(settings));
  }}>
    <div><h3 className="text-sm font-medium">Plan your kitchen</h3>
      <p className="mt-1 text-xs text-muted-foreground">Choose a shape and enter the room dimensions before arranging cabinets.</p></div>
    <div role="group" aria-label="Kitchen shape" className="grid grid-cols-3 gap-2">
      {SHAPES.map((shape) => <button key={shape.value} type="button" aria-pressed={settings.shape === shape.value}
        onClick={() => setSettings({ ...settings, shape: shape.value })}
        className={`rounded-lg border p-2 text-xs ${settings.shape === shape.value ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted"}`}>
        <svg viewBox="0 0 80 60" className="mx-auto h-10 w-14" aria-hidden="true"><path d={shape.path} fill="none" stroke="currentColor" strokeWidth="9" /></svg>
        {shape.label}
      </button>)}
    </div>
    <div className="grid grid-cols-2 gap-3">
      {dimension("roomWidth", "Back wall length")}
      {dimension("roomDepth", "Room width / side wall")}
      {dimension("roomHeight", "Ceiling height")}
      {settings.shape === "island" || settings.shape === "g_shaped" ? dimension("islandWidth", settings.shape === "island" ? "Island length" : "Peninsula length") : null}
    </div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.wallCabinets}
      onChange={(event) => setSettings({ ...settings, wallCabinets: event.target.checked })} />Include upper cabinets</label>
    {settings.wallCabinets ? <div className="grid grid-cols-2 gap-3">
      {dimension("wallHeight", "Upper cabinet height")}
      <label className="space-y-1 text-xs"><span>Extra top row</span><select className="w-full rounded-md border bg-background px-2 py-2"
        value={settings.topHeight} onChange={(event) => setSettings({ ...settings, topHeight: Number(event.target.value) })}>
        <option value={0}>No extra row</option>{[300, 400, 500, 700, 1000].map((height) => <option key={height} value={height}>{height / 10} cm high</option>)}
      </select></label>
    </div> : null}
    <p className="text-[11px] text-muted-foreground">Base cabinets are 60 cm deep; upper cabinets are 35 cm deep. Island and peninsula layouts reserve at least 90 cm access. You can edit individual cabinets afterwards.</p>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    <button type="submit" disabled={!!error} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{submitLabel}</button>
  </form>;
}
