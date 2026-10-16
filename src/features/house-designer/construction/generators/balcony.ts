import { ASSUME, UP, dim, type Ctx, type LevelInfo } from "../context";
import { alongLine, box, clipConvex, cyl, polygonArea, prism, v3, type P2, type Shape } from "../geometry";
import { addQuantity, barBetween, concreteQuantity, f2, f3, formworkQuantity, rebarQuantity, round, spaced, spacedWithin } from "../helpers";
import { counterClockwise, offsetPolygon } from "../region";
import { frameHalfOf, halfPlane, pourXCut } from "../slab-cast";
import { outwardSign } from "./foundation";
import { lattice } from "./slab-steel";

/**
 * Cantilever balconies, cast with the floor slab.
 *
 * A balcony is not a box bolted on at the end: it is the floor slab carried on past the edge beam, poured in one
 * with it, with the top steel (the negative steel) running from the tip, over the beam and back into the slab
 * behind it. So it is built at the stage the floor is: its concrete and steel, its formwork and the props that carry it
 * while it gains strength. The waterproofing, screed and tiles go on with the floors, the render and paint with the
 * outside, and the railing last.
 */

/** The size of the upstand cast round the three outer edges, mm. It holds the waterproofing and the railing. */
const KERB_WIDTH = 100;
const KERB_HEIGHT = 150;

type Balcony = Ctx["project"]["balconies"][number];

export type BalconyFrame = {
  /** Along the wall, and out from it, unit vectors in plan. */
  u: P2;
  out: P2;
  /** The middle of the balcony along the wall, on the wall's centre line. */
  root: P2;
  width: number;
  /** From the wall's centre line: where the slab as cast ends, the outer face of the edge beam, and the tip. */
  edge: number;
  beamFace: number;
  tip: number;
  /** The slab's top, and its underside. */
  top: number;
  bottom: number;
  thickness: number;
};

const unit = (x: number, y: number): P2 => { const len = Math.hypot(x, y) || 1; return { x: x / len, y: y / len }; };
const at = (f: BalconyFrame, along: number, out: number): P2 => ({ x: f.root.x + f.u.x * along + f.out.x * out, y: f.root.y + f.u.y * along + f.out.y * out });

/** Where a balcony stands: its direction along and out from the wall, and how far out each part of it reaches. */
export function balconyFrame(ctx: Ctx, balcony: Balcony, lowerLevelId: string): BalconyFrame {
  const wall = ctx.walls.find((w) => w.id === balcony.wallId);
  const rad = (balcony.rotation * Math.PI) / 180;
  const centre = { x: balcony.x, y: balcony.y };
  let u: P2; let out: P2; let root: P2; let wallHalf: number;
  if (wall) {
    const sign = outwardSign(wall) || -1;
    u = { x: wall.ux, y: wall.uy };
    out = { x: wall.nx * sign, y: wall.ny * sign };
    // The balcony's middle, dropped onto the wall's centre line.
    const s = (centre.x - wall.start.x) * wall.ux + (centre.y - wall.start.y) * wall.uy;
    root = { x: wall.start.x + wall.ux * s, y: wall.start.y + wall.uy * s };
    wallHalf = wall.thickness / 2;
  } else {
    // Without its wall, out is the way the rectangle's depth runs that points away from the middle of the plan.
    u = unit(Math.cos(rad), Math.sin(rad));
    const across = unit(-Math.sin(rad), Math.cos(rad));
    const mid = { x: (ctx.bounds.minX + ctx.bounds.maxX) / 2, y: (ctx.bounds.minY + ctx.bounds.maxY) / 2 };
    const sign = (centre.x - mid.x) * across.x + (centre.y - mid.y) * across.y >= 0 ? 1 : -1;
    out = { x: across.x * sign, y: across.y * sign };
    wallHalf = (ctx.walls.find((w) => w.exterior)?.thickness ?? 200) / 2;
    root = { x: centre.x - out.x * (balcony.depth / 2 + wallHalf), y: centre.y - out.y * (balcony.depth / 2 + wallHalf) };
  }
  // The edge beam is the one under the wall the balcony comes out of; without a wall, the widest beam of the storey stands for it.
  const beams = ctx.project.structuralBeams.filter((b) => b.levelId === lowerLevelId);
  const under = wall ? beams.filter((b) => [b.start, b.end].every((p) => Math.abs((p.x - wall.start.x) * wall.nx + (p.y - wall.start.y) * wall.ny) <= 150)) : [];
  return {
    u, out, root, width: balcony.width,
    edge: frameHalfOf(ctx, lowerLevelId),
    beamFace: Math.max(0, ...(under.length ? under : beams).map((b) => b.width / 2)),
    tip: wallHalf + balcony.depth,
    top: balcony.elevation, bottom: balcony.elevation - balcony.thickness, thickness: balcony.thickness,
  };
}

