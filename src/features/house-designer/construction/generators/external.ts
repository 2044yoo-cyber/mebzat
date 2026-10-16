import { ASSUME, UP, dim, onWall, type Ctx, type LevelInfo, type WallFrame } from "../context";
import { alongLine, box, boxAt, cyl, polygonArea, polygonBounds, prism, rectPoly, subtractConvex, v3, type P2, type Shape } from "../geometry";
import { addQuantity, concreteQuantity, f2, f3, round } from "../helpers";
import { insetOutline } from "../structure-data";
import { generateBalconyFinish } from "./balcony";
import { outwardSign } from "./foundation";

/**
 * Stage 18: external plaster and paint, the entrance steps and railing,
 * balconies and railings from the project, paving, external drainage, the
 * boundary wall and gates, landscaping, the service route and commissioning.
 */

const GROUND = ASSUME.naturalGround;
const FFL = ASSUME.floorBuildUp;
const EXT_COATS = [
  { id: "base", name: "External plaster, base coat", material: "plaster-base", t: ASSUME.plasterBase, workItem: "plaster.external-base", desc: "External plaster base coat", section: "J" as const },
  { id: "final", name: "External plaster, final coat", material: "plaster-final", t: ASSUME.plasterFinal + ASSUME.externalPlasterExtra, workItem: "plaster.external-final", desc: "External plaster final coat", section: "J" as const },
  { id: "paint", name: "External paint", material: "paint-ext", t: ASSUME.paint, workItem: "paint.external", desc: "Exterior masonry paint", section: "M" as const },
];

type Piece = { s0: number; s1: number; z0: number; z1: number };
function facadePieces(wall: WallFrame, z0: number, z1: number, base: number): Piece[] {
  const out: Piece[] = [];
  let cursor = 0;
  const opens = [...wall.openings].sort((a, b) => a.s0 - b.s0);
  for (const o of opens) {
    if (o.s0 > cursor) out.push({ s0: cursor, s1: o.s0, z0, z1 });
    if (base + o.z0 > z0) out.push({ s0: o.s0, s1: o.s1, z0, z1: base + o.z0 });
    if (base + o.z1 < z1) out.push({ s0: o.s0, s1: o.s1, z0: base + o.z1, z1 });
    cursor = Math.max(cursor, o.s1);
  }
  if (cursor < wall.length) out.push({ s0: cursor, s1: wall.length, z0, z1 });
  return out.filter((p) => p.s1 - p.s0 > 1 && p.z1 - p.z0 > 1);
}

function slabOn(wall: WallFrame, out: number, piece: Piece, offset: number, thick: number): Shape {
  const n = out * (wall.thickness / 2 + offset + thick / 2);
  return alongLine(onWall(wall, piece.s0, n), onWall(wall, piece.s1, n), thick, piece.z0, piece.z1);
}

