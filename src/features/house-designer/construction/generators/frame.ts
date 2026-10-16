import { ASSUME, UP, dim, type Ctx, type LevelInfo } from "../context";
import { alongLine, box, boxAt, clipConvex, cyl, netVolumes, polygonArea, prism, prismOfShape, rectPoly, unionArea, v3, type P2, type Prism, type Shape } from "../geometry";
import { addQuantity, barBetween, concreteQuantity, f2, f3, formworkQuantity, hoopXY, hoopXZ, hoopYZ, m3, rebarQuantity, round, spaced } from "../helpers";
import { slabOpenings } from "../slab-openings";

/** Stage 5: the reinforced-concrete frame, storey by storey. */

type Hole = { id: string; x0: number; y0: number; x1: number; y1: number };

/** Split a horizontal bar line at the holes it crosses, keeping the parts outside them. */
function cutLine(lo: number, hi: number, fixed: number, axis: "x" | "y", holes: Hole[], margin = 0): [number, number][] {
  let parts: [number, number][] = [[lo, hi]];
  for (const h of holes) {
    const across = axis === "x" ? fixed > h.y0 - margin && fixed < h.y1 + margin : fixed > h.x0 - margin && fixed < h.x1 + margin;
    if (!across) continue;
    const a = (axis === "x" ? h.x0 : h.y0) - margin;
    const b = (axis === "x" ? h.x1 : h.y1) + margin;
    parts = parts.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e] as [number, number]] : ([[s, Math.min(e, a)], [Math.max(s, b), e]] as [number, number][]).filter(([x, y]) => y - x > 1)));
  }
  return parts;
}

export function pourXCut(ctx: Ctx): number {
  const xs = ctx.project.structuralGrid.filter((g) => g.levelId === ctx.ground?.levelId && g.axis === "x").map((g) => g.position).sort((a, b) => a - b);
  const mid = (ctx.bounds.minX + ctx.bounds.maxX) / 2;
  if (xs.length === 0) return mid;
  return xs.reduce((best, x) => (Math.abs(x - mid) < Math.abs(best - mid) - 1e-9 || (Math.abs(Math.abs(x - mid) - Math.abs(best - mid)) < 1e-9 && x > best) ? x : best), xs[0]!);
}

const halfPlane = (xcut: number, side: "west" | "east"): P2[] => (side === "west" ? rectPoly(-1e7, -1e7, xcut, 1e7) : rectPoly(xcut, -1e7, 1e7, 1e7));

