import { ASSUME, UP, dim, type Ctx } from "../context";
import { alongLine, box, boxAt, cyl, polygonArea, polygonBounds, prism, rectPoly, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, f3, m2, m3, metres, round } from "../helpers";
import { footingGroups, groundBeams, expand, insetOutline, type Rect } from "../structure-data";
import { netVolumes, prismOfShape } from "../geometry";

/** Stages 1 and 2: the site, then the ground taken out of it. */

export function pitRects(ctx: Ctx): { id: string; rect: Rect; floorZ: number; label: string }[] {
  return footingGroups(ctx).map((g) => ({ id: g.id, rect: expand(g.rect, ASSUME.working), floorZ: g.bottomZ - ASSUME.blindingThickness, label: g.label }));
}

/** Trench rectangles for ground beams, running from pit edge to pit edge so no hole overlaps another. */
export function trenchRects(ctx: Ctx): { id: string; rect: Rect; floorZ: number }[] {
  const pits = pitRects(ctx);
  const out: { id: string; rect: Rect; floorZ: number }[] = [];
  for (const beam of groundBeams(ctx)) {
    const half = beam.width / 2 + ASSUME.working;
    const horizontal = Math.abs(beam.a.y - beam.b.y) < 1;
    const lo = horizontal ? Math.min(beam.a.x, beam.b.x) : Math.min(beam.a.y, beam.b.y);
    const hi = horizontal ? Math.max(beam.a.x, beam.b.x) : Math.max(beam.a.y, beam.b.y);
    const fixed = horizontal ? beam.a.y : beam.a.x;
    // Trim to the pits at either end.
    const insidePit = (u: number) => pits.find((p) => (horizontal ? u > p.rect.x0 && u < p.rect.x1 && fixed > p.rect.y0 && fixed < p.rect.y1 : u > p.rect.y0 && u < p.rect.y1 && fixed > p.rect.x0 && fixed < p.rect.x1));
    const startPit = insidePit(lo + 1);
    const endPit = insidePit(hi - 1);
    const s = startPit ? (horizontal ? startPit.rect.x1 : startPit.rect.y1) : lo;
    const e = endPit ? (horizontal ? endPit.rect.x0 : endPit.rect.y0) : hi;
    if (e - s < 50) continue;
    out.push({ id: beam.id.replace("ground-beam:", "trench:"), rect: horizontal ? { x0: s, x1: e, y0: fixed - half, y1: fixed + half } : { x0: fixed - half, x1: fixed + half, y0: s, y1: e }, floorZ: beam.z0 - ASSUME.blindingThickness });
  }
  return out;
}

const rectOf = (r: Rect): P2[] => rectPoly(r.x0, r.y0, r.x1, r.y1);