export function generateExternal(ctx: Ctx): void {
  const ground = ctx.ground;
  const top = ctx.top;
  if (!ground || !top) return;
  const b = ctx.bounds;
  const roof = ctx.project.roofs[0];
  const roofTop = roof ? roof.elevation + roof.thickness : top.topZ;
  const plot = (ctx.project.site?.boundary ?? rectPoly(b.minX - 2500, b.minY - 2500, b.maxX + 2500, b.maxY + 2500)).map((p) => ({ x: p.x, y: p.y }));
  const pb = polygonBounds(plot);

  // --- External plaster and paint ------------------------------------------------
  const parapetH = ASSUME.parapetHeight;
  for (const level of ctx.levels) {
    const walls = ctx.wallsOf(level.levelId).filter((w) => w.exterior);
    EXT_COATS.forEach((coat, ci) => {
      const before = EXT_COATS.slice(0, ci).reduce((s, c) => s + c.t, 0);
      const shapes: Shape[] = [];
      const rows: { wall: WallFrame; net: number; gross: number; out: number; text: string }[] = [];
      for (const wall of walls) {
        const sign = outwardSign(wall) || -1;
        const base = level.floorZ;
        const pieces = facadePieces(wall, base, level.topZ, base);
        pieces.forEach((p) => shapes.push(slabOn(wall, sign, p, before, coat.t)));
        const gross = wall.length * (level.topZ - base) * 1e-6;
        let ded = 0;
        for (const o of wall.openings) if (ctx.rules.openingDeduction === "all" || (ctx.rules.openingDeduction === "over-threshold" && o.width * o.height * 1e-6 > ctx.rules.openingThresholdM2)) ded += o.width * o.height * 1e-6;
        rows.push({ wall, gross, out: ded, net: gross - ded, text: `${f2(wall.length / 1000)} m × ${f3((level.topZ - base) / 1000)} m − openings ${f2(ded)} m² = ${f2(gross - ded)} m²` });
      }
      if (shapes.length === 0) return;
      const comp = ctx.add({
        id: `ext:${level.index}:${coat.id}`, name: `${coat.name} — ${level.name}`, kind: coat.id === "paint" ? "paint-layer" : "external-plaster", category: "external", subcategory: "External finishes", stage: 18, level, layer: coat.id === "paint" ? "paint" : "plaster", materialId: coat.material,
        shapes, repeated: { noun: "panel" }, source: "schematic", explode: { layerIndex: ci, dir: v3(0, 0, 0) }, dims: { thickness: dim(coat.t, "mm", "assumed") }, note: "Measured on the outer wall faces from floor level to the next floor; column and beam faces are not added.",
      });
      for (const r of rows) addQuantity(ctx, comp, { workItem: coat.workItem, description: coat.desc, section: coat.section, unit: "m²", value: round(r.net, 3), formula: r.text, inputs: { length: round(r.wall.length, 0), openings: round(r.out, 3), rule: ctx.rules.openingDeduction }, status: "calculated" },
        { allowance: { rule: coat.section === "J" ? "Wastage and thickness variation (example assumption)" : "Waste and absorbency (example assumption)", percent: coat.section === "J" ? ctx.rules.allowances.plaster : ctx.rules.allowances.paint }, assumptions: [`Openings over ${ctx.rules.openingThresholdM2} m² are deducted (rule: ${ctx.rules.openingDeduction}).`], room: null });
    });
  }
  // Parapet outer face (flat roof only).
  {
    const walls = ctx.wallsOf(top.levelId).filter((w) => w.exterior);
    const shapes: Shape[] = [];
    let length = 0;
    for (const wall of walls) {
      const sign = outwardSign(wall) || -1;
      shapes.push(slabOn(wall, sign, { s0: 0, s1: wall.length, z0: top.topZ, z1: roofTop + parapetH }, 0, ASSUME.plasterBase + ASSUME.plasterFinal + ASSUME.externalPlasterExtra));
      length += wall.length;
    }
    const area = length * (roofTop + parapetH - top.topZ) * 1e-6;
    const comp = ctx.add({ id: "ext:parapet-render", name: "Parapet — external render and paint", kind: "external-plaster", category: "external", subcategory: "External finishes", stage: 18, level: top, layer: "plaster", materialId: "plaster-final", shapes, variant: { group: "roof", value: "flat" }, source: "schematic", explode: { layerIndex: 3, dir: v3(0, 0, 0) } });
    addQuantity(ctx, comp, { workItem: "plaster.external-final", description: "External plaster final coat", section: "J", unit: "m²", value: round(area, 3), formula: `outer parapet face ${f2(length / 1000)} m × ${f3((roofTop + parapetH - top.topZ) / 1000)} m`, inputs: { length: round(length, 0) }, status: "assumed" }, { allowance: { rule: "Wastage (example assumption)", percent: ctx.rules.allowances.plaster } });
  }

  // --- Entrance steps and railing -----------------------------------------------------
  const entrance = ctx.wallsOf(ground.levelId).filter((w) => w.exterior).flatMap((w) => w.openings.filter((o) => o.kind === "door").map((o) => ({ wall: w, o })))[0];
  const platW = 2000;
  let stepsRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let pathStart: P2 | null = null;
  let pathDir: P2 = { x: 0, y: -1 };
  if (entrance) {
    const { wall, o } = entrance;
    const sign = outwardSign(wall) || -1;
    const nx = wall.nx * sign;
    const ny = wall.ny * sign;
    const faceOut = wall.thickness / 2 + ASSUME.plasterBase + ASSUME.plasterFinal + ASSUME.externalPlasterExtra + 5;
    const risers = 3;
    const riser = (FFL - GROUND) / risers;
    const mid = (o.s0 + o.s1) / 2;
    const depths = [1000, 300, 300];
    let offset = faceOut;
    const shapes: Shape[] = [];
    const concreteVolumes: number[] = [];
    depths.forEach((d, k) => {
      const topZ = FFL - k * riser;
      const centre = onWall(wall, mid, sign * (offset + d / 2));
      const along = Math.abs(wall.ux) > 0.999;
      shapes.push(box(centre.x, centre.y, (GROUND + topZ) / 2, along ? platW : d, along ? d : platW, topZ - GROUND));
      concreteVolumes.push(platW * d * (topZ - GROUND) * 1e-9);
      offset += d;
    });
    const total = concreteVolumes.reduce((s, v) => s + v, 0);
    const steps = ctx.add({
      id: "ext:steps", name: "Entrance landing and steps", kind: "entrance-steps", category: "external", subcategory: "Steps", stage: 18, level: ground, layer: "concrete", materialId: "concrete", shapes, repeated: { noun: "step" }, source: "project", sourceRef: o.id,
      explode: { layerIndex: 0, dir: v3(nx, ny, 0) }, dims: { height: dim(round(FFL - GROUND, 1), "mm", "calculated", `${risers} risers of ${f2(riser)} mm`), width: dim(platW, "mm", "assumed") },
      label: { text: "Entrance steps", anchor: v3(onWall(wall, mid, sign * (faceOut + 700)).x, onWall(wall, mid, sign * (faceOut + 700)).y, FFL + 300) }, note: "Risers are equal. The landing is deep enough to open the door outwards and to stand on.",
    });
    concreteQuantity(ctx, steps, "concrete.steps", "Entrance steps (solid)", total, `landing + two steps, ${f3(platW / 1000)} m wide, to the ground = ${f3(total)} m³`, { width: platW, risers, riser: round(riser, 1) }, "assumed", ["Cast solid on compacted fill: the foundation of the steps is not designed here."]);
    // Railing down both sides.
    const rail: Shape[] = [];
    const totalDepth = depths.reduce((s, d) => s + d, 0);
    for (const side of [-1, 1]) {
      const sideOffset = side * (platW / 2 + 40);
      const a = onWall(wall, mid + sideOffset, sign * faceOut);
      const c = onWall(wall, mid + sideOffset, sign * (faceOut + totalDepth));
      rail.push(alongLine(a, c, 40, FFL + 880, FFL + 920));
      for (let d = 0; d <= totalDepth; d += 500) {
        const p = onWall(wall, mid + sideOffset, sign * (faceOut + d));
        const stepTop = d < depths[0]! ? FFL : d < depths[0]! + depths[1]! ? FFL - riser : FFL - 2 * riser;
        rail.push(boxAt(p.x - 20, p.y - 20, stepTop, 40, 40, FFL + 900 - stepTop));
      }
    }
    const railComp = ctx.add({
      id: "ext:steps-railing", name: "Entrance steps handrails", kind: "railing", category: "external", subcategory: "Railings", stage: 18, level: ground, layer: "external", materialId: "railing", shapes: rail, repeated: { noun: "part" }, source: "schematic",
      parentId: steps.id, explode: { layerIndex: 1, dir: v3(0, 0, 1) }, note: "Height and strength are set by regulation; 900 mm is an example.",
    });
    const lenR = 2 * totalDepth;
    addQuantity(ctx, railComp, { workItem: "external.railing", description: "Railings and handrails", section: "W", unit: "m", value: round(lenR / 1000, 3), formula: `2 sides × ${f3(totalDepth / 1000)} m`, inputs: { sides: 2, length: totalDepth }, status: "assumed" }, { allowance: { rule: "Posts and returns (example)", percent: 5 } });
    const stepFinish = ctx.add({ id: "ext:steps-finish", name: "Step finish (non-slip tile)", kind: "floor-tile", category: "external", subcategory: "Steps", stage: 18, level: ground, layer: "tile", materialId: "tile-stone", shapes: shapes.map((s) => ({ ...(s as Extract<Shape, { t: "box" }>), c: { ...(s as Extract<Shape, { t: "box" }>).c, z: (s as Extract<Shape, { t: "box" }>).c.z + (s as Extract<Shape, { t: "box" }>).s.z / 2 + 8 }, s: { ...(s as Extract<Shape, { t: "box" }>).s, z: 16 } })), source: "schematic", parentId: steps.id, explode: { layerIndex: 2, dir: v3(0, 0, 1) } });
    const stepArea = depths.reduce((s, d) => s + d * platW, 0) * 1e-6;
    addQuantity(ctx, stepFinish, { workItem: "external.step-finish", description: "Non-slip step finish", section: "W", unit: "m²", value: round(stepArea, 3), formula: `treads ${f2(stepArea)} m² (risers not added)`, inputs: { area: round(stepArea, 3) }, status: "assumed" }, { allowance: { rule: "Cutting waste (example assumption)", percent: ctx.rules.allowances.tiles } });
    const p0 = onWall(wall, mid, sign * (faceOut + totalDepth));
    pathStart = p0;
    pathDir = { x: nx, y: ny };
    const half = platW / 2;
    const q0 = onWall(wall, mid - half, sign * faceOut);
    const q1 = onWall(wall, mid + half, sign * (faceOut + totalDepth));
    stepsRect = { x0: Math.min(q0.x, q1.x), y0: Math.min(q0.y, q1.y), x1: Math.max(q0.x, q1.x), y1: Math.max(q0.y, q1.y) };
  }

  // --- Apron round the building --------------------------------------------------------
  const apronW = 1000;
  const inner = insetOutline(ctx, -190);
  const outer = insetOutline(ctx, -190 - apronW);
  const ib = polygonBounds(inner.poly);
  const ob = polygonBounds(outer.poly);
  const strips: P2[][] = [rectPoly(ob.minX, ob.minY, ob.maxX, ib.minY), rectPoly(ob.minX, ib.maxY, ob.maxX, ob.maxY), rectPoly(ob.minX, ib.minY, ib.minX, ib.maxY), rectPoly(ib.maxX, ib.minY, ob.maxX, ib.maxY)];
  const apronPieces = strips.flatMap((s) => (stepsRect ? subtractConvex(s, rectPoly(stepsRect.x0, stepsRect.y0, stepsRect.x1, stepsRect.y1)) : [s])).filter((p) => p.length >= 3 && polygonArea(p) > 10000);
  const apronArea = apronPieces.reduce((s, p) => s + polygonArea(p), 0) * 1e-6;
  const apron = ctx.add({
    id: "ext:apron", name: "Concrete apron round the building", kind: "path", category: "external", subcategory: "Paving", stage: 18, level: null, storeyIndex: -1, layer: "concrete", materialId: "paving", shapes: apronPieces.map((p) => prism(p, GROUND - 100, GROUND)), source: "schematic",
    explode: { layerIndex: 0, dir: UP }, dims: { width: dim(apronW, "mm", "assumed"), area: dim(round(apronArea, 2), "m²", "calculated") }, note: "Falls away from the building so water does not stand against the walls.",
  });
  concreteQuantity(ctx, apron, "concrete.apron", "Concrete apron", apronArea * 0.1, `${f2(apronArea)} m² × 0.100 m = ${f3(apronArea * 0.1)} m³`, { area: round(apronArea, 3), thickness: 100 }, "assumed", ["Thickness and the sub-base are examples."]);

  // --- Path and driveway ------------------------------------------------------------------
  const pathW = 1500;
  const paving: { id: string; name: string; poly: P2[]; area: number }[] = [];
  if (pathStart) {
    const ex = pathDir.x !== 0 ? [pathStart.x, pathDir.x > 0 ? pb.maxX : pb.minX] : [pathStart.x - pathW / 2, pathStart.x + pathW / 2];
    const ey = pathDir.y !== 0 ? [pathStart.y, pathDir.y > 0 ? pb.maxY : pb.minY] : [pathStart.y - pathW / 2, pathStart.y + pathW / 2];
    const poly = rectPoly(Math.min(...ex), Math.min(...ey), Math.max(...ex), Math.max(...ey));
    paving.push({ id: "path", name: "Entrance path", poly: pathDir.y !== 0 ? rectPoly(pathStart.x - pathW / 2, Math.min(...ey), pathStart.x + pathW / 2, Math.max(...ey)) : poly, area: 0 });
  }
  const driveX0 = pb.maxX - 4200;
  paving.push({ id: "driveway", name: "Driveway", poly: rectPoly(driveX0, pb.minY, driveX0 + 3000, ob.minY), area: 0 });
  let pavingTotal = 0;
  paving.forEach((p, i) => {
    p.area = polygonArea(p.poly) * 1e-6;
    pavingTotal += p.area;
    const comp = ctx.add({ id: `ext:${p.id}`, name: p.name, kind: "path", category: "external", subcategory: "Paving", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "paving", shapes: [prism(p.poly, GROUND - 150, GROUND - 90), prism(p.poly, GROUND - 90, GROUND)], source: "schematic", explode: { layerIndex: i, dir: UP }, dims: { area: dim(round(p.area, 2), "m²", "calculated") } });
    addQuantity(ctx, comp, { workItem: "external.paving", description: "Paving on bedding and sub-base", section: "W", unit: "m²", value: round(p.area, 3), formula: `${p.name.toLowerCase()} ${f2(p.area)} m²`, inputs: { area: round(p.area, 3) }, status: "calculated" }, { allowance: { rule: "Cutting waste (example assumption)", percent: ctx.rules.allowances.tiles }, assumptions: ["Paving 60 mm on 30 mm bedding on 60 mm sub-base (examples)."] });
  });

  // --- External drainage -----------------------------------------------------------------------
  const chan: Shape[] = [
    boxAt(ob.minX, ob.minY - 200, GROUND - 120, ob.maxX - ob.minX, 200, 120), boxAt(ob.minX, ob.maxY, GROUND - 120, ob.maxX - ob.minX, 200, 120),
    boxAt(ob.minX - 200, ob.minY, GROUND - 120, 200, ob.maxY - ob.minY, 120), boxAt(ob.maxX, ob.minY, GROUND - 120, 200, ob.maxY - ob.minY, 120),
  ];
  const chanLen = 2 * (ob.maxX - ob.minX) + 2 * (ob.maxY - ob.minY);
  const drain = ctx.add({ id: "ext:drain", name: "Surface-water channel round the apron", kind: "external-drain", category: "external", subcategory: "Drainage", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "chamber", shapes: chan, source: "schematic", explode: { layerIndex: 3, dir: UP }, dims: { length: dim(round(chanLen, 0), "mm", "calculated") }, note: "Takes surface water to the storm drain; the outfall is not designed here." });
  addQuantity(ctx, drain, { workItem: "external.drain", description: "Surface-water channel", section: "W", unit: "m", value: round(chanLen / 1000, 3), formula: `round the apron, ${f2(chanLen / 1000)} m`, inputs: { length: round(chanLen, 0) }, status: "assumed" }, { allowance: { rule: "Joints and corners (example)", percent: 5 } });

  // --- Boundary wall and gates ------------------------------------------------------------------
  const wallH = 2000;
  const wallT = 200;
  const inset = 100;
  const gateW = 3000;
  const pedW = 1200;
  const plotRect = { x0: pb.minX + inset, y0: pb.minY + inset, x1: pb.maxX - inset, y1: pb.maxY - inset };
  const segs: { a: P2; b: P2; name: string }[] = [];
  const pedX = pathStart && pathDir.y !== 0 ? pathStart.x : null;
  const southGaps: [number, number][] = [[driveX0, driveX0 + gateW] as [number, number], ...(pedX !== null ? [[pedX - pedW / 2, pedX + pedW / 2] as [number, number]] : [])].sort((p, q) => p[0] - q[0]);
  let cursor = plotRect.x0;
  for (const [g0, g1] of southGaps) { if (g0 > cursor) segs.push({ a: { x: cursor, y: plotRect.y0 }, b: { x: g0, y: plotRect.y0 }, name: "south" }); cursor = g1; }
  if (cursor < plotRect.x1) segs.push({ a: { x: cursor, y: plotRect.y0 }, b: { x: plotRect.x1, y: plotRect.y0 }, name: "south" });
  segs.push({ a: { x: plotRect.x1, y: plotRect.y0 }, b: { x: plotRect.x1, y: plotRect.y1 }, name: "east" }, { a: { x: plotRect.x1, y: plotRect.y1 }, b: { x: plotRect.x0, y: plotRect.y1 }, name: "north" }, { a: { x: plotRect.x0, y: plotRect.y1 }, b: { x: plotRect.x0, y: plotRect.y0 }, name: "west" });
  const wallShapes = segs.map((s) => alongLine(s.a, s.b, wallT, GROUND, GROUND + wallH));
  const wallLen = segs.reduce((s, g) => s + Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y), 0);
  const wallArea = wallLen * wallH * 1e-6;
  const boundary = ctx.add({ id: "ext:boundary-wall", name: "Boundary wall", kind: "boundary-wall", category: "external", subcategory: "Boundary", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "boundary-wall", shapes: wallShapes, repeated: { noun: "length" }, source: "project", sourceRef: ctx.project.site?.id ?? null, explode: { layerIndex: 0, dir: UP }, dims: { length: dim(round(wallLen, 0), "mm", "calculated"), height: dim(wallH, "mm", "assumed") }, note: "Plot boundary taken from the project's site, or a default 2.5 m margin round the building." });
  addQuantity(ctx, boundary, { workItem: "external.boundary-wall", description: "Boundary wall, 200 mm blockwork, 2.0 m high", section: "W", unit: "m", value: round(wallLen / 1000, 3), formula: `Σ wall lengths between gate openings = ${f2(wallLen / 1000)} m`, inputs: { length: round(wallLen, 0), height: wallH }, status: "calculated" }, { allowance: null, assumptions: ["Foundations, piers and plaster are not included."] });
  const perM2 = 1e6 / ((390 + 10) * (190 + 10));
  addQuantity(ctx, boundary, { workItem: "external.boundary-blocks", description: "Blocks for the boundary wall", section: "F", unit: "piece", value: round(wallArea * perM2, 1), formula: `${f2(wallArea)} m² × ${f2(perM2)} per m²`, inputs: { area: round(wallArea, 3), perM2: round(perM2, 3) }, status: "assumed" }, { allowance: { rule: "Breakage (example assumption)", percent: ctx.rules.allowances.blocks } });
  const gates: Shape[] = [];
  const gateNames: string[] = [];
  const gateLen = (x0: number, x1: number, name: string) => {
    const mid = (x0 + x1) / 2;
    gates.push(box(x0 + 60, plotRect.y0, GROUND + 1000, 120, 240, 2000), box(x1 - 60, plotRect.y0, GROUND + 1000, 120, 240, 2000), box(mid, plotRect.y0, GROUND + 900, x1 - x0 - 260, 40, 1700));
    gateNames.push(`${name} post`, `${name} post`, `${name} leaves`);
  };
  gateLen(driveX0, driveX0 + gateW, "Vehicle gate");
  if (pedX !== null) gateLen(pedX - pedW / 2, pedX + pedW / 2, "Pedestrian gate");
  const gateComp = ctx.add({ id: "ext:gates", name: "Gates and posts", kind: "gate", category: "external", subcategory: "Boundary", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "gate", shapes: gates, repeated: { noun: "part" }, instanceNames: gateNames, source: "schematic", parentId: boundary.id, explode: { layerIndex: 1, dir: v3(0, -1, 0) } });
  addQuantity(ctx, gateComp, { workItem: "external.gate", description: "Gates (vehicle and pedestrian)", section: "W", unit: "piece", value: pedX !== null ? 2 : 1, formula: pedX !== null ? "1 vehicle gate + 1 pedestrian gate" : "1 vehicle gate", inputs: { vehicle: 1, pedestrian: pedX !== null ? 1 : 0 }, status: "assumed" });

  // --- Landscaping ---------------------------------------------------------------------------------
  const grassArea = Math.max(0, polygonArea(plot) * 1e-6 - (ob.maxX - ob.minX) * (ob.maxY - ob.minY) * 1e-6 - pavingTotal);
  const grass = ctx.add({ id: "ext:grass", name: "Lawn and planting", kind: "landscaping", category: "external", subcategory: "Landscaping", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "grass", shapes: [prism(plot, GROUND - 40, GROUND - 2, [outer.poly])], source: "schematic", explode: { layerIndex: 0, dir: UP }, dims: { area: dim(round(grassArea, 1), "m²", "review", "Plot less apron, paths and driveway") } });
  addQuantity(ctx, grass, { workItem: "external.landscaping", description: "Lawn and planting beds", section: "W", unit: "m²", value: round(grassArea, 3), formula: `plot ${f2(polygonArea(plot) * 1e-6)} m² − apron rectangle − paving ${f2(pavingTotal)} m²`, inputs: { plot: round(polygonArea(plot) * 1e-6, 2), paving: round(pavingTotal, 2) }, status: "review" }, { assumptions: ["Paving is assumed to lie wholly inside the plot and clear of the apron rectangle."] });
  const trees: Shape[] = [];
  [{ x: pb.minX + 1500, y: pb.maxY - 1500 }, { x: pb.maxX - 1500, y: pb.maxY - 1500 }, { x: pb.minX + 1500, y: pb.minY + 2000 }].forEach((t) => { trees.push(cyl(t.x, t.y, GROUND + 1000, 100, 2000, "z"), cyl(t.x, t.y, GROUND + 2600, 1000, 1400, "z")); });
  const treeComp = ctx.add({ id: "ext:trees", name: "Trees", kind: "landscaping", category: "external", subcategory: "Landscaping", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "grass", shapes: trees, repeated: { noun: "part" }, source: "schematic", loose: true, explode: { layerIndex: 1, dir: UP } });
  addQuantity(ctx, treeComp, { workItem: "external.trees", description: "Trees", section: "W", unit: "piece", value: 3, formula: "3 trees (example)", inputs: { count: 3 }, status: "assumed" });

  // --- Service route (electricity) ------------------------------------------------------------
  const meter = ctx.components.find((c) => c.id === "elec:meter");
  if (meter) {
    const s = meter.shapes[0]! as Extract<Shape, { t: "box" }>;
    const toNorth = Math.abs(s.c.y - b.maxY) < Math.abs(s.c.y - b.minY);
    const start = { x: s.c.x, y: toNorth ? pb.maxY : pb.minY };
    const trench: Shape[] = [cyl(s.c.x, (start.y + s.c.y) / 2, GROUND - 600, 25, Math.abs(start.y - s.c.y), "y"), cyl(s.c.x, s.c.y, (GROUND - 600 + 1500) / 2, 25, 1500 - (GROUND - 600), "z"), alongLine({ x: s.c.x, y: start.y }, { x: s.c.x, y: s.c.y }, 150, GROUND - 300, GROUND - 295)];
    const len = Math.abs(start.y - s.c.y) + (1500 - (GROUND - 600));
    const route = ctx.add({ id: "ext:service-route", name: "Underground electrical service route", kind: "service-route", category: "external", subcategory: "Services", stage: 18, level: null, storeyIndex: -1, layer: "external", materialId: "conduit", shapes: trench, repeated: { noun: "part" }, source: "schematic", concealed: true, parentId: meter.id, explode: { layerIndex: 2, dir: v3(0, 0, -1) }, note: "Laid in a trench with sand surround and warning tape above, to the utility's requirements." });
    addQuantity(ctx, route, { workItem: "external.service-route", description: "Underground service conduit", section: "Q", unit: "m", value: round(len / 1000, 3), formula: `boundary to meter ${f2(Math.abs(start.y - s.c.y) / 1000)} m + rise to meter`, inputs: { length: round(len, 0) }, status: "assumed" }, { allowance: { rule: "Bends and waste (example assumption)", percent: ctx.rules.allowances.conduit }, exclusions: ["Trench excavation and backfill", "Utility connection charges"] });
  }

  // --- Commissioning markers -------------------------------------------------------------------------
  const targets: { id: string; name: string; at: { x: number; y: number; z: number }; level: LevelInfo | null }[] = [];
  for (const level of ctx.levels) {
    const board = ctx.components.find((c) => c.id === `elec:${level.index}:board`);
    const s = board?.shapes[0] as Extract<Shape, { t: "box" }> | undefined;
    if (s) targets.push({ id: `elec-${level.index}`, name: `Electrical test certificate — ${level.name}`, at: { x: s.c.x, y: s.c.y, z: s.c.z + 450 }, level });
  }
  for (const [id, name, compId] of [["pump", "Water pressure test", "plumb:pump"], ["tank", "Tank and float valve test", "plumb:tank"], ["drain", "Drain test", "plumb:cleanout"]] as const) {
    const s = ctx.components.find((c) => c.id === compId)?.shapes[0];
    if (s && (s.t === "box" || s.t === "cyl")) targets.push({ id, name, at: { x: s.c.x, y: s.c.y, z: s.c.z + 700 }, level: null });
  }
  if (targets.length) {
    const marks = ctx.add({ id: "ext:commissioning", name: "Commissioning and testing points", kind: "commissioning", category: "external", subcategory: "Handover", stage: 18, level: null, storeyIndex: 0, layer: "marker", materialId: "marker", shapes: targets.map((t) => box(t.at.x, t.at.y, t.at.z, 200, 20, 300)), repeated: { noun: "test" }, instanceNames: targets.map((t) => t.name), source: "schematic", explode: { layerIndex: 4, dir: UP }, note: "Each system is tested and signed off before handover; snags are listed and closed out." });
    addQuantity(ctx, marks, { workItem: "handover.commissioning", description: "Testing and commissioning of services", section: "A", unit: "lump sum", value: 1, formula: `${targets.length} test points (electrical per storey, water, tank, drains)`, inputs: { points: targets.length }, status: "assumed" }, { assumptions: ["A lump sum to be priced by the contractor; no figure is invented here."] });
    addQuantity(ctx, marks, { workItem: "handover.snagging", description: "Snagging, cleaning and handover", section: "A", unit: "lump sum", value: 1, formula: "1 handover", inputs: { count: 1 }, status: "assumed" });
  }

  // --- Balconies: the render and paint on them, and the railings (their slab is cast with the floor, at stage 5) ---------------------------------
  generateBalconyFinish(ctx);
}
