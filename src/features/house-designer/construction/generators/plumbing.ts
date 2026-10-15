import type { Ctx, LevelInfo, RoomInfo } from "../context";
import { box, cyl, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, round } from "../helpers";
import { freeRuns, longestFreeRun, manhattan, onEdge, roomLayout, wallBox, type Edge, type RoomLayout } from "../layout";
import { ASSUME } from "../context";

/** Stage 10: water supply, hot water, waste, soil and vent stacks, underground drains, chambers, rainwater. */

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Pt = { x: number; y: number; z: number };
const at = (p: P2, z: number): Pt => ({ x: p.x, y: p.y, z });

type Fixture = { kind: "wc" | "basin" | "shower"; label: string; edge: Edge; t: number; supplyZ: number; hot: boolean; size: [number, number, number] };

function fixturesFor(layout: RoomLayout): Fixture[] {
  const room = layout.room;
  if (room.kind !== "bath" && room.kind !== "wc") return [];
  const runs = layout.edges.flatMap((edge) => freeRuns(edge, 300, 500).map(([t0, t1]) => ({ edge, t0, t1 }))).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
  if (runs.length === 0) return [];
  const pick = (i: number) => runs[i % runs.length]!;
  const out: Fixture[] = [];
  const a = pick(0);
  out.push({ kind: "wc", label: "WC pan", edge: a.edge, t: a.t0 + 350, supplyZ: 250, hot: false, size: [380, 700, 400] });
  const b = pick(1);
  out.push({ kind: "basin", label: "Wash basin", edge: b.edge, t: (b.t0 + b.t1) / 2, supplyZ: 550, hot: true, size: [500, 420, 150] });
  const c = pick(2);
  out.push({ kind: "shower", label: "Shower tray and head", edge: c.edge, t: Math.min(c.edge.length - 500, c.t1 - 450), supplyZ: 1100, hot: true, size: [900, 900, 60] });
  return out;
}

