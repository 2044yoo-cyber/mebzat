import type { Bay, Cabinet, DesignSpec, FrontGrip } from "../types/spec";

/**
 * How a door is gripped, and what that does to it.
 *
 * One place, because four things read it and must agree: the door sizes
 * (`cabinetFronts`), the parts and their machining, the hardware order, and
 * the closure panels that cover what a shortened door leaves open. A door
 * whose grip is drawn one way and cut another is the bug this prevents.
 */

/** The grip a bay's doors have: the bay's own, else the design's, else a handle — as every design saved before this was. */
export function gripOf(spec: Pick<DesignSpec, "doorHardware">, bay: Pick<Bay, "frontGrip">): FrontGrip {
  return bay.frontGrip ?? spec.doorHardware?.grip ?? "handle";
}

/** Whether a grip needs no handle on the face. */
export function isHandleless(grip: FrontGrip): boolean {
  return grip !== "handle";
}

/**
 * Which edge the grip runs along. A wall unit is reached from below, so its
 * doors are gripped at the bottom; everything else at the top, under the
 * worktop or the carcass top.
 */
export function gripEdgeOf(cabinet: Pick<Cabinet, "kind">): "top" | "bottom" {
  return cabinet.kind === "wall" ? "bottom" : "top";
}

/**
 * The finger-pull profile for a grip, with its defaults.
 *
 * Groove: 20 mm tall, routed 10 mm into the back of the door — deep enough
 * for a fingertip, and leaving 8 mm of an 18 mm board. Profiles: a 25 mm
 * aluminium section. Channel: a 30 mm gap above the door, its rail set back
 * 18 mm behind the carcass front, so a finger reaches 36 mm in behind an
 * 18 mm door. A groove cannot be routed deeper than the door less 6 mm.
 */
export function fingerPullOf(spec: Pick<DesignSpec, "doorHardware">, grip: FrontGrip, doorThickness = 18): { height: number; depth: number } {
  const typed = spec.doorHardware?.profile ?? {};
  const defaults: Partial<Record<FrontGrip, { height: number; depth: number }>> = {
    groove: { height: 20, depth: 10 },
    "g-profile": { height: 25, depth: 0 },
    "j-profile": { height: 25, depth: 0 },
    channel: { height: 30, depth: 18 },
  };
  const base = defaults[grip] ?? { height: 0, depth: 0 };
  const height = typed.height ?? base.height;
  const depth = grip === "groove"
    ? Math.min(typed.depth ?? base.depth, Math.max(0, doorThickness - 6))
    : typed.depth ?? base.depth;
  return { height, depth };
}

/** How much shorter the board of a door with this grip is cut, on its grip edge. */
export function frontShortening(spec: Pick<DesignSpec, "doorHardware">, grip: FrontGrip, doorThickness = 18): number {
  return grip === "g-profile" || grip === "j-profile" || grip === "channel" ? fingerPullOf(spec, grip, doorThickness).height : 0;
}

/**
 * Which side a leaf is hinged on. A single leaf on its left; a pair on their
 * outer edges, meeting in the middle; in a run of three or more, the first on
 * its left and the rest on their right. The elevation draws its hinges by
 * this rule and the door-swing check uses it, so they cannot disagree.
 */
export function hingeSideOf(leaf: { leaf: number; leaves: number }): "left" | "right" {
  return leaf.leaves === 1 || leaf.leaf === 0 ? "left" : "right";
}
