"use client";

import { useState } from "react";
import { createKitchenDesign } from "../services/kitchen-setup";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS, kitchenRunChoices, kitchenSetupError, type KitchenSetup as Settings } from "../types/kitchen";
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
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_KITCHEN_SETUP, wallHeight: 1000, topHeight: 0, ...initial, details: structuredClone(initial?.details ?? REFERENCE_KITCHEN_DETAILS) });
  const error = kitchenSetupError(settings);
  const runs = kitchenRunChoices(settings);
  const detail = settings.details!;
  function fridgeAt(runId: string, placement = settings.fridgePlacement) {
    const length = runs.find((run) => run.id === runId)?.length ?? detail.fridge.width;
    return {
      ...detail.fridge,
      runId,
      offset: placement === "right" ? Math.max(0, length - detail.fridge.width) : placement === "left" ? 0 : detail.fridge.offset,
    };
  }
  function applianceValue(role: "fridge" | "sink" | "stove", key: "offset" | "width", value: number) {
    const appliance = { ...detail[role], [key]: value };
    if (role !== "fridge") return appliance;
    if (settings.fridgePlacement === "left") appliance.offset = 0;
    if (settings.fridgePlacement === "right") {
      const length = runs.find((run) => run.id === appliance.runId)?.length ?? appliance.width;
      appliance.offset = Math.max(0, length - appliance.width);
    }
    return appliance;
  }
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
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Kitchen creation method">
      {(["auto", "plan"] as const).map((mode) => <button key={mode} type="button" role="tab"
        aria-selected={settings.placementMode === mode}
        onClick={() => setSettings({ ...settings, placementMode: mode, fridgePlacement: mode === "auto" ? "left" : settings.fridgePlacement })}
        className={`rounded-md px-3 py-2 text-xs font-medium ${settings.placementMode === mode ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
        {mode === "auto" ? "Auto Kitchen" : "Sketch with Plan"}
      </button>)}
    </div>
    <div role="group" aria-label="Kitchen shape" className="grid grid-cols-3 gap-2">
      {SHAPES.map((shape) => <button key={shape.value} type="button" aria-pressed={settings.shape === shape.value}
        onClick={() => setSettings({ ...settings, shape: shape.value })}
        className={`rounded-lg border p-2 text-xs ${settings.shape === shape.value ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted"}`}>
        <svg viewBox="0 0 80 60" className="mx-auto h-10 w-14" aria-hidden="true"><path d={shape.path} fill="none" stroke="currentColor" strokeWidth="9" /></svg>
        {shape.label}
      </button>)}
    </div>
    {settings.placementMode === "plan" ? <KitchenPlanPreview settings={settings} /> : null}
    {settings.placementMode === "plan" ? <fieldset className="space-y-3 border-t pt-3">
      <legend className="text-sm font-medium">Appliance positions</legend>
      <p className="text-[11px] text-muted-foreground">Choose the wall or island first. Position is measured from the start of its usable cabinet run, after the corner. Back wall: right to left; left wall: back to front; right wall: front to back; island/peninsula: left to right.</p>
      {(["fridge", "sink", "stove"] as const).map((role) => <div key={role} className="space-y-2 rounded-lg border p-2">
        <label className="block text-xs font-medium">{role === "fridge" ? "Fridge" : role === "sink" ? "Sink" : "Stove / oven"}
          <select aria-label={`${role} wall`} className="mt-1 w-full rounded-md border bg-background p-2" value={detail[role].runId}
            onChange={(event) => setSettings({ ...settings, details: { ...detail, [role]: role === "fridge" ? fridgeAt(event.target.value) : { ...detail[role], runId: event.target.value } } })}>
            {!runs.some((r) => r.id === detail[role].runId) ? <option value={detail[role].runId}>Choose a wall</option> : null}
            {runs.filter((r) => role !== "fridge" || !/island|peninsula/.test(r.id)).map((run) => <option key={run.id} value={run.id}>{run.label} · {run.length / 10} cm usable</option>)}
          </select>
        </label>
        {role === "fridge" ? <div className="grid grid-cols-3 gap-1" role="group" aria-label="Fridge position on run">
          {(["left", "right", "custom"] as const).map((placement) => <button key={placement} type="button"
            aria-pressed={settings.fridgePlacement === placement}
            onClick={() => setSettings({ ...settings, fridgePlacement: placement, details: { ...detail, fridge: fridgeAt(detail.fridge.runId, placement) } })}
            className={`rounded-md border px-2 py-1.5 text-xs capitalize ${settings.fridgePlacement === placement ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted"}`}>
            {placement === "custom" ? "Custom" : `${placement} end`}
          </button>)}
        </div> : null}
        <div className="grid grid-cols-2 gap-2">{(["offset", "width"] as const).map((key) => <label key={key} className="text-xs">
          {key === "offset" ? "Position" : "Bay width"} (cm)
          <input aria-label={`${role} ${key} in cm`} type="number" required min={key === "offset" ? 0 : 45} max={key === "offset" ? 1200 : 120} step={0.05}
            disabled={role === "fridge" && key === "offset" && settings.fridgePlacement !== "custom"}
            className="mt-1 w-full rounded-md border bg-background p-2" value={detail[role][key] / 10}
            onChange={(event) => {
              const placement = role === "fridge" && key === "offset" ? "custom" : settings.fridgePlacement;
              const next = { ...settings, fridgePlacement: placement };
              next.details = { ...detail, [role]: applianceValue(role, key, Number(event.target.value) * 10) };
              setSettings(next);
            }} />
        </label>)}</div>
        {role === "fridge" ? <label className="block text-xs">Fridge clear height including ventilation (cm)<input type="number" required min={140} max={220} step={1} value={detail.fridgeHeight / 10} className="mt-1 w-full rounded-md border bg-background p-2" onChange={(event) => setSettings({ ...settings, details: { ...detail, fridgeHeight: Number(event.target.value) * 10 } })} /><span className="text-muted-foreground">Clear width: {(detail.fridge.width - 36) / 10} cm after the two side boards.</span></label> : null}
      </div>)}
    </fieldset> : <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">Automatic layout keeps the fridge at an outer run end and places the sink and stove from the standard working sequence. Choose Sketch with Plan to position all three manually.</p>}
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
    <p className="text-[11px] text-muted-foreground">Reference construction: {detail.baseDepth / 10} cm base depth, {detail.upperDepth / 10} cm upper depth and {detail.plinthHeight / 10} cm recessed Zekolo. Upper cabinets connect around corners. The countertop starts hidden so you can inspect the cutting parts.</p>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    <button type="submit" disabled={!!error} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{settings.placementMode === "plan" ? "Generate kitchen from plan" : submitLabel}</button>
  </form>;
}

function KitchenPlanPreview({ settings }: { settings: Settings }) {
  const runs = kitchenRunChoices(settings);
  const details = settings.details!;
  const point = (runId: string, offset: number) => {
    const run = runs.find((item) => item.id === runId);
    const ratio = run ? Math.max(0, Math.min(1, offset / run.length)) : 0;
    if (runId.endsWith("left")) return { x: 20, y: 30 + ratio * 140 };
    if (runId.endsWith("right")) return { x: 280, y: 170 - ratio * 140 };
    if (runId.includes("island")) return { x: 95 + ratio * 120, y: 120 };
    if (runId.includes("peninsula")) return { x: 20 + ratio * 130, y: 170 };
    return { x: 280 - ratio * 260, y: 30 };
  };
  const hasLeft = ["u_shaped", "g_shaped"].includes(settings.shape);
  const hasRight = ["l_shaped", "u_shaped", "g_shaped"].includes(settings.shape);
  return <div className="rounded-lg border bg-muted/20 p-2">
    <svg viewBox="0 0 300 190" className="h-44 w-full" aria-label="Kitchen top plan with appliance anchors">
      <path d={`M20 30H280${hasRight ? "V170" : ""}${settings.shape === "g_shaped" ? "M20 170H150" : ""}`} fill="none" stroke="currentColor" strokeWidth="12" opacity=".22" />
      {hasLeft ? <path d="M20 30V170" fill="none" stroke="currentColor" strokeWidth="12" opacity=".22" /> : null}
      {settings.shape === "island" ? <path d="M95 120H215" fill="none" stroke="currentColor" strokeWidth="18" opacity=".22" /> : null}
      {(["fridge", "sink", "stove"] as const).map((role) => {
        const at = point(details[role].runId, details[role].offset + details[role].width / 2);
        return <g key={role}><circle cx={at.x} cy={at.y} r="12" fill="var(--color-primary)" /><text x={at.x} y={at.y + 4} textAnchor="middle" fontSize="10" fill="white">{role === "fridge" ? "F" : role === "sink" ? "S" : "H"}</text></g>;
      })}
    </svg>
    <p className="text-center text-[11px] text-muted-foreground">Top plan · F fridge · S sink · H stove</p>
  </div>;
}