export function generatePlumbing(ctx: Ctx): void {
  const ground = ctx.ground;
  const topLevel = ctx.top;
  if (!ground || !topLevel) return;
  const b = ctx.bounds;
  const layouts = new Map<string, RoomLayout>();
  for (const room of ctx.rooms) layouts.set(room.id, roomLayout(ctx, room));

  // The wet stack stands in the ground-floor bathroom's first fixture wall; every storey's wet rooms share its plan position.
  const bathG = ctx.roomsOf(ground.levelId).find((r) => r.kind === "bath");
  const bathLayout = bathG ? layouts.get(bathG.id)! : null;
  const stackRun = bathLayout ? longestFreeRun(bathLayout, 200) : null;
  const stackPlan: P2 = bathLayout && stackRun ? onEdge(stackRun.edge, stackRun.t1 - 120, 110) : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const roofTop = ctx.project.roofs[0] ? ctx.project.roofs[0].elevation + ctx.project.roofs[0].thickness : topLevel.topZ;
  const ventTop = roofTop + 700;
  const drainZ = -1200;

  // --- Underground drain, chambers ------------------------------------------
  const dirs: { name: string; d: number; dx: number; dy: number }[] = [
    { name: "west", d: stackPlan.x - b.minX, dx: -1, dy: 0 }, { name: "east", d: b.maxX - stackPlan.x, dx: 1, dy: 0 },
    { name: "south", d: stackPlan.y - b.minY, dx: 0, dy: -1 }, { name: "north", d: b.maxY - stackPlan.y, dx: 0, dy: 1 },
  ];
  const way = dirs.sort((p, q) => p.d - q.d)[0]!;
  const ic1: P2 = { x: stackPlan.x + way.dx * (way.d + 1800), y: stackPlan.y + way.dy * (way.d + 1800) };
  const ic2: P2 = { x: ic1.x + way.dx * 3000, y: ic1.y + way.dy * 3000 };
  const drain = manhattan([at(stackPlan, drainZ + 600), at(stackPlan, drainZ), at(ic1, drainZ), at(ic2, drainZ)], 110);
  const drainComp = ctx.add({
    id: "plumb:drain", name: "Underground foul drain", kind: "drain-horizontal", category: "plumbing", subcategory: "Underground drainage", stage: 10, level: null, storeyIndex: -1, layer: "plumbing", materialId: "pipe-waste", shapes: drain.shapes, repeated: { noun: "run" },
    source: "schematic", concealed: true, explode: { layerIndex: 0, dir: v3(0, 0, -1) }, dims: { length: { value: round(drain.length, 0), unit: "mm", status: "assumed" } },
    note: "Laid to a fall (for example 1:60) on a granular bed. Drawn level here; the gradient is part of the drainage design.",
  });
  addQuantity(ctx, drainComp, { workItem: "plumbing.pipe.drain-110", description: "Underground drain, 110 mm", section: "O", unit: "m", value: round(drain.length / 1000, 3), formula: `stack → chamber 1 → chamber 2 = ${f2(drain.length / 1000)} m`, inputs: { length: round(drain.length, 0), diameter: 110 }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes }, exclusions: ["Excavation", "Granular bed and surround", "Connection to sewer or septic system"] });
  const chambers = ctx.add({
    id: "plumb:chambers", name: "Inspection chambers", kind: "inspection-chamber", category: "plumbing", subcategory: "Underground drainage", stage: 10, level: null, storeyIndex: -1, layer: "plumbing", materialId: "chamber",
    shapes: [ic1, ic2].map((c) => box(c.x, c.y, (ASSUME.naturalGround + drainZ - 300) / 2, 700, 700, ASSUME.naturalGround - (drainZ - 300))), repeated: { noun: "chamber" }, source: "schematic", parentId: drainComp.id, concealed: true, explode: { layerIndex: 1, dir: v3(0, 0, -1) },
    label: { text: "Inspection chamber", anchor: v3(ic1.x, ic1.y, ASSUME.naturalGround + 300) }, note: "Final connection (public sewer, septic tank or other) depends on local rules and is not designed here.",
  });
  addQuantity(ctx, chambers, { workItem: "plumbing.chamber", description: "Inspection chambers", section: "O", unit: "piece", value: 2, formula: "2 chambers (example layout)", inputs: { count: 2 }, status: "assumed" });

  // --- Stack and vent ----------------------------------------------------------
  const stackShapes: Shape[] = [cyl(stackPlan.x, stackPlan.y, (drainZ + 600 + ventTop) / 2, 55, ventTop - (drainZ + 600), "z")];
  const stack = ctx.add({
    id: "plumb:stack", name: "Soil and vent stack", kind: "drain-stack", category: "plumbing", subcategory: "Stacks", stage: 10, level: null, storeyIndex: 0, layer: "plumbing", materialId: "pipe-waste", shapes: stackShapes,
    source: "schematic", concealed: true, parentId: drainComp.id, explode: { layerIndex: 2, dir: v3(0, 0, 1) }, dims: { height: { value: round(ventTop - drainZ, 0), unit: "mm", status: "calculated" } },
    label: { text: "Soil stack", anchor: v3(stackPlan.x, stackPlan.y, ctx.levels[1]?.floorZ ?? 3200) }, note: "One stack serves the stacked wet rooms and rises above the roof to vent. It passes through each slab in a sleeve.",
  });
  addQuantity(ctx, stack, { workItem: "plumbing.pipe.soil-110", description: "Soil and vent stack, 110 mm", section: "O", unit: "m", value: round((ventTop - roofTop + (roofTop - (drainZ + 600))) / 1000 - 0.7, 3), formula: `stack from ${f2((drainZ + 600) / 1000)} m to roof level ${f2(roofTop / 1000)} m`, inputs: { bottom: drainZ + 600, roof: roofTop }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes } });
  addQuantity(ctx, stack, { workItem: "plumbing.pipe.vent-110", description: "Vent extension above roof, 110 mm", section: "O", unit: "m", value: 0.7, formula: "terminal 700 mm above the roof surface", inputs: { height: 700 }, status: "assumed" });
  const cleanout = ctx.add({
    id: "plumb:cleanout", name: "Rodding access at the stack base", kind: "cleanout", category: "plumbing", subcategory: "Stacks", stage: 10, level: ground, layer: "plumbing", materialId: "valve", shapes: [cyl(stackPlan.x, stackPlan.y, 300, 70, 140, "z")], source: "schematic",
    parentId: stack.id, explode: { layerIndex: 3, dir: v3(0, 0, 1) },
  });
  addQuantity(ctx, cleanout, { workItem: "plumbing.cleanout", description: "Cleanouts", section: "O", unit: "piece", value: 1, formula: "1 at the stack base", inputs: { count: 1 }, status: "assumed" });

  // --- Water: mains, pump, tank, risers -----------------------------------------
  const utilityG = ctx.roomsOf(ground.levelId).find((r) => r.kind === "laundry" || r.kind === "store");
  const utilLayout = utilityG ? layouts.get(utilityG.id)! : null;
  const utilRun = utilLayout ? longestFreeRun(utilLayout, 250) : null;
  const pumpPlan: P2 = utilLayout && utilRun ? onEdge(utilRun.edge, utilRun.t0 + 250, 250) : { x: b.maxX - 800, y: b.maxY - 800 };
  const entry: P2 = { x: pumpPlan.x, y: b.minY - 3000 };
  const tankPlan: P2 = { x: pumpPlan.x, y: Math.min(b.maxY - 900, pumpPlan.y) };
  const tankZ = roofTop + 1500;
  const mains = manhattan([at(entry, ASSUME.naturalGround - 150), at({ x: entry.x, y: pumpPlan.y }, ASSUME.naturalGround - 150), at(pumpPlan, ASSUME.naturalGround - 150), at(pumpPlan, 300)], 25);
  const mainsComp = ctx.add({
    id: "plumb:mains", name: "Mains water pipe, boundary to pump", kind: "water-entry", category: "plumbing", subcategory: "Supply", stage: 10, level: null, storeyIndex: -1, layer: "plumbing", materialId: "pipe-cold", shapes: mains.shapes, repeated: { noun: "run" },
    source: "schematic", concealed: true, explode: { layerIndex: 0, dir: v3(0, 0, -1) }, note: "Buried at the depth the water authority requires, with warning tape above.",
  });
  addQuantity(ctx, mainsComp, { workItem: "plumbing.pipe.cold-25", description: "Mains and rising main, 25 mm", section: "O", unit: "m", value: round(mains.length / 1000, 3), formula: `boundary → pump = ${f2(mains.length / 1000)} m`, inputs: { length: round(mains.length, 0), diameter: 25 }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes } });
  const meter = ctx.add({
    id: "plumb:water-meter", name: "Water meter", kind: "water-meter", category: "plumbing", subcategory: "Supply", stage: 10, level: null, storeyIndex: -1, layer: "plumbing", materialId: "valve",
    shapes: [box(entry.x, entry.y, ASSUME.naturalGround + 100, 300, 250, 250)], source: "schematic", parentId: mainsComp.id, explode: { layerIndex: 1, dir: v3(0, 0, 1) }, label: { text: "Water meter", anchor: v3(entry.x, entry.y, ASSUME.naturalGround + 500) },
  });
  addQuantity(ctx, meter, { workItem: "plumbing.meter", description: "Water meter and boundary valve", section: "O", unit: "set", value: 1, formula: "1 at the boundary", inputs: { count: 1 }, status: "assumed" });
  const pump = ctx.add({
    id: "plumb:pump", name: "Booster pump", kind: "pump", category: "plumbing", subcategory: "Supply", stage: 10, level: ground, layer: "plumbing", materialId: "appliance", shapes: [box(pumpPlan.x, pumpPlan.y, 300, 500, 300, 400)],
    source: "schematic", room: utilityG?.name ?? null, parentId: mainsComp.id, explode: { layerIndex: 2, dir: v3(0, 0, 1) }, label: { text: "Booster pump", anchor: v3(pumpPlan.x, pumpPlan.y, 900) }, note: "Pump duty and the need for one depend on mains pressure and the building height.",
  });
  addQuantity(ctx, pump, { workItem: "plumbing.pump", description: "Booster pump", section: "O", unit: "piece", value: 1, formula: "1 pump (example)", inputs: { count: 1 }, status: "assumed" });
  const tank = ctx.add({
    id: "plumb:tank", name: "Roof water tank (1000 litres, example)", kind: "water-tank", category: "plumbing", subcategory: "Storage", stage: 10, level: topLevel, layer: "plumbing", materialId: "water-tank",
    shapes: [cyl(tankPlan.x, tankPlan.y, tankZ, 550, 1200, "x"), ...[-500, 500].flatMap((dx) => [-300, 300].map((dy) => box(tankPlan.x + dx, tankPlan.y + dy, roofTop + 700, 100, 100, 1400)))], repeated: undefined,
    source: "schematic", parentId: pump.id, explode: { layerIndex: 3, dir: v3(0, 0, 1) }, label: { text: "Water tank", anchor: v3(tankPlan.x, tankPlan.y, tankZ + 700) }, note: "Stand, size and structural support are designed separately; the roof slab must be designed to carry it.",
  });
  addQuantity(ctx, tank, { workItem: "plumbing.tank", description: "Water storage tank with stand", section: "O", unit: "piece", value: 1, formula: "1 tank (example)", inputs: { count: 1 }, status: "assumed" });

  // Up-feed riser from the pump to the tank, down-feed riser from the tank beside the stack.
  const upfeed = manhattan([at(pumpPlan, 500), at(pumpPlan, tankZ - 400), at(tankPlan, tankZ - 400)], 25);
  const downPlan: P2 = { x: stackPlan.x + (stackRun ? stackRun.edge.ux * 200 : 200), y: stackPlan.y + (stackRun ? stackRun.edge.uy * 200 : 0) };
  const down = manhattan([at(tankPlan, tankZ - 400), at({ x: downPlan.x, y: tankPlan.y }, tankZ - 400), at(downPlan, tankZ - 400), at(downPlan, 300)], 25);
  const riserComp = ctx.add({
    id: "plumb:riser", name: "Cold water risers (up-feed and down-feed)", kind: "riser", category: "plumbing", subcategory: "Supply", stage: 10, level: null, storeyIndex: 0, layer: "plumbing", materialId: "pipe-cold", shapes: [...upfeed.shapes, ...down.shapes], repeated: { noun: "segment" },
    source: "schematic", concealed: true, parentId: tank.id, explode: { layerIndex: 4, dir: v3(0, 0, 1) }, note: "Risers pass through the slabs in sleeves. Isolation valves at each branch let one storey be shut off.",
  });
  addQuantity(ctx, riserComp, { workItem: "plumbing.pipe.cold-25", description: "Mains and rising main, 25 mm", section: "O", unit: "m", value: round((upfeed.length + down.length) / 1000, 3), formula: `up-feed ${f2(upfeed.length / 1000)} m + down-feed ${f2(down.length / 1000)} m`, inputs: { upfeed: round(upfeed.length, 0), downfeed: round(down.length, 0), diameter: 25 }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes } });

  // --- Wet rooms on each storey ---------------------------------------------------
  for (const level of ctx.levels) {
    for (const room of ctx.roomsOf(level.levelId)) {
      if (!["bath", "wc", "kitchen", "laundry"].includes(room.kind)) continue;
      wetRoom(ctx, level, room, layouts.get(room.id)!, stackPlan, downPlan, riserComp.id, stack.id);
    }
  }

  // --- Rainwater ---------------------------------------------------------------------
  rainwater(ctx, roofTop);
}

