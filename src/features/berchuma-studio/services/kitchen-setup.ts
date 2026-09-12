import { startingDesign } from "./starting-designs";
import { placeOnRun, solveLayout } from "./layout";
import { validateSpec, type Cabinet, type DesignSpec } from "../types/spec";
import { layoutLabel, type RunSpec } from "../types/layout";
import { kitchenSetupError, type KitchenSetup } from "../types/kitchen";

/** Build actual cabinets on measured runs, with separate overhead carcasses. */
export function createKitchenDesign(options: KitchenSetup): DesignSpec {
  const error = kitchenSetupError(options);
  if (error) throw new Error(error);
  const spec = startingDesign("kitchen");
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
  const solved = solveLayout(spec.layout, spec.runs, { cornerKind: spec.cornerKind, kitchenFacing: true });
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
  return validateSpec(spec).spec;
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
  const y = Math.max(1450, lower.position.y + lower.size.height + (spec.worktop?.board.thickness ?? 38) + 500);
  if (spec.kitchenSetup && y + height > spec.kitchenSetup.roomHeight) return spec;
  const occupied = spec.cabinets.some((c) => c.kind === "wall" && c.runId === lower.runId && Math.abs(c.position.y - y) < 100 && (c.offset ?? c.position.x) < (lower.offset ?? lower.position.x) + lower.size.width && (c.offset ?? c.position.x) + c.size.width > (lower.offset ?? lower.position.x));
  if (occupied) return spec;
  const draft = structuredClone(spec);
  draft.cabinets.push(upperCabinet(lower, `${lower.id}-upper-${Date.now()}`, y, height));
  return validateSpec(draft).spec;
}
