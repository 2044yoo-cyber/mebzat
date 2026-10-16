import { ASSUME, type Ctx, type LevelInfo } from "../context";
import { alongLine, type P2, type Shape } from "../geometry";
import { counterClockwise } from "../region";
import { slabCastOutline } from "../slab-cast";
import { balconyFrame } from "./balcony";

/**
 * The faces of the frame, for the render and the paint.
 *
 * The columns, the edge beams and the edge of every slab are cast flush with one another, standing a little proud of the blockwork between them, so the
 * outside of a finished building is the blockwork rendered and the frame rendered, in the same coats. The walls' own faces are drawn with the walls
 * (external.ts); these are the rest: each storey's column faces from the floor to the underside of the beams, and the band of beam and slab edge above
 * them up to the floor over. Nothing is drawn where a balcony is carried out from the slab (it has its own render), except the beam below its soffit.
 */

/** The coats on the outside, one on another: base, final (with the extra a weatherproof mix needs) and paint. */
export const EXTERNAL_COATS = [
  { id: "base", name: "External plaster, base coat", material: "plaster-base", t: ASSUME.plasterBase, workItem: "plaster.external-base", desc: "External plaster base coat", section: "J" as const },
  { id: "final", name: "External plaster, final coat", material: "plaster-final", t: ASSUME.plasterFinal + ASSUME.externalPlasterExtra, workItem: "plaster.external-final", desc: "External plaster final coat", section: "J" as const },
  { id: "paint", name: "External paint", material: "paint-ext", t: ASSUME.paint, workItem: "paint.external", desc: "Exterior masonry paint", section: "M" as const },
];

/** Skins along the edges of a polygon, counter-clockwise, `offset` out from each edge (or in, with `inward`) and `thick` thick, from `z0` to `z1`. */
export function edgeSkins(poly: P2[], offset: number, thick: number, z0: number, z1: number, inward = false): Shape[] {
  const ring = counterClockwise(poly);
  const out: Shape[] = [];
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1) return;
    const shift = (inward ? -1 : 1) * (offset + thick / 2);
    // To the right of the direction of travel is outward for a counter-clockwise polygon.
    const nx = ((q.y - p.y) / len) * shift;
    const ny = (-(q.x - p.x) / len) * shift;
    out.push(alongLine({ x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }, thick, z0, z1));
  });
  return out;
}

/** The part of the cast outline's edge `p`→`q` a balcony takes over, as [from, to] along it, mm. */
function balconyGaps(ctx: Ctx, level: LevelInfo, p: P2, q: P2): { s0: number; s1: number; soffit: number }[] {
  const above = ctx.levels[level.index + 1];
  if (!above) return [];
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
  const out: { s0: number; s1: number; soffit: number }[] = [];
  for (const balcony of ctx.project.balconies.filter((b) => b.levelId === above.levelId)) {
    const f = balconyFrame(ctx, balcony, level.levelId);
    if (f.tip - f.edge < 300 || f.width < 600) continue;
    if (Math.abs(d.x * f.u.x + d.y * f.u.y) < 0.999) continue;
    // The balcony's slab begins at the edge as cast: this is the edge it begins at.
    if (Math.abs((p.x - f.root.x) * f.out.x + (p.y - f.root.y) * f.out.y - f.edge) > 2) continue;
    const centre = (f.root.x - p.x) * d.x + (f.root.y - p.y) * d.y;
    out.push({ s0: centre - f.width / 2, s1: centre + f.width / 2, soffit: f.bottom });
  }
  return out.sort((a, b) => a.s0 - b.s0);
}

/**
 * The skins on the frame of one storey: `offset` out from the faces (the coats under it) and `thick` thick. The column faces run from the floor up to the
 * underside of the beams, the band above them from there to the floor over.
 */
export function frameFaces(ctx: Ctx, level: LevelInfo, offset: number, thick: number): Shape[] {
  const columns = ctx.project.structuralColumns.filter((c) => c.levelId === level.levelId);
  const beams = ctx.project.structuralBeams.filter((b) => b.levelId === level.levelId);
  const beamBottom = level.soffitZ - Math.max(0, ...beams.map((b) => b.depth));
  const cast = counterClockwise(slabCastOutline(ctx, level.levelId));
  const out: Shape[] = [];

  // The band: the edge beams and the edge of the slab over them, along every edge of the slab as cast.
  cast.forEach((p, i) => {
    const q = cast[(i + 1) % cast.length]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1) return;
    const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
    const nx = (q.y - p.y) / len;
    const ny = -(q.x - p.x) / len;
    const at = (s: number, z: number): { a: P2; z: number } => ({ a: { x: p.x + d.x * s + nx * (offset + thick / 2), y: p.y + d.y * s + ny * (offset + thick / 2) }, z });
    const piece = (s0: number, s1: number, z0: number, z1: number) => {
      if (s1 - s0 < 1 || z1 - z0 < 1) return;
      out.push(alongLine(at(s0, z0).a, at(s1, z0).a, thick, z0, z1));
    };
    let cursor = 0;
    for (const gap of balconyGaps(ctx, level, p, q)) {
      piece(cursor, Math.max(cursor, gap.s0), beamBottom, level.topZ);
      // Below the balcony's soffit the beam is bare.
      piece(Math.max(0, gap.s0), Math.min(len, gap.s1), beamBottom, gap.soffit);
      cursor = Math.max(cursor, gap.s1);
    }
    piece(cursor, len, beamBottom, level.topZ);
  });

  // The columns standing on the outline, the faces that look outward, from the floor to the beams.
  const ring = counterClockwise(ctx.outline);
  for (const col of columns) {
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1) return;
      const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
      const nx = (q.y - p.y) / len;
      const ny = -(q.x - p.x) / len;
      // On this edge, within a millimetre of its line and between its ends.
      const across = (col.x - p.x) * nx + (col.y - p.y) * ny;
      const along = (col.x - p.x) * d.x + (col.y - p.y) * d.y;
      if (Math.abs(across) > 1 || along < -1 || along > len + 1) return;
      const ha = Math.abs(d.x) * (col.width / 2) + Math.abs(d.y) * (col.depth / 2);
      const hp = Math.abs(nx) * (col.width / 2) + Math.abs(ny) * (col.depth / 2);
      const shift = hp + offset + thick / 2;
      const centre = { x: col.x + nx * shift, y: col.y + ny * shift };
      out.push(alongLine({ x: centre.x - d.x * ha, y: centre.y - d.y * ha }, { x: centre.x + d.x * ha, y: centre.y + d.y * ha }, thick, level.floorZ, beamBottom));
    });
  }
  return out;
}
