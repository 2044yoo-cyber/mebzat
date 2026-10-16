import { ASSUME, UP, dim, type Ctx } from "../context";
import { alongLine, box, cyl, polygonArea, polygonBounds, prism, profile, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, f3, round } from "../helpers";
import { offsetPolygon } from "../region";
import { parapetBand } from "../slab-cast";
import { EXTERNAL_COATS, edgeSkins } from "./facade";
import { planPlumbing } from "../plumbing-plan";
import { FASCIA_SETBACK, OVERHANG, PITCH_DEG, PLATE, PLATE_H, RAFTER_TOP, TRUSS_D, gableOutline, parapetHeightOf, pitchedCover, pitchedGutter } from "../roof-geometry";

/**
 * Stage 8: the roof, as two selectable alternatives on the same roof slab.
 * A flat roof is built up in layers inside a parapet; a pitched roof stands
 * timber trusses on wall plates. Components of each carry a `roof` variant so
 * only the chosen one is shown, and quantities are totalled for the chosen one.
 */

const PROTECTION = 30;
const TRUSS_SPACING = 900;
const BATTEN_SPACING = 350;
const TRUSS_W = 50;
const COVERING_T = 6;
const COPING_T = 40;
const COPING_OVER = 25;

const flat = { group: "roof", value: "flat" } as const;
const pitched = { group: "roof", value: "pitched" } as const;

function perimeter(poly: P2[]): number {
  return poly.reduce((s, p, i) => s + Math.hypot(poly[(i + 1) % poly.length]!.x - p.x, poly[(i + 1) % poly.length]!.y - p.y), 0);
}

export function generateRoof(ctx: Ctx): void {
  const top = ctx.top;
  const roof = ctx.project.roofs[0];
  if (!top || !roof) {
    ctx.warnings.push("The project has no roof, so no roof construction can be shown.");
    return;
  }
  const slabTop = roof.elevation + roof.thickness;
  generateFlat(ctx, slabTop);
  generatePitched(ctx, slabTop);
}

// ---------------------------------------------------------------------------
// Flat roof
// ---------------------------------------------------------------------------

