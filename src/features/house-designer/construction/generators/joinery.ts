import { startingDesign } from "@/features/berchuma-studio/services/starting-designs";
import { buildParts } from "@/features/berchuma-studio/services/geometry";
import { partWorldBounds } from "@/features/berchuma-studio/services/part-transform";
import type { Part, PartsBreakdown } from "@/features/berchuma-studio/types/parts";
import type { DesignSpec } from "@/features/berchuma-studio/types/spec";

import { ASSUME, type Ctx, type LevelInfo, type RoomInfo } from "../context";
import { box, cyl, v3, type Shape } from "../geometry";
import { addQuantity, f2, round } from "../helpers";
import { freeRuns, onEdge, roomLayout, type Edge, type RoomLayout } from "../layout";
import type { LayerId, StageId } from "../types";

/**
 * Stage 16 (and the Berchuma-built furniture of stage 17): kitchens,
 * wardrobes and storage built from the Berchuma studio's own cutting parts.
 * Every panel here is a real, named part from `buildParts`, so the 3D model,
 * the cutting list and the quantities all read the same list.
 */

export const FLOOR_TOP = ASSUME.floorBuildUp;

type Run = { edge: Edge; t0: number; t1: number };
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The free wall runs of a room, longest first, optionally skipping an edge already used. */
export function runsOf(layout: RoomLayout, margin = 80, skip: Edge[] = []): Run[] {
  return layout.edges.filter((e) => e.wall && !skip.includes(e)).flatMap((edge) => freeRuns(edge, margin, 400).map(([t0, t1]) => ({ edge, t0, t1 }))).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
}

/**
 * Where a Berchuma unit's own frame sits in the house: x runs along the wall (right as seen from the
 * front), y up, z backwards from the front face into the wall.
 */
export function unitFrame(layout: RoomLayout, edge: Edge, tStart: number) {
  // Seen from the front, x increases towards −u (the unit faces the room).
  const origin = onEdge(edge, tStart, 0);
  const rz = Math.atan2(-edge.uy, -edge.ux);
  return {
    origin,
    point: (x: number, z: number) => ({ x: origin.x - edge.ux * x - edge.nx * z, y: origin.y - edge.uy * x - edge.ny * z }),
    rz,
    base: layout.level.floorZ + FLOOR_TOP,
  };
}

type Class = { id: string; name: string; kind: string; layer: LayerId; roles: string[]; material: (part: Part) => string };
const CLASSES: Class[] = [
  { id: "carcass", name: "Carcass panels", kind: "cabinet-panel", layer: "joinery", roles: ["gable", "divider", "top", "bottom", "shelf", "back", "rail"], material: () => "mdf-white" },
  { id: "fronts", name: "Doors and drawer fronts", kind: "cabinet-panel", layer: "joinery", roles: ["door", "drawer_front", "closure"], material: (p) => (/oak|walnut|birch/i.test(p.board.appearance?.colour ?? "") ? "mdf-oak" : "mdf-white") },
  { id: "drawers", name: "Drawer boxes", kind: "cabinet-panel", layer: "joinery", roles: ["drawer_side", "drawer_back", "drawer_base"], material: () => "mdf-white" },
  { id: "plinth", name: "Plinth and legs", kind: "cabinet-panel", layer: "joinery", roles: ["plinth", "leg"], material: () => "mdf-white" },
  { id: "worktop", name: "Worktop", kind: "worktop", layer: "joinery", roles: ["worktop"], material: () => "worktop" },
  { id: "backsplash", name: "Backsplash", kind: "backsplash", layer: "joinery", roles: ["backsplash"], material: () => "backsplash" },
  { id: "led", name: "LED strips", kind: "cabinet-hardware", layer: "joinery", roles: ["led"], material: () => "hardware" },
];

export type BuiltIn = {
  id: string;
  name: string;
  room: RoomInfo;
  level: LevelInfo;
  layout: RoomLayout;
  spec: DesignSpec;
  parts: PartsBreakdown;
  edge: Edge;
  tStart: number;
  stage: StageId;
  category: "joinery" | "furniture";
  loose: boolean;
};

export function placeDesign(ctx: Ctx, input: Omit<BuiltIn, "parts" | "spec"> & { spec: DesignSpec }): void {
  const parts = buildParts(input.spec);
  const built: BuiltIn = { ...input, parts };
  addBuiltIn(ctx, built);
}

