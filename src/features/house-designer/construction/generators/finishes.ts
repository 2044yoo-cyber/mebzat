import { ASSUME, UP, dim, type Ctx, type LevelInfo, type RoomInfo } from "../context";
import type { ModelOptions } from "../types";
import { alongLine, box, clipConvex, cyl, pointInPolygon, polygonArea, prism, rectPoly, subtractConvex, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, f3, round } from "../helpers";
import { onEdge, roomLayout, type Edge, type RoomLayout } from "../layout";
import { slabOpenings } from "../slab-openings";
import { planElectrical } from "../electrical-plan";
import type { ComponentRecord, LayerId } from "../types";

/**
 * Stages 11, 12, 13 and 15: plaster and its coats, suspended ceilings,
 * floor and wall finishes with wet-area waterproofing, and paint. Each is a
 * set of thin layers on the same room surfaces, so they are built from one
 * reading of the rooms (layout.ts) and can be peeled apart in the explode view.
 */

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const WET = new Set(["bath", "wc"]);
const TILE_HEIGHT = 2100;
const SKIRTING_H = 100;

// Plaster coats, from the block face outwards. Thicknesses are examples.
const COATS = [
  { id: "bonding", name: "Bonding treatment", kind: "plaster-layer", material: "bonding", t: 2, workItem: "plaster.bonding", desc: "Bonding treatment to walls", note: "Applied where the surface is too smooth or too absorbent." },
  { id: "base", name: "Base coat", kind: "plaster-layer", material: "plaster-base", t: ASSUME.plasterBase, workItem: "plaster.base", desc: "Plaster base coat", note: undefined },
  { id: "mid", name: "Intermediate coat", kind: "plaster-layer", material: "plaster-mid", t: ASSUME.plasterMid, workItem: "plaster.mid", desc: "Plaster intermediate coat", note: undefined },
  { id: "final", name: "Final coat", kind: "plaster-layer", material: "plaster-final", t: ASSUME.plasterFinal, workItem: "plaster.final", desc: "Plaster final coat", note: undefined },
  { id: "skim", name: "Skim coat / filler", kind: "plaster-layer", material: "skim", t: ASSUME.skim, workItem: "plaster.skim", desc: "Skim coat", note: undefined },
  { id: "primer", name: "Primer", kind: "paint-layer", material: "primer", t: ASSUME.primer, workItem: "paint.primer", desc: "Primer coat", note: undefined },
] as const;
const COAT_OFFSET = COATS.reduce<number[]>((acc, c) => [...acc, (acc.at(-1) ?? 0) + c.t], []);
const PLASTER_TOTAL = COATS.reduce((s, c) => s + c.t, 0);
const BEFORE = (index: number) => (index === 0 ? 0 : COAT_OFFSET[index - 1]!);

type Piece = { t0: number; t1: number; z0: number; z1: number };

/** The solid pieces of a wall face once openings are taken out, between heights z0 and z1 (rooms are measured from the floor). */
function edgePieces(edge: Edge, z0: number, z1: number): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;
  const open = edge.openings.filter((o) => o.opening.z1 > z0 && o.opening.z0 < z1);
  for (const eo of open) {
    const a = Math.max(0, eo.t0);
    const b = Math.min(edge.length, eo.t1);
    if (a > cursor) pieces.push({ t0: cursor, t1: a, z0, z1 });
    if (eo.opening.z0 > z0) pieces.push({ t0: a, t1: b, z0, z1: Math.min(z1, eo.opening.z0) });
    if (eo.opening.z1 < z1) pieces.push({ t0: a, t1: b, z0: Math.max(z0, eo.opening.z1), z1 });
    cursor = Math.max(cursor, b);
  }
  if (cursor < edge.length) pieces.push({ t0: cursor, t1: edge.length, z0, z1 });
  return pieces.filter((p) => p.t1 - p.t0 > 1 && p.z1 - p.z0 > 1);
}

/** A slab of thickness `thick` lying on a wall face, `offset` out from it. */
function faceSlab(layout: RoomLayout, edge: Edge, piece: Piece, offset: number, thick: number): Shape {
  const a = onEdge(edge, piece.t0, offset + thick / 2);
  const b = onEdge(edge, piece.t1, offset + thick / 2);
  const base = layout.level.floorZ;
  return alongLine(a, b, thick, base + piece.z0, base + piece.z1);
}

function deducted(ctx: Ctx, width: number, height: number): boolean {
  const rule = ctx.rules.openingDeduction;
  return rule === "all" || (rule === "over-threshold" && width * height * 1e-6 > ctx.rules.openingThresholdM2);
}

/** Net area of a room's wall faces between two heights, openings taken out by the stated rule. */
function wallArea(ctx: Ctx, layout: RoomLayout, z0: number, z1: number) {
  let gross = 0;
  let out = 0;
  let perimeter = 0;
  for (const edge of layout.edges) {
    if (!edge.wall) continue;
    perimeter += edge.length;
    gross += edge.length * (z1 - z0);
    for (const eo of edge.openings) {
      const h = Math.min(z1, eo.opening.z1) - Math.max(z0, eo.opening.z0);
      const w = eo.t1 - eo.t0;
      if (h > 0 && deducted(ctx, eo.opening.width, eo.opening.height)) out += w * h;
    }
  }
  const net = (gross - out) * 1e-6;
  return { gross: gross * 1e-6, out: out * 1e-6, net, perimeter, text: `${f2(perimeter / 1000)} m × ${f3((z1 - z0) / 1000)} m − openings ${f2(out * 1e-6)} m² = ${f2(net)} m²` };
}