function generateFlat(ctx: Ctx, slabTop: number): void {
  const top = ctx.top!;
  // The parapet stands on the edge of the roof slab, flush with it and with the frame below (see parapetBand): the roof surface is what is inside it.
  const { outer, inner: innerPoly } = parapetBand(ctx);
  const inner = { poly: innerPoly, exact: true };
  const exact = inner.exact;
  const parapetT = ASSUME.parapetThickness;
  const innerArea = polygonArea(inner.poly) * 1e-6;
  const band = polygonArea(outer) * 1e-6 - innerArea;
  const ph = parapetHeightOf(ctx.options);
  const b = ctx.bounds;
  const ib = polygonBounds(inner.poly);
  // The outlets are where the rainwater plan stands the downpipes, so each one drains into a pipe that is really there.
  const planned = planPlumbing(ctx).rain.flatOutlets;
  const outlets = planned.length ? planned : [{ x: ib.minX + (ib.maxX - ib.minX) * 0.25, y: ib.minY + 250 }, { x: ib.minX + (ib.maxX - ib.minX) * 0.75, y: ib.minY + 250 }];
  const run = Math.max(...inner.poly.map((p) => Math.min(...outlets.map((o) => Math.hypot(p.x - o.x, p.y - o.y)))));
  const minScreed = ASSUME.roofScreedMin;
  const screedAvg = minScreed + (ASSUME.roofFall * run) / 2;
  const screedTop = slabTop + screedAvg;
  const insTop = screedTop + 1 + ASSUME.roofInsulation;
  const memTop = insTop + ASSUME.membrane;
  const protTop = memTop + PROTECTION;
  const label = (text: string, z: number) => ({ text, anchor: v3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, z) });
  const common = { category: "roof" as const, stage: 8 as const, level: top, variant: flat, source: "schematic" as const };

  // Parapet: the blockwork band round the roof, net of nothing (it stands on the slab edge).
  const parapet = ctx.add({
    ...common, id: "roof:flat:parapet", name: "Parapet wall", kind: "parapet", category: "masonry", subcategory: "Parapet", layer: "masonry", materialId: "block-hollow",
    shapes: [prism(outer, slabTop, slabTop + ph, [inner.poly])], source: "project", sourceRef: "main-roof", explode: { layerIndex: 0, dir: UP },
    dims: { height: dim(ph, "mm", "assumed"), thickness: dim(parapetT, "mm", "assumed"), area: dim(round(band, 2), "m²", exact ? "calculated" : "review", "Plan area of the parapet band") },
    label: { text: "Parapet", anchor: v3(b.minX, (b.minY + b.maxY) / 2, slabTop + ph) },
    note: "Height and thickness are example values: the designer sets them from the safety and drainage requirements.",
  });
  // The centre line of the band is half way between its two edges, however many corners the outline has.
  const parapetLen = (perimeter(outer) + perimeter(inner.poly)) / 2;
  const parapetArea = (parapetLen * 1e-3) * (ph * 1e-3);
  const perM2 = 1e6 / ((390 + 10) * (190 + 10));
  addQuantity(ctx, parapet, { workItem: "masonry.parapet", description: "Parapet blockwork", section: "F", unit: "m²", value: round(parapetArea, 3), formula: `centre length ${f2(parapetLen / 1000)} m × height ${f3(ph / 1000)} m = ${f2(parapetArea)} m²`, inputs: { length: round(parapetLen, 0), height: ph }, status: exact ? "assumed" : "review" },
    { assumptions: ["Parapet one block thick on the slab edge, no openings.", "Blocks at 12.5 per m²."], allowance: { rule: "Breakage and cutting waste (example assumption)", percent: ctx.rules.allowances.blocks } });
  addQuantity(ctx, parapet, { workItem: "masonry.blocks", description: "Blocks — parapet", section: "F", unit: "piece", value: round(parapetArea * perM2, 1), formula: `${f2(parapetArea)} m² × ${f2(perM2)} per m²`, inputs: { area: round(parapetArea, 3), perM2: round(perM2, 3) }, status: "assumed" },
    { allowance: { rule: "Breakage and cutting waste (example assumption)", percent: ctx.rules.allowances.blocks } });

  const layerSpec: { id: string; name: string; kind: string; material: string; layer: "waterproofing" | "insulation" | "screed" | "roofing"; z0: number; z1: number; area: number; workItem: string; description: string; section: "G" | "H" | "K"; note?: string; index: number }[] = [
    { id: "screed", name: "Screed to falls", kind: "roof-screed", material: "screed", layer: "screed", z0: slabTop, z1: screedTop, area: innerArea, workItem: "screed.roof", description: "Roof screed to falls", section: "K", index: 1, note: `Drawn at its average thickness of ${f2(screedAvg)} mm. It is thinnest (${minScreed} mm) at the outlets and thickens at 1:${Math.round(1 / ASSUME.roofFall)} away from them.` },
    { id: "vapour", name: "Vapour control layer (where specified)", kind: "vapour-control", material: "dpm", layer: "waterproofing", z0: screedTop, z1: screedTop + 1, area: innerArea, workItem: "waterproofing.roof-vapour", description: "Roof vapour control layer", section: "G", index: 2, note: "Included as an example; omit where the specification does not require it." },
    { id: "insulation", name: "Roof insulation (where specified)", kind: "roof-insulation", material: "insulation", layer: "insulation", z0: screedTop + 1, z1: insTop, area: innerArea, workItem: "insulation.roof", description: "Roof insulation", section: "G", index: 3, note: "Included as an example; thickness comes from the energy requirement." },
    { id: "membrane", name: "Waterproofing membrane", kind: "roof-membrane", material: "roof-membrane", layer: "waterproofing", z0: insTop, z1: memTop, area: innerArea, workItem: "waterproofing.roof-membrane", description: "Roof waterproofing membrane (flat area)", section: "H", index: 4 },
    { id: "protection", name: "Protection layer", kind: "roof-protection", material: "roof-protection", layer: "roofing", z0: memTop, z1: protTop, area: innerArea, workItem: "roof.protection", description: "Protection layer over the membrane", section: "H", index: 5 },
  ];
  for (const l of layerSpec) {
    const comp = ctx.add({
      ...common, id: `roof:flat:${l.id}`, name: l.name, kind: l.kind, subcategory: "Flat roof build-up", layer: l.layer, materialId: l.material, shapes: [prism(inner.poly, l.z0, l.z1)],
      explode: { layerIndex: l.index, dir: UP }, dims: { thickness: dim(round(l.z1 - l.z0, 1), "mm", "assumed"), area: dim(round(l.area, 2), "m²", exact ? "calculated" : "review") },
      ...(l.note ? { note: l.note } : {}), ...(l.id === "membrane" ? { label: label("Waterproofing membrane", memTop) } : {}),
    });
    addQuantity(ctx, comp, { workItem: l.workItem, description: l.description, section: l.section, unit: "m²", value: round(l.area, 3), formula: `Plan area inside the parapet ${f2(l.area)} m² (the roof is flat, so plan area = surface area)`, inputs: { planArea: round(l.area, 3), thickness: round(l.z1 - l.z0, 1) }, status: exact ? "assumed" : "review" },
      { assumptions: ["Layer thicknesses are examples."], allowance: { rule: "Laps and cutting waste (example assumption)", percent: ctx.rules.allowances.tiles } });
  }
  // Upstand: the membrane turned up the inside of the parapet.
  const innerPerimeter = perimeter(inner.poly);
  const upstand = 300;
  const upstandShapes: Shape[] = inner.poly.map((p, i) => alongLine(p, inner.poly[(i + 1) % inner.poly.length]!, 4, memTop, memTop + upstand));
  const flashing = ctx.add({
    ...common, id: "roof:flat:upstand", name: "Membrane upstand and flashing at the parapet", kind: "flashing", subcategory: "Flat roof build-up", layer: "waterproofing", materialId: "flashing", shapes: upstandShapes,
    explode: { layerIndex: 4, dir: UP }, parentId: "roof:flat:membrane", dims: { length: dim(round(innerPerimeter, 0), "mm", "calculated"), height: dim(upstand, "mm", "assumed") },
  });
  addQuantity(ctx, flashing, { workItem: "waterproofing.roof-upstand", description: "Membrane upstand at parapet", section: "H", unit: "m²", value: round((innerPerimeter / 1000) * (upstand / 1000), 3), formula: `perimeter ${f2(innerPerimeter / 1000)} m × upstand ${f3(upstand / 1000)} m`, inputs: { perimeter: round(innerPerimeter, 0), upstand }, status: "assumed" },
    { assumptions: ["Upstand height is an example; the specification sets it above the finished roof level."], allowance: { rule: "Laps (example assumption)", percent: ctx.rules.allowances.tiles } });

  // Coping on the parapet.
  const copingOuter = { poly: offsetPolygon(outer, COPING_OVER) };
  const copingInner = { poly: offsetPolygon(inner.poly, -COPING_OVER) };
  const coping = ctx.add({
    ...common, id: "roof:flat:coping", name: "Parapet coping", kind: "coping", subcategory: "Parapet", layer: "concrete", materialId: "coping",
    shapes: [prism(copingOuter.poly, slabTop + ph, slabTop + ph + COPING_T, [copingInner.poly])], explode: { layerIndex: 6, dir: UP }, parentId: parapet.id,
    dims: { thickness: dim(COPING_T, "mm", "assumed"), length: dim(round(parapetLen, 0), "mm", "calculated") },
  });
  addQuantity(ctx, coping, { workItem: "roof.coping", description: "Parapet coping", section: "H", unit: "m", value: round(parapetLen / 1000, 3), formula: `parapet centre length ${f2(parapetLen / 1000)} m`, inputs: { length: round(parapetLen, 0) }, status: "assumed" }, { allowance: { rule: "Cutting waste at corners (example assumption)", percent: 5 } });

  // The parapet's faces, rendered and painted in the coats of the walls: the outer face from the roof slab up (below it the frame's band is rendered with the walls),
  // and the inner face above the membrane's upstand, which covers its foot.
  const faceTop = slabTop + ph;
  const innerFrom = memTop + upstand;
  const innerH = Math.max(0, faceTop - innerFrom);
  const outerLen = perimeter(outer);
  const faceArea = (outerLen * ph + innerPerimeter * innerH) * 1e-6;
  EXTERNAL_COATS.forEach((coat, ci) => {
    const before = EXTERNAL_COATS.slice(0, ci).reduce((sum, c) => sum + c.t, 0);
    const shapes = [...edgeSkins(outer, before, coat.t, slabTop, faceTop), ...(innerH > 1 ? edgeSkins(inner.poly, before, coat.t, innerFrom, faceTop, true) : [])];
    const comp = ctx.add({
      ...common, id: `ext:parapet:${coat.id}`, name: `Parapet — ${coat.name.charAt(0).toLowerCase()}${coat.name.slice(1)}`, kind: coat.id === "paint" ? "paint-layer" : "external-plaster", category: "external", subcategory: "External finishes", stage: 18,
      layer: coat.id === "paint" ? "paint" : "plaster", materialId: coat.material, shapes, repeated: { noun: "panel" }, explode: { layerIndex: ci, dir: v3(0, 0, 0) }, parentId: parapet.id, dims: { thickness: dim(coat.t, "mm", "assumed") },
      note: "The outside face of the parapet from the roof slab up, and the inside face above the membrane's upstand.",
    });
    addQuantity(ctx, comp, { workItem: coat.workItem, description: coat.desc, section: coat.section, unit: "m²", value: round(faceArea, 3), formula: `outer face ${f2(outerLen / 1000)} m × ${f3(ph / 1000)} m + inner face ${f2(innerPerimeter / 1000)} m × ${f3(innerH / 1000)} m (above the ${upstand} mm upstand) = ${f2(faceArea)} m²`, inputs: { outer: round(outerLen, 0), inner: round(innerPerimeter, 0), height: ph, innerHeight: round(innerH, 0) }, status: "calculated" },
      { allowance: { rule: coat.section === "J" ? "Wastage and thickness variation (example assumption)" : "Waste and absorbency (example assumption)", percent: coat.section === "J" ? ctx.rules.allowances.plaster : ctx.rules.allowances.paint } });
  });

  // Outlets and downpipe stubs.
  const outletShapes: Shape[] = outlets.map((o) => cyl(o.x, o.y, screedTop + 5, 60, 10, "z"));
  const outletComp = ctx.add({
    ...common, id: "roof:flat:outlets", name: "Roof outlets", kind: "roof-outlet", subcategory: "Drainage", layer: "plumbing", materialId: "pvc", shapes: outletShapes, repeated: { noun: "outlet" },
    explode: { layerIndex: 7, dir: UP }, dims: {}, label: { text: "Roof outlet", anchor: v3(outlets[0]!.x, outlets[0]!.y, protTop + 100) },
    note: "Each outlet drains through the parapet into a downpipe on the outside of the wall. The number and size come from the rainfall design.",
  });
  addQuantity(ctx, outletComp, { workItem: "roof.outlet", description: "Roof outlets", section: "H", unit: "piece", value: outlets.length, formula: `${outlets.length} outlets (example layout)`, inputs: { count: outlets.length }, status: "assumed" });
}