const rectAt = (f: BalconyFrame, a0: number, a1: number, o0: number, o1: number): P2[] => [at(f, a0, o0), at(f, a1, o0), at(f, a1, o1), at(f, a0, o1)];

/** The plan area, round the root of each balcony, where the steel over the edge beam is the balcony's own: the slab's top bars give way to it. */
export function balconyRootZones(ctx: Ctx, upperLevelId: string, lowerLevelId: string): P2[][] {
  return ctx.project.balconies.filter((b) => b.levelId === upperLevelId).map((b) => {
    const f = balconyFrame(ctx, b, lowerLevelId);
    return rectAt(f, -f.width / 2 - 1, f.width / 2 + 1, -400, 400);
  });
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The balconies of the floor over `lower`, as cast with it: concrete and steel, formwork and props. Stage 5. */
export function generateBalconyStructure(ctx: Ctx, lower: LevelInfo, upper: LevelInfo, baseBeamPour: number): void {
  const approved = ctx.approved;
  const cover = ASSUME.rebarCover;
  const cut = pourXCut(ctx);
  const convex = ctx.outline.length === 4;
  for (const balcony of ctx.project.balconies.filter((b) => b.levelId === upper.levelId)) {
    const f = balconyFrame(ctx, balcony, lower.levelId);
    const id = slug(balcony.id);
    const reach = f.tip - f.edge;
    if (reach < 300 || f.width < 600) continue;
    const mid = at(f, 0, (f.edge + f.tip) / 2);
    const deck = rectAt(f, -f.width / 2, f.width / 2, f.edge, f.tip);
    const area = f.width * reach;
    const kerbs: P2[][] = [
      rectAt(f, -f.width / 2, f.width / 2, f.tip - KERB_WIDTH, f.tip),
      rectAt(f, -f.width / 2, -f.width / 2 + KERB_WIDTH, f.edge, f.tip - KERB_WIDTH),
      rectAt(f, f.width / 2 - KERB_WIDTH, f.width / 2, f.edge, f.tip - KERB_WIDTH),
    ];
    // Where the floor slab is poured in two, a balcony over the joint is poured in two with it: each part is placed with the zone it grows out of.
    const byZone = (poly: P2[]): { zone: string; poly: P2[] }[] => (convex
      ? (["west", "east"] as const).map((side) => ({ zone: `${side}-zone`, poly: clipConvex(counterClockwise(poly), halfPlane(cut, side)) })).filter((part) => part.poly.length >= 3 && polygonArea(part.poly) > 1)
      : [{ zone: "slab", poly }]);
    const concretes = byZone(deck).map((part, i) => {
      const own = kerbs.flatMap((k) => byZone(k)).filter((k) => k.zone === part.zone).map((k) => k.poly);
      const partArea = polygonArea(part.poly);
      const slabVolume = partArea * f.thickness * 1e-9;
      const kerbLength = own.reduce((sum, k) => sum + polygonArea(k) / KERB_WIDTH, 0);
      const kerbVolume = kerbLength * KERB_WIDTH * KERB_HEIGHT * 1e-9;
      const parent = `frame:slab:${upper.levelId}:${part.zone}`;
      const comp = ctx.add({
        id: i === 0 ? `frame:balcony:${id}` : `frame:balcony:${id}:${part.zone}`, name: `Balcony cantilever slab${i === 0 ? "" : ` (${part.zone.replace("-", " ")})`} — ${upper.name}`, kind: "balcony", category: "frame", subcategory: "Cantilever slabs", stage: 5, level: lower, layer: "concrete", materialId: "concrete",
        shapes: [prism(part.poly, f.bottom, f.top), ...own.map((k) => prism(k, f.top, f.top + KERB_HEIGHT))], source: "project", sourceRef: balcony.id, pour: baseBeamPour + (part.zone === "east-zone" ? 1 : 0), parentId: parent, connectedIds: [parent], explode: { layerIndex: 0, dir: UP },
        dims: { length: dim(round(partArea / reach, 0), "mm", "measured", "Along the wall"), width: dim(round(reach, 0), "mm", "calculated", "From the edge of the floor slab to the tip"), thickness: dim(f.thickness, "mm", "measured"), volume: dim(round(slabVolume + kerbVolume, 3), "m³", "calculated") },
        ...(i === 0 ? { label: { text: "Cantilever balcony slab", anchor: v3(mid.x, mid.y, f.top + KERB_HEIGHT) } } : {}),
        note: "The floor slab carried past the edge beam and poured with it. The top steel runs from the tip, over the beam and back into the slab behind; it is the steel that holds the balcony up. Its size and length come from the structural design.",
      });
      concreteQuantity(ctx, comp, "concrete.balcony", "Balcony cantilever slab", slabVolume, `${f2(partArea / 1e6)} m² beyond the slab edge × ${f3(f.thickness / 1000)} m = ${f3(slabVolume)} m³`, { width: round(partArea / reach, 0), reach: round(reach, 0), thickness: f.thickness }, "calculated", ["Cantilever: the structural design sets its depth and steel.", "Cast in one with the floor slab: no joint between them."]);
      if (own.length) concreteQuantity(ctx, comp, "concrete.balcony", "Balcony upstand (kerb) round the outer edges", kerbVolume, `${f2(kerbLength / 1000)} m of kerb ${KERB_WIDTH} × ${KERB_HEIGHT} mm = ${f3(kerbVolume)} m³`, { length: round(kerbLength, 0), width: KERB_WIDTH, height: KERB_HEIGHT }, "assumed", ["The upstand size is an example."]);
      return comp;
    });
    const slab = concretes[0]!;
    const parent = slab.parentId!;

    // Steel. The top bars run from the tip over the edge beam and back into the slab: a cantilever's bars must be anchored 1.5 times its length behind its support.
    const r = 6;
    const zTop = f.top - cover - ASSUME.slabBar / 2 - ASSUME.slabBar - 1;
    const span = f.tip - f.beamFace;
    const backTo = f.beamFace - Math.ceil((1.5 * span) / 50) * 50;
    const half = f.width / 2 - cover - r;
    const top: Shape[] = [];
    // At the tip each bar is turned down, so the free end is anchored in the concrete: a leg as long as the slab allows, a cover above the soffit and the bottom bars.
    const leg = zTop - (f.bottom + cover + ASSUME.slabBar + 2);
    for (const a of spaced(-half, half, 150)) {
      top.push(barBetween(at(f, a, f.tip - cover), at(f, a, backTo), zTop, r * 2));
      if (leg < 30) continue;
      const foot = at(f, a, f.tip - cover - r);
      top.push(cyl(foot.x, foot.y, zTop - leg / 2, r, leg, "z"));
    }
    // Bars across them, under them, to hold them in place: along the wall, from the tip back to the edge of the floor slab.
    for (const o of spaced(backTo + 100, f.tip - cover, 250)) top.push(barBetween(at(f, -half, o), at(f, half, o), zTop - r - 4, 8));
    const topComp = ctx.add({
      id: `frame:balcony:${id}:top`, name: `Balcony top reinforcement (schematic) — ${upper.name}`, kind: "slab-bars-top", category: "frame", subcategory: "Reinforcement", stage: 5, level: lower, layer: "reinforcement", materialId: "steel-bar",
      shapes: top, repeated: { noun: "bar" }, source: "schematic", parentId: slab.id, connectedIds: [slab.id, parent], explode: { layerIndex: 2, dir: UP },
      note: `The main bars run from ${cover} mm short of the tip, over the edge beam and ${f2(Math.abs(backTo - f.beamFace) / 1000)} m back into the slab (1.5 times the ${f2(span / 1000)} m the balcony reaches from its support), with bars across them to hold them. Size and number come from the design.`,
    });
    rebarQuantity(ctx, topComp, "Balcony top reinforcement", approved);
    const region = offsetPolygon(deck, -cover);
    const bottom: Shape[] = [...lattice(region, [], "x", 200, f.bottom + cover + 5, 5), ...lattice(region, [], "y", 200, f.bottom + cover + 15, 5)];
    const kerbBars: Shape[] = [];
    for (const [a0, a1, o0, o1] of [[-half, half, f.tip - KERB_WIDTH / 2, f.tip - KERB_WIDTH / 2], [-f.width / 2 + KERB_WIDTH / 2, -f.width / 2 + KERB_WIDTH / 2, f.edge + cover, f.tip - cover], [f.width / 2 - KERB_WIDTH / 2, f.width / 2 - KERB_WIDTH / 2, f.edge + cover, f.tip - cover]] as const) {
      kerbBars.push(barBetween(at(f, a0, o0), at(f, a1, o1), f.top + KERB_HEIGHT / 2, 10));
    }
    const bottomComp = ctx.add({
      id: `frame:balcony:${id}:bottom`, name: `Balcony bottom reinforcement and upstand bars (schematic) — ${upper.name}`, kind: "slab-bars-bottom", category: "frame", subcategory: "Reinforcement", stage: 5, level: lower, layer: "reinforcement", materialId: "steel-mesh",
      shapes: [...bottom, ...kerbBars], repeated: { noun: "bar" }, source: "schematic", parentId: slab.id, connectedIds: [slab.id], explode: { layerIndex: 1, dir: UP },
    });
    rebarQuantity(ctx, bottomComp, "Balcony bottom reinforcement", approved);

    // Formwork: the deck under the cantilever, and boards round its three outer edges up to the top of the upstand.
    const ply = ASSUME.formworkPly;
    const edgeBoard = (a: P2, b: P2): Shape => alongLine(a, b, ply, f.bottom, f.top + KERB_HEIGHT);
    const out0 = (o: number, a: number): P2 => at(f, a, o);
    const form = ctx.add({
      id: `frame:balcony:${id}:form`, name: `Balcony formwork — ${upper.name}`, kind: "slab-formwork", category: "frame", subcategory: "Formwork", stage: 5, removedAfter: 5, level: lower, layer: "formwork", materialId: "formwork",
      shapes: [
        prism(deck, f.bottom - ply, f.bottom),
        edgeBoard(out0(f.tip + ply / 2, -f.width / 2 - ply), out0(f.tip + ply / 2, f.width / 2 + ply)),
        edgeBoard(out0(f.edge, -f.width / 2 - ply / 2), out0(f.tip, -f.width / 2 - ply / 2)),
        edgeBoard(out0(f.edge, f.width / 2 + ply / 2), out0(f.tip, f.width / 2 + ply / 2)),
      ], source: "schematic", parentId: slab.id, explode: { layerIndex: 3, dir: UP },
    });
    const soffit = area * 1e-6;
    const edges = (f.width + 2 * reach) * (f.thickness + KERB_HEIGHT) * 1e-6;
    formworkQuantity(ctx, form, "formwork.balcony", "Formwork to the balcony soffit and edges", soffit + edges, `soffit ${f2(soffit)} m² + the edges (${f2(f.width / 1000)} + 2 × ${f2(reach / 1000)} m) × ${f3((f.thickness + KERB_HEIGHT) / 1000)} m = ${f2(soffit + edges)} m²`, { soffit: round(soffit, 3), edges: round(edges, 3) }, "calculated", ["The root of the balcony is not formed: it is the floor slab."]);
    // Props under the deck, in rows across the cantilever, at most 1 m apart along it, standing on the ground outside.
    const ground = ASSUME.naturalGround;
    const props: Shape[] = [];
    const rows = reach > 1000 ? [f.edge + 350, f.tip - 300] : [f.tip - 300];
    for (const o of rows) for (const a of spacedWithin(-f.width / 2 + 300, f.width / 2 - 300, 1000)) {
      const p = at(f, a, o);
      const height = f.bottom - ply - ground;
      if (height > 100) props.push(cyl(p.x, p.y, ground + height / 2, 30, height, "z"));
    }
    ctx.add({
      id: `frame:balcony:${id}:props`, name: `Balcony props — ${upper.name}`, kind: "prop", category: "frame", subcategory: "Props", stage: 5, removedAfter: 5, level: lower, layer: "props", materialId: "prop",
      shapes: props, repeated: { noun: "prop" }, source: "schematic", parentId: form.id, explode: { layerIndex: 4, dir: UP },
      note: "A cantilever is held up until its concrete is strong enough to carry itself: the props stay longer than under a slab between beams.",
    });
  }
}

/** Waterproofing, screed to falls and tiles on each balcony. Stage 13. */
export function generateBalconyFloors(ctx: Ctx): void {
  for (const balcony of ctx.project.balconies) {
    const upper = ctx.level(balcony.levelId);
    const lower = upper ? ctx.levels[upper.index - 1] : undefined;
    if (!upper || !lower) continue;
    const f = balconyFrame(ctx, balcony, lower.levelId);
    const reach = f.tip - f.edge;
    if (reach < 300 || f.width < 600) continue;
    const id = slug(balcony.id);
    const inner = rectAt(f, -f.width / 2 + KERB_WIDTH, f.width / 2 - KERB_WIDTH, f.edge, f.tip - KERB_WIDTH);
    const innerArea = polygonArea(inner) * 1e-6;
    const fall = 1 / 60;
    const screedAvg = 20 + (fall * (reach - KERB_WIDTH)) / 2;
    const membrane = ASSUME.wetWaterproofing;
    const screedTop = f.top + membrane + screedAvg;
    const tileTop = screedTop + ASSUME.tileAdhesive + ASSUME.floorTile;
    const common = { category: "finishes" as const, stage: 13 as const, level: upper, source: "schematic" as const, sourceRef: balcony.id, parentId: `frame:balcony:${id}` };
    // The membrane is turned up the kerbs and the wall: 150 mm.
    const upstandHeight = 150;
    const upstand: Shape[] = [
      alongLine(at(f, -f.width / 2 + KERB_WIDTH, f.tip - KERB_WIDTH), at(f, f.width / 2 - KERB_WIDTH, f.tip - KERB_WIDTH), membrane, f.top, f.top + KERB_HEIGHT),
      alongLine(at(f, -f.width / 2 + KERB_WIDTH, f.edge), at(f, -f.width / 2 + KERB_WIDTH, f.tip - KERB_WIDTH), membrane, f.top, f.top + KERB_HEIGHT),
      alongLine(at(f, f.width / 2 - KERB_WIDTH, f.edge), at(f, f.width / 2 - KERB_WIDTH, f.tip - KERB_WIDTH), membrane, f.top, f.top + KERB_HEIGHT),
      alongLine(at(f, -f.width / 2 + KERB_WIDTH, f.edge), at(f, f.width / 2 - KERB_WIDTH, f.edge), membrane, f.top, f.top + upstandHeight),
    ];
    const upstandLength = f.width - 2 * KERB_WIDTH + 2 * (reach - KERB_WIDTH) + (f.width - 2 * KERB_WIDTH);
    const waterproofing = ctx.add({
      ...common, id: `bal:${id}:waterproofing`, name: `Balcony waterproofing — ${upper.name}`, kind: "balcony-waterproofing", subcategory: "Balcony floor", layer: "waterproofing", materialId: "waterproofing",
      shapes: [prism(inner, f.top, f.top + membrane), ...upstand], explode: { layerIndex: 0, dir: UP },
      dims: { area: dim(round(innerArea, 2), "m²", "calculated"), thickness: dim(membrane, "mm", "assumed") },
      note: "A liquid or sheet membrane over the whole deck, turned up the upstand and the wall. A balcony that leaks stains the ceiling of the room below.",
    });
    const wpArea = innerArea + (upstandLength * KERB_HEIGHT) * 1e-6;
    addQuantity(ctx, waterproofing, { workItem: "waterproofing.balcony", description: "Balcony waterproofing membrane with upstands", section: "G", unit: "m²", value: round(wpArea, 3), formula: `deck ${f2(innerArea)} m² + upstand ${f2(upstandLength / 1000)} m × ${f2(KERB_HEIGHT / 1000)} m = ${f2(wpArea)} m²`, inputs: { deck: round(innerArea, 3), upstand: round(upstandLength, 0) }, status: "assumed" }, { allowance: { rule: "Laps and upstands (example assumption)", percent: ctx.rules.allowances.tiles }, assumptions: ["Upstand 150 mm all round."] });
    const screed = ctx.add({
      ...common, id: `bal:${id}:screed`, name: `Balcony screed to falls — ${upper.name}`, kind: "floor-screed", subcategory: "Balcony floor", layer: "screed", materialId: "screed",
      shapes: [prism(inner, f.top + membrane, screedTop)], explode: { layerIndex: 1, dir: UP },
      dims: { thickness: dim(round(screedAvg, 1), "mm", "assumed", "Average: it thickens away from the door so water runs off the edge"), area: dim(round(innerArea, 2), "m²", "calculated") },
    });
    const screedVolume = innerArea * screedAvg * 1e-3;
    addQuantity(ctx, screed, { workItem: "screed.balcony", description: "Screed to falls on the balcony", section: "K", unit: "m³", value: round(screedVolume, 3), formula: `${f2(innerArea)} m² × ${f3(screedAvg / 1000)} m average = ${f3(screedVolume)} m³`, inputs: { area: round(innerArea, 3), thickness: round(screedAvg, 1) }, status: "assumed" }, { assumptions: ["20 mm at the thinnest, 1 in 60 fall away from the building (examples)."], allowance: { rule: "Wastage and level variation (example)", percent: null } });
    const adhesiveTop = screedTop + ASSUME.tileAdhesive;
    const adhesive = ctx.add({
      ...common, id: `bal:${id}:adhesive`, name: `Balcony tile adhesive — ${upper.name}`, kind: "tile-adhesive", subcategory: "Balcony floor", layer: "tile", materialId: "adhesive", shapes: [prism(inner, screedTop, adhesiveTop)], explode: { layerIndex: 2, dir: UP },
      dims: { area: dim(round(innerArea, 2), "m²", "calculated"), thickness: dim(ASSUME.tileAdhesive, "mm", "assumed") },
      note: "A weather-resistant, flexible adhesive: an outdoor floor moves with the sun and the rain.",
    });
    addQuantity(ctx, adhesive, { workItem: "flooring.balcony-adhesive", description: "Tile adhesive (balcony)", section: "K", unit: "m²", value: round(innerArea, 3), formula: `deck inside the upstand ${f2(innerArea)} m² at ${ASSUME.tileAdhesive} mm`, inputs: { area: round(innerArea, 3), thickness: ASSUME.tileAdhesive }, status: "assumed" }, { allowance: { rule: "Waste (example assumption)", percent: 5 } });
    const tiles = ctx.add({
      ...common, id: `bal:${id}:tiles`, name: `Balcony tiles — ${upper.name}`, kind: "floor-tile", subcategory: "Balcony floor", layer: "tile", materialId: "tile-stone", shapes: [prism(inner, adhesiveTop, tileTop)], explode: { layerIndex: 3, dir: UP },
      dims: { area: dim(round(innerArea, 2), "m²", "calculated"), thickness: dim(ASSUME.floorTile, "mm", "assumed") },
      note: "Non-slip, frost-proof tiles on adhesive: an outdoor floor needs a rougher surface than an indoor one.",
    });
    addQuantity(ctx, tiles, { workItem: "flooring.balcony", description: "Non-slip tiles on the balcony", section: "K", unit: "m²", value: round(innerArea, 3), formula: `deck inside the upstand ${f2(innerArea)} m²`, inputs: { area: round(innerArea, 3) }, status: "calculated" }, { allowance: { rule: "Cutting waste (example assumption)", percent: ctx.rules.allowances.tiles } });
  }
}

/** Render and paint on the underside and the edges, and the railing with its glass. Stage 18. */
export function generateBalconyFinish(ctx: Ctx): void {
  for (const balcony of ctx.project.balconies) {
    const upper = ctx.level(balcony.levelId);
    const lower = upper ? ctx.levels[upper.index - 1] : undefined;
    if (!upper || !lower) continue;
    const f = balconyFrame(ctx, balcony, lower.levelId);
    const reach = f.tip - f.edge;
    if (reach < 300 || f.width < 600) continue;
    const id = slug(balcony.id);
    const coat = ASSUME.plasterBase + ASSUME.plasterFinal + ASSUME.externalPlasterExtra;
    const common = { category: "external" as const, stage: 18 as const, level: upper, source: "schematic" as const, sourceRef: balcony.id, parentId: `frame:balcony:${id}` };
    // The soffit and the three outer faces, up to the top of the upstand.
    const faces: Shape[] = [
      prism(rectAt(f, -f.width / 2 - coat, f.width / 2 + coat, f.edge, f.tip + coat), f.bottom - coat, f.bottom),
      alongLine(at(f, -f.width / 2 - coat, f.tip + coat / 2), at(f, f.width / 2 + coat, f.tip + coat / 2), coat, f.bottom - coat, f.top + KERB_HEIGHT),
      alongLine(at(f, -f.width / 2 - coat / 2, f.edge), at(f, -f.width / 2 - coat / 2, f.tip + coat), coat, f.bottom - coat, f.top + KERB_HEIGHT),
      alongLine(at(f, f.width / 2 + coat / 2, f.edge), at(f, f.width / 2 + coat / 2, f.tip + coat), coat, f.bottom - coat, f.top + KERB_HEIGHT),
    ];
    const finishArea = (f.width * reach + (f.width + 2 * reach) * (f.thickness + KERB_HEIGHT)) * 1e-6;
    const render = ctx.add({
      ...common, id: `ext:balcony:${id}:render`, name: `Balcony soffit and edge render and paint — ${upper.name}`, kind: "external-plaster", subcategory: "External finishes", layer: "plaster", materialId: "plaster-final", shapes: faces, explode: { layerIndex: 0, dir: v3(0, 0, 0) },
      dims: { area: dim(round(finishArea, 2), "m²", "calculated"), thickness: dim(coat, "mm", "assumed") },
    });
    addQuantity(ctx, render, { workItem: "plaster.external-final", description: "External plaster final coat", section: "J", unit: "m²", value: round(finishArea, 3), formula: `soffit ${f2((f.width * reach) / 1e6)} m² + edges ${f2(((f.width + 2 * reach) * (f.thickness + KERB_HEIGHT)) / 1e6)} m²`, inputs: { soffit: round((f.width * reach) / 1e6, 3) }, status: "assumed" }, { allowance: { rule: "Wastage (example assumption)", percent: ctx.rules.allowances.plaster } });
    addQuantity(ctx, render, { workItem: "paint.external", description: "Exterior masonry paint", section: "M", unit: "m²", value: round(finishArea, 3), formula: `the same ${f2(finishArea)} m² as the render`, inputs: { area: round(finishArea, 3) }, status: "assumed" }, { allowance: { rule: "Waste and absorbency (example assumption)", percent: ctx.rules.allowances.paint } });

    // Railing along the three outer edges: posts at most 1.2 m apart on top of the upstand, a handrail, and glass between them.
    const height = balcony.railingHeight || 1050;
    const sections: [P2, P2][] = [
      [at(f, -f.width / 2 + KERB_WIDTH / 2, f.tip - KERB_WIDTH / 2), at(f, f.width / 2 - KERB_WIDTH / 2, f.tip - KERB_WIDTH / 2)],
      [at(f, -f.width / 2 + KERB_WIDTH / 2, f.edge + KERB_WIDTH), at(f, -f.width / 2 + KERB_WIDTH / 2, f.tip - KERB_WIDTH / 2)],
      [at(f, f.width / 2 - KERB_WIDTH / 2, f.edge + KERB_WIDTH), at(f, f.width / 2 - KERB_WIDTH / 2, f.tip - KERB_WIDTH / 2)],
    ];
    const baseZ = f.top + KERB_HEIGHT;
    const posts: Shape[] = [];
    const rails: Shape[] = [];
    const panes: Shape[] = [];
    let length = 0;
    for (const [a, b] of sections) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      length += len;
      const n = Math.max(1, Math.ceil(len / 1200));
      for (let k = 0; k <= n; k += 1) posts.push(box(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, f.top + height / 2 + KERB_HEIGHT / 2 - 25, 50, 50, height - KERB_HEIGHT + 50 - 0));
      rails.push(alongLine(a, b, 50, f.top + height - 30, f.top + height + 20));
      for (let k = 0; k < n; k += 1) {
        const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
        const q = { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n };
        const gap = 40;
        const dx = (q.x - p.x) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
        const dy = (q.y - p.y) / (Math.hypot(q.x - p.x, q.y - p.y) || 1);
        panes.push(alongLine({ x: p.x + dx * gap, y: p.y + dy * gap }, { x: q.x - dx * gap, y: q.y - dy * gap }, 12, baseZ + 80, f.top + height - 40));
      }
    }
    const railing = ctx.add({
      ...common, id: `ext:balcony:${id}:railing`, name: `Balcony railing posts and handrail — ${upper.name}`, kind: "railing", subcategory: "Railings", layer: "external", materialId: "railing", shapes: [...posts, ...rails], repeated: { noun: "part" }, parentId: `frame:balcony:${id}`, explode: { layerIndex: 1, dir: UP },
      note: "Height and strength are set by regulation; 1.05 m is an example.",
    });
    addQuantity(ctx, railing, { workItem: "external.railing", description: "Railings and handrails", section: "W", unit: "m", value: round(length / 1000, 3), formula: `along the three outer edges ${f2(length / 1000)} m`, inputs: { length: round(length, 0) }, status: "assumed" }, { allowance: { rule: "Posts and returns (example)", percent: 5 } });
    const glass = ctx.add({
      ...common, id: `ext:balcony:${id}:glass`, name: `Balcony glass panels — ${upper.name}`, kind: "railing-glass", subcategory: "Railings", layer: "external", materialId: "glass", shapes: panes, repeated: { noun: "pane" }, parentId: railing.id, explode: { layerIndex: 2, dir: UP },
      note: "Toughened (or laminated) glass, fixed between the posts.",
    });
    const glassArea = (length * (height - KERB_HEIGHT - 120)) * 1e-6;
    addQuantity(ctx, glass, { workItem: "external.railing-glass", description: "Toughened glass in the balcony railing", section: "W", unit: "m²", value: round(glassArea, 3), formula: `${f2(length / 1000)} m × ${f2((height - KERB_HEIGHT - 120) / 1000)} m`, inputs: { length: round(length, 0), height: round(height - KERB_HEIGHT - 120, 0) }, status: "assumed" }, { allowance: { rule: "Cutting to size (example)", percent: 5 } });
  }
}
