import type { Bay, Cabinet, DesignSpec } from "../types/spec";

/**
 * A wardrobe's transport modules: the separate carcasses it is built, carried
 * and installed in.
 *
 * A wardrobe wider than a van, a stair or a door is not made as one box. It
 * is made as several, each a complete cabinet with its own two sides, top,
 * bottom and back, and joined on site side to side — two panels against each
 * other at every joint, screwed together from inside. The rule here is the
 * workshop's: modules of 1600 mm from the left, the rest in the last one, not
 * equal shares. A top cabinet is a separate assembly above, its joints over
 * the joints below unless somebody deliberately makes them different.
 *
 * Modules are carcass structure, not facade. The bays — the openings with
 * their shelves, rails, drawers and doors — are laid out inside the modules:
 * a joint always falls between two bays, and the two side panels there take
 * the place of the one divider a bay boundary would otherwise have. The
 * doors either side of a joint are widened over half the double wall each,
 * so the facade reads the same at a joint as at an ordinary divider.
 *
 * Pure geometry on the spec. Everything that lays bays out — the parts, the
 * fronts, the elevation, the operations — reads `bayLayout`, so there is one
 * answer to where a bay is.
 */

/** The widest module preferred for transport, mm. */
export const MAX_MODULE = 1600;
/** The narrowest module that is still a cabinet: two sides and a usable opening. */
export const MIN_MODULE = 200;

export type CabinetModule = { index: number; from: number; to: number; width: number };
export type BayPlace = {
  bay: Bay;
  index: number;
  /** Left edge of the bay's clear opening, from the cabinet's left side. */
  x: number;
  width: number;
  module: number;
  /** Whether the bay's left / right edge is a transport joint (not the cabinet's outer side). */
  jointLeft: boolean;
  jointRight: boolean;
};

/**
 * The default joints for a width: a joint every 1600 mm from the left, the
 * rest in the last module — 2400 is 1600 + 800, 3600 is 1600 + 1600 + 400.
 * A remainder too narrow to be a cabinet moves the last joint left until the
 * last module is `MIN_MODULE` wide; that, and only that, is not the rule.
 */
export function defaultJoints(width: number): number[] {
  const joints: number[] = [];
  for (let at = MAX_MODULE; at < width - 0.5; at += MAX_MODULE) joints.push(at);
  if (joints.length && width - joints.at(-1)! < MIN_MODULE) joints[joints.length - 1] = width - MIN_MODULE;
  return joints;
}

/** The joints a cabinet has, in order, each leaving a buildable module either side. */
export function jointsOf(cabinet: Pick<Cabinet, "transport" | "size">): number[] {
  const width = cabinet.size.width;
  const sorted = [...(cabinet.transport?.joints ?? [])].map((joint) => joint.at).sort((a, b) => a - b);
  const kept: number[] = [];
  for (const at of sorted) {
    const previous = kept.at(-1) ?? 0;
    if (at - previous >= MIN_MODULE - 0.5 && width - at >= MIN_MODULE - 0.5) kept.push(at);
  }
  return kept;
}

/** The modules, left to right. A cabinet with no joints is one module, the whole width. */
export function modulesOf(cabinet: Pick<Cabinet, "transport" | "size">): CabinetModule[] {
  const edges = [0, ...jointsOf(cabinet), cabinet.size.width];
  return edges.slice(0, -1).map((from, index) => ({ index, from, to: edges[index + 1]!, width: edges[index + 1]! - from }));
}

/**
 * Which module each bay is in. By where the bay's middle falls as the bays
 * are listed, joints aside: a bay belongs to the module it is mostly in. The
 * bays are in order, so a module's bays are always a contiguous run.
 */
export function bayModules(cabinet: Pick<Cabinet, "transport" | "size" | "bays">, t: number): number[] {
  const joints = jointsOf(cabinet);
  if (!joints.length) return cabinet.bays.map(() => 0);
  let cursor = t;
  return cabinet.bays.map((bay) => {
    const middle = cursor + bay.width / 2;
    cursor += bay.width + t;
    return joints.filter((at) => at <= middle).length;
  });
}

