import { ASSUME, UP, dim, type Ctx } from "../context";
import { alongLine, boxAt, cyl, netVolumes, polygonArea, prism, prismOfShape, rectPoly, v3, type P2, type Prism, type Shape } from "../geometry";
import { addQuantity, concreteQuantity, f2, f3, rebarQuantity, round, spaced } from "../helpers";
import { insetOutline, pedestalsOf } from "../structure-data";

/** The thicknesses of the ground-floor build-up, worked from the slab down. */
export function groundFloorStack(ctx: Ctx) {
  const slab = ctx.ground?.slabThickness ?? 150;
  const formation = ASSUME.naturalGround - ASSUME.topsoilStrip;
  const fillTop = formation + 100; // selected fill, placed with the earthworks
  const dpm = 3;
  const insulation = ASSUME.floorInsulation;
  const sand = 50;
  const termite = 3;
  const subBase = 100;
  const slabBottom = -slab;
  const dpmBottom = slabBottom - dpm;
  const insBottom = dpmBottom - insulation;
  const sandBottom = insBottom - sand;
  const termBottom = sandBottom - termite;
  const subBottom = termBottom - subBase;
  const hardcore = Math.max(50, subBottom - fillTop);
  return { slab, formation, fillTop, dpm, insulation, sand, termite, subBase, slabBottom, dpmBottom, insBottom, sandBottom, termBottom, subBottom, hardcoreBottom: subBottom - hardcore, hardcore };
}

