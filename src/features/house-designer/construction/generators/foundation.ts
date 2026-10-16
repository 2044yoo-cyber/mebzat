import { ASSUME, UP, dim, onWall, type Ctx, type WallFrame } from "../context";
import { alongLine, box, boxAt, cyl, netVolumes, prismOfShape, v3, type Prism, type Shape } from "../geometry";
import { addQuantity, barBetween, concreteQuantity, f2, f3, formworkQuantity, hoopXY, m2, m3, rebarQuantity, round, spaced } from "../helpers";
import { footingGroups, groundBeams, pedestalsOf } from "../structure-data";

/** Which way is out of the building for this wall: −1 or +1 along its left normal. */
export function outwardSign(wall: WallFrame): number {
  if (wall.left !== null && wall.right === null) return -1;
  if (wall.right !== null && wall.left === null) return 1;
  return wall.exterior ? -1 : 0;
}

export function generateFoundation(ctx: Ctx): void {
  const ground = ctx.ground;
  if (!ground) return;
  const groups = footingGroups(ctx);
  if (groups.length === 0) {
    ctx.warnings.push("No footings in the project: no foundation system can be shown.");
    return;
  }
  const beams = groundBeams(ctx);
  const gz = ASSUME.naturalGround;
  const cover = 50;
  const bar = 12;
  const approved = ctx.approved;

  // Pedestals first, as concrete prisms, so ground beams can be netted against them.
  const pedestals = pedestalsOf(ctx);
  const pedPrisms: Prism[] = pedestals.map((p) => prismOfShape(boxAt(p.col.x - p.col.width / 2, p.col.y - p.col.depth / 2, p.z0, p.col.width, p.col.depth, p.z1 - p.z0))!);
  const beamPrisms: Prism[] = beams.map((b) => prismOfShape(alongLine(b.a, b.b, b.width, b.z0, b.z1))!);
  const nets = netVolumes([...pedPrisms, ...beamPrisms]);

  // --- Footings -------------------------------------------------------------
  for (const group of groups) {
    const r = group.rect;
    const w = r.x1 - r.x0;
    const d = r.y1 - r.y0;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const t = group.thickness;
    const grid = ctx.gridRef(ground.levelId, group.columns[0]?.x ?? cx, group.columns[0]?.y ?? cy);
    const sid = group.id.replace(/[^\w+-]+/g, "-");
    const kind = group.combined ? "combined-footing" : "pad-footing";
    const label = group.combined ? "Combined footing" : "Pad footing";

    const blinding = ctx.add({
      id: `found:blinding:${sid}`, name: `Blinding — ${label.toLowerCase()}${grid ? ` ${grid}` : ""}`, kind: "blinding", category: "substructure", subcategory: "Blinding", stage: 3, layer: "blinding", materialId: "blinding",
      shapes: [boxAt(r.x0 - 100, r.y0 - 100, group.bottomZ - ASSUME.blindingThickness, w + 200, d + 200, ASSUME.blindingThickness)], source: "schematic", sourceRef: group.members[0]?.id ?? null, grid,
      dims: { length: dim(w + 200, "mm", "calculated"), width: dim(d + 200, "mm", "calculated"), thickness: dim(ASSUME.blindingThickness, "mm", "assumed"), volume: dim(round(m3(w + 200, d + 200, ASSUME.blindingThickness), 3), "m³", "assumed") },
      explode: { layerIndex: 0, dir: UP },
    });
    concreteQuantity(ctx, blinding, "concrete.blinding", "Blinding concrete (lean mix)", m3(w + 200, d + 200, ASSUME.blindingThickness), `${f2((w + 200) / 1000)} × ${f2((d + 200) / 1000)} × ${f3(ASSUME.blindingThickness / 1000)} = ${f3(m3(w + 200, d + 200, ASSUME.blindingThickness))} m³`, { length: w + 200, width: d + 200, thickness: ASSUME.blindingThickness }, "assumed", ["Blinding projects 100 mm beyond the footing; 75 mm thick (example)."]);

    const concrete = ctx.add({
      id: `found:footing:${sid}`, name: `${label}${grid ? ` ${grid}` : ""}`, kind, category: "substructure", subcategory: label, stage: 3, layer: "concrete", materialId: "concrete",
      shapes: [boxAt(r.x0, r.y0, group.bottomZ, w, d, t)], source: "project", sourceRef: group.members.map((m) => m.id).join(","), grid,
      parentId: blinding.id, connectedIds: [blinding.id], dims: { length: dim(w, "mm", "measured"), width: dim(d, "mm", "measured"), thickness: dim(t, "mm", "measured"), volume: dim(round(m3(w, d, t), 3), "m³", "calculated") },
      explode: { layerIndex: 1, dir: UP }, pour: 1,
      label: { text: `${label}${grid ? ` ${grid}` : ""}`, anchor: v3(cx, cy, group.topZ) },
    });
    concreteQuantity(ctx, concrete, group.combined ? "concrete.combined-footing" : "concrete.footing", group.combined ? "Combined footings" : "Pad footings", m3(w, d, t), `${f2(w / 1000)} × ${f2(d / 1000)} × ${f3(t / 1000)} = ${f3(m3(w, d, t))} m³`, { length: w, width: d, thickness: t }, "calculated");

    // Reinforcement mesh (schematic).
    const meshShapes: Shape[] = [];
    const zx = group.bottomZ + cover + bar / 2;
    for (const y of spaced(r.y0 + cover, r.y1 - cover, 150)) meshShapes.push(cyl((r.x0 + r.x1) / 2, y, zx, bar / 2, w - 2 * cover, "x"));
    for (const x of spaced(r.x0 + cover, r.x1 - cover, 150)) meshShapes.push(cyl(x, (r.y0 + r.y1) / 2, zx + bar, bar / 2, d - 2 * cover, "y"));
    const mesh = ctx.add({
      id: `found:rebar:${sid}`, name: `${label} reinforcement (schematic)${grid ? ` ${grid}` : ""}`, kind: "footing-rebar", category: "substructure", subcategory: "Reinforcement", stage: 3, layer: "reinforcement", materialId: "steel-bar",
      shapes: meshShapes, repeated: { noun: "bar" }, source: "schematic", parentId: concrete.id, connectedIds: [concrete.id], grid, explode: { layerIndex: 2, dir: UP },
      dims: { length: dim(w, "mm", "assumed"), width: dim(d, "mm", "assumed") }, note: "Bars are schematic: size, spacing, laps and bends come from the approved structural drawings.",
    });
    rebarQuantity(ctx, mesh, `${label} reinforcement`, approved);

    // Spacers under the mesh.
    const spacers: Shape[] = [];
    for (const x of spaced(r.x0 + 200, r.x1 - 200, 750)) for (const y of spaced(r.y0 + 200, r.y1 - 200, 750)) spacers.push(box(x, y, group.bottomZ + cover / 2, 60, 60, cover));
    const spacer = ctx.add({
      id: `found:spacers:${sid}`, name: `Cover spacers${grid ? ` ${grid}` : ""}`, kind: "spacer", category: "substructure", subcategory: "Cover & spacers", stage: 3, layer: "reinforcement", materialId: "spacer",
      shapes: spacers, repeated: { noun: "spacer" }, source: "schematic", parentId: concrete.id, grid, explode: { layerIndex: 2, dir: UP }, dims: { height: dim(cover, "mm", "assumed", "Concrete cover to the bottom steel") },
    });
    addQuantity(ctx, spacer, { workItem: "steel.spacers", description: "Cover spacers", section: "D", unit: "piece", value: spacers.length, formula: `${spacers.length} spacers at 750 mm centres under the footing mesh`, inputs: { spacing: 750 }, status: "assumed" }, { assumptions: ["Spacing 750 mm and 50 mm cover are example values."] });

    // Formwork around the footing: struck once the concrete has cured.
    const ply = ASSUME.formworkPly;
    const form = ctx.add({
      id: `found:formwork:${sid}`, name: `Footing formwork${grid ? ` ${grid}` : ""}`, kind: "footing-formwork", category: "substructure", subcategory: "Formwork", stage: 3, removedAfter: 3, layer: "formwork", materialId: "formwork",
      shapes: [boxAt(r.x0 - ply, r.y0 - ply, group.bottomZ, w + 2 * ply, ply, t + 50), boxAt(r.x0 - ply, r.y1, group.bottomZ, w + 2 * ply, ply, t + 50), boxAt(r.x0 - ply, r.y0, group.bottomZ, ply, d, t + 50), boxAt(r.x1, r.y0, group.bottomZ, ply, d, t + 50)],
      source: "schematic", parentId: concrete.id, grid, explode: { layerIndex: 3, dir: v3(0, 0, 1) }, dims: { thickness: dim(ply, "mm", "assumed") },
    });
    const area = (2 * (w + d) * t) * 1e-6;
    formworkQuantity(ctx, form, "formwork.footing", "Formwork to footing sides", area, `perimeter ${f2((2 * (w + d)) / 1000)} m × ${f3(t / 1000)} m = ${f3(area)} m²`, { perimeter: 2 * (w + d), height: t });
  }

  // --- Pedestals and starter bars ----------------------------------------
  pedestals.forEach((ped, index) => {
    const { col, z0, z1, group } = ped;
    const h = z1 - z0;
    const grid = ctx.gridRef(ground.levelId, col.x, col.y);
    const sid = col.id.replace(/[^\w]+/g, "-");
    const pedestal = ctx.add({
      id: `found:pedestal:${sid}`, name: `Column pedestal${grid ? ` ${grid}` : ""}`, kind: "pedestal", category: "substructure", subcategory: "Pedestals", stage: 3, layer: "concrete", materialId: "concrete",
      shapes: [boxAt(col.x - col.width / 2, col.y - col.depth / 2, z0, col.width, col.depth, h)], source: "project", sourceRef: col.id, grid, parentId: `found:footing:${group.id.replace(/[^\w+-]+/g, "-")}`, pour: 1,
      dims: { length: dim(col.width, "mm", "measured"), width: dim(col.depth, "mm", "measured"), height: dim(h, "mm", "calculated"), volume: dim(round(nets[index]! * 1e-9, 4), "m³", "calculated") },
      explode: { layerIndex: 1, dir: UP },
    });
    concreteQuantity(ctx, pedestal, "concrete.pedestal", "Column pedestals", nets[index]! * 1e-9, `${f3(col.width / 1000)} × ${f3(col.depth / 1000)} × ${f3(h / 1000)} = ${f3(nets[index]! * 1e-9)} m³`, { width: col.width, depth: col.depth, height: h }, "calculated");
    const inset = cover + 8 + 8;
    const bars: Shape[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) bars.push(cyl(col.x + sx * (col.width / 2 - inset), col.y + sy * (col.depth / 2 - inset), (group.bottomZ + cover + z1 + 600) / 2, 8, z1 + 600 - (group.bottomZ + cover), "z"));
    const starters = ctx.add({
      id: `found:starters:${sid}`, name: `Column starter bars (dowels)${grid ? ` ${grid}` : ""}`, kind: "starter-bars", category: "substructure", subcategory: "Reinforcement", stage: 3, layer: "reinforcement", materialId: "steel-bar",
      shapes: bars, repeated: { noun: "bar" }, source: "schematic", grid, parentId: pedestal.id, connectedIds: [pedestal.id], explode: { layerIndex: 2, dir: UP },
      dims: { height: dim(round(z1 + 600 - (group.bottomZ + cover), 0), "mm", "assumed", "Lap of 600 mm above floor level is an example value") },
      note: "Standing 600 mm above the pedestal so the column bars can be lapped to them.",
    });
    rebarQuantity(ctx, starters, "Column starter bars", approved);
    const stirrups: Shape[] = [];
    for (const z of spaced(z0 + 100, z1 - 100, 150)) stirrups.push(...hoopXY(col.x, col.y, z, col.width - 2 * cover, col.depth - 2 * cover, 8));
    ctx.add({
      id: `found:pedestal-ties:${sid}`, name: `Pedestal stirrups (schematic)${grid ? ` ${grid}` : ""}`, kind: "column-stirrups", category: "substructure", subcategory: "Reinforcement", stage: 3, layer: "reinforcement", materialId: "steel-bar",
      shapes: stirrups, repeated: { noun: "stirrup" }, source: "schematic", grid, parentId: pedestal.id, explode: { layerIndex: 2, dir: UP },
    });
    const form = ctx.add({
      id: `found:pedestal-form:${sid}`, name: `Pedestal formwork${grid ? ` ${grid}` : ""}`, kind: "footing-formwork", category: "substructure", subcategory: "Formwork", stage: 3, removedAfter: 3, layer: "formwork", materialId: "formwork",
      shapes: [boxAt(col.x - col.width / 2 - 18, col.y - col.depth / 2 - 18, z0, col.width + 36, 18, h), boxAt(col.x - col.width / 2 - 18, col.y + col.depth / 2, z0, col.width + 36, 18, h), boxAt(col.x - col.width / 2 - 18, col.y - col.depth / 2, z0, 18, col.depth, h), boxAt(col.x + col.width / 2, col.y - col.depth / 2, z0, 18, col.depth, h)],
      source: "schematic", grid, parentId: pedestal.id, explode: { layerIndex: 3, dir: UP },
    });
    const fa = 2 * (col.width + col.depth) * h * 1e-6;
    formworkQuantity(ctx, form, "formwork.pedestal", "Formwork to pedestals", fa, `perimeter ${f2((2 * (col.width + col.depth)) / 1000)} m × ${f3(h / 1000)} m = ${f3(fa)} m²`, { perimeter: 2 * (col.width + col.depth), height: h });
  });

  // --- Ground beams -------------------------------------------------------
  beams.forEach((beam, index) => {
    const net = nets[pedestals.length + index]!;
    const sid = beam.id.replace(/[^\w]+/g, "-");
    const depth = beam.z1 - beam.z0;
    const concrete = ctx.add({
      id: `found:${sid}`, name: `Ground beam ${beam.fromColumn ? ctx.gridRef(ground.levelId, beam.a.x, beam.a.y) : ""}–${ctx.gridRef(ground.levelId, beam.b.x, beam.b.y) ?? ""}`, kind: "ground-beam", category: "substructure", subcategory: "Ground beams", stage: 3, layer: "concrete", materialId: "concrete",
      shapes: [alongLine(beam.a, beam.b, beam.width, beam.z0, beam.z1)], source: "project", sourceRef: beam.id, grid: ctx.gridRef(ground.levelId, beam.a.x, beam.a.y), connectedIds: [], pour: 1,
      dims: { length: dim(round(beam.length, 0), "mm", "measured"), width: dim(beam.width, "mm", "measured"), height: dim(depth, "mm", "assumed", "Ground beam depth is an example value"), volume: dim(round(net * 1e-9, 4), "m³", "calculated", "Net of the pedestals it frames into") },
      explode: { layerIndex: 1, dir: UP },
    });
    concreteQuantity(ctx, concrete, "concrete.ground-beam", "Ground beams", net * 1e-9, `gross ${f3(m3(beam.length, beam.width, depth))} m³ − part inside pedestals = ${f3(net * 1e-9)} m³`, { length: round(beam.length, 0), width: beam.width, depth }, "calculated", ["Centre-to-centre length less the volume already counted in the pedestals."]);
    const bars: Shape[] = [];
    for (const sy of [-1, 1]) for (const z of [beam.z0 + 50 + 8, beam.z1 - 50 - 8]) {
      const nx = -(beam.b.y - beam.a.y) / beam.length;
      const ny = (beam.b.x - beam.a.x) / beam.length;
      const off = sy * (beam.width / 2 - 50 - 8);
      bars.push(barBetween({ x: beam.a.x + nx * off, y: beam.a.y + ny * off }, { x: beam.b.x + nx * off, y: beam.b.y + ny * off }, z, 16));
    }
    const bm = ctx.add({
      id: `found:${sid}:rebar`, name: "Ground beam reinforcement (schematic)", kind: "footing-rebar", category: "substructure", subcategory: "Reinforcement", stage: 3, layer: "reinforcement", materialId: "steel-bar",
      shapes: bars, repeated: { noun: "bar" }, source: "schematic", parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 2, dir: UP },
    });
    rebarQuantity(ctx, bm, "Ground beam reinforcement", approved);
    const form = ctx.add({
      id: `found:${sid}:form`, name: "Ground beam formwork", kind: "footing-formwork", category: "substructure", subcategory: "Formwork", stage: 3, removedAfter: 3, layer: "formwork", materialId: "formwork",
      shapes: [alongLine({ x: beam.a.x - ((beam.b.y - beam.a.y) / beam.length) * (beam.width / 2 + 9), y: beam.a.y + ((beam.b.x - beam.a.x) / beam.length) * (beam.width / 2 + 9) }, { x: beam.b.x - ((beam.b.y - beam.a.y) / beam.length) * (beam.width / 2 + 9), y: beam.b.y + ((beam.b.x - beam.a.x) / beam.length) * (beam.width / 2 + 9) }, 18, beam.z0, beam.z1),
        alongLine({ x: beam.a.x + ((beam.b.y - beam.a.y) / beam.length) * (beam.width / 2 + 9), y: beam.a.y - ((beam.b.x - beam.a.x) / beam.length) * (beam.width / 2 + 9) }, { x: beam.b.x + ((beam.b.y - beam.a.y) / beam.length) * (beam.width / 2 + 9), y: beam.b.y - ((beam.b.x - beam.a.x) / beam.length) * (beam.width / 2 + 9) }, 18, beam.z0, beam.z1)],
      source: "schematic", parentId: concrete.id, explode: { layerIndex: 3, dir: UP },
    });
    const clear = Math.max(0, beam.length - 300);
    formworkQuantity(ctx, form, "formwork.ground-beam", "Formwork to ground beam sides", 2 * clear * depth * 1e-6, `2 sides × ${f2(clear / 1000)} m × ${f3(depth / 1000)} m = ${f3(2 * clear * depth * 1e-6)} m²`, { length: clear, depth }, "calculated", ["Clear length taken as centre length less one column width."]);
    ctx.add({
      id: `found:${sid}:blinding`, name: "Blinding — ground beam", kind: "blinding", category: "substructure", subcategory: "Blinding", stage: 3, layer: "blinding", materialId: "blinding",
      shapes: [alongLine(beam.a, beam.b, beam.width + 200, beam.z0 - ASSUME.blindingThickness, beam.z0)], source: "schematic", parentId: concrete.id, explode: { layerIndex: 0, dir: UP },
    });
  });

  // --- Foundation walls, DPC, waterproofing, protection, drainage layer ------
  const walls = ctx.wallsOf(ground.levelId).filter((w) => w.exterior);
  const cols = ctx.project.structuralColumns.filter((c) => c.levelId === ground.levelId);
  const top = ground.floorZ;
  const bottom = ASSUME.groundBeamTop;
  for (const wall of walls) {
    const here = cols.filter((c) => Math.abs((c.x - wall.start.x) * wall.nx + (c.y - wall.start.y) * wall.ny) < wall.thickness).map((c) => ({ s: (c.x - wall.start.x) * wall.ux + (c.y - wall.start.y) * wall.uy, half: Math.max(c.width, c.depth) / 2 })).sort((a, b) => a.s - b.s);
    const cuts = [{ s: -Infinity, half: 0 }, ...here, { s: Infinity, half: 0 }];
    const out = outwardSign(wall);
    const wid = wall.id.replace(/[^\w]+/g, "-");
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const s0 = Math.max(0, cuts[k]!.s === -Infinity ? 0 : cuts[k]!.s + cuts[k]!.half);
      const s1 = Math.min(wall.length, cuts[k + 1]!.s === Infinity ? wall.length : cuts[k + 1]!.s - cuts[k + 1]!.half);
      if (s1 - s0 < 100) continue;
      const a = onWall(wall, s0);
      const b = onWall(wall, s1);
      const courses = Math.max(1, Math.round((top - bottom) / ASSUME.blockCourse));
      const ch = (top - bottom) / courses;
      const shapes: Shape[] = Array.from({ length: courses }, (_, i) => alongLine(a, b, wall.thickness, bottom + i * ch + 5, bottom + (i + 1) * ch - 5));
      const fw = ctx.add({
        id: `found:wall:${wid}:${k}`, name: "Foundation wall (solid blocks)", kind: "foundation-wall", category: "substructure", subcategory: "Foundation walls", stage: 3, layer: "masonry", materialId: "block-solid",
        shapes, repeated: { noun: "course" }, source: "project", sourceRef: wall.id, grid: ctx.gridSpanX(ground.levelId, (a.x + b.x) / 2) ?? ctx.gridSpanY(ground.levelId, (a.y + b.y) / 2),
        dims: { length: dim(round(s1 - s0, 0), "mm", "measured"), thickness: dim(wall.thickness, "mm", "measured"), height: dim(top - bottom, "mm", "assumed", "Ground-beam top to floor level"), volume: dim(round(m3(s1 - s0, wall.thickness, top - bottom), 3), "m³", "calculated") },
        explode: { layerIndex: 1, dir: UP },
      });
      const v = m3(s1 - s0, wall.thickness, top - bottom);
      addQuantity(ctx, fw, { workItem: "masonry.foundation-wall", description: "Foundation walling in solid blocks", section: "F", unit: "m³", value: round(v, 3), formula: `${f2((s1 - s0) / 1000)} × ${f3(wall.thickness / 1000)} × ${f3((top - bottom) / 1000)} = ${f3(v)} m³`, inputs: { length: round(s1 - s0, 0), thickness: wall.thickness, height: top - bottom }, status: "calculated" }, { assumptions: ["Walling stands between column faces from ground-beam top to floor level."], exclusions: ["Mortar and breakage allowance are not added to the net volume"] });
      // Damp-proof course on top; waterproofing + protection + drainage on the outer face.
      const nx = wall.nx * out;
      const ny = wall.ny * out;
      const half = wall.thickness / 2;
      const outer = (d: number) => ({ a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d } });
      const dpc = ctx.add({
        id: `found:dpc:${wid}:${k}`, name: "Damp-proof course (DPC)", kind: "dpm", category: "substructure", subcategory: "Damp-proofing", stage: 3, layer: "waterproofing", materialId: "dpm",
        shapes: [alongLine(a, b, wall.thickness + 20, top, top + 4)], source: "schematic", parentId: fw.id, explode: { layerIndex: 2, dir: UP },
      });
      addQuantity(ctx, dpc, { workItem: "waterproofing.dpc", description: "Damp-proof course to walls", section: "G", unit: "m", value: round((s1 - s0) / 1000, 3), formula: `${f2((s1 - s0) / 1000)} m of wall`, inputs: { length: round(s1 - s0, 0) }, status: "calculated" }, { allowance: { rule: "Laps (example)", percent: null } });
      const wp = outer(half + 1.5);
      const waterproof = ctx.add({
        id: `found:waterproofing:${wid}:${k}`, name: "Foundation waterproofing coat", kind: "waterproofing-foundation", category: "substructure", subcategory: "Waterproofing", stage: 3, layer: "waterproofing", materialId: "waterproofing",
        shapes: [alongLine(wp.a, wp.b, 3, bottom - 200, top)], source: "schematic", parentId: fw.id, explode: { layerIndex: 2, dir: v3(nx, ny, 0) },
      });
      const wa = (s1 - s0) * (top - bottom + 200);
      addQuantity(ctx, waterproof, { workItem: "waterproofing.foundation", description: "Waterproofing coat to buried wall faces", section: "G", unit: "m²", value: round(wa * 1e-6, 3), formula: `${f2((s1 - s0) / 1000)} m × ${f3((top - bottom + 200) / 1000)} m = ${f3(wa * 1e-6)} m²`, inputs: { length: round(s1 - s0, 0), height: top - bottom + 200 }, status: "calculated" }, { assumptions: ["Outer face only; carried 200 mm below the beam top."], allowance: { rule: "Laps and wastage (example)", percent: null } });
      const pr = outer(half + 3 + 3);
      ctx.add({
        id: `found:protection:${wid}:${k}`, name: "Protection board over waterproofing", kind: "protection-board", category: "substructure", subcategory: "Protection", stage: 3, layer: "waterproofing", materialId: "protection-board",
        shapes: [alongLine(pr.a, pr.b, 6, bottom - 200, top - 100)], source: "schematic", parentId: waterproof.id, explode: { layerIndex: 3, dir: v3(nx, ny, 0) },
      });
      const dr = outer(half + 12 + 150);
      ctx.add({
        id: `found:drain-layer:${wid}:${k}`, name: "Drainage aggregate layer", kind: "protection-board", category: "substructure", subcategory: "Drainage layer", stage: 3, layer: "fill", materialId: "sand-layer",
        shapes: [alongLine(dr.a, dr.b, 300, bottom - 150, gz)], source: "schematic", parentId: waterproof.id, explode: { layerIndex: 4, dir: v3(nx, ny, 0) },
      });
    }
  }

  // --- Backfill around the foundations ----------------------------------
  for (const group of groups) {
    const r = { x0: group.rect.x0 - ASSUME.working, y0: group.rect.y0 - ASSUME.working, x1: group.rect.x1 + ASSUME.working, y1: group.rect.y1 + ASSUME.working };
    const z0 = group.topZ;
    const z1 = gz;
    const cx = group.columns[0]?.x ?? (group.rect.x0 + group.rect.x1) / 2;
    const strips: Shape[] = [];
    // Left and right of the column strip, and ends, leaving the pedestals standing clear.
    const pxs = group.columns.map((c) => [c.x - c.width / 2, c.x + c.width / 2]).sort((a, b) => a[0]! - b[0]!);
    const cy = group.columns[0]?.y ?? (group.rect.y0 + group.rect.y1) / 2;
    const half = (group.columns[0]?.depth ?? 300) / 2;
    strips.push(boxAt(r.x0, r.y0, z0, r.x1 - r.x0, cy - half - r.y0, z1 - z0), boxAt(r.x0, cy + half, z0, r.x1 - r.x0, r.y1 - (cy + half), z1 - z0));
    let x = r.x0;
    for (const [a, b] of pxs) { if (a! > x) strips.push(boxAt(x, cy - half, z0, a! - x, 2 * half, z1 - z0)); x = b!; }
    if (r.x1 > x) strips.push(boxAt(x, cy - half, z0, r.x1 - x, 2 * half, z1 - z0));
    const sid = group.id.replace(/[^\w+-]+/g, "-");
    const bf = ctx.add({
      id: `found:backfill:${sid}`, name: "Backfill (compacted in layers)", kind: "backfill", category: "earthworks", subcategory: "Backfill", stage: 3, layer: "fill", materialId: "spoil",
      shapes: strips, source: "schematic", sourceRef: group.id, grid: ctx.gridRef(ground.levelId, cx, cy, 1300), explode: { layerIndex: 5, dir: UP },
      note: "Placed in thin layers and compacted evenly on all sides once the concrete has gained strength.",
    });
    const pitVol = m3(r.x1 - r.x0, r.y1 - r.y0, gz - (group.bottomZ - ASSUME.blindingThickness));
    const fv = m3(group.rect.x1 - group.rect.x0, group.rect.y1 - group.rect.y0, group.thickness);
    const bv = m3(group.rect.x1 - group.rect.x0 + 200, group.rect.y1 - group.rect.y0 + 200, ASSUME.blindingThickness);
    const pedv = group.columns.reduce((s, c) => s + m3(c.width, c.depth, gz - group.topZ), 0);
    const backfill = pitVol - fv - bv - pedv;
    addQuantity(ctx, bf, { workItem: "earth.backfill", description: "Backfill and compaction around foundations", section: "B", unit: "m³", value: round(Math.max(0, backfill), 3), formula: `pit ${f3(pitVol)} − footing ${f3(fv)} − blinding ${f3(bv)} − pedestals below ground ${f3(pedv)} = ${f3(backfill)} m³`, inputs: { pit: round(pitVol, 3), footing: round(fv, 3), blinding: round(bv, 3), pedestals: round(pedv, 3) }, status: "assumed" }, { assumptions: ["Pit sides vertical; ground beams entering the pit are ignored here (conservative)."], exclusions: ["Imported fill"], allowance: { rule: "Compaction shrinkage (example)", percent: null } });
  }
  void ASSUME.floorBuildUp; void m2;
}