function wetRoom(ctx: Ctx, level: LevelInfo, room: RoomInfo, layout: RoomLayout, stackPlan: P2, downPlan: P2, riserId: string, stackId: string): void {
  const rid = `plumb:${level.index}:${slug(room.name)}`;
  const grid = ctx.gridRef(level.levelId, room.centre.x, room.centre.y, 2500);
  const base = { category: "plumbing" as const, stage: 10 as const, level, room: room.name, grid, source: "schematic" as const };
  const z0 = level.floorZ;
  let fixtures: Fixture[] = fixturesFor(layout);
  let supplyPts: { fx: Fixture | null; pos: P2; z: number; hot: boolean }[] = [];
  const kitchenOrLaundry = room.kind === "kitchen" || room.kind === "laundry";
  if (kitchenOrLaundry) {
    const run = longestFreeRun(layout, 400);
    if (run) {
      const edge = run.edge;
      const t = (run.t0 + run.t1) / 2;
      const f: Fixture = { kind: "basin", label: room.kind === "kitchen" ? "Sink supply and waste stubs" : "Washing machine tap and standpipe", edge, t, supplyZ: room.kind === "kitchen" ? 900 : 1000, hot: room.kind === "kitchen", size: [100, 100, 100] };
      fixtures = [];
      supplyPts = [{ fx: f, pos: onEdge(edge, t, -30), z: z0 + f.supplyZ, hot: f.hot }];
    }
  } else {
    supplyPts = fixtures.map((f) => ({ fx: f, pos: onEdge(f.edge, f.t, -30), z: z0 + f.supplyZ, hot: f.hot }));
  }
  // Fixtures (visible, with traps and floor drain).
  const shapes: Shape[] = [];
  for (const f of fixtures) {
    const [w, d, h] = f.size;
    if (f.kind === "wc") shapes.push(wallBox(layout, f.edge, f.t, h / 2, w, h, d), wallBox(layout, f.edge, f.t, 650, w, 350, 180, 200));
    else if (f.kind === "basin") shapes.push(wallBox(layout, f.edge, f.t, 800, w, h, d), wallBox(layout, f.edge, f.t, 450, 60, 400, 60, 100));
    else shapes.push(box(onEdge(f.edge, f.t, 450).x + f.edge.ux * 450, onEdge(f.edge, f.t, 450).y + f.edge.uy * 450, z0 + 30, w, d, h), cyl(onEdge(f.edge, f.t, 50).x + f.edge.ux * 450, onEdge(f.edge, f.t, 50).y + f.edge.uy * 450, z0 + 1900, 70, 50, "y"));
  }
  const kinds = new Map<string, number>();
  for (const f of fixtures) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
  if (fixtures.length) {
    const comp = ctx.add({ ...base, id: `${rid}:fixtures`, name: `Sanitary fixtures — ${room.name}, ${level.name}`, kind: "wc", subcategory: "Fixtures", layer: "plumbing", materialId: "sanitary", shapes, repeated: { noun: "fixture part" }, explode: { layerIndex: 5, dir: v3(0, 0, 1) }, parentId: `${rid}:supply` });
    for (const [kind, count] of kinds) {
      const desc = kind === "wc" ? "WC pan with cistern" : kind === "basin" ? "Wash basin with tap" : "Shower tray with mixer and head";
      addQuantity(ctx, comp, { workItem: `sanitary.${kind}`, description: desc, section: "P", unit: "piece", value: count, formula: `${count} in ${room.name}`, inputs: { count }, status: "assumed" }, { assumptions: ["The fixture set is an example layout; the real set comes from the brief."] });
    }
  }
  if (supplyPts.length === 0) return;

  // Cold and hot supply: branch off the down-feed riser at floor level, along the walls.
  const cold: Shape[] = [];
  const hot: Shape[] = [];
  let coldLen = 0;
  let hotLen = 0;
  const heaterPos = onEdge(supplyPts[0]!.fx!.edge, Math.max(250, Math.min(supplyPts[0]!.fx!.edge.length - 250, supplyPts[0]!.fx!.t + 600)), 0);
  for (const sp of supplyPts) {
    const r = { x: downPlan.x, y: downPlan.y, z: z0 + 600 };
    const m = manhattan([r, { x: sp.pos.x, y: r.y, z: r.z }, { x: sp.pos.x, y: sp.pos.y, z: r.z }, { x: sp.pos.x, y: sp.pos.y, z: sp.z }], 20);
    cold.push(...m.shapes);
    coldLen += m.length;
    if (sp.hot) {
      const h = manhattan([{ x: heaterPos.x, y: heaterPos.y, z: z0 + 1800 }, { x: heaterPos.x, y: sp.pos.y + 25, z: z0 + 1800 }, { x: sp.pos.x + 25, y: sp.pos.y + 25, z: z0 + 1800 }, { x: sp.pos.x + 25, y: sp.pos.y + 25, z: sp.z }], 20);
      hot.push(...h.shapes);
      hotLen += h.length;
    }
  }
  const supply = ctx.add({ ...base, id: `${rid}:supply`, name: `Cold-water pipes — ${room.name}, ${level.name}`, kind: "pipe-cold", subcategory: "Supply", layer: "plumbing", materialId: "pipe-cold", shapes: cold, repeated: { noun: "segment" }, concealed: true, parentId: riserId, explode: { layerIndex: 3, dir: v3(0, 0, 1) } });
  addQuantity(ctx, supply, { workItem: "plumbing.pipe.cold-20", description: "Cold-water pipe, 20 mm", section: "O", unit: "m", value: round(coldLen / 1000, 3), formula: `branches from the riser to ${supplyPts.length} point(s) = ${f2(coldLen / 1000)} m`, inputs: { length: round(coldLen, 0), points: supplyPts.length, diameter: 20 }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes } });
  const valve = ctx.add({ ...base, id: `${rid}:valve`, name: `Isolation valve — ${room.name}, ${level.name}`, kind: "valve", subcategory: "Valves", layer: "plumbing", materialId: "valve", shapes: [cyl(downPlan.x, downPlan.y, z0 + 600, 35, 60, "x")], parentId: supply.id, explode: { layerIndex: 4, dir: v3(0, 0, 1) } });
  addQuantity(ctx, valve, { workItem: "plumbing.valve", description: "Isolation valves", section: "O", unit: "piece", value: 1, formula: "1 per room branch", inputs: { count: 1 }, status: "assumed" });
  if (hot.length) {
    const heater = ctx.add({ ...base, id: `${rid}:heater`, name: `Water heater — ${room.name}, ${level.name}`, kind: "water-heater", subcategory: "Hot water", layer: "plumbing", materialId: "appliance", shapes: [cyl(heaterPos.x, heaterPos.y, z0 + 1900, 200, 600, "z")], parentId: supply.id, explode: { layerIndex: 5, dir: v3(0, 0, 1) }, note: "Electric storage heater (example). Needs its own circuit, a pressure-relief valve and a drain." });
    addQuantity(ctx, heater, { workItem: "sanitary.heater", description: "Water heaters", section: "P", unit: "piece", value: 1, formula: "1 per wet room with hot water", inputs: { count: 1 }, status: "assumed" });
    const hp = ctx.add({ ...base, id: `${rid}:hot`, name: `Hot-water pipes — ${room.name}, ${level.name}`, kind: "pipe-hot", subcategory: "Hot water", layer: "plumbing", materialId: "pipe-hot", shapes: hot, repeated: { noun: "segment" }, concealed: true, parentId: heater.id, explode: { layerIndex: 3, dir: v3(0, 0, 1) } });
    addQuantity(ctx, hp, { workItem: "plumbing.pipe.hot-20", description: "Hot-water pipe, 20 mm", section: "O", unit: "m", value: round(hotLen / 1000, 3), formula: `heater to fixtures = ${f2(hotLen / 1000)} m`, inputs: { length: round(hotLen, 0), diameter: 20 }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes }, assumptions: ["Insulation of hot pipes is a separate item and is not counted here."] });
  }
  // Waste: each point drains to the stack along the wall base.
  const waste: Shape[] = [];
  let wasteLen = 0;
  let traps = 0;
  const wasteZ = z0 + 60;
  const drains: Shape[] = [];
  for (const sp of supplyPts) {
    const wcLike = sp.fx?.kind === "wc";
    const dia = wcLike ? 110 : 50;
    const end = { x: stackPlan.x, y: stackPlan.y };
    const m = manhattan([{ x: sp.pos.x, y: sp.pos.y, z: wasteZ }, { x: end.x, y: sp.pos.y, z: wasteZ }, { x: end.x, y: end.y, z: wasteZ }], dia);
    if (wcLike) { waste.push(...m.shapes); wasteLen += m.length; } else { waste.push(...m.shapes); wasteLen += m.length; traps += 1; }
    if (sp.fx?.kind === "shower") drains.push(cyl(sp.pos.x + sp.fx.edge.nx * 450 + sp.fx.edge.ux * 450, sp.pos.y + sp.fx.edge.ny * 450 + sp.fx.edge.uy * 450, z0 + 25, 55, 20, "z"));
  }
  if (waste.length) {
    const w = ctx.add({ ...base, id: `${rid}:waste`, name: `Waste pipes — ${room.name}, ${level.name}`, kind: "pipe-waste", subcategory: "Waste", layer: "plumbing", materialId: "pipe-waste", shapes: waste, repeated: { noun: "segment" }, concealed: true, parentId: stackId, explode: { layerIndex: 2, dir: v3(0, 0, -1) }, note: "Waste pipes need a fall towards the stack; they are boxed in at the wall base here." });
    addQuantity(ctx, w, { workItem: "plumbing.pipe.waste-50", description: "Waste pipe, 50 mm (110 mm for WCs)", section: "O", unit: "m", value: round(wasteLen / 1000, 3), formula: `fixtures to stack = ${f2(wasteLen / 1000)} m`, inputs: { length: round(wasteLen, 0) }, status: "assumed" }, { allowance: { rule: "Fittings and waste (example assumption)", percent: ctx.rules.allowances.pipes } });
    if (traps) addQuantity(ctx, w, { workItem: "plumbing.trap", description: "Traps", section: "O", unit: "piece", value: traps, formula: `${traps} water-seal traps`, inputs: { count: traps }, status: "assumed" });
  }
  if (drains.length) {
    const fd = ctx.add({ ...base, id: `${rid}:floor-drain`, name: `Shower floor drain — ${room.name}, ${level.name}`, kind: "floor-drain", subcategory: "Waste", layer: "plumbing", materialId: "valve", shapes: drains, repeated: { noun: "drain" }, parentId: `${rid}:waste`, explode: { layerIndex: 6, dir: v3(0, 0, 1) } });
    addQuantity(ctx, fd, { workItem: "plumbing.floor-drain", description: "Floor drains", section: "O", unit: "piece", value: drains.length, formula: `${drains.length} shower drain(s)`, inputs: { count: drains.length }, status: "assumed" });
  }
}