export function generateFrame(ctx: Ctx): void {
  const cut = pourXCut(ctx);
  const outlineConvex = ctx.outline.length === 4;
  const approved = ctx.approved;
  const cover = ASSUME.rebarCover;

  for (const level of ctx.levels) {
    const L = level.index;
    const baseBeamPour = 2 + 3 * L;
    const columns = ctx.project.structuralColumns.filter((c) => c.levelId === level.levelId);
    const beams = ctx.project.structuralBeams.filter((b) => b.levelId === level.levelId);
    const nextFloor = ctx.levels[L + 1]?.floorZ;
    const clearH = level.soffitZ - level.floorZ;

    // Net volumes: columns whole, then each beam less what a column or an earlier beam holds.
    const colPrisms: Prism[] = columns.map((c) => prismOfShape(boxAt(c.x - c.width / 2, c.y - c.depth / 2, level.floorZ, c.width, c.depth, clearH))!);
    const beamPrisms: Prism[] = beams.map((b) => prismOfShape(alongLine(b.start, b.end, b.width, b.elevation, b.elevation + b.depth))!);
    const nets = netVolumes([...colPrisms, ...beamPrisms]);

    // --- Columns -----------------------------------------------------
    columns.forEach((col, i) => {
      const grid = ctx.gridRef(level.levelId, col.x, col.y);
      const sid = col.id.replace(/[^\w]+/g, "-");
      const concrete = ctx.add({
        id: `frame:${sid}`, name: `Column ${grid ?? ""} — ${level.name}`.replace("  ", " "), kind: "column", category: "frame", subcategory: "Columns", stage: 5, level, layer: "concrete", materialId: "concrete",
        shapes: [boxAt(col.x - col.width / 2, col.y - col.depth / 2, level.floorZ, col.width, col.depth, clearH)], source: "project", sourceRef: col.id, grid, pour: 2 + 3 * L - 1 + 1,
        dims: { length: dim(col.width, "mm", "measured"), width: dim(col.depth, "mm", "measured"), height: dim(round(clearH, 0), "mm", "calculated", "Floor to underside of the slab above"), volume: dim(round(nets[i]! * 1e-9, 4), "m³", "calculated") },
        explode: { layerIndex: 0, dir: UP },
        ...(L === 0 && i === 0 ? { label: { text: "Column", anchor: v3(col.x, col.y, level.floorZ + clearH / 2) } } : {}),
      });
      concreteQuantity(ctx, concrete, "concrete.column", "Columns", nets[i]! * 1e-9, `${f3(col.width / 1000)} × ${f3(col.depth / 1000)} × ${f3(clearH / 1000)} = ${f3(nets[i]! * 1e-9)} m³`, { width: col.width, depth: col.depth, height: round(clearH, 0) }, "calculated", ["Height is floor to underside of the slab above."]);
      // Reinforcement: main bars, stirrups, with a dense zone left to the joint component.
      const bar = ASSUME.mainBar;
      const off = cover + ASSUME.stirrupBar + bar / 2;
      const px = col.width / 2 - off;
      const py = col.depth / 2 - off;
      const zTop = nextFloor !== undefined ? nextFloor + 600 : level.soffitZ;
      const bars: Shape[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) bars.push(cyl(col.x + sx * px, col.y + sy * py, (level.floorZ + zTop) / 2, bar / 2, zTop - level.floorZ, "z"));
      if (col.width >= 400) for (const sx of [-1, 1]) bars.push(cyl(col.x + sx * px, col.y, (level.floorZ + zTop) / 2, bar / 2, zTop - level.floorZ, "z"));
      const mains = ctx.add({
        id: `frame:${sid}:bars`, name: `Column main bars (schematic) ${grid ?? ""} — ${level.name}`, kind: "column-bars", category: "frame", subcategory: "Reinforcement", stage: 5, level, layer: "reinforcement", materialId: "steel-bar",
        shapes: bars, repeated: { noun: "bar" }, source: "schematic", grid, parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 1, dir: UP },
        note: `Bars rise past the slab so the next lift can be lapped to them. Size, number and laps are for the structural drawings.`,
      });
      rebarQuantity(ctx, mains, "Column main bars", approved);
      const stirrups: Shape[] = [];
      const beamZone = Math.max(0, ...beams.filter((b) => Math.hypot(b.start.x - col.x, b.start.y - col.y) < 1 || Math.hypot(b.end.x - col.x, b.end.y - col.y) < 1).map((b) => b.depth));
      for (const z of spaced(level.floorZ + 75, level.soffitZ - beamZone - 50, ASSUME.stirrupSpacing)) stirrups.push(...hoopXY(col.x, col.y, z, col.width - 2 * cover, col.depth - 2 * cover, ASSUME.stirrupBar));
      const ties = ctx.add({
        id: `frame:${sid}:stirrups`, name: `Column stirrups (schematic) ${grid ?? ""} — ${level.name}`, kind: "column-stirrups", category: "frame", subcategory: "Reinforcement", stage: 5, level, layer: "reinforcement", materialId: "steel-bar",
        shapes: stirrups, repeated: { noun: "stirrup" }, source: "schematic", grid, parentId: concrete.id, explode: { layerIndex: 1, dir: UP },
      });
      rebarQuantity(ctx, ties, "Column stirrups", approved);
      if (beamZone > 0) {
        const joint: Shape[] = [];
        for (const z of spaced(level.soffitZ - beamZone + 40, level.soffitZ - 40, 75)) joint.push(...hoopXY(col.x, col.y, z, col.width - 2 * cover, col.depth - 2 * cover, ASSUME.stirrupBar));
        ctx.add({
          id: `frame:${sid}:joint`, name: `Beam–column joint ${grid ?? ""} — ${level.name}`, kind: "beam-column-joint", category: "frame", subcategory: "Joints", stage: 5, level, layer: "reinforcement", materialId: "steel-bar",
          shapes: joint, repeated: { noun: "joint stirrup" }, source: "schematic", grid, parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 1, dir: UP },
          note: "Closely spaced ties where beams frame into the column. The real detail is designed.",
        });
      }
      // Column formwork.
      const f = 18;
      const form = ctx.add({
        id: `frame:${sid}:form`, name: `Column formwork ${grid ?? ""} — ${level.name}`, kind: "column-formwork", category: "frame", subcategory: "Formwork", stage: 5, removedAfter: 5, level, layer: "formwork", materialId: "formwork",
        shapes: [boxAt(col.x - col.width / 2 - f, col.y - col.depth / 2 - f, level.floorZ, col.width + 2 * f, f, clearH), boxAt(col.x - col.width / 2 - f, col.y + col.depth / 2, level.floorZ, col.width + 2 * f, f, clearH), boxAt(col.x - col.width / 2 - f, col.y - col.depth / 2, level.floorZ, f, col.depth, clearH), boxAt(col.x + col.width / 2, col.y - col.depth / 2, level.floorZ, f, col.depth, clearH)],
        source: "schematic", grid, parentId: concrete.id, explode: { layerIndex: 3, dir: UP },
      });
      const fa = 2 * (col.width + col.depth) * clearH * 1e-6;
      formworkQuantity(ctx, form, "formwork.column", "Formwork to columns", fa, `perimeter ${f2((2 * (col.width + col.depth)) / 1000)} m × ${f3(clearH / 1000)} m = ${f3(fa)} m²`, { perimeter: 2 * (col.width + col.depth), height: round(clearH, 0) });
    });

    // --- Beams ---------------------------------------------------------
    beams.forEach((beam, bi) => {
      const net = nets[columns.length + bi]!;
      const len = Math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y);
      const ux = (beam.end.x - beam.start.x) / len;
      const uy = (beam.end.y - beam.start.y) / len;
      const nx = -uy;
      const ny = ux;
      const mid = { x: (beam.start.x + beam.end.x) / 2, y: (beam.start.y + beam.end.y) / 2 };
      const zone = baseBeamPour + (outlineConvex && mid.x > cut + 1 ? 1 : 0);
      const sid = beam.id.replace(/[^\w]+/g, "-");
      const a = ctx.gridRef(level.levelId, beam.start.x, beam.start.y);
      const b = ctx.gridRef(level.levelId, beam.end.x, beam.end.y);
      const concrete = ctx.add({
        id: `frame:${sid}`, name: `Beam ${a ?? ""}–${b ?? ""} — ${level.name}`, kind: "beam", category: "frame", subcategory: "Beams", stage: 5, level, layer: "concrete", materialId: "concrete",
        shapes: [alongLine(beam.start, beam.end, beam.width, beam.elevation, beam.elevation + beam.depth)], source: "project", sourceRef: beam.id, grid: a, pour: zone,
        dims: { length: dim(round(len, 0), "mm", "measured", "Centre to centre"), width: dim(beam.width, "mm", "measured"), height: dim(beam.depth, "mm", "measured", "Depth below the slab soffit"), volume: dim(round(net * 1e-9, 4), "m³", "calculated", "Net of columns") },
        explode: { layerIndex: 0, dir: UP },
      });
      concreteQuantity(ctx, concrete, "concrete.beam", "Beams (below the slab soffit)", net * 1e-9, `gross ${f3(m3(len, beam.width, beam.depth))} − inside columns = ${f3(net * 1e-9)} m³`, { length: round(len, 0), width: beam.width, depth: beam.depth }, "calculated", ["The beam hangs below the slab; no slab concrete is counted in it.", "Centre-to-centre length less the volume already in the columns."]);
      // Bars: two top, three bottom (illustration), stirrups.
      const bars: Shape[] = [];
      const bz = [beam.elevation + cover + 8 + 8, beam.elevation + beam.depth - cover - 8 - 8];
      const bx = beam.width / 2 - cover - 8 - 8;
      for (const z of bz) for (const o of z === bz[0] ? [-bx, 0, bx] : [-bx, bx]) bars.push(barBetween({ x: beam.start.x + nx * o + ux * 50, y: beam.start.y + ny * o + uy * 50 }, { x: beam.end.x + nx * o - ux * 50, y: beam.end.y + ny * o - uy * 50 }, z, 16));
      const bb = ctx.add({
        id: `frame:${sid}:bars`, name: `Beam bars (schematic) ${a ?? ""}–${b ?? ""} — ${level.name}`, kind: "beam-bars", category: "frame", subcategory: "Reinforcement", stage: 5, level, layer: "reinforcement", materialId: "steel-bar",
        shapes: bars, repeated: { noun: "bar" }, source: "schematic", grid: a, parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 1, dir: UP },
      });
      rebarQuantity(ctx, bb, "Beam bars", approved);
      const colHalf = 150;
      const stir: Shape[] = [];
      for (const s of spaced(colHalf + 60, len - colHalf - 60, ASSUME.stirrupSpacing)) {
        const cx = beam.start.x + ux * s;
        const cy = beam.start.y + uy * s;
        const cz = beam.elevation + beam.depth / 2;
        if (Math.abs(ux) > 0.999) stir.push(...hoopYZ(cx, cy, cz, beam.width - 2 * cover, beam.depth - 2 * cover, ASSUME.stirrupBar));
        else if (Math.abs(uy) > 0.999) stir.push(...hoopXZ(cx, cy, cz, beam.width - 2 * cover, beam.depth - 2 * cover, ASSUME.stirrupBar));
      }
      const bs = ctx.add({
        id: `frame:${sid}:stirrups`, name: `Beam stirrups (schematic) ${a ?? ""}–${b ?? ""} — ${level.name}`, kind: "beam-stirrups", category: "frame", subcategory: "Reinforcement", stage: 5, level, layer: "reinforcement", materialId: "steel-bar",
        shapes: stir, repeated: { noun: "stirrup" }, source: "schematic", grid: a, parentId: concrete.id, explode: { layerIndex: 1, dir: UP },
      });
      rebarQuantity(ctx, bs, "Beam stirrups", approved);
      // Formwork: soffit and both sides along the clear span.
      const f = 18;
      const clear = Math.max(0, len - 2 * colHalf);
      const p0 = { x: beam.start.x + ux * colHalf, y: beam.start.y + uy * colHalf };
      const p1 = { x: beam.end.x - ux * colHalf, y: beam.end.y - uy * colHalf };
      const side = (sgn: number): Shape => alongLine({ x: p0.x + nx * sgn * (beam.width / 2 + f / 2), y: p0.y + ny * sgn * (beam.width / 2 + f / 2) }, { x: p1.x + nx * sgn * (beam.width / 2 + f / 2), y: p1.y + ny * sgn * (beam.width / 2 + f / 2) }, f, beam.elevation - f, beam.elevation + beam.depth);
      const form = ctx.add({
        id: `frame:${sid}:form`, name: `Beam formwork ${a ?? ""}–${b ?? ""} — ${level.name}`, kind: "beam-formwork", category: "frame", subcategory: "Formwork", stage: 5, removedAfter: 5, level, layer: "formwork", materialId: "formwork",
        shapes: [alongLine(p0, p1, beam.width + 2 * f, beam.elevation - f, beam.elevation), side(1), side(-1)], source: "schematic", grid: a, parentId: concrete.id, explode: { layerIndex: 3, dir: UP },
      });
      const fa = (beam.width + 2 * beam.depth) * clear * 1e-6;
      formworkQuantity(ctx, form, "formwork.beam", "Formwork to beams (soffit and sides)", fa, `(${f3(beam.width / 1000)} + 2 × ${f3(beam.depth / 1000)}) × ${f2(clear / 1000)} = ${f3(fa)} m²`, { width: beam.width, depth: beam.depth, clear: round(clear, 0) }, "calculated", ["Clear span taken as centre length less one column width."]);
      // Props under the beam.
      const props: Shape[] = [];
      const propTop = beam.elevation - f;
      for (const s of spaced(colHalf + 350, len - colHalf - 350, 1000)) props.push(cyl(beam.start.x + ux * s, beam.start.y + uy * s, (level.floorZ + propTop) / 2, 30, propTop - level.floorZ, "z"));
      ctx.add({
        id: `frame:${sid}:props`, name: `Beam props ${a ?? ""}–${b ?? ""} — ${level.name}`, kind: "prop", category: "frame", subcategory: "Props", stage: 5, removedAfter: 5, level, layer: "props", materialId: "prop",
        shapes: props, repeated: { noun: "prop" }, source: "schematic", grid: a, parentId: form.id, explode: { layerIndex: 4, dir: UP },
      });
    });

    // --- The slab over this level (and the roof slab over the top one) -----
    const slabLevel = L + 1;
    const above = ctx.levels[slabLevel];
    const slabThickness = above ? above.slabThickness : ctx.project.roofs[0]?.thickness ?? level.slabThickness;
    const z0 = level.soffitZ;
    const z1 = z0 + slabThickness;
    const isRoof = !above;
    const holes: Hole[] = slabOpenings(ctx, slabLevel);
    const holePolys = holes.map((h) => rectPoly(h.x0, h.y0, h.x1, h.y1));
    const zones: { name: string; poly: P2[]; pour: number }[] = outlineConvex
      ? [{ name: "west zone", poly: clipConvex(ctx.outline, halfPlane(cut, "west")), pour: baseBeamPour }, { name: "east zone", poly: clipConvex(ctx.outline, halfPlane(cut, "east")), pour: baseBeamPour + 1 }].filter((z) => z.poly.length >= 3)
      : [{ name: "slab", poly: ctx.outline, pour: baseBeamPour }];
    const slabName = isRoof ? "Roof slab" : `Suspended slab — ${above!.name} floor`;
    const slabSource = isRoof ? "main-roof" : `${above!.levelId}:slab`;
    const slabId = isRoof ? "roof" : above!.levelId;
    // Slab concrete: net of any beam or column that rises into it (none do here: beams hang below the soffit).
    for (const zone of zones) {
      const zoneHoles = holePolys.filter((hp) => hp.every((p) => zone.poly.length && pointInZone(p, zone.poly)));
      const zoneHoleRects = holes.filter((h) => zoneHoles.some((hp) => Math.abs(hp[0]!.x - h.x0) < 1 && Math.abs(hp[0]!.y - h.y0) < 1));
      const gross = polygonArea(zone.poly);
      const holeArea = zoneHoleRects.reduce((s, h) => s + (h.x1 - h.x0) * (h.y1 - h.y0), 0);
      const netArea = gross - holeArea;
      const vol = netArea * slabThickness * 1e-9;
      const concrete = ctx.add({
        id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}`, name: `${slabName}${zones.length > 1 ? ` (${zone.name})` : ""}`, kind: "slab", category: "frame", subcategory: "Slabs", stage: 5, level, layer: "concrete", materialId: "concrete",
        shapes: [prism(zone.poly, z0, z1, zoneHoleRects.map((h) => rectPoly(h.x0, h.y0, h.x1, h.y1)))], source: "project", sourceRef: slabSource, pour: zone.pour, grid: null,
        dims: { thickness: dim(slabThickness, "mm", "measured"), area: dim(round(netArea * 1e-6, 2), "m²", "calculated", "Net of stair openings"), volume: dim(round(vol, 3), "m³", "calculated") },
        explode: { layerIndex: 0, dir: UP },
        ...(zone.name !== "east zone" ? { label: { text: slabName, anchor: v3((zone.poly[0]!.x + zone.poly[2]!.x) / 2, (zone.poly[0]!.y + zone.poly[2]!.y) / 2, z1) } } : {}),
      });
      concreteQuantity(ctx, concrete, "concrete.slab", isRoof ? "Roof slab" : "Suspended slabs", vol, `(${f2(gross * 1e-6)} m² − openings ${f2(holeArea * 1e-6)} m²) × ${f3(slabThickness / 1000)} m = ${f3(vol)} m³`, { gross: round(gross * 1e-6, 3), openings: round(holeArea * 1e-6, 3), thickness: slabThickness }, "calculated", ["Beams hang below the soffit and are counted in their own lines, so the slab is not reduced by them.", "Stair openings are deducted."]);
      // Reinforcement layers.
      const r = ASSUME.slabBar / 2;
      const b = polygonBoundsOf(zone.poly);
      const zb = z0 + cover + r;
      const bottom: Shape[] = [];
      for (const y of spaced(b.minY + cover, b.maxY - cover, ASSUME.slabSpacing)) for (const [s, e] of cutLine(b.minX + cover, b.maxX - cover, y, "x", zoneHoleRects, 0)) bottom.push(cyl((s + e) / 2, y, zb, r, e - s, "x"));
      for (const x of spaced(b.minX + cover, b.maxX - cover, ASSUME.slabSpacing)) for (const [s, e] of cutLine(b.minY + cover, b.maxY - cover, x, "y", zoneHoleRects, 0)) bottom.push(cyl(x, (s + e) / 2, zb + 2 * r, r, e - s, "y"));
      const bm = ctx.add({
        id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}:bottom`, name: `${slabName} bottom reinforcement (schematic)${zones.length > 1 ? ` — ${zone.name}` : ""}`, kind: "slab-bars-bottom", category: "frame", subcategory: "Reinforcement", stage: 5, level, layer: "reinforcement", materialId: "steel-mesh",
        shapes: bottom, repeated: { noun: "bar" }, source: "schematic", parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 1, dir: UP },
      });
      rebarQuantity(ctx, bm, `${slabName} bottom reinforcement`, approved);
      // Top bars over the supports only: short bars either side of every beam line.
      const topZ = z1 - cover - r;
      const top: Shape[] = [];
      const inZone = beams.filter((bb) => { const m = { x: (bb.start.x + bb.end.x) / 2, y: (bb.start.y + bb.end.y) / 2 }; return pointInZone(m, zone.poly) || pointOnZoneEdge(m, zone.poly); });
      for (const bb of inZone) {
        const horizontal = Math.abs(bb.start.y - bb.end.y) < 1;
        const lo = horizontal ? Math.min(bb.start.x, bb.end.x) : Math.min(bb.start.y, bb.end.y);
        const hi = horizontal ? Math.max(bb.start.x, bb.end.x) : Math.max(bb.start.y, bb.end.y);
        const fixed = horizontal ? bb.start.y : bb.start.x;
        for (const u of spaced(lo + 150, hi - 150, ASSUME.slabSpacing)) {
          if (horizontal) top.push(cyl(u, fixed, topZ, r, 1600, "y")); else top.push(cyl(fixed, u, topZ, r, 1600, "x"));
        }
      }
      const tm = ctx.add({
        id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}:top`, name: `${slabName} top reinforcement over supports (schematic)${zones.length > 1 ? ` — ${zone.name}` : ""}`, kind: "slab-bars-top", category: "frame", subcategory: "Reinforcement", stage: 5, level, layer: "reinforcement", materialId: "steel-mesh",
        shapes: top, repeated: { noun: "bar" }, source: "schematic", parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 2, dir: UP },
        note: "Top bars sit over the beams where a slab needs them. Their size and length come from the design.",
      });
      rebarQuantity(ctx, tm, `${slabName} top reinforcement`, approved);
      // Spacers under the bottom layer, chairs under the top bars.
      const spacers: Shape[] = [];
      for (const x of spaced(b.minX + 400, b.maxX - 400, 1000)) for (const y of spaced(b.minY + 400, b.maxY - 400, 1000)) if (!zoneHoleRects.some((h) => x > h.x0 - 200 && x < h.x1 + 200 && y > h.y0 - 200 && y < h.y1 + 200)) spacers.push(box(x, y, z0 + cover / 2, 50, 50, cover));
      const sp = ctx.add({
        id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}:spacers`, name: `Spacers — ${slabName}${zones.length > 1 ? ` (${zone.name})` : ""}`, kind: "spacer", category: "frame", subcategory: "Cover & chairs", stage: 5, level, layer: "reinforcement", materialId: "spacer",
        shapes: spacers, repeated: { noun: "spacer" }, source: "schematic", parentId: concrete.id, explode: { layerIndex: 1, dir: UP },
      });
      addQuantity(ctx, sp, { workItem: "steel.spacers", description: "Cover spacers under slab steel", section: "D", unit: "piece", value: spacers.length, formula: `${spacers.length} spacers at 1000 mm centres`, inputs: { spacing: 1000 }, status: "assumed" }, { assumptions: ["Spacing 1000 mm and 40 mm cover are example values."] });
      const chairs: Shape[] = [];
      for (const bb of inZone) {
        const horizontal = Math.abs(bb.start.y - bb.end.y) < 1;
        const lo = horizontal ? Math.min(bb.start.x, bb.end.x) : Math.min(bb.start.y, bb.end.y);
        const hi = horizontal ? Math.max(bb.start.x, bb.end.x) : Math.max(bb.start.y, bb.end.y);
        for (const u of spaced(lo + 400, hi - 400, 1000)) chairs.push(horizontal ? box(u, bb.start.y, (zb + topZ) / 2, 40, 40, topZ - zb - r) : box(bb.start.x, u, (zb + topZ) / 2, 40, 40, topZ - zb - r));
      }
      if (chairs.length) {
        const ch = ctx.add({
          id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}:chairs`, name: `Chairs for top steel — ${slabName}${zones.length > 1 ? ` (${zone.name})` : ""}`, kind: "spacer", category: "frame", subcategory: "Cover & chairs", stage: 5, level, layer: "reinforcement", materialId: "spacer",
          shapes: chairs, repeated: { noun: "chair" }, source: "schematic", parentId: concrete.id, explode: { layerIndex: 2, dir: UP },
        });
        addQuantity(ctx, ch, { workItem: "steel.chairs", description: "Chairs supporting top steel", section: "D", unit: "piece", value: chairs.length, formula: `${chairs.length} chairs at 1000 mm along the supports`, inputs: { spacing: 1000 }, status: "assumed" });
      }
      // Slab formwork: deck, edges, and the props that carry it.
      const deckZ0 = z0 - 18;
      const deckPoly = zone.poly;
      const edges: Shape[] = zone.poly.map((p, i) => alongLine(p, zone.poly[(i + 1) % zone.poly.length]!, 18, z0, z1));
      const form = ctx.add({
        id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}:form`, name: `Slab formwork deck — ${slabName}${zones.length > 1 ? ` (${zone.name})` : ""}`, kind: "slab-formwork", category: "frame", subcategory: "Formwork", stage: 5, removedAfter: 5, level, layer: "formwork", materialId: "formwork",
        shapes: [prism(deckPoly, deckZ0, z0, zoneHoleRects.map((h) => rectPoly(h.x0, h.y0, h.x1, h.y1))), ...edges], source: "schematic", parentId: concrete.id, explode: { layerIndex: 3, dir: UP },
      });
      // Soffit area exposed between the beams and columns.
      const clippedBeams = beams.map((bb) => beamRect(bb)).map((poly) => clipConvex(poly, ensureConvexCcw(zone.poly))).filter((p) => p.length >= 3);
      const clippedCols = columns.map((c) => clipConvex(rectPoly(c.x - c.width / 2, c.y - c.depth / 2, c.x + c.width / 2, c.y + c.depth / 2), ensureConvexCcw(zone.poly))).filter((p) => p.length >= 3);
      const covered = unionArea([...clippedBeams, ...clippedCols]);
      const soffit = Math.max(0, netArea - covered);
      const edgeLen = zone.name === "slab" ? polygonPerimeter(zone.poly) : polygonPerimeter(zone.poly) - (zones.length > 1 ? cutLength(zone.poly, cut) : 0);
      const holeEdge = zoneHoleRects.reduce((s, h) => s + 2 * ((h.x1 - h.x0) + (h.y1 - h.y0)), 0);
      const fa = (soffit + (edgeLen + holeEdge) * slabThickness) * 1e-6;
      formworkQuantity(ctx, form, "formwork.slab", "Formwork to slab soffit and edges", fa, `soffit ${f2(soffit * 1e-6)} m² + edges ${f2(((edgeLen + holeEdge) * slabThickness) * 1e-6)} m² = ${f2(fa)} m²`, { soffit: round(soffit * 1e-6, 3), edge: round(edgeLen + holeEdge, 0), thickness: slabThickness }, "calculated", ["Soffit is the slab underside between beams and columns; the beam soffits and sides are in the beam lines.", "The side at the construction joint is not formed here (it meets the next zone's concrete)."]);
      const props: Shape[] = [];
      for (const x of spaced(b.minX + 600, b.maxX - 600, 1200)) for (const y of spaced(b.minY + 600, b.maxY - 600, 1200)) {
        if (!pointInZone({ x, y }, zone.poly)) continue;
        const nearBeam = beams.some((bb) => distToSegment({ x, y }, bb.start, bb.end) < bb.width / 2 + 150);
        const nearCol = columns.some((c) => Math.abs(c.x - x) < c.width / 2 + 200 && Math.abs(c.y - y) < c.depth / 2 + 200);
        const nearHole = zoneHoleRects.some((h) => x > h.x0 - 300 && x < h.x1 + 300 && y > h.y0 - 300 && y < h.y1 + 300);
        if (nearBeam || nearCol || nearHole) continue;
        props.push(cyl(x, y, (level.floorZ + deckZ0) / 2, 30, deckZ0 - level.floorZ, "z"));
      }
      ctx.add({
        id: `frame:slab:${slabId}:${zone.name.replace(/\W+/g, "-")}:props`, name: `Props under slab — ${slabName}${zones.length > 1 ? ` (${zone.name})` : ""}`, kind: "prop", category: "frame", subcategory: "Props", stage: 5, removedAfter: 5, level, layer: "props", materialId: "prop",
        shapes: props, repeated: { noun: "prop" }, source: "schematic", parentId: form.id, explode: { layerIndex: 4, dir: UP },
        note: "Props stay until the slab has gained the strength the specification asks for.",
      });
    }
    // Construction joint between the two pour zones.
    if (zones.length > 1) {
      const b = polygonBoundsOf(ctx.outline);
      ctx.add({
        id: `frame:joint:${level.levelId}`, name: `Construction joint — ${level.name} slab`, kind: "construction-joint", category: "frame", subcategory: "Joints", stage: 5, level, layer: "marker", materialId: "marker",
        shapes: [boxAt(cut - 10, b.minY, level.soffitZ - 450, 20, b.maxY - b.minY, 450 + slabThickness + 20)], source: "schematic", explode: { layerIndex: 5, dir: UP },
        note: "A planned stop between two pours. It is placed where the designer allows.",
      });
    }
  }
  void (undefined as unknown as LevelInfo);
}