// ---------------------------------------------------------------------------
// Pitched roof
// ---------------------------------------------------------------------------

function generatePitched(ctx: Ctx, slabTop: number): void {
  const top = ctx.top!;
  const b = ctx.bounds;
  const theta = (PITCH_DEG * Math.PI) / 180;
  const tanT = Math.tan(theta);
  const cosT = Math.cos(theta);
  const common = { category: "roof" as const, stage: 8 as const, level: top, variant: pitched, source: "schematic" as const };
  const plate = PLATE;
  // The gable walls close the two ends: as thick as the walls under them, centred on the outline.
  const wallT = ctx.walls.find((w) => w.exterior && w.levelId === top.levelId)?.thickness ?? ctx.walls.find((w) => w.exterior)?.thickness ?? 200;
  const spanY = b.maxY - b.minY - 2 * plate;
  const half = spanY / 2;
  const rise = half * tanT;
  const ridgeY = (b.minY + b.maxY) / 2;
  const xMid = (b.minX + b.maxX) / 2;
  const plateTop = slabTop + PLATE_H;
  const ridgeZ = plateTop + rise;
  const yBearingS = b.minY + plate;
  const yBearingN = b.maxY - plate;
  const lengthX = b.maxX - b.minX;
  // The trusses stand between the gable walls, the end ones against their inner faces.
  const xFirst = b.minX + wallT / 2 + TRUSS_W / 2;
  const xLast = b.maxX - wallT / 2 - TRUSS_W / 2;
  const n = Math.max(2, Math.ceil((xLast - xFirst) / TRUSS_SPACING));
  const xs: number[] = [];
  for (let i = 0; i <= n; i += 1) xs.push(xFirst + ((xLast - xFirst) * i) / n);

  const tilt = (shape: Shape, rx: number): Shape => ({ ...(shape as Extract<Shape, { t: "box" }>), rx });
  // Heights of the top of the rafters, and what lies on them, `d` along the plan from a bearing toward the ridge (negative out over the eaves).
  const rafterTopZ = (d: number) => plateTop + RAFTER_TOP + d * tanT;
  const battenCentre = (d: number) => rafterTopZ(d) + 12.5 / cosT;
  const eaveReach = OVERHANG - FASCIA_SETBACK;
  const rafterLen = (half + eaveReach) / cosT;
  const coverX = lengthX + 2 * OVERHANG;
  const slopeRun = half + OVERHANG;
  const slopedLen = slopeRun / cosT;
  /** A point on the slope in plan, `d` from the bearing of the south (`south`) or north eaves toward the ridge. */
  const yAt = (south: boolean, d: number) => (south ? yBearingS + d : yBearingN - d);

  // Wall plates on the slab, along both eaves, between the gable walls. Each stands on a timber packer: the heel is raised so the rafters, which run on out
  // over the eaves, clear the edge of the slab.
  const plateLen = lengthX - wallT;
  const plateShapes: Shape[] = [yBearingS, yBearingN].map((y) => box(xMid, y, slabTop + PLATE_H / 2, plateLen, TRUSS_D, PLATE_H));
  const plates = ctx.add({
    ...common, id: "roof:pitched:plates", name: "Wall plates (on a raised heel)", kind: "wall-plate", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: plateShapes, repeated: { noun: "plate" }, explode: { layerIndex: 0, dir: UP },
    dims: { length: dim(round(plateLen, 0), "mm", "calculated", "Between the gable walls"), height: dim(PLATE_H, "mm", "assumed") }, note: "Fixed to the roof slab with anchors at the designer's spacing. Standing the plate up on a packer raises the heel so the rafters clear the slab edge at the eaves.",
  });
  addQuantity(ctx, plates, { workItem: "roof.wall-plate", description: "Wall plates", section: "H", unit: "m", value: round((2 * plateLen) / 1000, 3), formula: `2 × ${f2(plateLen / 1000)} m`, inputs: { length: round(plateLen, 0) }, status: "assumed" }, { allowance: { rule: "Cutting waste (example)", percent: 10 } });

  // Trusses: bottom chord, two rafters that run on out over the eaves, king post and two struts, each a thin timber member.
  const trussShapes: Shape[] = [];
  for (const x of xs) {
    trussShapes.push(box(x, ridgeY, plateTop + TRUSS_D / 2, TRUSS_W, spanY, TRUSS_D));
    for (const south of [true, false]) {
      const dMid = (half - eaveReach) / 2;
      trussShapes.push(tilt(box(x, yAt(south, dMid), plateTop + TRUSS_D / 2 + dMid * tanT, TRUSS_W, rafterLen, TRUSS_D), south ? theta : -theta));
    }
    trussShapes.push(box(x, ridgeY, plateTop + rise / 2, TRUSS_W, TRUSS_W, rise));
    const strutRise = rise - TRUSS_D;
    const strutLen = Math.hypot(half / 2, strutRise);
    const strutAngle = Math.atan2(strutRise, half / 2);
    const strutZ = plateTop + TRUSS_D + strutRise / 2;
    trussShapes.push(tilt(box(x, ridgeY - half / 4, strutZ, TRUSS_W, strutLen, TRUSS_W), strutAngle));
    trussShapes.push(tilt(box(x, ridgeY + half / 4, strutZ, TRUSS_W, strutLen, TRUSS_W), -strutAngle));
  }
  const trusses = ctx.add({
    ...common, id: "roof:pitched:trusses", name: `Roof trusses (${xs.length} at about ${TRUSS_SPACING} mm)`, kind: "roof-truss", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: trussShapes, repeated: { noun: "member" },
    explode: { layerIndex: 1, dir: UP }, dims: { length: dim(round(spanY, 0), "mm", "calculated", "Span between the plates"), height: dim(round(rise, 0), "mm", "calculated", `Rise at ${PITCH_DEG}°`) },
    label: { text: "Roof truss", anchor: v3(xs[Math.floor(xs.length / 2)]!, ridgeY, ridgeZ + 100) },
    note: "A schematic truss. The rafters run on past the plates to the eaves. Timber sizes, joints and bracing are designed by the supplier or engineer.",
  });
  addQuantity(ctx, trusses, { workItem: "roof.truss", description: "Timber roof trusses", section: "H", unit: "piece", value: xs.length, formula: `${f2((xLast - xFirst) / 1000)} m between the gable walls ÷ ${TRUSS_SPACING} mm, rounded up = ${n} bays → ${xs.length} trusses`, inputs: { length: round(xLast - xFirst, 0), spacing: TRUSS_SPACING, span: round(spanY, 0), pitch: PITCH_DEG }, status: "assumed" },
    { assumptions: [`Pitch ${PITCH_DEG}°, spacing ${TRUSS_SPACING} mm and the truss pattern are examples.`], exclusions: ["Bracing", "Truss clips and hangers", "Design"] });

  // Battens, running along the roof on both slopes, from the ends of the rafters up to the ridge, from one barge board to the other.
  const battenShapes: Shape[] = [];
  const battenRows = Math.max(1, Math.floor((rafterLen - 100) / BATTEN_SPACING));
  const battenLen = coverX - 50;
  for (const south of [true, false]) {
    for (let k = 0; k <= battenRows; k += 1) {
      const dAlong = 50 + (k * (rafterLen - 100)) / battenRows;
      const d = dAlong * cosT - eaveReach;
      battenShapes.push(box(xMid, yAt(south, d), battenCentre(d), battenLen, 38, 25));
    }
  }
  const battens = ctx.add({
    ...common, id: "roof:pitched:battens", name: "Roof battens", kind: "batten", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: battenShapes, repeated: { noun: "batten" }, explode: { layerIndex: 2, dir: UP },
    dims: { length: dim(round(battenLen, 0), "mm", "calculated") },
  });
  const battenTotal = battenShapes.length * battenLen;
  addQuantity(ctx, battens, { workItem: "roof.batten", description: "Roof battens", section: "H", unit: "m", value: round(battenTotal / 1000, 3), formula: `${battenShapes.length} rows × ${f2(battenLen / 1000)} m`, inputs: { rows: battenShapes.length, length: round(battenLen, 0), spacing: BATTEN_SPACING }, status: "assumed" }, { allowance: { rule: "Laps and cutting waste (example)", percent: 10 } });

  // Underlay and covering: sloped areas, longer than the plan area they cover. They lie on the battens and run on past the fascia into the gutter.
  const { plan: planCover, sloped: slopedCover } = pitchedCover(lengthX, b.maxY - b.minY);
  const makeSkin = (south: boolean, thickness: number, above: number): Shape => {
    const dMid = (half - OVERHANG) / 2;
    return tilt(box(xMid, yAt(south, dMid), battenCentre(dMid) + above, coverX, slopedLen, thickness), south ? theta : -theta);
  };
  const underlay = ctx.add({
    ...common, id: "roof:pitched:underlay", name: "Roof underlay", kind: "underlay", subcategory: "Covering", layer: "waterproofing", materialId: "dpm", shapes: [makeSkin(true, 2, 12.5 / cosT + 1), makeSkin(false, 2, 12.5 / cosT + 1)], explode: { layerIndex: 3, dir: UP },
    dims: { area: dim(round(slopedCover, 2), "m²", "calculated", "Sloped area") },
  });
  addQuantity(ctx, underlay, { workItem: "roof.underlay", description: "Roof underlay (sloped area)", section: "H", unit: "m²", value: round(slopedCover, 3), formula: `plan area ${f2(planCover)} m² ÷ cos ${PITCH_DEG}° = ${f2(slopedCover)} m²`, inputs: { planArea: round(planCover, 3), pitch: PITCH_DEG, slopedArea: round(slopedCover, 3) }, status: "assumed" }, { allowance: { rule: "Laps (example assumption)", percent: 10 } });
  const covering = ctx.add({
    ...common, id: "roof:pitched:covering", name: "Roof covering (profiled sheets)", kind: "roof-covering", subcategory: "Covering", layer: "roofing", materialId: "roof-sheet", shapes: [makeSkin(true, COVERING_T, 12.5 / cosT + 2 + COVERING_T / 2), makeSkin(false, COVERING_T, 12.5 / cosT + 2 + COVERING_T / 2)], explode: { layerIndex: 4, dir: UP },
    dims: { area: dim(round(slopedCover, 2), "m²", "calculated", "Sloped area"), length: dim(round(slopedLen, 0), "mm", "calculated", "Rafter length incl. overhang") },
    label: { text: "Roof covering", anchor: v3(xMid, (yBearingS + ridgeY) / 2, ridgeZ - rise / 2 + 200) },
    note: `The covering is measured on the slope: the plan area ${f2(planCover)} m² is not the area to buy.`,
  });
  addQuantity(ctx, covering, { workItem: "roof.covering", description: "Roof covering (sloped area)", section: "H", unit: "m²", value: round(slopedCover, 3), formula: `plan area ${f2(planCover)} m² (incl. ${OVERHANG} mm overhang all round) ÷ cos ${PITCH_DEG}° = ${f2(slopedCover)} m²`, inputs: { planArea: round(planCover, 3), pitch: PITCH_DEG, slopedArea: round(slopedCover, 3), overhang: OVERHANG }, status: "assumed" },
    { allowance: { rule: "Overlaps and cutting waste (example assumption)", percent: ctx.rules.allowances.tiles } });

  // Ridge cap, eaves gutters and downpipes.
  const capZ = ridgeZ + RAFTER_TOP + 12.5 / cosT + 2 + COVERING_T + 15;
  const ridge = ctx.add({
    ...common, id: "roof:pitched:ridge", name: "Ridge cap", kind: "ridge", subcategory: "Covering", layer: "roofing", materialId: "flashing", shapes: [box(xMid, ridgeY, capZ, coverX, 200, 30)], explode: { layerIndex: 5, dir: UP },
    dims: { length: dim(round(coverX, 0), "mm", "calculated") },
  });
  addQuantity(ctx, ridge, { workItem: "roof.ridge", description: "Ridge cap", section: "H", unit: "m", value: round(coverX / 1000, 3), formula: `ridge length ${f2(coverX / 1000)} m`, inputs: { length: round(coverX, 0) }, status: "assumed" });
  const gutterAt = pitchedGutter(b, slabTop);
  const gutterShapes: Shape[] = [gutterAt.southY, gutterAt.northY].map((y) => box(xMid, y, gutterAt.z, coverX, 110, 80));
  const gutters = ctx.add({
    ...common, id: "roof:pitched:gutters", name: "Eaves gutters", kind: "gutter", subcategory: "Rainwater", layer: "plumbing", materialId: "pvc", shapes: gutterShapes, repeated: { noun: "run" }, explode: { layerIndex: 6, dir: UP },
    dims: { length: dim(round(coverX, 0), "mm", "calculated") },
  });
  addQuantity(ctx, gutters, { workItem: "roof.gutter", description: "Eaves gutters", section: "H", unit: "m", value: round((2 * coverX) / 1000, 3), formula: `2 eaves × ${f2(coverX / 1000)} m`, inputs: { length: round(coverX, 0) }, status: "assumed" }, { allowance: { rule: "Joints and stop ends (example)", percent: 5 } });

  // Fascia across the ends of the rafters at the eaves, the gutter fixed to it, and barge boards up the edges of the roof at the gables.
  const BOARD_T = 25;
  const BOARD_H = 150;
  const fasciaLen = coverX - 50;
  const dTail = -eaveReach;
  const fasciaShapes: Shape[] = [true, false].map((south) => box(xMid, yAt(south, dTail) + (south ? -BOARD_T / 2 : BOARD_T / 2), battenCentre(dTail) + 12.5 / cosT - BOARD_H / 2, fasciaLen, BOARD_T, BOARD_H));
  const fascia = ctx.add({
    ...common, id: "roof:pitched:fascia", name: "Fascia boards", kind: "fascia-board", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: fasciaShapes, repeated: { noun: "board" }, explode: { layerIndex: 6, dir: UP },
    dims: { length: dim(round(fasciaLen, 0), "mm", "calculated"), height: dim(BOARD_H, "mm", "assumed"), thickness: dim(BOARD_T, "mm", "assumed") }, parentId: "roof:pitched:trusses",
    note: "Fixed across the ends of the rafters. The gutter is fixed to it and the covering runs on over it into the gutter.",
  });
  addQuantity(ctx, fascia, { workItem: "roof.fascia", description: "Fascia boards", section: "H", unit: "m", value: round((2 * fasciaLen) / 1000, 3), formula: `2 eaves × ${f2(fasciaLen / 1000)} m`, inputs: { length: round(fasciaLen, 0) }, status: "assumed" }, { allowance: { rule: "Cutting waste and joints (example)", percent: 10 } });
  const bargeShapes: Shape[] = [];
  for (const x of [b.minX - OVERHANG + BOARD_T / 2, b.maxX + OVERHANG - BOARD_T / 2]) for (const south of [true, false]) {
    const dMid = (half - eaveReach) / 2;
    bargeShapes.push(tilt(box(x, yAt(south, dMid), battenCentre(dMid) + 12.5 / cosT - BOARD_H / 2, BOARD_T, rafterLen, BOARD_H), south ? theta : -theta));
  }
  const barge = ctx.add({
    ...common, id: "roof:pitched:barge", name: "Barge boards", kind: "barge-board", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: bargeShapes, repeated: { noun: "board" }, explode: { layerIndex: 6, dir: UP },
    dims: { length: dim(round(rafterLen, 0), "mm", "calculated", "Along the slope"), height: dim(BOARD_H, "mm", "assumed"), thickness: dim(BOARD_T, "mm", "assumed") }, parentId: "roof:pitched:trusses",
    note: "Up the edge of the roof at each gable, hiding the ends of the battens. Carried on outriggers from the end truss: not drawn here, the design sets them.",
  });
  addQuantity(ctx, barge, { workItem: "roof.barge", description: "Barge boards", section: "H", unit: "m", value: round((4 * rafterLen) / 1000, 3), formula: `4 boards × ${f2(rafterLen / 1000)} m along the slope`, inputs: { length: round(rafterLen, 0) }, status: "assumed" }, { allowance: { rule: "Cutting waste and joints (example)", percent: 10 } });
  const boardLength = 2 * fasciaLen + 4 * rafterLen;
  const paintArea = (boardLength * (BOARD_H + BOARD_T + BOARD_H)) * 1e-6;
  addQuantity(ctx, fascia, { workItem: "paint.timber-external", description: "Paint to fascia and barge boards", section: "M", unit: "m²", value: round(paintArea, 3), formula: `${f2(boardLength / 1000)} m of board × (150 + 25 + 150) mm, painted on both faces and the edge`, inputs: { length: round(boardLength, 0), girth: BOARD_H + BOARD_T + BOARD_H }, status: "assumed" }, { allowance: { rule: "Waste and absorbency (example assumption)", percent: ctx.rules.allowances.paint }, assumptions: ["Primer and two coats, counted once."] });

  // The gable walls: blockwork closing each end of the roof, from the roof slab up to the rafters, on the outline over the end beam.
  const outline = gableOutline(spanY, wallT);
  const gableShapes: Shape[] = [b.minX, b.maxX].map((x) => profile({ x, y: yBearingS }, { x: 0, y: 1 }, outline.map((p) => ({ s: p.s, z: slabTop + p.z })), wallT));
  const gableArea = (polygonArea(outline.map((p) => ({ x: p.s, y: p.z }))) * 1e-6) * 2;
  const gables = ctx.add({
    ...common, id: "roof:pitched:gables", name: "Gable walls", kind: "gable-wall", category: "masonry", subcategory: "Gable ends", layer: "masonry", materialId: "block-hollow", shapes: gableShapes, repeated: { noun: "wall" }, explode: { layerIndex: 0, dir: UP },
    dims: { area: dim(round(gableArea, 2), "m²", "calculated", "Both gables"), thickness: dim(wallT, "mm", "measured"), height: dim(round(outline[3]!.z, 0), "mm", "calculated", "Roof slab to the ridge") },
    label: { text: "Gable wall", anchor: v3(b.minX, ridgeY, slabTop + outline[3]!.z) },
    note: "Blockwork on the end beam from the roof slab up to the underside of the covering, so the roof is closed at each end. The top edge follows the rafters.",
  });
  const gablePerM2 = 1e6 / ((390 + 10) * (190 + 10));
  addQuantity(ctx, gables, { workItem: "masonry.gable", description: "Gable-end blockwork", section: "F", unit: "m²", value: round(gableArea, 3), formula: `2 gables, each ${f2(gableArea / 2)} m² (from the roof slab up to the rafters, the width of the building between the outer faces of the eaves walls)`, inputs: { area: round(gableArea, 3), thickness: wallT }, status: "calculated" },
    { assumptions: ["No openings in the gables.", "The internal face is in the roof void and is not plastered."], allowance: { rule: "Breakage and cutting waste (example assumption)", percent: ctx.rules.allowances.blocks } });
  addQuantity(ctx, gables, { workItem: "masonry.blocks", description: "Blocks — gable walls", section: "F", unit: "piece", value: round(gableArea * gablePerM2, 1), formula: `${f2(gableArea)} m² × ${f2(gablePerM2)} per m²`, inputs: { area: round(gableArea, 3), perM2: round(gablePerM2, 3) }, status: "assumed" },
    { allowance: { rule: "Breakage and cutting waste (example assumption)", percent: ctx.rules.allowances.blocks } });

  // The outer face of each gable, rendered and painted in the coats of the walls.
  const polygon = outline.map((p) => ({ s: p.s, z: slabTop + p.z }));
  EXTERNAL_COATS.forEach((coat, ci) => {
    const before = EXTERNAL_COATS.slice(0, ci).reduce((sum, c) => sum + c.t, 0);
    const shapes: Shape[] = [{ sign: -1, x: b.minX }, { sign: 1, x: b.maxX }].map(({ sign, x }) => profile({ x: x + sign * (wallT / 2 + before + coat.t / 2), y: yBearingS }, { x: 0, y: 1 }, polygon, coat.t));
    const comp = ctx.add({
      ...common, id: `ext:gable:${coat.id}`, name: `Gable walls — ${coat.name.charAt(0).toLowerCase()}${coat.name.slice(1)}`, kind: coat.id === "paint" ? "paint-layer" : "external-plaster", category: "external", subcategory: "External finishes", stage: 18,
      layer: coat.id === "paint" ? "paint" : "plaster", materialId: coat.material, shapes, repeated: { noun: "panel" }, explode: { layerIndex: ci, dir: v3(0, 0, 0) }, parentId: gables.id, dims: { thickness: dim(coat.t, "mm", "assumed") },
      note: "The outside face of each gable wall.",
    });
    addQuantity(ctx, comp, { workItem: coat.workItem, description: coat.desc, section: coat.section, unit: "m²", value: round(gableArea, 3), formula: `outer faces of 2 gables, ${f2(gableArea / 2)} m² each = ${f2(gableArea)} m²`, inputs: { area: round(gableArea, 3) }, status: "calculated" },
      { allowance: { rule: coat.section === "J" ? "Wastage and thickness variation (example assumption)" : "Waste and absorbency (example assumption)", percent: coat.section === "J" ? ctx.rules.allowances.plaster : ctx.rules.allowances.paint } });
  });
}