export function generateGroundFloor(ctx: Ctx): void {
  const ground = ctx.ground;
  if (!ground) return;
  const st = groundFloorStack(ctx);
  const extT = ctx.walls.find((w) => w.exterior && w.levelId === ground.levelId)?.thickness ?? 200;
  const inner = insetOutline(ctx, extT / 2);
  const area = polygonArea(inner.poly) * 1e-6;
  const peds = pedestalsOf(ctx);
  // Interior pedestals pass through the layers as holes; those on the wall line are netted in the volume instead.
  const b = polygonBoundsOf(inner.poly);
  const holes: P2[][] = peds.filter((p) => p.col.x - p.col.width / 2 > b.minX + 1 && p.col.x + p.col.width / 2 < b.maxX - 1 && p.col.y - p.col.depth / 2 > b.minY + 1 && p.col.y + p.col.depth / 2 < b.maxY - 1).map((p) => rectPoly(p.col.x - p.col.width / 2, p.col.y - p.col.depth / 2, p.col.x + p.col.width / 2, p.col.y + p.col.depth / 2));
  const pedPrisms: Prism[] = peds.map((p) => prismOfShape(boxAt(p.col.x - p.col.width / 2, p.col.y - p.col.depth / 2, p.z0, p.col.width, p.col.depth, p.z1 - p.z0))!);

  type Layer = { id: string; name: string; kind: string; layer: "fill" | "waterproofing" | "insulation" | "blinding" | "concrete"; material: string; z0: number; z1: number; note?: string; workItem: string; description: string; section: "B" | "G" | "C"; order: number };
  const layers: Layer[] = [
    { id: "hardcore", name: "Hardcore / selected granular fill", kind: "compacted-fill", layer: "fill", material: "hardcore", z0: st.hardcoreBottom, z1: st.subBottom, workItem: "earth.hardcore", description: "Hardcore fill, compacted in layers", section: "B", order: 1 },
    { id: "sub-base", name: "Compacted sub-base", kind: "sub-base", layer: "fill", material: "sub-base", z0: st.subBottom, z1: st.termBottom, workItem: "earth.sub-base", description: "Compacted sub-base", section: "B", order: 2 },
    { id: "termite", name: "Termite barrier (where locally applicable and specified)", kind: "termite-barrier", layer: "waterproofing", material: "termite", z0: st.termBottom, z1: st.sandBottom, workItem: "waterproofing.termite", description: "Termite barrier under the slab", section: "G", order: 3, note: "Included as an example. Use only where the locality and the specification call for it." },
    { id: "sand", name: "Sand blinding", kind: "sand-blinding", layer: "blinding", material: "sand-blinding", z0: st.sandBottom, z1: st.insBottom, workItem: "earth.sand-blinding", description: "Sand blinding to protect the membrane", section: "B", order: 4 },
    { id: "insulation", name: "Rigid floor insulation (where specified)", kind: "floor-insulation", layer: "insulation", material: "insulation", z0: st.insBottom, z1: st.dpmBottom, workItem: "insulation.floor", description: "Rigid floor insulation", section: "G", order: 5, note: "Included as an example. Omit where the specification does not require it." },
    { id: "dpm", name: "Damp-proof membrane", kind: "dpm", layer: "waterproofing", material: "dpm", z0: st.dpmBottom, z1: st.slabBottom, workItem: "waterproofing.dpm", description: "Damp-proof membrane under the slab", section: "G", order: 6 },
  ];
  const slabAreaTotal = area;
  layers.forEach((l, index) => {
    const t = l.z1 - l.z0;
    const comp = ctx.add({
      id: `ground:${l.id}`, name: l.name, kind: l.kind, category: "substructure", subcategory: "Ground floor", stage: 4, layer: l.layer, materialId: l.material,
      shapes: [prism(inner.poly, l.z0, l.z1, holes)], source: "schematic", sourceRef: "outline", level: ground, explode: { layerIndex: index, dir: UP },
      dims: { thickness: dim(round(t, 1), "mm", "assumed"), area: dim(round(area, 2), "m²", inner.exact ? "calculated" : "review") },
      ...(l.note ? { note: l.note } : {}),
    });
    const isArea = l.section === "G";
    const v = t * 1e-3 * slabAreaTotal;
    addQuantity(ctx, comp, isArea
      ? { workItem: l.workItem, description: l.description, section: l.section, unit: "m²", value: round(area, 3), formula: `${f2(area)} m² (net floor area inside the foundation walls)`, inputs: { area: round(area, 3), thickness: round(t, 1) }, status: inner.exact ? "assumed" : "review" }
      : { workItem: l.workItem, description: l.description, section: l.section, unit: "m³", value: round(v, 3), formula: `${f2(area)} m² × ${f3(t / 1000)} m = ${f3(v)} m³`, inputs: { area: round(area, 3), thickness: round(t, 1) }, status: inner.exact ? "assumed" : "review" },
      { assumptions: ["Layer thickness is an example value.", "Area is the footprint inside the foundation walls; interior pedestals are not deducted from this layer line."], exclusions: ["Compaction testing", "Haulage"], allowance: { rule: "Compaction and wastage (example)", percent: null } });
  });
  // Turn-ups of the membrane at the walls.
  const perimeter = polygonPerimeter(inner.poly);
  const turn = ctx.add({
    id: "ground:dpm-turnup", name: "Membrane turned up at the walls", kind: "dpm", category: "substructure", subcategory: "Ground floor", stage: 4, layer: "waterproofing", materialId: "dpm",
    shapes: inner.poly.map((p, i) => alongLine(p, inner.poly[(i + 1) % inner.poly.length]!, 3, st.dpmBottom, st.slabBottom + 300)), source: "schematic", level: ground, explode: { layerIndex: 6, dir: UP },
    dims: { length: dim(round(perimeter, 0), "mm", "calculated") },
  });
  addQuantity(ctx, turn, { workItem: "waterproofing.dpm-turnup", description: "Damp-proof membrane turn-up at walls", section: "G", unit: "m", value: round(perimeter / 1000, 3), formula: `perimeter ${f2(perimeter / 1000)} m`, inputs: { perimeter: round(perimeter, 0) }, status: "calculated" });

  // Slab mesh (schematic).
  const meshShapes: Shape[] = [];
  const mz = -st.slab / 2;
  for (const y of spaced(b.minY + 100, b.maxY - 100, 150)) meshShapes.push(cyl((b.minX + b.maxX) / 2, y, mz, 3, b.maxX - b.minX - 200, "x"));
  for (const x of spaced(b.minX + 100, b.maxX - 100, 150)) meshShapes.push(cyl(x, (b.minY + b.maxY) / 2, mz + 6, 3, b.maxY - b.minY - 200, "y"));
  const mesh = ctx.add({
    id: "ground:mesh", name: "Slab reinforcement mesh (schematic, where specified)", kind: "floor-mesh", category: "substructure", subcategory: "Ground floor", stage: 4, layer: "reinforcement", materialId: "steel-mesh",
    shapes: meshShapes, repeated: { noun: "bar" }, source: "schematic", level: ground, explode: { layerIndex: 7, dir: UP }, note: "Mesh type and laps are specified by the designer; none is taken from this illustration.",
  });
  rebarQuantity(ctx, mesh, "Ground slab mesh", ctx.approved);

  // The ground-bearing slab, net of the pedestals that pass through it.
  const slabPrism = prismOfShape(prism(inner.poly, st.slabBottom, 0, []))!;
  const nets = netVolumes([...pedPrisms, slabPrism]);
  const slabNet = nets[nets.length - 1]! * 1e-9;
  const slabComp = ctx.add({
    id: "ground:slab", name: "Ground-bearing concrete slab", kind: "ground-slab", category: "substructure", subcategory: "Ground floor", stage: 4, layer: "concrete", materialId: "concrete",
    shapes: [prism(inner.poly, st.slabBottom, 0, holes)], source: "project", sourceRef: `${ground.levelId}:slab`, level: ground, pour: 1,
    explode: { layerIndex: 8, dir: UP }, dims: { thickness: dim(st.slab, "mm", "measured"), area: dim(round(area, 2), "m²", "calculated"), volume: dim(round(slabNet, 3), "m³", "calculated", "Net of pedestals") },
    label: { text: "Ground-bearing slab", anchor: v3(b.minX + 600, b.minY + 600, 0) },
    note: "Rests on the ground. The upper floors are suspended slabs spanning between beams.",
  });
  concreteQuantity(ctx, slabComp, "concrete.ground-slab", "Ground-bearing slab", slabNet, `${f2(area)} m² × ${f3(st.slab / 1000)} m − pedestals through it = ${f3(slabNet)} m³`, { area: round(area, 3), thickness: st.slab }, inner.exact ? "calculated" : "review", ["Area is inside the foundation walls."]);

  // Screed.
  const screedPrism = prismOfShape(prism(inner.poly, 0, ASSUME.screed))!;
  const colPrisms = ctx.project.structuralColumns.filter((c) => c.levelId === ground.levelId).map((c) => prismOfShape(boxAt(c.x - c.width / 2, c.y - c.depth / 2, 0, c.width, c.depth, ground.soffitZ))!);
  const sn = netVolumes([...colPrisms, screedPrism]);
  const screedNet = sn[sn.length - 1]! * 1e-9;
  const screed = ctx.add({
    id: "ground:screed", name: "Ground-floor screed", kind: "floor-screed", category: "substructure", subcategory: "Ground floor", stage: 4, layer: "screed", materialId: "screed",
    shapes: [prism(inner.poly, 0, ASSUME.screed, holes)], source: "schematic", level: ground, explode: { layerIndex: 9, dir: UP },
    dims: { thickness: dim(ASSUME.screed, "mm", "assumed"), volume: dim(round(screedNet, 3), "m³", "calculated", "Net of columns") },
  });
  addQuantity(ctx, screed, { workItem: "screed.ground", description: "Cement-sand screed to the ground floor", section: "K", unit: "m³", value: round(screedNet, 3), formula: `${f2(area)} m² × ${f3(ASSUME.screed / 1000)} m − columns = ${f3(screedNet)} m³`, inputs: { area: round(area, 3), thickness: ASSUME.screed }, status: "assumed" }, { assumptions: ["Screed laid wall to wall before partitions; room-by-room areas are in the finishes."], allowance: { rule: "Wastage and level variation (example)", percent: null } });
}

function polygonBoundsOf(poly: P2[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function polygonPerimeter(poly: P2[]) {
  return poly.reduce((s, p, i) => s + Math.hypot(poly[(i + 1) % poly.length]!.x - p.x, poly[(i + 1) % poly.length]!.y - p.y), 0);
}