function addBuiltIn(ctx: Ctx, b: BuiltIn): void {
  const frame = unitFrame(b.layout, b.edge, b.tStart);
  const rid = `join:${b.level.index}:${slug(b.room.name)}:${b.id}`;
  const grid = ctx.gridRef(b.level.levelId, b.room.centre.x, b.room.centre.y, 2500);
  const common = { category: b.category, stage: b.stage, level: b.level, room: b.room.name, grid, source: "project" as const, loose: b.loose };
  const env = b.spec.envelope;
  const summary = ctx.add({
    ...common, source: "schematic", id: `${rid}:run`, name: `${b.name} — ${b.room.name}, ${b.level.name}`, kind: b.category === "furniture" ? "tv-unit" : "cabinet-panel", subcategory: "Built-in unit", layer: "joinery", materialId: "marker", shapes: [],
    explode: { layerIndex: 0, dir: v3(0, 0, 1) },
    dims: { length: { value: env.width, unit: "mm", status: "measured", note: "Overall run" }, height: { value: env.height, unit: "mm", status: "measured" }, width: { value: env.depth, unit: "mm", status: "measured", note: "Depth" } },
    note: "Built from the Berchuma studio's own cutting parts: every panel below is on its cutting list. Sheet optimisation and costing come from the same list.",
  });
  const byClass = new Map<string, { shapes: Shape[]; names: string[]; area: number; parts: number }>();
  for (const part of b.parts.parts) {
    const cls = CLASSES.find((c) => c.roles.includes(part.role));
    if (!cls) continue;
    const entry = byClass.get(cls.id) ?? { shapes: [], names: [], area: 0, parts: 0 };
    byClass.set(cls.id, entry);
    part.placements.forEach((placement, index) => {
      const wb = partWorldBounds(part, placement);
      const cx = (wb.min.x + wb.max.x) / 2;
      const cz = (wb.min.z + wb.max.z) / 2;
      const p = frame.point(cx, cz);
      const sx = wb.max.x - wb.min.x;
      const sz = wb.max.z - wb.min.z;
      const sy = wb.max.y - wb.min.y;
      entry.shapes.push(box(p.x, p.y, frame.base + (wb.min.y + wb.max.y) / 2, sx, sz, sy, frame.rz));
      entry.names.push(part.quantity > 1 ? `${part.label} (${index + 1} of ${part.quantity})` : part.label);
    });
    entry.area += part.length * part.width * part.quantity * 1e-6;
    entry.parts += part.quantity;
  }
  let layerIndex = 1;
  for (const cls of CLASSES) {
    const entry = byClass.get(cls.id);
    if (!entry || entry.shapes.length === 0) continue;
    const sample = b.parts.parts.find((p) => cls.roles.includes(p.role))!;
    const comp = ctx.add({
      ...common, id: `${rid}:${cls.id}`, name: `${cls.name} — ${b.name}, ${b.room.name}`, kind: cls.kind, subcategory: cls.name, layer: cls.layer, materialId: cls.material(sample), shapes: entry.shapes, repeated: { noun: "panel" }, instanceNames: entry.names,
      parentId: summary.id, explode: { layerIndex, dir: v3(frame.point(0, 0).x * 0 + (frame.point(0, -1).x - frame.point(0, 0).x), frame.point(0, -1).y - frame.point(0, 0).y, 0) }, sourceRef: null,
      dims: { area: { value: round(entry.area, 3), unit: "m²", status: "calculated" } }, note: `Board: ${sample.board.label ?? sample.board.id}, ${sample.board.thickness} mm.`,
    });
    layerIndex += 1;
    const boardAreas = new Map<string, { area: number; label: string; thickness: number }>();
    for (const part of b.parts.parts.filter((p) => cls.roles.includes(p.role) && p.manufacture !== "purchased")) {
      const e = boardAreas.get(part.board.id) ?? { area: 0, label: part.board.label ?? part.board.id, thickness: part.board.thickness };
      e.area += part.length * part.width * part.quantity * 1e-6;
      boardAreas.set(part.board.id, e);
    }
    const section = b.stage === 16 ? (b.spec.furnitureType === "kitchen" ? "T" : "U") : "V";
    for (const [boardId, e] of boardAreas) {
      addQuantity(ctx, comp, { workItem: `joinery.panel.${boardId}`, description: `Board ${e.label} (${e.thickness} mm), panels in ${cls.name.toLowerCase()}`, section, unit: "m²", value: round(e.area, 3), formula: `Σ (length × width × quantity) over ${entry.parts} panel(s) = ${f2(e.area)} m²`, inputs: { area: round(e.area, 3), thickness: e.thickness, panels: entry.parts }, status: "calculated" },
        { sourceGeometry: `berchuma:${b.id}`, allowance: { rule: "Cutting waste is set by the nesting, not here (sheet optimisation comes later)", percent: null }, assumptions: ["Net panel area, not sheet area."] });
    }
  }
  // Design-level lines: edge banding, hardware.
  const section = b.stage === 16 ? (b.spec.furnitureType === "kitchen" ? "T" : "U") : "V";
  for (const [bandId, metres] of Object.entries(b.parts.totals.bandByEdge)) {
    addQuantity(ctx, summary, { workItem: `joinery.edge-band.${bandId}`, description: `Edge banding ${bandId}`, section, unit: "m", value: round(metres, 3), formula: `Σ banded edges over the run's panels = ${f2(metres)} m`, inputs: { metres: round(metres, 3) }, status: "calculated" }, { sourceGeometry: `berchuma:${b.id}` });
  }
  for (const line of b.parts.hardware) {
    addQuantity(ctx, summary, { workItem: `joinery.hardware.${line.hardware.id}`, description: line.hardware.label, section, unit: line.hardware.unit === "metre" ? "m" : "piece", value: round(line.quantity, 3), formula: `${line.quantity} ${line.hardware.unit} — ${line.note}`, inputs: { quantity: line.quantity, unit: line.hardware.unit }, status: "calculated" },
      { sourceGeometry: `berchuma:${b.id}`, assumptions: line.hardware.unit === "pair" ? ["Sold by the pair: the count is pairs."] : [] });
  }
  // Hardware in 3D: handles on fronts and hinges on doors.
  const hw: Shape[] = [];
  const hwNames: string[] = [];
  for (const part of b.parts.parts.filter((p) => p.role === "door" || p.role === "drawer_front")) {
    part.placements.forEach((placement, i) => {
      const wb = partWorldBounds(part, placement);
      const faceZ = wb.min.z - 8;
      const isDoor = part.role === "door";
      const hx = isDoor ? wb.max.x - 40 : (wb.min.x + wb.max.x) / 2;
      const hy = isDoor ? Math.min(wb.max.y - 60, wb.min.y + (wb.max.y - wb.min.y) * 0.5) : (wb.min.y + wb.max.y) / 2;
      const p = frame.point(hx, faceZ);
      hw.push(box(p.x, p.y, frame.base + hy, isDoor ? 14 : 160, 14, isDoor ? 140 : 14, frame.rz));
      hwNames.push(`Handle — ${part.label}${part.quantity > 1 ? ` (${i + 1})` : ""}`);
      if (isDoor) {
        for (const hyy of [wb.min.y + 100, wb.max.y - 100]) {
          const q = frame.point(wb.min.x + 20, wb.max.z - 4);
          hw.push(cyl(q.x, q.y, frame.base + hyy, 8, 40, "z"));
          hwNames.push(`Hinge — ${part.label}`);
        }
      }
    });
  }
  if (hw.length) {
    ctx.add({ ...common, id: `${rid}:fittings`, name: `Handles and hinges — ${b.name}, ${b.room.name}`, kind: "cabinet-hardware", subcategory: "Hardware", layer: "joinery", materialId: "hardware", shapes: hw, repeated: { noun: "fitting" }, instanceNames: hwNames, parentId: summary.id, explode: { layerIndex, dir: v3(frame.point(0, -1).x - frame.point(0, 0).x, frame.point(0, -1).y - frame.point(0, 0).y, 0) }, note: "Drawn schematically from the door and drawer-front positions; the counts and types are in the hardware schedule of the run." });
  }
  // Appliances and sink for a kitchen.
  if (b.spec.furnitureType === "kitchen") {
    for (const cab of b.spec.cabinets) {
      const label = cab.label.toLowerCase();
      const width = cab.size.width;
      const x0 = cab.position.x;
      if (/fridge/.test(label)) {
        const p = frame.point(x0 + width / 2, cab.size.depth / 2);
        const fridge = ctx.add({ ...common, source: "schematic", id: `${rid}:fridge`, name: `Refrigerator — ${b.room.name}`, kind: "appliance", category: "joinery", subcategory: "Appliances", layer: "joinery", materialId: "appliance", shapes: [box(p.x, p.y, frame.base + 900 + 100, width - 40, cab.size.depth - 60, 1800, frame.rz)], parentId: summary.id, explode: { layerIndex, dir: v3(0, 0, 1) }, loose: true });
        addQuantity(ctx, fridge, { workItem: "appliance.refrigerator", description: "Refrigerator (loose appliance)", section: "V", unit: "piece", value: 1, formula: "1 refrigerator in its tall unit", inputs: { count: 1 }, status: "assumed" }, { sourceGeometry: `berchuma:${b.id}`, room: b.room.name, assumptions: ["Supplied by the owner or priced as a loose item."] });
      }
      if (/sink/.test(label)) {
        const p = frame.point(x0 + width / 2, cab.size.depth / 2);
        const sink = ctx.add({ ...common, source: "schematic", id: `${rid}:sink`, name: `Kitchen sink — ${b.room.name}`, kind: "kitchen-sink", category: "joinery", subcategory: "Appliances", layer: "joinery", materialId: "sanitary", shapes: [box(p.x, p.y, frame.base + (cab.size.height + (cab.plinthHeight ?? 0)) - 100 + 40, Math.min(800, width - 60), cab.size.depth - 150, 30, frame.rz)], parentId: summary.id, explode: { layerIndex, dir: v3(0, 0, 1) } });
        addQuantity(ctx, sink, { workItem: "kitchen.sink", description: "Kitchen sink with tap", section: "T", unit: "piece", value: 1, formula: "1 sink in its base unit", inputs: { count: 1 }, status: "assumed" }, { sourceGeometry: `berchuma:${b.id}`, room: b.room.name });
      }
      if (/cook|stove|oven|hob/.test(label) && cab.kind === "base") {
        const p = frame.point(x0 + width / 2, cab.size.depth / 2);
        const hob = ctx.add({ ...common, source: "schematic", id: `${rid}:hob`, name: `Cooktop — ${b.room.name}`, kind: "appliance", category: "joinery", subcategory: "Appliances", layer: "joinery", materialId: "appliance", shapes: [box(p.x, p.y, frame.base + (cab.size.height + (cab.plinthHeight ?? 0)) + 10, Math.min(600, width - 40), 500, 20, frame.rz)], parentId: summary.id, explode: { layerIndex, dir: v3(0, 0, 1) } });
        addQuantity(ctx, hob, { workItem: "kitchen.cooktop", description: "Cooktop", section: "T", unit: "piece", value: 1, formula: "1 cooktop in its base unit", inputs: { count: 1 }, status: "assumed" }, { sourceGeometry: `berchuma:${b.id}`, room: b.room.name });
      }
    }
  }
}