export function generateSite(ctx: Ctx): void {
  const project = ctx.project;
  const siteBoundary = (project.site?.boundary ?? rectPoly(ctx.bounds.minX - 2500, ctx.bounds.minY - 2500, ctx.bounds.maxX + 2500, ctx.bounds.maxY + 2500)).map((p) => ({ x: p.x, y: p.y }));
  const sb = polygonBounds(siteBoundary);
  const ground = ASSUME.naturalGround;
  const siteArea = polygonArea(siteBoundary);
  const g = ctx.ground;

  // The plot's edge, pegged.
  const pegs: Shape[] = siteBoundary.map((p) => boxAt(p.x - 40, p.y - 40, ground, 80, 80, 500));
  const strings: Shape[] = siteBoundary.map((p, i) => alongLine(p, siteBoundary[(i + 1) % siteBoundary.length]!, 12, ground + 300, ground + 312));
  const boundary = ctx.add({
    id: "site:plot-boundary", name: "Plot boundary", kind: "plot-boundary", category: "site", subcategory: "Boundary", stage: 1,
    layer: "marker", materialId: "marker", shapes: [...pegs, ...strings], source: "project", sourceRef: project.site?.id ?? null,
    dims: { area: dim(round(siteArea * 1e-6, 2), "m²", "measured", "From the project's site boundary"), length: dim(round(siteBoundary.reduce((s, p, i) => s + Math.hypot(siteBoundary[(i + 1) % siteBoundary.length]!.x - p.x, siteBoundary[(i + 1) % siteBoundary.length]!.y - p.y), 0), 0), "mm", "calculated") },
    label: { text: "Plot boundary", anchor: v3(sb.minX, sb.minY, ground + 600) },
    explode: { layerIndex: 0, dir: UP },
  });
  addQuantity(ctx, boundary, { workItem: "prelim.site-area", description: "Site area to be cleared and set out", section: "A", unit: "m²", value: round(siteArea * 1e-6, 2), formula: `Plot polygon area = ${f2(siteArea * 1e-6)} m²`, inputs: { vertices: siteBoundary.length }, status: "measured" }, { sourceGeometry: `project:${project.site?.id ?? "outline"}`, exclusions: ["Tree removal", "Demolition", "Hazardous ground"] });

  // The ground, before anyone digs.
  ctx.add({
    id: "site:existing-ground", name: "Existing ground surface (schematic)", kind: "soil-layer", category: "site", subcategory: "Existing ground", stage: 1, removedAfter: 1,
    layer: "soil", materialId: "topsoil", shapes: [prism(siteBoundary, ground - 20, ground)], source: "schematic",
    dims: { area: dim(round(siteArea * 1e-6, 2), "m²", "measured"), thickness: dim(20, "mm", "assumed", "A thin plate stands for the surface") },
    note: "Natural ground is shown at an assumed level below the ground-floor level; the real level comes from the survey.",
  });

  // Soil layers: a cut section at the south edge, schematic.
  const layerDefs: [string, string, number, number][] = [["Topsoil (schematic)", "topsoil", 0, 300], ["Clay subsoil (schematic)", "clay", 300, 1800], ["Sand and gravel (schematic)", "sand-layer", 1800, 3200], ["Weathered rock (schematic)", "weathered-rock", 3200, 4600]];
  layerDefs.forEach(([name, mat, top, bottom], i) => {
    ctx.add({
      id: `site:soil-layer:${i + 1}`, name, kind: "soil-layer", category: "site", subcategory: "Soil layers (schematic)", stage: 1, layer: "soil", materialId: mat,
      shapes: [boxAt(sb.minX, sb.minY - 900, ground - bottom, sb.maxX - sb.minX, 900, bottom - top)], source: "schematic",
      dims: { thickness: dim(bottom - top, "mm", "assumed", "Illustrative thickness; a site investigation gives the real layers") },
      explode: { layerIndex: i, dir: v3(0, -1, 0) }, note: "Illustrative section only. Actual soil layers, depths and bearing capacity come from a site investigation report.",
      ...(i === 1 ? { label: { text: "Soil layers (schematic)", anchor: v3((sb.minX + sb.maxX) / 2, sb.minY - 900, ground - 1000) } } : {}),
    });
  });

  // Benchmark.
  const bx = sb.minX + 500;
  const by = sb.minY + 500;
  ctx.add({
    id: "site:benchmark", name: "Benchmark (BM)", kind: "benchmark", category: "site", subcategory: "Reference level", stage: 1, layer: "marker", materialId: "bench",
    shapes: [boxAt(bx - 75, by - 75, ground - 300, 150, 150, 1300), boxAt(bx - 90, by - 90, ground + 1000, 180, 180, 60)], source: "schematic",
    dims: { height: dim(1000, "mm", "assumed") }, label: { text: "Benchmark: all levels measured from here", anchor: v3(bx, by, ground + 1200) },
  });

  // Grid lines on profile boards.
  const gridLines = project.structuralGrid.filter((line) => line.levelId === g?.levelId);
  for (const line of gridLines) {
    const a = line.start;
    const b = line.end;
    const board = (p: P2, dirx: number, diry: number): Shape[] => {
      const across = Math.abs(dirx) > Math.abs(diry);
      return [
        across ? box(p.x, p.y, ground + 800, 40, 900, 160) : box(p.x, p.y, ground + 800, 900, 40, 160),
        ...(across ? [boxAt(p.x - 20, p.y - 450, ground, 50, 50, 800), boxAt(p.x - 20, p.y + 400, ground, 50, 50, 800)] : [boxAt(p.x - 450, p.y - 20, ground, 50, 50, 800), boxAt(p.x + 400, p.y - 20, ground, 50, 50, 800)]),
      ];
    };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    ctx.add({
      id: `site:grid:${line.id}`, name: `Grid line ${line.label}`, kind: "grid-line", category: "site", subcategory: "Setting out", stage: 1, layer: "marker", materialId: "string-line",
      shapes: [alongLine(a, b, 14, ground + 850, ground + 864), ...board(a, dx, dy), ...board(b, dx, dy)], source: "project", sourceRef: line.id,
      grid: line.label, dims: { length: dim(round(Math.hypot(dx, dy), 0), "mm", "measured") },
      label: line.axis === "x" ? { text: `Grid ${line.label}`, anchor: v3(a.x, a.y, ground + 900) } : { text: `Grid ${line.label}`, anchor: v3(a.x, a.y, ground + 900) },
      explode: { layerIndex: 0, dir: UP },
    });
  }

  // Building footprint and the excavation limits.
  if (ctx.outline.length >= 3) {
    ctx.add({
      id: "site:footprint", name: "Building footprint (setting-out lines)", kind: "building-footprint", category: "site", subcategory: "Setting out", stage: 1, removedAfter: 2, layer: "marker", materialId: "marker",
      shapes: ctx.outline.map((p, i) => alongLine(p, ctx.outline[(i + 1) % ctx.outline.length]!, 60, ground + 2, ground + 22)), source: "project", sourceRef: "outline",
      dims: { area: dim(round(polygonArea(ctx.outline) * 1e-6, 2), "m²", "measured") },
    });
  }
  const pits = pitRects(ctx);
  ctx.add({
    id: "site:excavation-boundary", name: "Excavation boundaries (pits)", kind: "excavation-boundary", category: "site", subcategory: "Setting out", stage: 1, removedAfter: 2, layer: "marker", materialId: "marker",
    shapes: pits.flatMap((p) => { const r = p.rect; const c = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]; return c.map((q, i) => alongLine(q, c[(i + 1) % 4]!, 40, ground + 2, ground + 20)); }),
    source: "schematic", note: "Each pit is the footing plus 300 mm working space on every side (an example allowance).",
  });

  // Access and temporary works.
  const accessW = 3000;
  const ax = ctx.bounds.minX + 1000;
  ctx.add({
    id: "site:access", name: "Access road and delivery area", kind: "access-area", category: "site", subcategory: "Access", stage: 1, layer: "temporary", materialId: "paving",
    shapes: [prism(rectPoly(ax, sb.minY, ax + accessW, ctx.bounds.minY - 1400), ground, ground + 30)], source: "schematic", removedAfter: 17,
    note: "Temporary compacted access; the permanent path is built in the external works.",
    dims: { area: dim(round(accessW * (ctx.bounds.minY - 1400 - sb.minY) * 1e-6, 2), "m²", "assumed") },
  });
  ctx.add({
    id: "site:storage", name: "Material storage and mixing area", kind: "access-area", category: "site", subcategory: "Temporary work area", stage: 1, removedAfter: 17, layer: "temporary", materialId: "temporary",
    shapes: [prism(rectPoly(sb.maxX - 5200, sb.minY + 300, sb.maxX - 300, sb.minY + 3300), ground, ground + 15)], source: "schematic",
  });
  ctx.add({
    id: "site:office", name: "Site office (temporary)", kind: "access-area", category: "site", subcategory: "Temporary work area", stage: 1, removedAfter: 17, layer: "temporary", materialId: "temporary",
    shapes: [boxAt(sb.maxX - 3600, sb.maxY - 3000, ground, 3000, 2400, 2400), boxAt(sb.maxX - 3700, sb.maxY - 3100, ground + 2400, 3200, 2600, 80)], source: "schematic",
  });
  const fence: Shape[] = [];
  siteBoundary.forEach((p, i) => {
    const q = siteBoundary[(i + 1) % siteBoundary.length]!;
    fence.push(alongLine(p, q, 25, ground + 1500, ground + 1560));
    const n = Math.max(1, Math.floor(Math.hypot(q.x - p.x, q.y - p.y) / 3000));
    for (let k = 0; k <= n; k += 1) fence.push(boxAt(p.x + ((q.x - p.x) * k) / n - 30, p.y + ((q.y - p.y) * k) / n - 30, ground, 60, 60, 1600));
  });
  const fenceLength = siteBoundary.reduce((s, p, i) => s + Math.hypot(siteBoundary[(i + 1) % siteBoundary.length]!.x - p.x, siteBoundary[(i + 1) % siteBoundary.length]!.y - p.y), 0);
  const fenceC = ctx.add({ id: "site:fence", name: "Temporary site fence and signboard", kind: "access-area", category: "site", subcategory: "Safety", stage: 1, removedAfter: 17, layer: "temporary", materialId: "temporary", shapes: fence, source: "schematic" });
  addQuantity(ctx, fenceC, { workItem: "prelim.fence", description: "Temporary site fence", section: "A", unit: "m", value: round(fenceLength / 1000, 2), formula: `Σ plot edges = ${f2(fenceLength / 1000)} m`, inputs: { edges: siteBoundary.length }, status: "calculated" }, { assumptions: ["Fence follows the plot boundary."], allowance: { rule: "Gates and returns (example)", percent: null } });
  ctx.add({
    id: "site:drainage", name: "Temporary surface drainage channels", kind: "site-drainage", category: "site", subcategory: "Drainage", stage: 1, removedAfter: 4, layer: "temporary", materialId: "weathered-rock",
    shapes: [alongLine({ x: sb.minX + 400, y: sb.minY + 400 }, { x: sb.minX + 400, y: sb.maxY - 400 }, 300, ground - 100, ground), alongLine({ x: sb.minX + 400, y: sb.maxY - 400 }, { x: sb.maxX - 400, y: sb.maxY - 400 }, 300, ground - 100, ground)], source: "schematic",
  });
}

