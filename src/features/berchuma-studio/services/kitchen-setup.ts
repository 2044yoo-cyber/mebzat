import { startingDesign } from "./starting-designs";
import { createDetailedKitchen } from "./kitchen-detail";
import { placeOnRun, solveLayout } from "./layout";
import { validateSpec, type Cabinet, type DesignSpec } from "../types/spec";
import { layoutLabel, type RunSpec } from "../types/layout";
import { buildParts } from "./geometry";
import { partWorldBounds } from "./part-transform";
import { kitchenSetupError, placeFridgeAtRunEdge, type KitchenSetup, type KitchenWindow } from "../types/kitchen";

/** Build actual cabinets on measured runs, with separate overhead carcasses. */
export function createKitchenDesign(options: KitchenSetup): DesignSpec {
  options = placeFridgeAtRunEdge(options);
  const error = kitchenSetupError(options);
  if (error) throw new Error(error);
  if (options.details) return clearWindows(createDetailedKitchen(options), options.windows);
  const spec = startingDesign("kitchen");
  spec.cornerKind = "blind";
  spec.kitchenSetup = { ...options };
  spec.layout = options.shape;
  spec.title = `${layoutLabel(options.shape)} kitchen, ${options.roomWidth / 1000} × ${options.roomDepth / 1000} m room`;
  const run = (id: string, label: string, length: number): RunSpec => ({ id, label, length, depth: 600, height: 870 });
  spec.runs = options.shape === "straight" || options.shape === "island"
    ? [run("kitchen-back", "Back wall", options.roomWidth)]
    : options.shape === "l_shaped"
      ? [run("kitchen-back", "Back wall", options.roomWidth), run("kitchen-right", "Right wall", options.roomDepth)]
      : [run("kitchen-left", "Left wall", options.roomDepth), run("kitchen-back", "Back wall", options.roomWidth), run("kitchen-right", "Right wall", options.roomDepth)];
  if (options.shape === "g_shaped") spec.runs.push(run("kitchen-peninsula", "Peninsula", options.islandWidth));
  if (options.shape === "island") spec.runs.push({
    ...run("kitchen-island", "Island", options.islandWidth),
    origin: { x: (options.roomWidth - options.islandWidth) / 2, z: 1540 }, rotation: 0,
  });
  const solved = solveLayout(spec.layout, spec.runs, { cornerKind: spec.cornerKind, cornerKinds: spec.cornerKinds, cornerSettings: spec.cornerSettings, kitchenFacing: true });
  spec.cabinets = [];
  for (const placement of solved.placements) {
    const count = Math.max(1, Math.ceil(placement.usableLength / 800));
    let offset = 0;
    for (let index = 0; index < count; index++) {
      const width = Math.round(placement.usableLength / count);
      const lastWidth = index === count - 1 ? placement.usableLength - offset : width;
      const placed = placeOnRun(placement, offset);
      const id = `${placement.runId}-${index}`;
      const main = placement.runId === "kitchen-back";
      const freestanding = /island|peninsula/.test(placement.runId);
      const label = main && index === 0 ? "Sink unit" : main && index === 1 ? "Hob unit" : index === 0 ? "Drawer bank" : "Base unit";
      const cabinet: Cabinet = {
        id, label: `${placement.label} · ${label}`, kind: freestanding ? "island" : "base",
        runId: placement.runId, offset,
        position: { x: placed.x, y: 0, z: placed.z },
        size: { width: lastWidth, height: 870, depth: 600 }, plinthHeight: 100,
        bays: [{ id: `${id}-bay`, width: lastWidth - 36,
          fitting: label === "Sink unit" ? { kind: "open" } : label === "Drawer bank" ? { kind: "drawers", count: 3 } : { kind: "shelves", count: 1, adjustable: true },
          door: label === "Drawer bank" ? "none" : "hinged", doorLeaves: lastWidth > 600 ? 2 : 1 }],
      };
      spec.cabinets.push(cabinet);
      if (options.wallCabinets && !freestanding && label !== "Hob unit") {
        const wall = upperCabinet(cabinet, `${id}-wall`, 1450, options.wallHeight);
        spec.cabinets.push(wall);
        if (options.topHeight > 0) spec.cabinets.push({
          ...upperCabinet(wall, `${id}-top`, 1450 + options.wallHeight, options.topHeight),
          label: `${placement.label} · Extra top cabinet`, stackedOn: wall.id,
        });
      }
      offset += lastWidth;
    }
  }
  spec.meta.assumptions = [
    `Room: ${options.roomWidth} × ${options.roomDepth} × ${options.roomHeight} mm.`,
    "Base units 870 mm high and 600 mm deep. Upper cabinets begin at 1450 mm; space above the hob is left clear.",
    "Confirm appliance, extractor, door and window positions before manufacturing.",
  ];
  return clearWindows(validateSpec(spec).spec, options.windows);
}