/**
 * Where each bay's opening is. Inside a module the bays run from just inside
 * its left side, one divider between each; a joint has a side panel of each
 * module, so the next module's first bay starts two boards on.
 */
export function bayLayout(cabinet: Pick<Cabinet, "transport" | "size" | "bays">, t: number): BayPlace[] {
  const modules = modulesOf(cabinet);
  const owners = bayModules(cabinet, t);
  let cursor = t;
  return cabinet.bays.map((bay, index) => {
    const owner = owners[index]!;
    const startsModule = index === 0 || owners[index - 1] !== owner;
    if (startsModule) cursor = modules[owner]!.from + t;
    const x = cursor;
    cursor += bay.width + t;
    const endsModule = index === cabinet.bays.length - 1 || owners[index + 1] !== owner;
    return { bay, index, x, width: bay.width, module: owner, jointLeft: startsModule && owner > 0, jointRight: endsModule && owner < modules.length - 1 };
  });
}

/** The clear width all the bays share: the cabinet less two sides per module and the dividers. */
export function carcassInterior(cabinet: Pick<Cabinet, "transport" | "size" | "bays">, t: number): number {
  return cabinet.size.width - t * (cabinet.bays.length + modulesOf(cabinet).length);
}

/** One module's clear width for `count` bays. */
export function moduleInterior(carcassModule: CabinetModule, count: number, t: number): number {
  return carcassModule.width - 2 * t - Math.max(0, count - 1) * t;
}

/** Whole millimetres in proportion, the last taking the rounding, each at least 1. */
function share(weights: number[], total: number): number[] {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  let handed = 0;
  return weights.map((weight, index) => {
    const next = index === weights.length - 1 ? total - handed : Math.max(1, Math.round(sum > 0 ? (weight / sum) * total : total / weights.length));
    handed += next;
    return Math.max(1, next);
  });
}

/**
 * The bays fitted to the modules: every module gets at least one bay — a
 * module with none is given one like its neighbour, so the layout is kept,
 * not cut through — and each module's bays share its clear width in the
 * proportions they had. A cabinet without joints is left alone.
 */
export function fitBaysToModules(cabinet: Cabinet, t: number, options: { owners?: number[]; fixed?: Map<number, number> } = {}): void {
  const modules = modulesOf(cabinet);
  if (modules.length <= 1) return;
  let owners = options.owners ?? bayModules(cabinet, t);
  for (const carcassModule of modules) {
    if (owners.includes(carcassModule.index)) continue;
    // The bay that reaches nearest this module lends its contents to a new one.
    const before = owners.filter((owner) => owner < carcassModule.index).length;
    const neighbour = cabinet.bays[before - 1] ?? cabinet.bays[before]!;
    const added: Bay = {
      ...structuredClone(neighbour),
      id: `${neighbour.id}-transport-${carcassModule.index + 1}`,
      width: Math.max(1, moduleInterior(carcassModule, 1, t)),
      door: neighbour.display ? "none" : neighbour.door === "none" ? "none" : neighbour.door,
    };
    delete added.doorOverrides;
    cabinet.bays.splice(before, 0, added);
    owners = [...owners.slice(0, before), carcassModule.index, ...owners.slice(before)];
  }
  for (const carcassModule of modules) {
    const indices = owners.map((owner, index) => (owner === carcassModule.index ? index : -1)).filter((index) => index >= 0);
    const interior = Math.max(indices.length, Math.round(moduleInterior(carcassModule, indices.length, t)));
    // A bay with a width of its own (a corner opening) keeps it, as far as
    // the module allows; the others share what is left.
    const fixedHere = indices.filter((index) => options.fixed?.has(index));
    const free = indices.filter((index) => !options.fixed?.has(index));
    const fixedTotal = Math.min(interior - free.length, fixedHere.reduce((sum, index) => sum + options.fixed!.get(index)!, 0));
    const fixedWidths = fixedHere.length ? share(fixedHere.map((index) => options.fixed!.get(index)!), Math.max(fixedHere.length, fixedTotal)) : [];
    fixedHere.forEach((index, at) => {
      cabinet.bays[index]!.width = fixedWidths[at]!;
    });
    if (!free.length) continue;
    const widths = share(free.map((index) => cabinet.bays[index]!.width), Math.max(free.length, interior - (fixedHere.length ? fixedWidths.reduce((sum, width) => sum + width, 0) : 0)));
    free.forEach((index, at) => {
      cabinet.bays[index]!.width = widths[at]!;
    });
  }
}

