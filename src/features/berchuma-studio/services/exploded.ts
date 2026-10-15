import type { Part, Vec3 } from "../types/parts";
import { partCentre } from "./part-transform";

/**
 * The exploded assembly view: every board pulled away from its cabinet along
 * the direction it is fitted from, so each one can be seen on its own with a
 * line back to where it goes.
 *
 * Pure, in the design's millimetres, so the check script can ask where a part
 * goes without a renderer. The viewer only draws what this says.
 */

/** How far a board travels at full explosion, mm. Fronts go furthest: they are fitted last. */
const DISTANCE = { front: 420, side: 300, vertical: 300, back: 300, inner: 160 } as const;

type Direction = { x: number; y: number; z: number; distance: number };

/** The direction a part is fitted from, in its cabinet's own frame (z backwards). */
export function fittingDirection(part: Part, placement: Vec3, cabinetCentre: Vec3): Direction {
  // Which side of its cabinet it is on, measured along its own run.
  const centre = partCentre(part, placement);
  const radians = ((part.rotationY ?? 0) * Math.PI) / 180;
  const along = (centre.x - cabinetCentre.x) * Math.cos(radians) + (centre.z - cabinetCentre.z) * Math.sin(radians);
  const sideways = along < 0 ? -1 : 1;
  const kind = part.closure?.kind;
  if (part.role === "door" || part.role === "drawer_front") return { x: 0, y: 0, z: -1, distance: DISTANCE.front };
  if (kind === "end" || kind === "decorative_end" || kind === "filler") return { x: sideways, y: 0, z: 0, distance: DISTANCE.side + 120 };
  if (kind === "top" || part.role === "top" || part.role === "worktop" || part.role === "backsplash") return { x: 0, y: 1, z: 0, distance: DISTANCE.vertical };
  if (kind === "bottom" || part.role === "bottom" || part.role === "plinth" || part.role === "leg") return { x: 0, y: -1, z: 0, distance: DISTANCE.vertical / 2 };
  if (kind === "rear" || part.role === "back") return { x: 0, y: 0, z: 1, distance: DISTANCE.back };
  if (kind === "rail" || kind === "masking") return { x: 0, y: 0, z: -1, distance: DISTANCE.front - 120 };
  if (part.role === "gable") return { x: sideways, y: 0, z: 0, distance: DISTANCE.side };
  return { x: 0, y: 0, z: -1, distance: DISTANCE.inner };
}

/**
 * Where a placed part is drawn when the view is exploded by `amount` (0 is
 * assembled, 1 fully apart), as an offset in the design's frame. A part on a
 * turned run moves along its run's own axes.
 */
export function explodedOffset(part: Part, placement: Vec3, cabinetCentre: Vec3, amount: number): Vec3 {
  const local = fittingDirection(part, placement, cabinetCentre);
  const radians = ((part.rotationY ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const d = local.distance * amount;
  // The same turn as part-transform's plan points: x along the run, z into it.
  return { x: (local.x * cos - local.z * sin) * d, y: local.y * d, z: (local.x * sin + local.z * cos) * d };
}

/** Each cabinet's centre, from its own parts, so its boards move away from it and not from the room. */
export function cabinetCentres(parts: Part[]): Map<string, Vec3> {
  const bounds = new Map<string, { min: Vec3; max: Vec3 }>();
  for (const part of parts) {
    const key = part.cabinetId ?? "";
    for (const at of part.placements) {
      const c = partCentre(part, at);
      const entry = bounds.get(key) ?? { min: { ...c }, max: { ...c } };
      entry.min = { x: Math.min(entry.min.x, c.x), y: Math.min(entry.min.y, c.y), z: Math.min(entry.min.z, c.z) };
      entry.max = { x: Math.max(entry.max.x, c.x), y: Math.max(entry.max.y, c.y), z: Math.max(entry.max.z, c.z) };
      bounds.set(key, entry);
    }
  }
  return new Map([...bounds].map(([key, { min, max }]) => [key, { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }]));
}

/**
 * Where each closure panel is joined, and to what — the connection view's
 * markers. Read off the parts, so a panel switched off has no joint drawn.
 */
export function closureJoins(parts: Part[]): { partId: string; label: string; fixedTo: string; at: Vec3 }[] {
  return parts.filter((part) => part.closure).map((part) => ({ partId: part.id, label: part.label, fixedTo: part.closure!.fixedTo, at: part.closure!.join }));
}
