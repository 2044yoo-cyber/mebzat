import { ASSUME, type Ctx } from "./context";
import { dist, type P2 } from "./geometry";

/**
 * Derived facts about the substructure, worked out once from the project's
 * footings, columns and beams so that excavation, foundations and the
 * ground floor all agree.
 */

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type FootingGroup = {
  id: string;
  combined: boolean;
  rect: Rect;
  thickness: number;
  bottomZ: number;
  topZ: number;
  /** The project footings this covers. */
  members: { id: string; x: number; y: number; size: Rect }[];
  columns: { id: string; x: number; y: number; width: number; depth: number }[];
  label: string;
};

/** Two pads closer than this are built as one combined footing (an example rule). */
export const COMBINE_GAP = 1000;

const rectGap = (a: Rect, b: Rect) => {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
  return { dx, dy };
};

export function footingGroups(ctx: Ctx): FootingGroup[] {
  const foundations = ctx.project.foundations;
  const rects = foundations.map((f) => ({ id: f.id, f, rect: { x0: f.x - f.width / 2, y0: f.y - f.depth / 2, x1: f.x + f.width / 2, y1: f.y + f.depth / 2 } }));
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const g = rectGap(rects[i]!.rect, rects[j]!.rect);
      // Close along one axis and overlapping on the other: one footing carries both.
      const aligned = (g.dx < COMBINE_GAP && g.dy === 0) || (g.dy < COMBINE_GAP && g.dx === 0);
      if (aligned) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map<number, number[]>();
  rects.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));
  const columns = ctx.project.structuralColumns.filter((c) => c.levelId === ctx.ground?.levelId);
  const groups: FootingGroup[] = [];
  for (const indices of byRoot.values()) {
    const members = indices.map((i) => rects[i]!);
    const rect = {
      x0: Math.min(...members.map((m) => m.rect.x0)), y0: Math.min(...members.map((m) => m.rect.y0)),
      x1: Math.max(...members.map((m) => m.rect.x1)), y1: Math.max(...members.map((m) => m.rect.y1)),
    };
    const bottomZ = Math.min(...members.map((m) => m.f.elevation));
    const thickness = Math.max(...members.map((m) => m.f.thickness));
    const cols = columns.filter((c) => c.x >= rect.x0 - 1 && c.x <= rect.x1 + 1 && c.y >= rect.y0 - 1 && c.y <= rect.y1 + 1);
    const first = members[0]!;
    groups.push({
      id: members.length > 1 ? `footing-group:${members.map((m) => m.id.replace("foundation:", "")).sort()[0]}+${members.length}` : first.id,
      combined: members.length > 1, rect, thickness, bottomZ, topZ: bottomZ + thickness,
      members: members.map((m) => ({ id: m.id, x: m.f.x, y: m.f.y, size: m.rect })),
      columns: cols.map((c) => ({ id: c.id, x: c.x, y: c.y, width: c.width, depth: c.depth })),
      label: members.length > 1 ? "Combined footing" : "Pad footing",
    });
  }
  return groups.sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
}

export type GroundBeam = { id: string; a: P2; b: P2; width: number; z0: number; z1: number; fromColumn: string; toColumn: string; length: number };

/**
 * Ground beams tie the footings together along the grid and carry the walls.
 * A beam wholly inside one combined footing is not a separate member.
 */
export function groundBeams(ctx: Ctx): GroundBeam[] {
  const ground = ctx.ground;
  if (!ground) return [];
  const groups = footingGroups(ctx);
  const z1 = ASSUME.groundBeamTop;
  const z0 = z1 - ASSUME.groundBeamDepth;
  const result: GroundBeam[] = [];
  for (const beam of ctx.project.structuralBeams.filter((b) => b.levelId === ground.levelId)) {
    const inside = groups.some((g) => g.combined && [beam.start, beam.end].every((p) => p.x >= g.rect.x0 - 1 && p.x <= g.rect.x1 + 1 && p.y >= g.rect.y0 - 1 && p.y <= g.rect.y1 + 1));
    if (inside) continue;
    result.push({
      id: beam.id.replace(/^[^:]+:beam:/, "ground-beam:"), a: { ...beam.start }, b: { ...beam.end }, width: beam.width, z0, z1,
      fromColumn: columnNear(ctx, beam.start), toColumn: columnNear(ctx, beam.end), length: dist(beam.start, beam.end),
    });
  }
  return result;
}

function columnNear(ctx: Ctx, p: P2): string {
  const column = ctx.project.structuralColumns.find((c) => c.levelId === ctx.ground?.levelId && Math.hypot(c.x - p.x, c.y - p.y) < 50);
  return column?.id ?? "";
}

export const expand = (rect: Rect, by: number): Rect => ({ x0: rect.x0 - by, y0: rect.y0 - by, x1: rect.x1 + by, y1: rect.y1 + by });

/** The plan outline inset by `by` on every side, when it is a rectangle; otherwise the outline itself. */
export function insetOutline(ctx: Ctx, by: number): { poly: P2[]; exact: boolean } {
  const b = ctx.bounds;
  const isRect = ctx.outline.length === 4 && ctx.outline.every((p) => (Math.abs(p.x - b.minX) < 1 || Math.abs(p.x - b.maxX) < 1) && (Math.abs(p.y - b.minY) < 1 || Math.abs(p.y - b.maxY) < 1));
  if (!isRect) return { poly: ctx.outline.map((p) => ({ ...p })), exact: false };
  return { poly: [{ x: b.minX + by, y: b.minY + by }, { x: b.maxX - by, y: b.minY + by }, { x: b.maxX - by, y: b.maxY - by }, { x: b.minX + by, y: b.maxY - by }], exact: true };
}

export type Pedestal = { group: FootingGroup; col: FootingGroup["columns"][number]; z0: number; z1: number };

/** Column pedestals: from the top of each footing up to the ground-floor structural level. */
export function pedestalsOf(ctx: Ctx): Pedestal[] {
  const ground = ctx.ground;
  if (!ground) return [];
  const out: Pedestal[] = [];
  for (const group of footingGroups(ctx)) for (const col of group.columns) if (group.topZ < ground.floorZ - 1) out.push({ group, col, z0: group.topZ, z1: ground.floorZ });
  return out;
}