/**
 * Where a joint can usefully go: on an existing partition (a divider's centre
 * line, where the two side panels replace it), on the wardrobe's centre line,
 * between two doors, and at the 1600 mm rule's own positions.
 */
export function jointSnapTargets(cabinet: Cabinet, t: number, doorEdges: number[] = []): number[] {
  const layout = bayLayout(cabinet, t);
  const targets = new Set<number>([cabinet.size.width / 2, ...defaultJoints(cabinet.size.width)]);
  for (let index = 0; index + 1 < layout.length; index += 1) {
    const left = layout[index]!;
    const right = layout[index + 1]!;
    targets.add((left.x + left.width + right.x) / 2);
  }
  for (const edge of doorEdges) targets.add(edge);
  return [...targets].filter((value) => value >= MIN_MODULE && value <= cabinet.size.width - MIN_MODULE).sort((a, b) => a - b);
}

/** Connectors along one joint: one every 400 mm or so of its height, never fewer than three. */
export function connectorsPerJoint(height: number): number {
  return Math.max(3, Math.ceil(height / 400) + 1);
}

/**
 * A new wardrobe carcass on the 1600 mm rule: its joints for its width, its
 * bays fitted to the modules. For designs being made, not ones being opened —
 * a cabinet saved without modules stays one carcass until somebody divides it.
 */
export function applyTransportDefaults(cabinet: Cabinet, t: number): void {
  if (cabinet.transport || cabinet.stackedOn) return;
  cabinet.transport = { joints: defaultJoints(cabinet.size.width).map((at) => ({ at })), auto: true, alignTop: true, connector: "confirmat" };
  fitBaysToModules(cabinet, t);
}

/**
 * Where a cabinet sits in a wardrobe's stack of height modules: the upper
 * carcass stacked on another, the lower one something stands on, or neither.
 * Kitchens stack too — an extra top row — but call it their own way.
 */
export function stackRoleOf(spec: Pick<DesignSpec, "furnitureType" | "cabinets">, cabinet: Pick<Cabinet, "id" | "stackedOn">): "Upper" | "Lower" | null {
  if (spec.furnitureType !== "wardrobe") return null;
  if (cabinet.stackedOn) return "Upper";
  return spec.cabinets.some((other) => other.stackedOn === cabinet.id) ? "Lower" : null;
}

/**
 * A module's name, the same on the drawing, in the panel and on the cut list:
 * "Lower module 1", "Upper module 2", "Module 1" for a wardrobe in one height,
 * "Upper module" for a height module with no width joints. `numbered` is
 * whether the cabinet has more than one width module.
 */
export function moduleLabel(spec: Pick<DesignSpec, "furnitureType" | "cabinets">, cabinet: Pick<Cabinet, "id" | "stackedOn">, index: number, numbered: boolean): string {
  if (spec.furnitureType !== "wardrobe") return `${cabinet.stackedOn ? "Top" : "Base"} module ${index + 1}`;
  const role = stackRoleOf(spec, cabinet);
  return role ? `${role} module${numbered ? ` ${index + 1}` : ""}` : `Module ${index + 1}`;
}