function rainwater(ctx: Ctx, roofTop: number): void {
  const b = ctx.bounds;
  const groundTop = ASSUME.naturalGround;
  const overhang = 450;
  const set: { variant: "flat" | "pitched"; points: { top: Pt; out: P2 }[] }[] = [
    { variant: "flat", points: [0.25, 0.75].map((f) => ({ top: { x: b.minX + (b.maxX - b.minX) * f, y: b.minY - 100 - 60, z: roofTop + 80 }, out: { x: b.minX + (b.maxX - b.minX) * f, y: b.minY - 1800 } })) },
    { variant: "pitched", points: [{ top: { x: b.maxX + overhang - 150, y: b.minY - overhang + 70, z: roofTop + 120 }, out: { x: b.maxX + overhang - 150, y: b.minY - 1800 } }, { top: { x: b.maxX + overhang - 150, y: b.maxY + overhang - 70, z: roofTop + 120 }, out: { x: b.maxX + overhang - 150, y: b.maxY + 1800 } }] },
  ];
  for (const s of set) {
    const shapes: Shape[] = [];
    let len = 0;
    let drainLen = 0;
    const drainShapes: Shape[] = [];
    s.points.forEach((pt) => {
      const m = manhattan([pt.top, { x: pt.top.x, y: pt.top.y, z: groundTop - 300 }], 90);
      shapes.push(...m.shapes);
      len += m.length;
      const d = manhattan([{ x: pt.top.x, y: pt.top.y, z: groundTop - 800 }, { x: pt.top.x, y: pt.out.y, z: groundTop - 800 }], 100);
      drainShapes.push(...d.shapes);
      drainLen += d.length;
    });
    const variant = { group: "roof", value: s.variant } as const;
    const down = ctx.add({
      id: `plumb:rain:${s.variant}:downpipes`, name: `Rainwater downpipes (${s.variant} roof)`, kind: "rain-downpipe", category: "plumbing", subcategory: "Rainwater", stage: 10, level: ctx.top, layer: "plumbing", materialId: "pipe-rain", shapes, repeated: { noun: "downpipe" },
      source: "schematic", variant, explode: { layerIndex: 7, dir: v3(0, -1, 0) }, label: s.variant === "flat" ? { text: "Rainwater downpipe", anchor: v3(s.points[0]!.top.x, s.points[0]!.top.y, roofTop - 1500) } : undefined,
      note: "Rainwater has its own drain, kept separate from the foul drain.",
    });
    addQuantity(ctx, down, { workItem: "plumbing.pipe.rain-90", description: "Rainwater downpipe, 90 mm", section: "O", unit: "m", value: round(len / 1000, 3), formula: `${s.points.length} downpipes from roof to ground = ${f2(len / 1000)} m`, inputs: { length: round(len, 0), count: s.points.length }, status: "assumed" }, { allowance: { rule: "Brackets and fittings (example assumption)", percent: ctx.rules.allowances.pipes } });
    const storm = ctx.add({
      id: `plumb:rain:${s.variant}:storm`, name: `Storm drain to soakaway (${s.variant} roof)`, kind: "drain-horizontal", category: "plumbing", subcategory: "Rainwater", stage: 10, level: null, storeyIndex: -1, layer: "plumbing", materialId: "pipe-rain", shapes: drainShapes, repeated: { noun: "run" },
      source: "schematic", variant, concealed: true, parentId: down.id, explode: { layerIndex: 0, dir: v3(0, 0, -1) },
    });
    addQuantity(ctx, storm, { workItem: "plumbing.pipe.storm-100", description: "Storm drain, 100 mm", section: "O", unit: "m", value: round(drainLen / 1000, 3), formula: `downpipe base to the disposal point = ${f2(drainLen / 1000)} m`, inputs: { length: round(drainLen, 0) }, status: "assumed" }, { allowance: { rule: "Fittings (example assumption)", percent: ctx.rules.allowances.pipes }, exclusions: ["Soakaway or connection to the public storm drain"] });
  }
}
