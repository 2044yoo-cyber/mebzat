import { ASSUME, dim, onWall, type Ctx, type OpeningFrame, type WallFrame } from "../context";
import { alongLine, cyl, netVolumes, prismOfShape, v3, type P2, type Prism, type Shape } from "../geometry";
import { addQuantity, concreteQuantity, f2, f3, formworkQuantity, rebarQuantity, round } from "../helpers";
import { outwardSign } from "./foundation";

/** Stage 7: blockwork between the columns, with lintels, sills, ties and mortar. */

const JOINT = 10;
const BLOCK = { hollow: { length: 390, height: 190, material: "block-hollow", label: "hollow concrete block" }, solid: { length: 390, height: 190, material: "block-solid", label: "solid concrete block" }, brick: { length: 215, height: 65, material: "brick", label: "clay brick" } } as const;
const SILL_THICKNESS = 75;
const SILL_BEARING = 100;
const TIE_SPACING = 600;

type Interval = { a: number; b: number; top: number };
type Excluded = { s0: number; s1: number; z0: number; z1: number };

/** Plan extent of a rectangle (a column) along a wall's centre line, or null when it does not touch the wall's band. */
function columnSpan(wall: WallFrame, column: { x: number; y: number; width: number; depth: number }): [number, number] | null {
  const corners: P2[] = [
    { x: column.x - column.width / 2, y: column.y - column.depth / 2 }, { x: column.x + column.width / 2, y: column.y - column.depth / 2 },
    { x: column.x + column.width / 2, y: column.y + column.depth / 2 }, { x: column.x - column.width / 2, y: column.y + column.depth / 2 },
  ];
  const ss = corners.map((p) => (p.x - wall.start.x) * wall.ux + (p.y - wall.start.y) * wall.uy);
  const ns = corners.map((p) => (p.x - wall.start.x) * wall.nx + (p.y - wall.start.y) * wall.ny);
  const half = wall.thickness / 2;
  if (Math.max(...ns) <= -half + 1 || Math.min(...ns) >= half - 1) return null;
  const lo = Math.min(...ss);
  const hi = Math.max(...ss);
  if (hi <= 1 || lo >= wall.length - 1) return null;
  return [lo, hi];
}

/**
 * How far a wall's end stops short of (positive) or runs past (negative) the
 * wall it meets, so that no block is built twice where walls join:
 * - a wall that ends on the face of another butts against it;
 * - a wall that continues end to end with another runs straight through, and
 *   what meets it butts;
 * - at a plain corner the earlier wall runs to the outer face and the later one butts.
 */
function endTrim(ctx: Ctx, wall: WallFrame, atStart: boolean): number {
  const p = atStart ? wall.start : wall.end;
  type Touch = { wall: WallFrame; interior: boolean; parallel: boolean };
  const touches: Touch[] = [];
  for (const other of ctx.wallsOf(wall.levelId)) {
    if (other.id === wall.id) continue;
    const rel = { x: p.x - other.start.x, y: p.y - other.start.y };
    const along = rel.x * other.ux + rel.y * other.uy;
    const across = rel.x * other.nx + rel.y * other.ny;
    if (Math.abs(across) > 5) continue;
    const interior = along > 5 && along < other.length - 5;
    const atEnd = Math.abs(along) <= 5 || Math.abs(along - other.length) <= 5;
    if (!interior && !atEnd) continue;
    touches.push({ wall: other, interior, parallel: Math.abs(wall.ux * other.ux + wall.uy * other.uy) > 0.999 });
  }
  const across = touches.filter((t) => !t.parallel);
  if (across.length === 0) return 0;
  const through = across.find((t) => t.interior);
  if (through) return through.wall.thickness / 2;
  if (touches.some((t) => t.parallel)) return 0; // this wall is half of a straight run; the others butt against it
  const pairRun = across.filter((t, i) => across.some((u, j) => j !== i && Math.abs(t.wall.ux * u.wall.ux + t.wall.uy * u.wall.uy) > 0.999));
  if (pairRun.length >= 2) return Math.max(...pairRun.map((t) => t.wall.thickness)) / 2;
  const other = across[0]!.wall;
  return wall.id < other.id ? -other.thickness / 2 : other.thickness / 2;
}

