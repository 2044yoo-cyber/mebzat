"use client";

import { useRef, useState, type PointerEvent } from "react";
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
  function moveAppliance(role: "fridge" | "sink" | "stove", runId: string, offset: number) {
    const run = runs.find((item) => item.id === runId);
    if (!run || (role === "fridge" && /island|peninsula/.test(runId))) return;
    const appliance = detail[role];
    const bounded = Math.max(0, Math.min(Math.max(0, run.length - appliance.width), Math.round(offset / 5) * 5));
    setSettings((current) => ({
      ...current,
      fridgePlacement: role === "fridge" ? "custom" : current.fridgePlacement,
      details: { ...current.details!, [role]: { ...current.details![role], runId, offset: bounded } },
    }));
  }
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
    {settings.placementMode === "plan" ? <KitchenPlanPreview settings={settings} onMove={moveAppliance} /> : null}
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
    {settings.wallCabinets ? <fieldset className="space-y-2 border-t pt-3">
      <legend className="text-sm font-medium">Windows</legend>
      <p className="text-[11px] text-muted-foreground">No upper cabinet is hung across a window. Back wall measured from its left end; side walls from the back corner.</p>
      {(settings.windows ?? []).map((window, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
        <label className="text-xs">Wall<select aria-label={`Window ${index + 1} wall`} className="mt-1 w-full rounded-md border bg-background p-2" value={window.wall}
          onChange={(event) => setSettings({ ...settings, windows: (settings.windows ?? []).map((entry, at) => at === index ? { ...entry, wall: event.target.value as typeof entry.wall } : entry) })}>
          <option value="back">Back</option>
          {settings.shape !== "straight" && settings.shape !== "island" ? <option value="right">Right</option> : null}
          {["u_shaped", "g_shaped"].includes(settings.shape) ? <option value="left">Left</option> : null}
        </select></label>
        {(["offset", "width"] as const).map((key) => <label key={key} className="text-xs">{key === "offset" ? "From (cm)" : "Width (cm)"}
          <input aria-label={`Window ${index + 1} ${key === "offset" ? "position" : "width"} in cm`} type="number" required min={key === "offset" ? 0 : 20} max={1200} step={0.5}
            className="mt-1 w-full rounded-md border bg-background p-2" value={window[key] / 10}
            onChange={(event) => setSettings({ ...settings, windows: (settings.windows ?? []).map((entry, at) => at === index ? { ...entry, [key]: Number(event.target.value) * 10 } : entry) })} />
        </label>)}
        <button type="button" aria-label={`Remove window ${index + 1}`} className="h-9 rounded-md border px-2 text-xs hover:bg-muted"
          onClick={() => setSettings({ ...settings, windows: (settings.windows ?? []).filter((_, at) => at !== index) })}>Remove</button>
      </div>)}
      {(settings.windows ?? []).length < 4 ? <button type="button" className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        onClick={() => setSettings({ ...settings, windows: [...(settings.windows ?? []), { wall: "back", offset: Math.max(0, Math.round(settings.roomWidth / 2 - 500)), width: 1000 }] })}>Add a window</button> : null}
    </fieldset> : null}
    <p className="text-[11px] text-muted-foreground">Reference construction: {detail.baseDepth / 10} cm base depth, {detail.upperDepth / 10} cm upper depth and {detail.plinthHeight / 10} cm recessed Zekolo. Upper cabinets connect around corners. The countertop starts hidden so you can inspect the cutting parts.</p>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    <button type="submit" disabled={!!error} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{settings.placementMode === "plan" ? "Generate kitchen from plan" : submitLabel}</button>
  </form>;
}

type ApplianceRole = "fridge" | "sink" | "stove";

/**
 * Mobile-friendly plan placement: tap an appliance to select it, then drag it
 * onto any valid wall (or island for sink/stove). All coordinates are derived
 * from kitchenRunChoices, so the form's exact numeric offsets remain the
 * source of truth for generated 3D cabinet positions.
 */