export function generateEarthworks(ctx: Ctx): void {
  const project = ctx.project;
  const siteBoundary = (project.site?.boundary ?? rectPoly(ctx.bounds.minX - 2500, ctx.bounds.minY - 2500, ctx.bounds.maxX + 2500, ctx.bounds.maxY + 2500)).map((p) => ({ x: p.x, y: p.y }));
  const ground = ASSUME.naturalGround;
  const formation = ground - ASSUME.topsoilStrip;
  const pits = pitRects(ctx);
  const trenches = trenchRects(ctx);
  if (pits.length === 0 || !ctx.ground) {
    ctx.warnings.push("No footings in the project: the excavation stage has nothing to show.");
    return;
  }
  // The platform: topsoil stripped over the area the pits and trenches occupy.
  const envelope: Rect = {
    x0: Math.min(ctx.bounds.minX, ...pits.map((p) => p.rect.x0)) - 200, y0: Math.min(ctx.bounds.minY, ...pits.map((p) => p.rect.y0)) - 200,
    x1: Math.max(ctx.bounds.maxX, ...pits.map((p) => p.rect.x1)) + 200, y1: Math.max(ctx.bounds.maxY, ...pits.map((p) => p.rect.y1)) + 200,
  };
  const holes = [...pits.map((p) => rectOf(p.rect)), ...trenches.map((t) => rectOf(t.rect))];
  ctx.add({
    id: "earth:ground-surface", name: "Ground surface after stripping", kind: "soil-layer", category: "earthworks", subcategory: "Existing ground", stage: 2, layer: "soil", materialId: "topsoil",
    shapes: [prism(siteBoundary, ground - 20, ground, [rectOf(envelope)])], source: "schematic",
    note: "Topsoil is stripped over the building platform and its working space; it is stored separately for landscaping.",
  });
  const platformArea = (envelope.x1 - envelope.x0) * (envelope.y1 - envelope.y0);
  const platform = ctx.add({
    id: "earth:formation", name: "Formation level (platform)", kind: "formation-level", category: "earthworks", subcategory: "Formation", stage: 2, layer: "soil", materialId: "clay",
    shapes: [prism(rectOf(envelope), formation - 20, formation, holes)], source: "schematic",
    dims: { area: dim(round(platformArea * 1e-6, 2), "m²", "assumed", "Footprint plus pit working space"), height: dim(formation, "mm", "assumed", "Level relative to the ground-floor structural level") },
    label: { text: "Formation level", anchor: v3(envelope.x0 + 500, envelope.y0 + 500, formation) },
  });
  addQuantity(ctx, platform, { workItem: "earth.strip", description: "Strip topsoil over the building platform", section: "B", unit: "m³", value: round(m3(envelope.x1 - envelope.x0, envelope.y1 - envelope.y0, ASSUME.topsoilStrip), 3), formula: `${f2((envelope.x1 - envelope.x0) / 1000)} × ${f2((envelope.y1 - envelope.y0) / 1000)} × ${f3(ASSUME.topsoilStrip / 1000)} = ${f3(m3(envelope.x1 - envelope.x0, envelope.y1 - envelope.y0, ASSUME.topsoilStrip))} m³`, inputs: { platformX: envelope.x1 - envelope.x0, platformY: envelope.y1 - envelope.y0, strip: ASSUME.topsoilStrip }, status: "assumed" }, { assumptions: ["Strip depth 150 mm and the platform margin are example assumptions; the survey and soil report decide.", "Natural ground assumed 300 mm below the ground-floor level."], allowance: { rule: "Bulking of excavated soil (example)", percent: null } });

  // Pits.
  let totalPit = 0;
  for (const pit of pits) {
    const r = pit.rect;
    const depth = ground - pit.floorZ;
    const t = 30;
    const walls = [boxAt(r.x0, r.y0, pit.floorZ, r.x1 - r.x0, t, depth), boxAt(r.x0, r.y1 - t, pit.floorZ, r.x1 - r.x0, t, depth), boxAt(r.x0, r.y0, pit.floorZ, t, r.y1 - r.y0, depth), boxAt(r.x1 - t, r.y0, pit.floorZ, t, r.y1 - r.y0, depth)];
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const comp = ctx.add({
      id: `earth:pit:${pit.id}`, name: `Excavation — ${pit.label.toLowerCase()}`, kind: "excavation-pit", category: "earthworks", subcategory: "Pits", stage: 2, removedAfter: 3, layer: "soil", materialId: "clay",
      shapes: [boxAt(r.x0, r.y0, pit.floorZ - 20, r.x1 - r.x0, r.y1 - r.y0, 20), ...walls], source: "schematic", sourceRef: pit.id,
      grid: ctx.gridRef(ctx.ground.levelId, cx, cy, 1300),
      dims: { length: dim(r.x1 - r.x0, "mm", "calculated"), width: dim(r.y1 - r.y0, "mm", "calculated"), height: dim(depth, "mm", "assumed", "From the assumed natural ground to formation under blinding"), volume: dim(round(m3(r.x1 - r.x0, r.y1 - r.y0, depth), 3), "m³", "assumed") },
    });
    const v = m3(r.x1 - r.x0, r.y1 - r.y0, depth);
    totalPit += v;
    addQuantity(ctx, comp, { workItem: "earth.pit", description: "Excavate pits for footings", section: "B", unit: "m³", value: round(v, 3), formula: `${f2((r.x1 - r.x0) / 1000)} × ${f2((r.y1 - r.y0) / 1000)} × ${f3(depth / 1000)} = ${f3(v)} m³`, inputs: { length: r.x1 - r.x0, width: r.y1 - r.y0, depth, working: ASSUME.working }, status: "assumed" }, {
      assumptions: ["Pit = footing + 300 mm working space each side; vertical sides.", "Depth from assumed natural ground to underside of blinding."], exclusions: ["Side slopes or shoring", "Dewatering", "Rock or obstruction"], allowance: { rule: "Bulking and over-dig (example)", percent: null },
    });
  }
  // Trenches for ground beams.
  for (const trench of trenches) {
    const r = trench.rect;
    const depth = ground - trench.floorZ;
    const comp = ctx.add({
      id: `earth:${trench.id}`, name: "Excavation — ground-beam trench", kind: "excavation-trench", category: "earthworks", subcategory: "Trenches", stage: 2, removedAfter: 3, layer: "soil", materialId: "clay",
      shapes: [boxAt(r.x0, r.y0, trench.floorZ - 20, r.x1 - r.x0, r.y1 - r.y0, 20)], source: "schematic",
      dims: { length: dim(Math.max(r.x1 - r.x0, r.y1 - r.y0), "mm", "calculated"), width: dim(Math.min(r.x1 - r.x0, r.y1 - r.y0), "mm", "calculated"), height: dim(depth, "mm", "assumed") },
    });
    const v = m3(r.x1 - r.x0, r.y1 - r.y0, depth);
    totalPit += v;
    addQuantity(ctx, comp, { workItem: "earth.trench", description: "Excavate trenches for ground beams", section: "B", unit: "m³", value: round(v, 3), formula: `${f2((r.x1 - r.x0) / 1000)} × ${f2((r.y1 - r.y0) / 1000)} × ${f3(depth / 1000)} = ${f3(v)} m³`, inputs: { length: r.x1 - r.x0, width: r.y1 - r.y0, depth }, status: "assumed" }, { assumptions: ["Trench = beam width + 300 mm each side, running from pit to pit (no overlap counted)."] });
  }
  // Spoil.
  const sb = polygonBounds(siteBoundary);
  const sx = sb.maxX - 3000;
  const sy = ctx.bounds.minY + 1500;
  const heap = ctx.add({
    id: "earth:spoil", name: "Excavated soil (stockpile)", kind: "spoil-heap", category: "earthworks", subcategory: "Spoil", stage: 2, removedAfter: 3, layer: "soil", materialId: "spoil",
    shapes: [boxAt(sx - 1500, sy - 900, ground, 3000, 1800, 500), boxAt(sx - 1100, sy - 650, ground + 500, 2200, 1300, 450), boxAt(sx - 650, sy - 400, ground + 950, 1300, 800, 400)], source: "schematic",
    dims: { volume: dim(round(totalPit, 1), "m³", "assumed", "Equals the pit and trench excavation; the pile shown is smaller than the real heap") },
    label: { text: "Excavated soil", anchor: v3(sx, sy, ground + 1300) }, note: "Stored away from the pit edge; part is returned as compacted backfill and the remainder removed.",
  });
  void heap;
  // Selected fill and the platform bed under the slab: the base of the ground floor.
  const inner = insetOutline(ctx, 0);
  const fillTop = formation + 100;
  const fill = ctx.add({
    id: "earth:selected-fill", name: "Compacted selected fill (platform)", kind: "compacted-fill", category: "earthworks", subcategory: "Fill", stage: 2, layer: "fill", materialId: "hardcore",
    shapes: [prism(inner.poly, formation, fillTop)], source: "schematic", dims: { thickness: dim(100, "mm", "assumed"), area: dim(round(polygonArea(inner.poly) * 1e-6, 2), "m²", inner.exact ? "calculated" : "review") },
    label: { text: "Compacted fill", anchor: v3(ctx.bounds.minX + 800, ctx.bounds.minY + 800, fillTop) },
  });
  const fillVol = polygonArea(inner.poly) * 100 * 1e-9;
  addQuantity(ctx, fill, { workItem: "earth.fill", description: "Selected fill, compacted in layers", section: "B", unit: "m³", value: round(fillVol, 3), formula: `${f2(polygonArea(inner.poly) * 1e-6)} m² × 0.100 m = ${f3(fillVol)} m³`, inputs: { area: round(polygonArea(inner.poly) * 1e-6, 2), thickness: 100 }, status: "assumed" }, { assumptions: ["Compacted thickness 100 mm over the whole footprint (example)."], exclusions: ["Haulage of imported fill"], allowance: { rule: "Compaction shrinkage (example)", percent: null } });
  void netVolumes; void prismOfShape; void cyl; void metres; void m2;
}