export function generateMasonry(ctx: Ctx): void {
  const blockType = ctx.options.blockType;
  const spec = BLOCK[blockType];
  const rules = ctx.rules;
  let labelled = false;
  for (const level of ctx.levels) {
    const columns = ctx.project.structuralColumns.filter((c) => c.levelId === level.levelId);
    const beams = ctx.project.structuralBeams.filter((b) => b.levelId === level.levelId);
    for (const wall of ctx.wallsOf(level.levelId)) {
      const wid = wall.id.replace(/[^\w]+/g, "-");
      const base = level.floorZ;
      const startTrim = endTrim(ctx, wall, true);
      const endTrimmed = endTrim(ctx, wall, false);
      // A negative trim extends the wall past its end; a positive one shortens it.
      const from = startTrim;
      const to = wall.length - endTrimmed;
      const cuts = columns.map((c) => columnSpan(wall, c)).filter((x): x is [number, number] => x !== null).sort((a, b) => a[0] - b[0]);
      const intervals: Interval[] = [];
      let cursor = from;
      const pushInterval = (a: number, b: number) => {
        if (b - a < 60) return;
        const top = level.soffitZ;
        intervals.push({ a, b, top });
      };
      for (const [c0, c1] of cuts) {
        if (c0 > cursor) pushInterval(cursor, Math.min(c0, to));
        cursor = Math.max(cursor, c1);
      }
      if (cursor < to) pushInterval(cursor, to);
      if (intervals.length === 0) continue;

      // Openings: the void, the lintel above it, the sill below a window.
      const lintelDepth = ASSUME.lintelDepth;
      const bearing = ASSUME.lintelBearing;
      const excluded: Excluded[] = [];
      // Beams over the wall, collinear or crossing: the wall stops under them.
      const ceilings: Excluded[] = [];
      for (const beam of beams) {
        const pts = [beam.start, beam.end];
        const dx = beam.end.x - beam.start.x;
        const dy = beam.end.y - beam.start.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        const bx = dx / len;
        const by = dy / len;
        const corners = pts.flatMap((q) => [-1, 1].map((sign) => ({ x: q.x - by * sign * (beam.width / 2), y: q.y + bx * sign * (beam.width / 2) })));
        const ss = corners.map((q) => (q.x - wall.start.x) * wall.ux + (q.y - wall.start.y) * wall.uy);
        const ns = corners.map((q) => (q.x - wall.start.x) * wall.nx + (q.y - wall.start.y) * wall.ny);
        if (Math.max(...ns) <= -wall.thickness / 2 + 1 || Math.min(...ns) >= wall.thickness / 2 - 1) continue;
        ceilings.push({ s0: Math.min(...ss), s1: Math.max(...ss), z0: beam.elevation, z1: level.soffitZ + 1 });
      }
      const topAt = (a: number, b: number) => Math.min(level.soffitZ, ...ceilings.filter((c) => c.s0 < b && c.s1 > a).map((c) => c.z0));
      const lintels: { opening: OpeningFrame; a: number; b: number; z0: number; z1: number }[] = [];
      const sills: { opening: OpeningFrame; a: number; b: number; z0: number; z1: number }[] = [];
      for (const opening of wall.openings) {
        const host = intervals.find((iv) => opening.s1 > iv.a && opening.s0 < iv.b);
        if (!host) continue;
        const z0 = base + opening.z0;
        excluded.push({ s0: Math.max(opening.s0, host.a), s1: Math.min(opening.s1, host.b), z0, z1: base + opening.z1 });
        const la = Math.max(host.a, opening.s0 - bearing);
        const lb = Math.min(host.b, opening.s1 + bearing);
        const lz0 = base + opening.z1;
        const lz1 = Math.min(topAt(la, lb), lz0 + lintelDepth);
        if (lz1 - lz0 > 20) {
          lintels.push({ opening, a: la, b: lb, z0: lz0, z1: lz1 });
          excluded.push({ s0: la, s1: lb, z0: lz0, z1: lz1 });
        }
        if (opening.kind === "window" && opening.z0 > SILL_THICKNESS + 100) {
          const sa = Math.max(host.a, opening.s0 - SILL_BEARING);
          const sb = Math.min(host.b, opening.s1 + SILL_BEARING);
          sills.push({ opening, a: sa, b: sb, z0: base + opening.z0 - SILL_THICKNESS, z1: base + opening.z0 });
          excluded.push({ s0: sa, s1: sb, z0: base + opening.z0 - SILL_THICKNESS, z1: base + opening.z0 });
        }
      }

      // Blocks, course by course, in running bond; the free runs of each course are found from what is excluded.
      const course = blockType === "brick" ? 75 : ASSUME.blockCourse;
      const pitch = spec.length + JOINT;
      const shapes: Shape[] = [];
      let fullPieces = 0;
      let cutPieces = 0;
      const placeBox = (sa: number, sb: number, z0: number, z1: number, thickness: number) => {
        const p0 = onWall(wall, sa);
        const p1 = onWall(wall, sb);
        shapes.push(alongLine(p0, p1, thickness, z0, z1));
      };
      for (const iv of intervals) {
        const usable = iv.top - base;
        const nCourses = Math.floor((usable + JOINT) / course);
        const lastTop = base + nCourses * course - JOINT;
        for (let c = 0; c < nCourses; c += 1) {
          const z0 = base + c * course;
          let z1 = z0 + (course - JOINT);
          if (c === nCourses - 1) z1 = Math.min(z1, lastTop);
          const free: [number, number][] = [[iv.a, iv.b]];
          let runs = free;
          for (const ex of excluded) {
            if (ex.z1 <= z0 + 0.5 || ex.z0 >= z1 - 0.5) continue;
            runs = runs.flatMap(([ra, rb]) => (ex.s1 <= ra || ex.s0 >= rb ? [[ra, rb] as [number, number]] : ([[ra, Math.min(rb, ex.s0)], [Math.max(ra, ex.s1), rb]] as [number, number][]).filter(([p, q]) => q - p > 1)));
          }
          // Under a beam the course is cut to the beam's soffit, or left out when little would remain.
          const stops = [...new Set([iv.a, iv.b, ...ceilings.flatMap((c) => [c.s0, c.s1])])].filter((x) => x >= iv.a && x <= iv.b).sort((p, q) => p - q);
          runs = runs.flatMap(([ra, rb]) => {
            const cuts2 = [ra, ...stops.filter((x) => x > ra + 1 && x < rb - 1), rb];
            return cuts2.slice(0, -1).map((x, i) => [x, cuts2[i + 1]!] as [number, number]);
          });
          for (const [ra, rb] of runs) {
            const zTop = Math.min(z1, topAt(ra, rb) - JOINT);
            if (zTop - z0 < 40) continue;
            if (blockType === "brick") {
              placeBox(ra, rb, z0, zTop, wall.thickness);
              fullPieces += 1;
              continue;
            }
            const offset = c % 2 === 0 ? 0 : pitch / 2;
            let p = Math.floor((ra - offset) / pitch) * pitch + offset;
            while (p < rb - 1) {
              const a = Math.max(p, ra);
              const b = Math.min(p + spec.length, rb);
              if (b - a > 20) {
                placeBox(a, b, z0, zTop, wall.thickness);
                if (b - a >= spec.length - 1) fullPieces += 1; else cutPieces += 1;
              }
              p += pitch;
            }
          }
        }
      }

      // Mortar behind the blocks: the same solid, a little thinner, visible through the joints.
      const cells = cellsOf(intervals, [...excluded, ...ceilings], base);
      const mortar: Shape[] = cells.map((cell) => alongLine(onWall(wall, cell.s0), onWall(wall, cell.s1), Math.max(40, wall.thickness - 2 * JOINT), cell.z0, cell.z1));
      const geometricArea = cells.reduce((sum, cell) => sum + (cell.s1 - cell.s0) * (cell.z1 - cell.z0), 0) * 1e-6;
      const openingsOfWall = wall.openings.filter((o) => intervals.some((iv) => o.s1 > iv.a && o.s0 < iv.b));
      const deducted = (o: OpeningFrame) => rules.openingDeduction === "all" || (rules.openingDeduction === "over-threshold" && (o.width * o.height) * 1e-6 > rules.openingThresholdM2);
      const keptOpenings = openingsOfWall.filter((o) => !deducted(o));
      const keptArea = keptOpenings.reduce((sum, o) => sum + (o.width * o.height) * 1e-6, 0);
      const netArea = geometricArea + keptArea;
      const leaves = blockType === "brick" ? Math.max(1, Math.round(wall.thickness / 102.5)) : 1;
      const perM2 = (1e6 / (pitch * (blockType === "brick" ? 75 : course))) * leaves;
      const blocks = netArea * perM2;
      const out = outwardSign(wall);
      const dir = v3(wall.nx * (out === 0 ? 1 : -out), wall.ny * (out === 0 ? 1 : -out), 0);
      const room = wall.left && wall.right ? `${wall.left} / ${wall.right}` : wall.left ?? wall.right;
      const top = Math.max(...intervals.map((iv) => topAt(iv.a, iv.b)));
      const mid = onWall(wall, wall.length / 2);
      const grid = ctx.gridRef(level.levelId, mid.x, mid.y, 400) ?? (Math.abs(wall.uy) < 0.01 ? ctx.gridSpanY(level.levelId, wall.start.y) : ctx.gridSpanX(level.levelId, wall.start.x));
      const wallComp = ctx.add({
        id: `masonry:${wid}`, name: `${wall.exterior ? "External" : "Internal"} wall — ${level.name}${room ? ` (${room})` : ""}`, kind: "wall-blocks", category: "masonry", subcategory: wall.exterior ? "External walls" : "Internal walls", stage: 7, level,
        layer: "masonry", materialId: spec.material, shapes, repeated: { noun: blockType === "brick" ? "course" : "block", perInstanceMassKg: blockType === "brick" ? undefined : blockType === "solid" ? 18 : 12 },
        source: "project", sourceRef: wall.id, room, grid, explode: { layerIndex: 0, dir },
        dims: { length: dim(round(wall.length, 0), "mm", "measured"), thickness: dim(wall.thickness, "mm", "measured"), height: dim(round(top - base, 0), "mm", "calculated", "Floor to underside of the beam or slab above"), area: dim(round(netArea, 2), "m²", "calculated", "Net of openings by the stated rule") },
        ...(!labelled && level.index === 0 && wall.exterior ? { label: { text: "Blockwork wall", anchor: v3(mid.x, mid.y, base + 1500) } } : {}),
        note: blockType === "hollow" ? "Hollow blocks are drawn as solid boxes; the cores are not modelled." : undefined,
      });
      labelled = labelled || (level.index === 0 && wall.exterior);
      const blockNote = `${spec.label} ${spec.length} × ${spec.height} mm, ${JOINT} mm joints, running bond`;
      addQuantity(ctx, wallComp, {
        workItem: "masonry.wall-area", description: `Blockwork wall area (${spec.label})`, section: "F", unit: "m²", value: round(netArea, 3),
        formula: `${f2(geometricArea)} m² (wall between columns, less openings, lintel zones and sills)${keptArea > 0 ? ` + ${f2(keptArea)} m² of openings not deducted by the rule "${rules.openingDeduction}"` : ""} = ${f2(netArea)} m²`,
        inputs: { length: round(wall.length, 0), height: round(top - base, 0), thickness: wall.thickness, openings: openingsOfWall.length, rule: rules.openingDeduction }, status: "calculated",
      }, { assumptions: [`Openings over ${rules.openingThresholdM2} m² are deducted (rule: ${rules.openingDeduction}).`, "Concrete columns, beams, lintels and sills are measured in their own items and removed from the masonry."], allowance: null });
      addQuantity(ctx, wallComp, {
        workItem: "masonry.blocks", description: `Blocks — ${spec.label}`, section: "F", unit: "piece", value: round(blocks, 1),
        formula: `${f2(netArea)} m² × ${leaves > 1 ? `${leaves} leaves × ` : ""}1 / ((${spec.length} + ${JOINT}) × (${spec.height} + ${JOINT}) mm) = ${f2(netArea)} × ${f2(perM2)} per m² = ${f2(blocks)} pieces`,
        inputs: { area: round(netArea, 3), perM2: round(perM2, 3), blockType, placedFull: fullPieces, placedCut: cutPieces }, status: "assumed",
      }, { allowance: { rule: "Breakage and cutting waste (example assumption)", percent: rules.allowances.blocks }, assumptions: [blockNote, "Walls are one block thick; the placed blocks in 3D are an illustration, the count comes from the area."], exclusions: ["Mortar", "Wall ties"] });
      const blockVolume = spec.length * spec.height * (blockType === "brick" ? wall.thickness / leaves : wall.thickness) * 1e-9;
      const mortarVolume = Math.max(0, netArea * (wall.thickness / 1000) - blocks * blockVolume);
      const mortarComp = ctx.add({
        id: `masonry:${wid}:mortar`, name: `Mortar bedding — ${level.name}${room ? ` (${room})` : ""}`, kind: "mortar", category: "masonry", subcategory: "Mortar", stage: 7, level, layer: "masonry", materialId: "mortar",
        shapes: mortar, repeated: { noun: "panel" }, source: "schematic", sourceRef: wall.id, room, grid, parentId: wallComp.id, explode: { layerIndex: 1, dir },
        dims: { volume: dim(round(mortarVolume, 3), "m³", "assumed") },
      });
      addQuantity(ctx, mortarComp, {
        workItem: "masonry.mortar", description: "Mortar for joints", section: "F", unit: "m³", value: round(mortarVolume, 3),
        formula: `${f2(netArea)} m² × ${f3(wall.thickness / 1000)} m − ${f2(blocks)} blocks × ${f3(blockVolume * 1000)} L = ${f3(mortarVolume)} m³`,
        inputs: { area: round(netArea, 3), thickness: wall.thickness, blocks: round(blocks, 1) }, status: "assumed",
      }, { allowance: { rule: "Waste and droppings (example assumption)", percent: 10 }, assumptions: ["Joints bedded over the full wall thickness; hollow blocks with face-shell bedding need less."] });

      // Wall ties where the wall meets a column: starter bars every 600 mm of height.
      const tieShapes: Shape[] = [];
      for (const iv of intervals) {
        for (const [edge, sign] of [[iv.a, 1], [iv.b, -1]] as const) {
          const atColumn = cuts.some(([c0, c1]) => Math.abs(c1 - edge) < 2 && sign === 1) || cuts.some(([c0]) => Math.abs(c0 - edge) < 2 && sign === -1);
          if (!atColumn) continue;
          for (let z = base + 300; z < topAt(iv.a, iv.b) - 150; z += TIE_SPACING) {
            const q = onWall(wall, edge + sign * 200);
            tieShapes.push(wall.ux !== 0 && Math.abs(wall.ux) > 0.5 ? cyl(q.x, q.y, z, 5, 400, "x") : cyl(q.x, q.y, z, 5, 400, "y"));
          }
        }
      }
      if (tieShapes.length) {
        const ties = ctx.add({
          id: `masonry:${wid}:ties`, name: `Starter bars to columns — ${level.name}`, kind: "wall-tie", category: "masonry", subcategory: "Ties", stage: 7, level, layer: "reinforcement", materialId: "wall-tie",
          shapes: tieShapes, repeated: { noun: "tie" }, source: "schematic", sourceRef: wall.id, room, parentId: wallComp.id, explode: { layerIndex: 2, dir },
          note: "Bar size and spacing are examples; the designer specifies the ties.",
        });
        addQuantity(ctx, ties, { workItem: "masonry.ties", description: "Wall ties / starter bars at columns", section: "F", unit: "piece", value: tieShapes.length, formula: `${tieShapes.length} ties at ${TIE_SPACING} mm vertical spacing on each column face`, inputs: { spacing: TIE_SPACING, count: tieShapes.length }, status: "assumed" }, { allowance: { rule: "Cutting waste (example)", percent: 5 } });
      }

      // Lintels, counted once and net of one another.
      if (lintels.length) {
        const prisms: Prism[] = lintels.map((l) => prismOfShape(alongLine(onWall(wall, l.a), onWall(wall, l.b), wall.thickness, l.z0, l.z1))!);
        const nets = netVolumes(prisms);
        lintels.forEach((l, i) => {
          const v = nets[i]! * 1e-9;
          const lc = ctx.add({
            id: `masonry:${wid}:lintel:${l.opening.id.replace(/[^\w]+/g, "-")}`, name: `Lintel over ${l.opening.kind} ${l.opening.ordinal + 1} — ${level.name}`, kind: "lintel", category: "masonry", subcategory: "Lintels", stage: 7, level,
            layer: "concrete", materialId: "lintel", shapes: [alongLine(onWall(wall, l.a), onWall(wall, l.b), wall.thickness, l.z0, l.z1)], source: "project", sourceRef: l.opening.id, room, parentId: wallComp.id,
            explode: { layerIndex: 3, dir }, pour: 0,
            dims: { length: dim(round(l.b - l.a, 0), "mm", "calculated", `Opening + ${bearing} mm bearing each side`), thickness: dim(wall.thickness, "mm", "measured"), height: dim(round(l.z1 - l.z0, 0), "mm", "assumed"), volume: dim(round(v, 4), "m³", "calculated") },
          });
          concreteQuantity(ctx, lc, "concrete.lintel", "Lintels", v, `${f3((l.b - l.a) / 1000)} m × ${f3(wall.thickness / 1000)} m × ${f3((l.z1 - l.z0) / 1000)} m = ${f3(v)} m³`, { length: round(l.b - l.a, 0), thickness: wall.thickness, depth: round(l.z1 - l.z0, 0) }, "calculated", [`Depth ${ASSUME.lintelDepth} mm and bearing ${bearing} mm are example values; the designer sizes the lintel.`]);
          const fa = ((l.b - l.a) * (wall.thickness + 2 * (l.z1 - l.z0))) * 1e-6;
          formworkQuantity(ctx, lc, "formwork.lintel", "Formwork to lintels (soffit and sides)", fa, `(${f3(wall.thickness / 1000)} + 2 × ${f3((l.z1 - l.z0) / 1000)}) × ${f3((l.b - l.a) / 1000)} = ${f3(fa)} m²`, { length: round(l.b - l.a, 0) }, "calculated");
          rebarQuantity(ctx, lc, "Lintel reinforcement", ctx.approved);
        });
      }
      sills.forEach((sl) => {
        const v = (sl.b - sl.a) * wall.thickness * (sl.z1 - sl.z0) * 1e-9;
        const comp = ctx.add({
          id: `masonry:${wid}:sill:${sl.opening.id.replace(/[^\w]+/g, "-")}`, name: `Window sill ${sl.opening.ordinal + 1} — ${level.name}`, kind: "sill", category: "masonry", subcategory: "Sills", stage: 7, level,
          layer: "concrete", materialId: "lintel", shapes: [alongLine(onWall(wall, sl.a), onWall(wall, sl.b), wall.thickness, sl.z0, sl.z1)], source: "project", sourceRef: sl.opening.id, room, parentId: wallComp.id, explode: { layerIndex: 4, dir },
          dims: { length: dim(round(sl.b - sl.a, 0), "mm", "calculated"), thickness: dim(SILL_THICKNESS, "mm", "assumed"), volume: dim(round(v, 4), "m³", "calculated") },
        });
        concreteQuantity(ctx, comp, "concrete.sill", "Window sills", v, `${f3((sl.b - sl.a) / 1000)} m × ${f3(wall.thickness / 1000)} m × ${f3(SILL_THICKNESS / 1000)} m = ${f3(v)} m³`, { length: round(sl.b - sl.a, 0), thickness: wall.thickness }, "assumed", ["Sill thickness is an example."]);
      });
    }
  }
}