/**
 * No wall cabinet across a window.
 *
 * Done on the finished layout, in room coordinates, rather than inside each
 * generator: the simple and the detailed kitchens lay their upper runs out in
 * different frames (the detailed back run is anchored from the right and
 * turned round), and a window is a hole in the room, not in a run. Every wall
 * cabinet whose boards reach into a window's span on its wall is taken out,
 * with anything stacked on it. Base cabinets stay: a window sits above the
 * worktop.
 */
export function clearWindows(spec: DesignSpec, windows: KitchenWindow[] | undefined): DesignSpec {
  if (!windows?.length) return spec;
  const { parts } = buildParts(spec);
  const wallOf = (cabinet: Cabinet): KitchenWindow["wall"] | null =>
    /left/.test(cabinet.runId ?? "") ? "left" : /right/.test(cabinet.runId ?? "") ? "right" : /back/.test(cabinet.runId ?? "") ? "back" : null;
  const blocked = new Set<string>();
  for (const cabinet of spec.cabinets) {
    if (cabinet.kind !== "wall") continue;
    const wall = wallOf(cabinet);
    const own = parts.filter((part) => part.cabinetId === cabinet.id);
    if (!wall || !own.length) continue;
    // Along the back wall is x; along a side wall, from the back corner, is z.
    const spans = own.flatMap((part) => part.placements.map((placement) => partWorldBounds(part, placement)));
    const from = Math.min(...spans.map((bounds) => (wall === "back" ? bounds.min.x : bounds.min.z)));
    const to = Math.max(...spans.map((bounds) => (wall === "back" ? bounds.max.x : bounds.max.z)));
    if (windows.some((window) => window.wall === wall && window.offset < to - 1 && window.offset + window.width > from + 1)) blocked.add(cabinet.id);
  }
  if (!blocked.size) return spec;
  // Whatever stands on a removed cabinet goes with it, even where it is
  // narrower than the cabinet and clear of the window itself.
  for (const cabinet of spec.cabinets) if (cabinet.stackedOn && blocked.has(cabinet.stackedOn)) blocked.add(cabinet.id);
  const named = windows.map((window) => `${window.wall} wall at ${Math.round(window.offset)} mm, ${Math.round(window.width)} mm wide`).join("; ");
  return validateSpec({
    ...spec,
    cabinets: spec.cabinets.filter((cabinet) => !blocked.has(cabinet.id)),
    meta: { ...spec.meta, assumptions: [...spec.meta.assumptions, `No wall cabinets across the window${windows.length > 1 ? "s" : ""} (${named}).`] },
  }).spec;
}

function upperCabinet(lower: Cabinet, id: string, y: number, height: number): Cabinet {
  return {
    id, label: "Upper cabinet", kind: "wall", runId: lower.runId, offset: lower.offset,
    position: { ...lower.position, y }, size: { width: lower.size.width, height, depth: 350 },
    plinthHeight: 0,
    bays: [{ id: `${id}-bay`, width: lower.size.width - 36, fitting: { kind: "shelves", count: height < 500 ? 1 : 2, adjustable: true }, door: "hinged", doorLeaves: lower.size.width > 600 ? 2 : 1 }],
  };
}

export function addKitchenUpper(spec: DesignSpec, lowerId: string): DesignSpec {
  const lower = spec.cabinets.find((c) => c.id === lowerId);
  if (spec.furnitureType !== "kitchen" || !lower || lower.kind !== "base") return spec;
  const height = spec.kitchenSetup?.wallHeight ?? 720;
  const y = Math.max(spec.kitchenSetup?.details?.upperBottom ?? 1450, lower.position.y + lower.size.height + (spec.worktop?.board.thickness ?? 38) + 500);
  if (spec.kitchenSetup && y + height > spec.kitchenSetup.roomHeight) return spec;
  const target = { ...lower };
  if (spec.kitchenSetup?.details) {
    const layout = solveLayout(spec.layout, spec.runs, { cornerKind: spec.cornerKind, cornerKinds: spec.cornerKinds, cornerSettings: spec.cornerSettings, kitchenFacing: true });
    const baseRun = layout.placements.find((r) => r.runId === lower.runId);
    const upperRun = layout.placements.find((r) => r.runId === `upper-${lower.runId}`);
    if (!baseRun || !upperRun) return spec;
    const point = placeOnRun(baseRun, lower.offset ?? 0);
    const radians = upperRun.rotation * Math.PI / 180;
    target.runId = upperRun.runId;
    target.offset = Math.round((point.x - upperRun.origin.x) * Math.cos(radians) + (point.z - upperRun.origin.z) * Math.sin(radians));
  }
  const occupied = spec.cabinets.some((c) => c.kind === "wall" && c.runId === target.runId && c.position.y < y + height && c.position.y + c.size.height > y && (c.offset ?? c.position.x) < (target.offset ?? target.position.x) + target.size.width && (c.offset ?? c.position.x) + c.size.width > (target.offset ?? target.position.x));
  if (occupied) return spec;
  const draft = structuredClone(spec);
  const upper = upperCabinet(target, `${lower.id}-upper-${Date.now()}`, y, height);
  if (spec.kitchenSetup?.details) upper.size.depth = spec.kitchenSetup.details.upperDepth;
  draft.cabinets.push(upper);
  return validateSpec(draft).spec;
}