function KitchenPlanPreview({ settings, onMove }: {
  settings: Settings;
  onMove: (role: ApplianceRole, runId: string, offset: number) => void;
}) {
  const runs = kitchenRunChoices(settings);
  const details = settings.details!;
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ role: ApplianceRole; pointerId: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<ApplianceRole | null>(null);
  const [preview, setPreview] = useState<{ role: ApplianceRole; x: number; y: number } | null>(null);
  const [hint, setHint] = useState("Drag F, S or H to a wall to position it.");

  const lines = (runId: string) => {
    if (runId.endsWith("left")) return { a: [20, 30] as const, b: [20, 170] as const };
    if (runId.endsWith("right")) return { a: [280, 170] as const, b: [280, 30] as const };
    if (runId.includes("island")) return { a: [95, 120] as const, b: [215, 120] as const };
    if (runId.includes("peninsula")) return { a: [20, 170] as const, b: [150, 170] as const };
    return { a: [280, 30] as const, b: [20, 30] as const };
  };
  function point(runId: string, offset: number) {
    const run = runs.find((item) => item.id === runId);
    const { a, b } = lines(runId);
    const t = run?.length ? Math.max(0, Math.min(1, offset / run.length)) : 0;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
  }
  function localPoint(event: PointerEvent<SVGSVGElement>) {
    const node = svg.current;
    if (!node) return null;
    const matrix = node.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  function nearestRun(role: ApplianceRole, x: number, y: number) {
    let nearest: { id: string; offset: number; distance: number } | null = null;
    for (const run of runs) {
      if (role === "fridge" && /island|peninsula/.test(run.id)) continue;
      const { a, b } = lines(run.id);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      const px = a[0] + dx * t, py = a[1] + dy * t;
      const distance = Math.hypot(x - px, y - py);
      if (!nearest || distance < nearest.distance) nearest = {
        id: run.id,
        offset: Math.max(0, Math.min(run.length - details[role].width, t * run.length - details[role].width / 2)),
        distance,
      };
    }
    return nearest;
  }
  function startDrag(role: ApplianceRole, event: PointerEvent<SVGGElement>) {
    event.preventDefault();
    event.stopPropagation();
    const p = localPoint(event as unknown as PointerEvent<SVGSVGElement>);
    if (!p) return;
    dragging.current = { role, pointerId: event.pointerId, x: p.x, y: p.y };
    setSelected(role);
    svg.current?.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!dragging.current || dragging.current.pointerId !== event.pointerId) return;
    const p = localPoint(event);
    if (p) setPreview({ role: dragging.current.role, x: p.x, y: p.y });
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    const active = dragging.current;
    if (!active || active.pointerId !== event.pointerId) return;
    dragging.current = null;
    const p = localPoint(event);
    setPreview(null);
    if (!p) return;
    const nearest = nearestRun(active.role, p.x, p.y);
    if (!nearest || nearest.distance > 40) {
      setHint("Drop on a highlighted wall or island.");
      return;
    }
    onMove(active.role, nearest.id, nearest.offset);
    setHint(`${active.role === "fridge" ? "Fridge" : active.role === "sink" ? "Sink" : "Stove"} moved to ${runs.find((run) => run.id === nearest.id)?.label ?? nearest.id}. Adjust exact position below.`);
  }
  const hasLeft = ["u_shaped", "g_shaped"].includes(settings.shape);
  const hasRight = ["l_shaped", "u_shaped", "g_shaped"].includes(settings.shape);
  return <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold">Place appliances · top view</span>
      <span className="text-[11px] text-muted-foreground">Touch and drag</span>
    </div>
    <svg ref={svg} viewBox="0 0 300 190" className="h-52 w-full select-none rounded-lg bg-background/70" style={{ touchAction: "none" }}
      aria-label="Draggable kitchen top plan with fridge, sink and stove"
      onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { dragging.current = null; setPreview(null); }}>
      <path d={`M20 30H280${hasRight ? "V170" : ""}${settings.shape === "g_shaped" ? "M20 170H150" : ""}`}
        fill="none" stroke="currentColor" strokeWidth="15" opacity=".18" />
      {hasLeft ? <path d="M20 30V170" fill="none" stroke="currentColor" strokeWidth="15" opacity=".18" /> : null}
      {settings.shape === "island" ? <path d="M95 120H215" fill="none" stroke="currentColor" strokeWidth="19" opacity=".18" /> : null}
      {runs.map((run) => {
        const { a, b } = lines(run.id);
        return <line key={run.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#3b82f6" strokeWidth="4" strokeDasharray="5 5" opacity=".55" />;
      })}
      {(["fridge", "sink", "stove"] as const).map((role) => {
        const position = preview?.role === role ? preview : point(details[role].runId, details[role].offset + details[role].width / 2);
        const active = selected === role;
        return <g key={role} role="button" tabIndex={0} aria-label={`Drag ${role} position`}
          onPointerDown={(event) => startDrag(role, event)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(role); }
          }}
          style={{ cursor: "grab" }}>
          <circle cx={position.x} cy={position.y} r={active ? 17 : 15} fill={role === "fridge" ? "#2563eb" : role === "sink" ? "#0891b2" : "#ea580c"}
            stroke={active ? "#facc15" : "white"} strokeWidth={active ? 3 : 2} />
          <text x={position.x} y={position.y + 4.5} textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" pointerEvents="none">
            {role === "fridge" ? "F" : role === "sink" ? "S" : "H"}
          </text>
        </g>;
      })}
    </svg>
    <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
      {(["fridge", "sink", "stove"] as const).map((role) => <button key={role} type="button"
        onClick={() => setSelected(role)}
        className={`min-h-10 rounded-lg border px-1 font-medium ${selected === role ? "border-brand bg-brand/10 text-brand" : "bg-background"}`}>
        {role === "fridge" ? "F · Fridge" : role === "sink" ? "S · Sink" : "H · Stove"}
      </button>)}
    </div>
    <p role="status" className="min-h-4 text-center text-[11px] text-muted-foreground">{hint}</p>
  </div>;
}
