import { ASSUME, UP, dim, type Ctx } from "../context";
import { alongLine, box, cyl, polygonArea, prism, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, f3, round } from "../helpers";
import { insetOutline } from "../structure-data";
import { planPlumbing } from "../plumbing-plan";
import { OVERHANG, PITCH_DEG, PLATE, TRUSS_D, pitchedCover, pitchedGutter } from "../roof-geometry";

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
  const outer = ctx.outline;
  const parapetT = ASSUME.parapetThickness;
  const inner = insetOutline(ctx, parapetT);
  const exact = inner.exact;
  const innerArea = polygonArea(inner.poly) * 1e-6;
  const planArea = polygonArea(outer) * 1e-6;
  const band = planArea - innerArea;
  const ph = ASSUME.parapetHeight;
  const b = ctx.bounds;
  // The outlets are where the rainwater plan stands the downpipes, so each one drains into a pipe that is really there.
  const planned = planPlumbing(ctx).rain.flatOutlets;
  const outlets = planned.length ? planned : [{ x: b.minX + (b.maxX - b.minX) * 0.25, y: b.minY + parapetT + 250 }, { x: b.minX + (b.maxX - b.minX) * 0.75, y: b.minY + parapetT + 250 }];
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
  const parapetLen = perimeter(outer) - 4 * parapetT;
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
  const copingOuter = insetOutline(ctx, -COPING_OVER);
  const copingInner = insetOutline(ctx, parapetT + COPING_OVER);
  const coping = ctx.add({
    ...common, id: "roof:flat:coping", name: "Parapet coping", kind: "coping", subcategory: "Parapet", layer: "concrete", materialId: "coping",
    shapes: [prism(copingOuter.poly, slabTop + ph, slabTop + ph + COPING_T, [copingInner.poly])], explode: { layerIndex: 6, dir: UP }, parentId: parapet.id,
    dims: { thickness: dim(COPING_T, "mm", "assumed"), length: dim(round(parapetLen, 0), "mm", "calculated") },
  });
  addQuantity(ctx, coping, { workItem: "roof.coping", description: "Parapet coping", section: "H", unit: "m", value: round(parapetLen / 1000, 3), formula: `parapet centre length ${f2(parapetLen / 1000)} m`, inputs: { length: round(parapetLen, 0) }, status: "assumed" }, { allowance: { rule: "Cutting waste at corners (example assumption)", percent: 5 } });

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
  const common = { category: "roof" as const, stage: 8 as const, level: top, variant: pitched, source: "schematic" as const };
  const plate = PLATE;
  const spanY = b.maxY - b.minY - 2 * plate;
  const half = spanY / 2;
  const rise = half * Math.tan(theta);
  const rafterLen = half / Math.cos(theta);
  const ridgeY = (b.minY + b.maxY) / 2;
  const plateTop = slabTop + 50;
  const ridgeZ = plateTop + rise;
  const xs: number[] = [];
  const lengthX = b.maxX - b.minX;
  const n = Math.max(2, Math.ceil(lengthX / TRUSS_SPACING));
  for (let i = 0; i <= n; i += 1) xs.push(b.minX + (lengthX * i) / n);

  const tilt = (shape: Shape, rx: number): Shape => ({ ...(shape as Extract<Shape, { t: "box" }>), rx });

  // Wall plates on the slab edge, along both eaves.
  const plateShapes: Shape[] = [b.minY + plate, b.maxY - plate].map((y) => box((b.minX + b.maxX) / 2, y, slabTop + 25, lengthX - 2 * plate, TRUSS_D, 50));
  const plates = ctx.add({
    ...common, id: "roof:pitched:plates", name: "Wall plates", kind: "wall-plate", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: plateShapes, repeated: { noun: "plate" }, explode: { layerIndex: 0, dir: UP },
    dims: { length: dim(round(lengthX - 2 * plate, 0), "mm", "calculated") }, note: "Fixed to the roof slab with anchors at the designer's spacing.",
  });
  const plateLen = 2 * (lengthX - 2 * plate);
  addQuantity(ctx, plates, { workItem: "roof.wall-plate", description: "Wall plates", section: "H", unit: "m", value: round(plateLen / 1000, 3), formula: `2 × ${f2((lengthX - 2 * plate) / 1000)} m`, inputs: { length: round(lengthX - 2 * plate, 0) }, status: "assumed" }, { allowance: { rule: "Cutting waste (example)", percent: 10 } });

  // Trusses: bottom chord, two rafters, king post and two struts, each a thin timber member.
  const trussShapes: Shape[] = [];
  const yBearingS = b.minY + plate;
  const yBearingN = b.maxY - plate;
  for (const x of xs) {
    trussShapes.push(box(x, ridgeY, plateTop + TRUSS_D / 2, TRUSS_W, spanY, TRUSS_D));
    trussShapes.push(tilt(box(x, (yBearingS + ridgeY) / 2, plateTop + rise / 2 + TRUSS_D / 2, TRUSS_W, rafterLen, TRUSS_D), theta));
    trussShapes.push(tilt(box(x, (yBearingN + ridgeY) / 2, plateTop + rise / 2 + TRUSS_D / 2, TRUSS_W, rafterLen, TRUSS_D), -theta));
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
    note: "A schematic truss. Timber sizes, joints and bracing are designed by the supplier or engineer.",
  });
  addQuantity(ctx, trusses, { workItem: "roof.truss", description: "Timber roof trusses", section: "H", unit: "piece", value: xs.length, formula: `${f2(lengthX / 1000)} m ÷ ${TRUSS_SPACING} mm, rounded up = ${n} bays → ${xs.length} trusses`, inputs: { length: round(lengthX, 0), spacing: TRUSS_SPACING, span: round(spanY, 0), pitch: PITCH_DEG }, status: "assumed" },
    { assumptions: [`Pitch ${PITCH_DEG}°, spacing ${TRUSS_SPACING} mm and the truss pattern are examples.`], exclusions: ["Bracing", "Truss clips and hangers", "Design"] });

  // Battens, running along the roof on both slopes.
  const battenShapes: Shape[] = [];
  const battenRows = Math.floor(rafterLen / BATTEN_SPACING);
  const battenLen = lengthX + 2 * (OVERHANG / 2);
  for (let k = 0; k <= battenRows; k += 1) {
    const d = (k * rafterLen) / battenRows;
    const zUp = (d * Math.sin(theta)) + TRUSS_D + 25;
    const yRun = d * Math.cos(theta);
    battenShapes.push(box((b.minX + b.maxX) / 2, yBearingS + yRun, plateTop + zUp, battenLen, 38, 25));
    battenShapes.push(box((b.minX + b.maxX) / 2, yBearingN - yRun, plateTop + zUp, battenLen, 38, 25));
  }
  const battens = ctx.add({
    ...common, id: "roof:pitched:battens", name: "Roof battens", kind: "batten", subcategory: "Timber roof", layer: "frame", materialId: "timber", shapes: battenShapes, repeated: { noun: "batten" }, explode: { layerIndex: 2, dir: UP },
    dims: { length: dim(round(battenLen, 0), "mm", "calculated") },
  });
  const battenTotal = battenShapes.length * battenLen;
  addQuantity(ctx, battens, { workItem: "roof.batten", description: "Roof battens", section: "H", unit: "m", value: round(battenTotal / 1000, 3), formula: `${battenShapes.length} rows × ${f2(battenLen / 1000)} m`, inputs: { rows: battenShapes.length, length: round(battenLen, 0), spacing: BATTEN_SPACING }, status: "assumed" }, { allowance: { rule: "Laps and cutting waste (example)", percent: 10 } });

  // Underlay and covering: sloped areas, longer than the plan area they cover.
  const slopeRun = half + OVERHANG;
  const slopedLen = slopeRun / Math.cos(theta);
  const { plan: planCover, sloped: slopedCover } = pitchedCover(lengthX, b.maxY - b.minY);
  const coverX = lengthX + 2 * OVERHANG;
  const makeSkin = (south: boolean, thickness: number, offset: number): Shape => {
    const yEave = south ? yBearingS - OVERHANG : yBearingN + OVERHANG;
    const zEave = plateTop + TRUSS_D + 25 - OVERHANG * Math.tan(theta);
    const yMid = south ? (yEave + ridgeY) / 2 : (yEave + ridgeY) / 2;
    const zMid = (zEave + (ridgeZ + TRUSS_D + 25)) / 2 + offset;
    return tilt(box((b.minX + b.maxX) / 2, yMid, zMid, coverX, slopedLen, thickness), south ? theta : -theta);
  };
  const underlay = ctx.add({
    ...common, id: "roof:pitched:underlay", name: "Roof underlay", kind: "underlay", subcategory: "Covering", layer: "waterproofing", materialId: "dpm", shapes: [makeSkin(true, 2, 0), makeSkin(false, 2, 0)], explode: { layerIndex: 3, dir: UP },
    dims: { area: dim(round(slopedCover, 2), "m²", "calculated", "Sloped area") },
  });
  addQuantity(ctx, underlay, { workItem: "roof.underlay", description: "Roof underlay (sloped area)", section: "H", unit: "m²", value: round(slopedCover, 3), formula: `plan area ${f2(planCover)} m² ÷ cos ${PITCH_DEG}° = ${f2(slopedCover)} m²`, inputs: { planArea: round(planCover, 3), pitch: PITCH_DEG, slopedArea: round(slopedCover, 3) }, status: "assumed" }, { allowance: { rule: "Laps (example assumption)", percent: 10 } });
  const covering = ctx.add({
    ...common, id: "roof:pitched:covering", name: "Roof covering (profiled sheets)", kind: "roof-covering", subcategory: "Covering", layer: "roofing", materialId: "roof-sheet", shapes: [makeSkin(true, COVERING_T, 25), makeSkin(false, COVERING_T, 25)], explode: { layerIndex: 4, dir: UP },
    dims: { area: dim(round(slopedCover, 2), "m²", "calculated", "Sloped area"), length: dim(round(slopedLen, 0), "mm", "calculated", "Rafter length incl. overhang") },
    label: { text: "Roof covering", anchor: v3((b.minX + b.maxX) / 2, (yBearingS + ridgeY) / 2, ridgeZ - rise / 2 + 200) },
    note: `The covering is measured on the slope: the plan area ${f2(planCover)} m² is not the area to buy.`,
  });
  addQuantity(ctx, covering, { workItem: "roof.covering", description: "Roof covering (sloped area)", section: "H", unit: "m²", value: round(slopedCover, 3), formula: `plan area ${f2(planCover)} m² (incl. ${OVERHANG} mm overhang all round) ÷ cos ${PITCH_DEG}° = ${f2(slopedCover)} m²`, inputs: { planArea: round(planCover, 3), pitch: PITCH_DEG, slopedArea: round(slopedCover, 3), overhang: OVERHANG }, status: "assumed" },
    { allowance: { rule: "Overlaps and cutting waste (example assumption)", percent: ctx.rules.allowances.tiles } });

  // Ridge cap, eaves gutters and downpipes.
  const ridge = ctx.add({
    ...common, id: "roof:pitched:ridge", name: "Ridge cap", kind: "ridge", subcategory: "Covering", layer: "roofing", materialId: "flashing", shapes: [box((b.minX + b.maxX) / 2, ridgeY, ridgeZ + TRUSS_D + 40, coverX, 200, 30)], explode: { layerIndex: 5, dir: UP },
    dims: { length: dim(round(coverX, 0), "mm", "calculated") },
  });
  addQuantity(ctx, ridge, { workItem: "roof.ridge", description: "Ridge cap", section: "H", unit: "m", value: round(coverX / 1000, 3), formula: `ridge length ${f2(coverX / 1000)} m`, inputs: { length: round(coverX, 0) }, status: "assumed" });
  const gutterAt = pitchedGutter(b, slabTop);
  const gutterShapes: Shape[] = [gutterAt.southY, gutterAt.northY].map((y) => box((b.minX + b.maxX) / 2, y, gutterAt.z, coverX, 110, 80));
  const gutters = ctx.add({
    ...common, id: "roof:pitched:gutters", name: "Eaves gutters", kind: "gutter", subcategory: "Rainwater", layer: "plumbing", materialId: "pvc", shapes: gutterShapes, repeated: { noun: "run" }, explode: { layerIndex: 6, dir: UP },
    dims: { length: dim(round(coverX, 0), "mm", "calculated") },
  });
  addQuantity(ctx, gutters, { workItem: "roof.gutter", description: "Eaves gutters", section: "H", unit: "m", value: round((2 * coverX) / 1000, 3), formula: `2 eaves × ${f2(coverX / 1000)} m`, inputs: { length: round(coverX, 0) }, status: "assumed" }, { allowance: { rule: "Joints and stop ends (example)", percent: 5 } });
}