export function generateJoinery(ctx: Ctx): void {
  const layouts = new Map<string, RoomLayout>();
  for (const room of ctx.rooms) layouts.set(room.id, roomLayout(ctx, room));
  for (const level of ctx.levels) {
    for (const room of ctx.roomsOf(level.levelId)) {
      const layout = layouts.get(room.id)!;
      const runs = runsOf(layout);
      const run = runs[0];
      if (!run) continue;
      const free = run.t1 - run.t0;
      if (room.kind === "kitchen") {
        const width = Math.floor(Math.min(3600, free) / 50) * 50;
        if (width < 1800) { ctx.warnings.push(`${room.name}: the longest free wall is ${Math.round(free)} mm, too short for a kitchen run.`); continue; }
        placeDesign(ctx, { id: "kitchen", name: "Kitchen run", room, level, layout, spec: startingDesign("kitchen", { width }), edge: run.edge, tStart: run.t1, stage: 16, category: "joinery", loose: false });
      } else if (room.kind === "bed") {
        const width = Math.floor(Math.min(2400, free) / 50) * 50;
        if (width < 1200) continue;
        placeDesign(ctx, { id: "wardrobe", name: "Fitted wardrobe", room, level, layout, spec: startingDesign("wardrobe", { width }), edge: run.edge, tStart: run.t1, stage: 16, category: "joinery", loose: false });
      } else if (room.kind === "office") {
        const width = Math.floor(Math.min(2000, free) / 50) * 50;
        if (width < 900) continue;
        placeDesign(ctx, { id: "storage", name: "Office storage", room, level, layout, spec: startingDesign("office_storage", { width }), edge: run.edge, tStart: run.t1, stage: 16, category: "joinery", loose: false });
      } else if (room.kind === "store") {
        const width = Math.floor(Math.min(900, free) / 50) * 50;
        if (width < 600) continue;
        placeDesign(ctx, { id: "shelving", name: "Linen shelving", room, level, layout, spec: startingDesign("shelving", { width }), edge: run.edge, tStart: run.t1, stage: 16, category: "joinery", loose: false });
      }
    }
  }
}