/** The floor of a room as polygons, with the stair opening taken out. */
function floorPieces(ctx: Ctx, layout: RoomLayout): P2[][] {
  let pieces: P2[][] = [layout.clear.poly];
  for (const h of slabOpenings(ctx, layout.level.index)) {
    const hole = rectPoly(h.x0, h.y0, h.x1, h.y1);
    pieces = pieces.flatMap((p) => subtractConvex(p, hole));
  }
  return pieces.filter((p) => p.length >= 3 && polygonArea(p) > 1000);
}

function tileShape(cellPoly: P2[], piece: P2[], z0: number, z1: number): Shape | null {
  const clipped = clipConvex(cellPoly, piece);
  if (clipped.length < 3) return null;
  const area = polygonArea(clipped);
  if (area < 400) return null;
  const xs = clipped.map((p) => p.x);
  const ys = clipped.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...ys) - Math.min(...ys);
  if (Math.abs(w * d - area) < 5) return box((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (z0 + z1) / 2, w, d, z1 - z0);
  return prism(clipped, z0, z1);
}

type RoomItem = { room: RoomInfo; layout: RoomLayout };

function roomsOf(ctx: Ctx, level: LevelInfo, layouts: Map<string, RoomLayout>): RoomItem[] {
  return ctx.roomsOf(level.levelId).map((room) => ({ room, layout: layouts.get(room.id)! }));
}

export function generateFinishes(ctx: Ctx): void {
  if (!ctx.ground) return;
  const layouts = new Map<string, RoomLayout>();
  for (const room of ctx.rooms) layouts.set(room.id, roomLayout(ctx, room));
  plaster(ctx, layouts);
  ceilings(ctx, layouts);
  floors(ctx, layouts);
  paint(ctx, layouts);
}

// ---------------------------------------------------------------------------
// Stage 11: plaster
// ---------------------------------------------------------------------------