/** The rectangles (along the wall, upward) that remain solid once the excluded regions are taken out of each interval. */
function cellsOf(intervals: Interval[], excluded: Excluded[], base: number): Excluded[] {
  const cells: Excluded[] = [];
  for (const iv of intervals) {
    const xs = [iv.a, iv.b, ...excluded.flatMap((e) => [e.s0, e.s1])].filter((x) => x >= iv.a - 1e-6 && x <= iv.b + 1e-6).sort((p, q) => p - q);
    const zs = [base, iv.top, ...excluded.flatMap((e) => [e.z0, e.z1])].filter((z) => z >= base - 1e-6 && z <= iv.top + 1e-6).sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 1) {
      if (xs[i + 1]! - xs[i]! < 1) continue;
      for (let j = 0; j + 1 < zs.length; j += 1) {
        if (zs[j + 1]! - zs[j]! < 1) continue;
        const cx = (xs[i]! + xs[i + 1]!) / 2;
        const cz = (zs[j]! + zs[j + 1]!) / 2;
        if (excluded.some((e) => cx > e.s0 && cx < e.s1 && cz > e.z0 && cz < e.z1)) continue;
        cells.push({ s0: xs[i]!, s1: xs[i + 1]!, z0: zs[j]!, z1: zs[j + 1]! });
      }
    }
  }
  return cells;
}