function pointInZone(p: P2, poly: P2[]): boolean {
  const b = polygonBoundsOf(poly);
  return p.x >= b.minX - 1e-6 && p.x <= b.maxX + 1e-6 && p.y >= b.minY - 1e-6 && p.y <= b.maxY + 1e-6;
}
const pointOnZoneEdge = pointInZone;

function polygonBoundsOf(poly: P2[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function polygonPerimeter(poly: P2[]) {
  return poly.reduce((s, p, i) => s + Math.hypot(poly[(i + 1) % poly.length]!.x - p.x, poly[(i + 1) % poly.length]!.y - p.y), 0);
}
function cutLength(poly: P2[], x: number) {
  const b = polygonBoundsOf(poly);
  return Math.abs(b.minX - x) < 1 || Math.abs(b.maxX - x) < 1 ? b.maxY - b.minY : b.maxY - b.minY;
}
function distToSegment(p: P2, a: P2, b: P2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function beamRect(b: { start: P2; end: P2; width: number }): P2[] {
  const dx = b.end.x - b.start.x;
  const dy = b.end.y - b.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (b.width / 2);
  const ny = (dx / len) * (b.width / 2);
  return [{ x: b.start.x - nx, y: b.start.y - ny }, { x: b.end.x - nx, y: b.end.y - ny }, { x: b.end.x + nx, y: b.end.y + ny }, { x: b.start.x + nx, y: b.start.y + ny }];
}
function ensureConvexCcw(poly: P2[]): P2[] {
  const sum = poly.reduce((s, a, i) => { const b = poly[(i + 1) % poly.length]!; return s + (a.x * b.y - b.x * a.y); }, 0);
  return sum < 0 ? [...poly].reverse() : poly;
}