function plaster(ctx: Ctx, layouts: Map<string, RoomLayout>): void {
  for (const level of ctx.levels) {
    const items = roomsOf(ctx, level, layouts);
    COATS.forEach((coat, ci) => {
      const shapes: Shape[] = [];
      const perRoom: { room: RoomInfo; area: ReturnType<typeof wallArea>; zFrom: number }[] = [];
      for (const { room, layout } of items) {
        const H = level.ceilingZ - level.floorZ;
        // Where tiles are going, the coats that would sit behind paint stop at the tile line.
        const zFrom = WET.has(room.kind) && (coat.id === "skim" || coat.id === "primer") ? TILE_HEIGHT : 0;
        for (const edge of layout.edges) {
          if (!edge.wall) continue;
          for (const piece of edgePieces(edge, zFrom, H)) shapes.push(faceSlab(layout, edge, piece, BEFORE(ci), coat.t));
        }
        perRoom.push({ room, area: wallArea(ctx, layout, zFrom, H), zFrom });
      }
      if (shapes.length === 0) return;
      const comp = ctx.add({
        id: `plaster:${level.index}:${coat.id}`, name: `${coat.name} — ${level.name}, internal`, kind: coat.kind, category: "finishes", subcategory: "Plaster", stage: 11, level, layer: coat.id === "bonding" ? "plaster" : coat.id === "primer" ? "paint" : "plaster",
        materialId: coat.material, shapes, repeated: { noun: "panel" }, source: "schematic", explode: { layerIndex: ci, dir: v3(0, 0, 0) },
        dims: { thickness: dim(coat.t, "mm", "assumed") }, note: coat.note ?? "Thickness is an example; the specification sets it.",
      });
      for (const { room, area, zFrom } of perRoom) {
        addQuantity(ctx, comp, { workItem: coat.workItem, description: `${coat.desc} (internal)`, section: coat.id === "primer" ? "M" : "J", unit: "m²", value: round(area.net, 3), formula: area.text, inputs: { perimeter: round(area.perimeter, 0), height: round(level.ceilingZ - level.floorZ - zFrom, 0), openings: round(area.out, 3), rule: ctx.rules.openingDeduction }, status: "calculated" },
          { room: room.name, allowance: { rule: "Wastage and thickness variation (example assumption)", percent: ctx.rules.allowances.plaster }, assumptions: [`Walls measured from the floor to the ceiling plane. Openings over ${ctx.rules.openingThresholdM2} m² are deducted (rule: ${ctx.rules.openingDeduction}).`, "Column and beam faces are not measured separately.", ...(zFrom ? ["Stops at the tile line in wet areas."] : [])] });
      }
    });

    // Mesh across the joint where wall meets ceiling and at the column faces (schematic strips).
    const mesh: Shape[] = [];
    const meshRoomLen: { room: RoomInfo; len: number }[] = [];
    for (const { room, layout } of items) {
      let len = 0;
      for (const edge of layout.edges) {
        if (!edge.wall) continue;
        const a = onEdge(edge, 0, BEFORE(2));
        const b = onEdge(edge, edge.length, BEFORE(2));
        mesh.push(alongLine(a, b, 1, level.ceilingZ - 150, level.ceilingZ));
        len += edge.length;
      }
      meshRoomLen.push({ room, len });
    }
    if (mesh.length) {
      const comp = ctx.add({
        id: `plaster:${level.index}:mesh`, name: `Reinforcing mesh at the wall–ceiling joint — ${level.name}`, kind: "plaster-layer", category: "finishes", subcategory: "Plaster", stage: 11, level, layer: "plaster", materialId: "plaster-mesh",
        shapes: mesh, repeated: { noun: "strip" }, source: "schematic", explode: { layerIndex: 3, dir: UP }, note: "Mesh is also stretched where block meets concrete, to stop cracks. Only the ceiling-line strips are drawn here.",
      });
      for (const { room, len } of meshRoomLen) addQuantity(ctx, comp, { workItem: "plaster.mesh", description: "Plaster mesh strip 150 mm wide", section: "J", unit: "m", value: round(len / 1000, 3), formula: `room perimeter ${f2(len / 1000)} m`, inputs: { length: round(len, 0), width: 150 }, status: "assumed" }, { room: room.name, allowance: { rule: "Laps (example assumption)", percent: 10 } });
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 12: ceilings
// ---------------------------------------------------------------------------

const BOARD = { w: 1200, l: 2400, t: ASSUME.ceilingBoard };
const CROSS = 600;
const MAIN = 1200;
const HANGER = 1200;

function chord(poly: P2[], axis: "x" | "y", value: number): [number, number] | null {
  const strip = axis === "x" ? rectPoly(-1e6, value - 0.5, 1e6, value + 0.5) : rectPoly(value - 0.5, -1e6, value + 0.5, 1e6);
  const c = clipConvex(strip, poly);
  if (c.length < 3) return null;
  const vals = c.map((p) => (axis === "x" ? p.x : p.y));
  return [Math.min(...vals), Math.max(...vals)];
}

function ceilings(ctx: Ctx, layouts: Map<string, RoomLayout>): void {
  for (const level of ctx.levels) {
    const top = level.index === ctx.levels.length - 1;
    const holes = slabOpenings(ctx, level.index + 1).map((h) => rectPoly(h.x0, h.y0, h.x1, h.y1));
    for (const { room, layout } of roomsOf(ctx, level, layouts)) {
      const rid = `ceiling:${level.index}:${slug(room.name)}`;
      const zc = level.ceilingZ;
      let regions: P2[][] = [layout.clear.poly];
      for (const hole of holes) regions = regions.flatMap((p) => subtractConvex(p, hole));
      regions = regions.filter((p) => p.length >= 3 && polygonArea(p) > 10000);
      if (regions.length === 0) continue;
      const area = regions.reduce((s, p) => s + polygonArea(p), 0) * 1e-6;
      const bounds = layout.room.bounds;
      const base = { category: "finishes" as const, stage: 12 as const, level, room: room.name, grid: ctx.gridRef(level.levelId, room.centre.x, room.centre.y, 2500), source: "schematic" as const };

      // Framing: perimeter angle, main and cross channels, hangers to the slab.
      const framing: Shape[] = [];
      let mainLen = 0;
      let crossLen = 0;
      let hangers = 0;
      let perimeter = 0;
      for (const edge of layout.edges) {
        if (!edge.wall) continue;
        framing.push(alongLine(onEdge(edge, 0, 12), onEdge(edge, edge.length, 12), 25, zc, zc + 27));
        perimeter += edge.length;
      }
      for (let y = bounds.minY + MAIN / 2; y < bounds.maxY; y += MAIN) {
        for (const region of regions) {
          const c = chord(region, "x", y);
          if (!c || c[1] - c[0] < 300) continue;
          framing.push(box((c[0] + c[1]) / 2, y, zc + 27 + 19, c[1] - c[0], 38, 38));
          mainLen += c[1] - c[0];
          for (let x = c[0] + 300; x < c[1] - 150; x += HANGER) {
            framing.push(cyl(x, y, (zc + 65 + level.soffitZ) / 2, 2, level.soffitZ - zc - 65, "z"));
            hangers += 1;
          }
        }
      }
      for (let x = bounds.minX + CROSS / 2; x < bounds.maxX; x += CROSS) {
        for (const region of regions) {
          const c = chord(region, "y", x);
          if (!c || c[1] - c[0] < 300) continue;
          framing.push(box(x, (c[0] + c[1]) / 2, zc + 13, 38, c[1] - c[0], 27));
          crossLen += c[1] - c[0];
        }
      }
      const frame = ctx.add({ ...base, id: `${rid}:framing`, name: `Ceiling framing — ${room.name}, ${level.name}`, kind: "ceiling-channel", subcategory: "Framing", layer: "ceiling", materialId: "ceiling-steel", shapes: framing, repeated: { noun: "member" }, concealed: true, explode: { layerIndex: 1, dir: UP }, note: "Spacings are examples; the ceiling supplier's tables govern." });
      addQuantity(ctx, frame, { workItem: "ceiling.hanger", description: "Ceiling hangers", section: "N", unit: "piece", value: hangers, formula: `main channels at ${MAIN} mm, hangers at ${HANGER} mm along them = ${hangers}`, inputs: { mainSpacing: MAIN, hangerSpacing: HANGER, count: hangers }, status: "assumed" }, { allowance: { rule: "Waste (example assumption)", percent: ctx.rules.allowances.boards } });
      addQuantity(ctx, frame, { workItem: "ceiling.channel", description: "Ceiling channels (main + cross)", section: "N", unit: "m", value: round((mainLen + crossLen) / 1000, 3), formula: `main ${f2(mainLen / 1000)} m + cross ${f2(crossLen / 1000)} m (cross channels at ${CROSS} mm)`, inputs: { main: round(mainLen, 0), cross: round(crossLen, 0) }, status: "assumed" }, { allowance: { rule: "Laps and waste (example assumption)", percent: ctx.rules.allowances.boards } });
      addQuantity(ctx, frame, { workItem: "ceiling.perimeter", description: "Perimeter angle", section: "N", unit: "m", value: round(perimeter / 1000, 3), formula: `room perimeter ${f2(perimeter / 1000)} m`, inputs: { perimeter: round(perimeter, 0) }, status: "calculated" }, { allowance: { rule: "Waste (example assumption)", percent: ctx.rules.allowances.boards } });

      // Boards on a 1200 × 2400 grid, cut to the room.
      const boards: Shape[] = [];
      const joints: Shape[] = [];
      for (let x = bounds.minX; x < bounds.maxX; x += BOARD.l) {
        for (let y = bounds.minY; y < bounds.maxY; y += BOARD.w) {
          const cell = rectPoly(x, y, x + BOARD.l, y + BOARD.w);
          for (const region of regions) {
            const s = tileShape(cell, region, zc - BOARD.t, zc);
            if (s) boards.push(s);
          }
        }
      }
      for (let x = bounds.minX + BOARD.l; x < bounds.maxX; x += BOARD.l) for (const region of regions) { const c = chord(region, "y", x); if (c) joints.push(box(x, (c[0] + c[1]) / 2, zc - BOARD.t - 1, 40, c[1] - c[0], 2)); }
      for (let y = bounds.minY + BOARD.w; y < bounds.maxY; y += BOARD.w) for (const region of regions) { const c = chord(region, "x", y); if (c) joints.push(box((c[0] + c[1]) / 2, y, zc - BOARD.t - 1, c[1] - c[0], 40, 2)); }
      const sheets = area / (BOARD.l * BOARD.w * 1e-6);
      const bc = ctx.add({ ...base, id: `${rid}:boards`, name: `Ceiling boards — ${room.name}, ${level.name}`, kind: "gypsum-board", subcategory: "Boards", layer: "ceiling", materialId: "gypsum", shapes: boards, repeated: { noun: "board" }, explode: { layerIndex: 2, dir: v3(0, 0, -1) }, dims: { area: dim(round(area, 2), "m²", "calculated"), thickness: dim(BOARD.t, "mm", "assumed") }, parentId: frame.id });
      addQuantity(ctx, bc, { workItem: "ceiling.area", description: "Suspended ceiling, area", section: "N", unit: "m²", value: round(area, 3), formula: `clear room ${f2(area)} m² (stair opening, where there is one, left out)`, inputs: { area: round(area, 3) }, status: layout.clear.exact ? "calculated" : "review" }, { allowance: null, assumptions: ["Ceiling follows the clear room outline at the underside of the beams."] });
      addQuantity(ctx, bc, { workItem: "ceiling.board", description: `Ceiling boards ${BOARD.l} × ${BOARD.w} × ${BOARD.t} mm`, section: "N", unit: "piece", value: round(sheets, 2), formula: `${f2(area)} m² ÷ ${f2(BOARD.l * BOARD.w * 1e-6)} m² per board`, inputs: { area: round(area, 3), board: `${BOARD.l}×${BOARD.w}` }, status: "assumed" }, { allowance: { rule: "Cutting waste (example assumption)", percent: ctx.rules.allowances.boards } });
      if (joints.length) {
        const jc = ctx.add({ ...base, id: `${rid}:joints`, name: `Taped and filled joints — ${room.name}, ${level.name}`, kind: "ceiling-joint", subcategory: "Joints", layer: "ceiling", materialId: "joint-compound", shapes: joints, repeated: { noun: "joint" }, explode: { layerIndex: 3, dir: v3(0, 0, -1) }, parentId: bc.id });
        const jl = joints.reduce((s, sh) => s + (sh.t === "box" ? Math.max(sh.s.x, sh.s.y) : 0), 0);
        addQuantity(ctx, jc, { workItem: "ceiling.joint", description: "Board joints taped and filled", section: "N", unit: "m", value: round(jl / 1000, 3), formula: `seams between boards = ${f2(jl / 1000)} m`, inputs: { length: round(jl, 0) }, status: "calculated" });
      }
      // Cut-outs where the conduit plan put the luminaire and the detector, and, in wet rooms, an access panel beside the light.
      const electrical = planElectrical(ctx).rooms.find((r) => r.level.index === level.index && r.room.id === room.id);
      const heads: { at: P2; r: number }[] = [];
      if (electrical?.lightPoint) heads.push({ at: electrical.lightPoint, r: room.area > 15e6 ? 160 : 120 });
      if (electrical?.detector) heads.push({ at: electrical.detector.at, r: 60 });
      if (heads.length) {
        const extras: Shape[] = heads.map((h) => cyl(h.at.x, h.at.y, zc - BOARD.t - 0.5, h.r, 1, "z"));
        const cut = ctx.add({ ...base, id: `${rid}:cutouts`, name: `Light cut-out — ${room.name}, ${level.name}`, kind: "ceiling-cutout", subcategory: "Cut-outs", layer: "ceiling", materialId: "dpm", shapes: extras, repeated: { noun: "cut-out" }, explode: { layerIndex: 4, dir: v3(0, 0, -1) }, parentId: bc.id });
        addQuantity(ctx, cut, { workItem: "ceiling.cutout", description: "Light cut-outs", section: "N", unit: "piece", value: heads.length, formula: "1 per luminaire or detector, where the conduit plan puts it", inputs: { count: heads.length }, status: "assumed" });
      }
      if (WET.has(room.kind)) {
        const from = electrical?.lightPoint ?? room.centre;
        const spot = [[700, 0], [-700, 0], [0, 700], [0, -700], [900, 900], [-900, -900]].map(([dx, dy]) => ({ x: from.x + dx!, y: from.y + dy! })).find((c) => regions.some((region) => rectPoly(c.x - 300, c.y - 300, c.x + 300, c.y + 300).every((q) => pointInPolygon(q, region))));
        if (spot) {
          const ap = ctx.add({ ...base, id: `${rid}:access`, name: `Access panel — ${room.name}, ${level.name}`, kind: "access-panel", subcategory: "Access", layer: "ceiling", materialId: "ceiling-steel", shapes: [box(spot.x, spot.y, zc - BOARD.t - 6, 600, 600, 12)], explode: { layerIndex: 4, dir: v3(0, 0, -1) }, parentId: bc.id, note: "Keeps the junction boxes in the slab above reachable." });
          addQuantity(ctx, ap, { workItem: "ceiling.access", description: "Access panels", section: "N", unit: "piece", value: 1, formula: "1 per wet room", inputs: { count: 1 }, status: "assumed" });
        }
      }
      if (top) {
        const ins: Shape[] = regions.map((p) => prism(p, zc + 65, zc + 65 + 50));
        const ic = ctx.add({ ...base, id: `${rid}:insulation`, name: `Ceiling insulation (where specified) — ${room.name}, ${level.name}`, kind: "ceiling-insulation", subcategory: "Insulation", layer: "insulation", materialId: "ceiling-insulation", shapes: ins, concealed: true, explode: { layerIndex: 0, dir: UP }, parentId: frame.id, note: "Included as an example on the top storey, under the roof; omit where not specified." });
        addQuantity(ctx, ic, { workItem: "insulation.ceiling", description: "Ceiling insulation", section: "N", unit: "m²", value: round(area, 3), formula: `ceiling area ${f2(area)} m²`, inputs: { area: round(area, 3), thickness: 50 }, status: "assumed" }, { allowance: { rule: "Cutting waste (example assumption)", percent: 5 } });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 13: floors, wet areas, wall tiles
// ---------------------------------------------------------------------------

const FINISH_TILE: Record<ModelOptions["floorFinish"], { w: number; d: number; t: number; material: string; label: string }> = {
  porcelain: { w: 600, d: 600, t: ASSUME.floorTile, material: "tile-porcelain", label: "porcelain tile" },
  ceramic: { w: 400, d: 400, t: ASSUME.floorTile, material: "tile-ceramic", label: "ceramic tile" },
  stone: { w: 450, d: 450, t: ASSUME.floorTile, material: "tile-stone", label: "natural stone" },
};
const GROUT = 3;

function floors(ctx: Ctx, layouts: Map<string, RoomLayout>): void {
  const finish = FINISH_TILE[ctx.options.floorFinish];
  for (const level of ctx.levels) {
    const items = roomsOf(ctx, level, layouts);
    const screedTop = level.floorZ + ASSUME.screed;
    const z0 = screedTop;
    const mk = (id: string, name: string, kind: string, layer: LayerId, material: string, shapes: Shape[], layerIndex: number, extra: Partial<{ concealed: boolean; note: string; repeated: string; subcategory: string }> = {}): ComponentRecord | null =>
      shapes.length === 0 ? null : ctx.add({
        id: `floor:${level.index}:${id}`, name: `${name} — ${level.name}`, kind, category: "finishes", subcategory: extra.subcategory ?? "Floors", stage: 13, level, layer, materialId: material, shapes, ...(extra.repeated ? { repeated: { noun: extra.repeated } } : {}),
        source: "schematic", explode: { layerIndex, dir: UP }, ...(extra.concealed ? { concealed: true } : {}), ...(extra.note ? { note: extra.note } : {}),
      });
    const eachRoom = (fn: (item: RoomItem, pieces: P2[][]) => void) => items.forEach((item) => fn(item, floorPieces(ctx, item.layout)));
    const areaOf = (item: RoomItem, pieces: P2[][]) => Math.max(0, pieces.reduce((s, p) => s + polygonArea(p), 0) - item.layout.clear.netOfColumns) * 1e-6;

    // Screed for the upper floors (the ground floor's was laid with the slab).
    if (level.index > 0) {
      const shapes: Shape[] = [];
      const perRoom: { room: RoomInfo; area: number }[] = [];
      eachRoom((item, pieces) => { pieces.forEach((p) => shapes.push(prism(p, level.floorZ, screedTop))); perRoom.push({ room: item.room, area: areaOf(item, pieces) }); });
      const comp = mk("screed", "Floor screed", "floor-screed", "screed", "screed", shapes, 0);
      if (comp) for (const r of perRoom) addQuantity(ctx, comp, { workItem: "screed.floor", description: "Cement-sand screed to floors", section: "K", unit: "m³", value: round(r.area * ASSUME.screed * 1e-3, 4), formula: `${f2(r.area)} m² × ${f3(ASSUME.screed / 1000)} m`, inputs: { area: round(r.area, 3), thickness: ASSUME.screed }, status: "assumed" }, { room: r.room.name, allowance: { rule: "Wastage and level variation (example assumption)", percent: 5 } });
    }

    // Wet-area waterproofing: the floor and 300 mm up the walls, 1800 mm in a shower (one wall, assumed).
    const wetItems = items.filter(({ room }) => WET.has(room.kind) || room.kind === "laundry");
    const wetShapes: Shape[] = [];
    const wetRooms: { room: RoomInfo; area: number; up: number }[] = [];
    for (const item of wetItems) {
      const pieces = floorPieces(ctx, item.layout);
      pieces.forEach((p) => wetShapes.push(prism(p, screedTop, screedTop + ASSUME.wetWaterproofing)));
      let up = 0;
      for (const edge of item.layout.edges) {
        if (!edge.wall) continue;
        for (const piece of edgePieces(edge, 0, 300)) { wetShapes.push(faceSlab(item.layout, edge, { ...piece, z0: screedTop - level.floorZ, z1: screedTop - level.floorZ + 300 }, BEFORE(3), ASSUME.wetWaterproofing)); up += (piece.t1 - piece.t0) * 300; }
      }
      wetRooms.push({ room: item.room, area: areaOf(item, pieces) + up * 1e-6, up: up * 1e-6 });
    }
    const wp = mk("waterproofing", "Wet-area waterproofing", "wet-waterproofing", "waterproofing", "waterproofing", wetShapes, 1, { note: "Tested by flooding before tiles are laid." });
    if (wp) for (const r of wetRooms) addQuantity(ctx, wp, { workItem: "waterproofing.wet-area", description: "Wet-area waterproofing (floor + 300 mm upturn)", section: "G", unit: "m²", value: round(r.area, 3), formula: `floor ${f2(r.area - r.up)} m² + upturn ${f2(r.up)} m²`, inputs: { floor: round(r.area - r.up, 3), upturn: round(r.up, 3) }, status: "assumed" }, { room: r.room.name, allowance: { rule: "Laps and upturns at corners (example assumption)", percent: 10 } });

    // Floor finish by room.
    const adhesive: Shape[] = [];
    const tiles: Shape[] = [];
    const laminate: Shape[] = [];
    const grout: Shape[] = [];
    const tileRooms: { room: RoomInfo; area: number; count: number }[] = [];
    const lamRooms: { room: RoomInfo; area: number }[] = [];
    eachRoom((item, pieces) => {
      const base = z0 + (WET.has(item.room.kind) || item.room.kind === "laundry" ? ASSUME.wetWaterproofing : 0);
      const adTop = base + ASSUME.tileAdhesive;
      const tTop = adTop + finish.t;
      const tiled = !["bed", "office"].includes(item.room.kind);
      const area = areaOf(item, pieces);
      if (!tiled) {
        pieces.forEach((p) => laminate.push(prism(p, base, base + 14)));
        lamRooms.push({ room: item.room, area });
        return;
      }
      pieces.forEach((p) => { adhesive.push(prism(p, base, adTop)); grout.push(prism(p, adTop, adTop + finish.t - 2)); });
      let count = 0;
      const b = item.room.bounds;
      for (let x = b.minX; x < b.maxX; x += finish.w + GROUT) for (let y = b.minY; y < b.maxY; y += finish.d + GROUT) {
        const cell = rectPoly(x, y, x + finish.w, y + finish.d);
        for (const p of pieces) { const s = tileShape(cell, p, adTop, tTop); if (s) { tiles.push(s); count += 1; } }
      }
      tileRooms.push({ room: item.room, area, count });
    });
    const ad = mk("adhesive", "Tile adhesive", "tile-adhesive", "tile", "adhesive", adhesive, 2);
    if (ad) for (const r of tileRooms) addQuantity(ctx, ad, { workItem: "flooring.adhesive", description: "Tile adhesive (floors)", section: "K", unit: "m²", value: round(r.area, 3), formula: `floor area ${f2(r.area)} m² at ${ASSUME.tileAdhesive} mm`, inputs: { area: round(r.area, 3), thickness: ASSUME.tileAdhesive }, status: "assumed" }, { room: r.room.name, allowance: { rule: "Waste (example assumption)", percent: 5 } });
    const gr = mk("grout", "Grout bed", "floor-joint", "tile", "grout", grout, 3);
    if (gr) for (const r of tileRooms) addQuantity(ctx, gr, { workItem: "flooring.grout", description: "Grout (floors)", section: "K", unit: "m²", value: round(r.area, 3), formula: `floor area ${f2(r.area)} m² with ${GROUT} mm joints`, inputs: { area: round(r.area, 3), joint: GROUT }, status: "assumed" }, { room: r.room.name, allowance: { rule: "Waste (example assumption)", percent: 5 } });
    const fl = mk("tiles", `Floor tiles (${finish.label})`, "floor-tile", "tile", finish.material, tiles, 4, { repeated: "tile", note: `${finish.w} × ${finish.d} mm, ${GROUT} mm joints. Tiles are cut at the edges.` });
    if (fl) for (const r of tileRooms) {
      const unit = (finish.w + GROUT) * (finish.d + GROUT) * 1e-6;
      addQuantity(ctx, fl, { workItem: "flooring.tile-area", description: `Floor tiles — ${finish.label}`, section: "K", unit: "m²", value: round(r.area, 3), formula: `clear floor ${f2(r.area)} m²`, inputs: { area: round(r.area, 3) }, status: "calculated" }, { room: r.room.name, allowance: { rule: "Cutting waste and breakage (example assumption)", percent: ctx.rules.allowances.tiles } });
      addQuantity(ctx, fl, { workItem: "flooring.tile-count", description: `Floor tiles — ${finish.label} (count)`, section: "K", unit: "piece", value: round(r.area / unit, 1), formula: `${f2(r.area)} m² ÷ ${f3(unit)} m² per tile (incl. joint); ${r.count} drawn`, inputs: { area: round(r.area, 3), tile: `${finish.w}×${finish.d}`, drawn: r.count }, status: "assumed" }, { room: r.room.name, allowance: { rule: "Cutting waste and breakage (example assumption)", percent: ctx.rules.allowances.tiles } });
    }
    const lam = mk("laminate", "Laminate flooring (bedrooms and offices)", "floor-tile", "tile", "laminate", laminate, 4);
    if (lam) for (const r of lamRooms) addQuantity(ctx, lam, { workItem: "flooring.laminate", description: "Laminate flooring", section: "K", unit: "m²", value: round(r.area, 3), formula: `clear floor ${f2(r.area)} m²`, inputs: { area: round(r.area, 3) }, status: "calculated" }, { room: r.room.name, allowance: { rule: "Cutting waste (example assumption)", percent: ctx.rules.allowances.tiles } });

    // Skirting and thresholds.
    const skirting: Shape[] = [];
    const sk: { room: RoomInfo; len: number }[] = [];
    const thresholds: Shape[] = [];
    const th: { room: RoomInfo; count: number }[] = [];
    for (const { room, layout } of items) {
      let len = 0;
      let count = 0;
      for (const edge of layout.edges) {
        if (!edge.wall) continue;
        let cursor = 0;
        const doors = edge.openings.filter((o) => o.opening.kind !== "window" && o.opening.z0 < 50);
        for (const eo of doors) {
          if (eo.t0 > cursor + 1) { skirting.push(faceSlab(layout, edge, { t0: cursor, t1: eo.t0, z0: z0 - level.floorZ, z1: z0 - level.floorZ + SKIRTING_H }, PLASTER_TOTAL, 12)); len += eo.t0 - cursor; }
          cursor = Math.max(cursor, eo.t1);
          const a = onEdge(edge, eo.t0, -edge.wall.thickness / 2 + 20);
          const b = onEdge(edge, eo.t1, -edge.wall.thickness / 2 + 20);
          thresholds.push(alongLine(a, b, edge.wall.thickness - 40, z0, z0 + finish.t + ASSUME.tileAdhesive));
          count += 1;
        }
        if (cursor < edge.length - 1) { skirting.push(faceSlab(layout, edge, { t0: cursor, t1: edge.length, z0: z0 - level.floorZ, z1: z0 - level.floorZ + SKIRTING_H }, PLASTER_TOTAL, 12)); len += edge.length - cursor; }
      }
      sk.push({ room, len });
      th.push({ room, count });
    }
    const skc = mk("skirting", "Skirting", "skirting", "tile", "skirting", skirting, 5, { repeated: "length" });
    if (skc) for (const r of sk) addQuantity(ctx, skc, { workItem: "flooring.skirting", description: "Skirting", section: "K", unit: "m", value: round(r.len / 1000, 3), formula: `wall base ${f2(r.len / 1000)} m less door openings`, inputs: { length: round(r.len, 0), height: SKIRTING_H }, status: "calculated" }, { room: r.room.name, allowance: { rule: "Mitres and waste (example assumption)", percent: 10 } });
    const thc = mk("thresholds", "Thresholds at doorways", "threshold", "tile", "threshold", thresholds, 5, { repeated: "threshold" });
    if (thc) for (const r of th) if (r.count) addQuantity(ctx, thc, { workItem: "flooring.threshold", description: "Door thresholds", section: "K", unit: "piece", value: r.count, formula: `${r.count} doorway(s) from ${r.room.name}`, inputs: { count: r.count }, status: "calculated" }, { room: r.room.name, assumptions: ["A doorway between two rooms appears in each room's count; the threshold is drawn once per side."] });

    // Wall tiles in baths and shower rooms.
    const wallTiles: Shape[] = [];
    const wt: { room: RoomInfo; area: number; count: number }[] = [];
    const wallAd: Shape[] = [];
    const wtSize = { w: 300, h: 600 };
    for (const { room, layout } of items.filter((i) => WET.has(i.room.kind))) {
      let count = 0;
      let area = 0;
      for (const edge of layout.edges) {
        if (!edge.wall) continue;
        for (const piece of edgePieces(edge, 0, TILE_HEIGHT)) {
          wallAd.push(faceSlab(layout, edge, piece, BEFORE(3), 5));
          area += (piece.t1 - piece.t0) * (piece.z1 - piece.z0) * 1e-6;
          for (let t = piece.t0; t < piece.t1 - 1; t += wtSize.w + GROUT) for (let z = piece.z0; z < piece.z1 - 1; z += wtSize.h + GROUT) {
            const t1 = Math.min(piece.t1, t + wtSize.w);
            const z1 = Math.min(piece.z1, z + wtSize.h);
            if (t1 - t < 20 || z1 - z < 20) continue;
            wallTiles.push(faceSlab(layout, edge, { t0: t, t1, z0: z, z1 }, BEFORE(3) + 5, 8));
            count += 1;
          }
        }
      }
      wt.push({ room, area, count });
    }
    const wad = mk("wall-adhesive", "Wall tile adhesive", "tile-adhesive", "tile", "adhesive", wallAd, 6, { subcategory: "Wall tiles" });
    const wtc = mk("wall-tiles", "Wall tiles (bathrooms)", "wall-tile", "tile", "tile-wall", wallTiles, 7, { repeated: "tile", subcategory: "Wall tiles", note: `${wtSize.w} × ${wtSize.h} mm to ${TILE_HEIGHT} mm high.` });
    if (wtc) for (const r of wt) {
      const unit = (wtSize.w + GROUT) * (wtSize.h + GROUT) * 1e-6;
      if (wad) addQuantity(ctx, wad, { workItem: "walltile.adhesive", description: "Tile adhesive (walls)", section: "L", unit: "m²", value: round(r.area, 3), formula: `tiled wall ${f2(r.area)} m²`, inputs: { area: round(r.area, 3) }, status: "calculated" }, { room: r.room.name, allowance: { rule: "Waste (example assumption)", percent: 5 } });
      addQuantity(ctx, wtc, { workItem: "walltile.area", description: "Wall tiles", section: "L", unit: "m²", value: round(r.area, 3), formula: `perimeter faces up to ${TILE_HEIGHT} mm, less doors and windows = ${f2(r.area)} m²`, inputs: { area: round(r.area, 3), height: TILE_HEIGHT }, status: "calculated" }, { room: r.room.name, allowance: { rule: "Cutting waste and breakage (example assumption)", percent: ctx.rules.allowances.tiles } });
      addQuantity(ctx, wtc, { workItem: "walltile.count", description: "Wall tiles (count)", section: "L", unit: "piece", value: round(r.area / unit, 1), formula: `${f2(r.area)} m² ÷ ${f3(unit)} m² per tile; ${r.count} drawn`, inputs: { area: round(r.area, 3), tile: `${wtSize.w}×${wtSize.h}`, drawn: r.count }, status: "assumed" }, { room: r.room.name, allowance: { rule: "Cutting waste and breakage (example assumption)", percent: ctx.rules.allowances.tiles } });
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 15: paint
// ---------------------------------------------------------------------------

const PAINT_COLOUR: Record<string, string> = { living: "paint-warm", dining: "paint-warm", kitchen: "paint-sage", bed: "paint-cool", office: "paint-cool", bath: "paint-wet", wc: "paint-wet", laundry: "paint-wet" };
const COATS_APPLIED = 2;
const SPREAD = 10; // m² per litre per coat, an example

function paint(ctx: Ctx, layouts: Map<string, RoomLayout>): void {
  const offset = PLASTER_TOTAL;
  for (const level of ctx.levels) {
    const items = roomsOf(ctx, level, layouts);
    const groups = new Map<string, RoomItem[]>();
    for (const item of items) {
      const m = PAINT_COLOUR[item.room.kind] ?? "paint-int";
      groups.set(m, [...(groups.get(m) ?? []), item]);
    }
    let gi = 0;
    for (const [material, rooms] of groups) {
      const shapes: Shape[] = [];
      const quantities: { room: RoomInfo; area: ReturnType<typeof wallArea> }[] = [];
      for (const { room, layout } of rooms) {
        const zFrom = WET.has(room.kind) ? TILE_HEIGHT : 0;
        const H = level.ceilingZ - level.floorZ;
        for (const edge of layout.edges) {
          if (!edge.wall) continue;
          for (const piece of edgePieces(edge, zFrom, H)) shapes.push(faceSlab(layout, edge, piece, offset, ASSUME.paint));
        }
        quantities.push({ room, area: wallArea(ctx, layout, zFrom, H) });
      }
      if (shapes.length === 0) continue;
      const comp = ctx.add({
        id: `paint:${level.index}:walls:${material}`, name: `Wall paint — ${level.name} (${material.replace("paint-", "")})`, kind: "paint-layer", category: "finishes", subcategory: "Paint", stage: 15, level, layer: "paint", materialId: material, shapes, repeated: { noun: "panel" },
        source: "schematic", explode: { layerIndex: 6 + gi, dir: v3(0, 0, 0) }, note: material === "paint-wet" ? "Moisture-resistant coating above the tile line in wet rooms." : "Colours are examples chosen to tell rooms apart.",
      });
      gi += 1;
      for (const { room, area } of quantities) {
        const wet = material === "paint-wet";
        addQuantity(ctx, comp, { workItem: wet ? "paint.wet-walls" : "paint.walls", description: wet ? "Moisture-resistant paint, walls" : "Interior emulsion paint, walls", section: "M", unit: "m²", value: round(area.net, 3), formula: area.text, inputs: { perimeter: round(area.perimeter, 0), openings: round(area.out, 3), coats: COATS_APPLIED, spread: SPREAD, litres: round((area.net * COATS_APPLIED) / SPREAD, 2) }, status: "calculated" },
          { room: room.name, allowance: { rule: "Waste and absorbency (example assumption)", percent: ctx.rules.allowances.paint }, assumptions: [`${COATS_APPLIED} coats at ${SPREAD} m² per litre per coat (an example; the product data sheet governs).`] });
      }
    }
    // Ceilings: one white component per storey.
    const ceil: Shape[] = [];
    const ceilQ: { room: RoomInfo; area: number }[] = [];
    const holes = slabOpenings(ctx, level.index + 1).map((h) => rectPoly(h.x0, h.y0, h.x1, h.y1));
    for (const { room, layout } of items) {
      let regions: P2[][] = [layout.clear.poly];
      for (const hole of holes) regions = regions.flatMap((p) => subtractConvex(p, hole));
      regions = regions.filter((p) => p.length >= 3 && polygonArea(p) > 10000);
      regions.forEach((p) => ceil.push(prism(p, level.ceilingZ - ceilingBoardPaintTop(), level.ceilingZ - ceilingBoardTop())));
      ceilQ.push({ room, area: regions.reduce((s, p) => s + polygonArea(p), 0) * 1e-6 });
    }
    if (ceil.length) {
      const comp = ctx.add({ id: `paint:${level.index}:ceilings`, name: `Ceiling paint — ${level.name}`, kind: "paint-layer", category: "finishes", subcategory: "Paint", stage: 15, level, layer: "paint", materialId: "paint-int", shapes: ceil, explode: { layerIndex: 12, dir: v3(0, 0, -1) }, source: "schematic" });
      for (const { room, area } of ceilQ) addQuantity(ctx, comp, { workItem: "paint.ceilings", description: "Ceiling emulsion paint", section: "M", unit: "m²", value: round(area, 3), formula: `ceiling area ${f2(area)} m²`, inputs: { area: round(area, 3), coats: COATS_APPLIED, litres: round((area * COATS_APPLIED) / SPREAD, 2) }, status: "calculated" }, { room: room.name, allowance: { rule: "Waste (example assumption)", percent: ctx.rules.allowances.paint } });
    }
  }
}

const ceilingBoardTop = () => ASSUME.ceilingBoard;
const ceilingBoardPaintTop = () => ASSUME.ceilingBoard + ASSUME.paint;
