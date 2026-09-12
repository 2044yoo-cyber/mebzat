import { startingDesign } from "./starting-designs";
import { placeOnRun, solveLayout } from "./layout";
import { validateSpec, type Cabinet, type DesignSpec } from "../types/spec";
import type { KitchenSetup } from "../types/kitchen";
import type { RunSpec } from "../types/layout";

/** Measured appliance spaces and connected wall runs, using the reference construction. */
export function createDetailedKitchen(options: KitchenSetup): DesignSpec {
  const d = options.details!;
  const spec = startingDesign("kitchen");
  spec.kitchenSetup = structuredClone(options);
  spec.layout = options.shape;
  spec.title = `${options.shape.replaceAll("_", " ")} kitchen · ${options.roomWidth / 1000} × ${options.roomDepth / 1000} m`;
  spec.carcass.plinthHeight = d.plinthHeight;
  spec.carcass.doorGap = 3;
  const run = (id: string, label: string, length: number): RunSpec => ({ id, label, length, depth: d.baseDepth, height: d.baseHeight });
  spec.runs = options.shape === "straight" || options.shape === "island" ? [run("kitchen-back", "Back wall", options.roomWidth)]
    : options.shape === "l_shaped" ? [run("kitchen-back", "Back wall", options.roomWidth), run("kitchen-right", "Right wall", options.roomDepth)]
      : [run("kitchen-left", "Left wall", options.roomDepth), run("kitchen-back", "Back wall", options.roomWidth), run("kitchen-right", "Right wall", options.roomDepth)];
  if (options.shape === "g_shaped") spec.runs.push(run("kitchen-peninsula", "Peninsula", options.islandWidth));
  if (options.shape === "island") spec.runs.push({ ...run("kitchen-island", "Island", options.islandWidth), origin: { x: (options.roomWidth - options.islandWidth) / 2, z: d.baseDepth + 940 }, rotation: 0 });
  const solved = solveLayout(spec.layout, spec.runs, { cornerKind: spec.cornerKind, kitchenFacing: true });
  spec.cabinets = [];
  type Segment = { offset: number; width: number; role?: "fridge" | "sink" | "stove" };
  function fill(start: number, end: number): Segment[] {
    if (end - start < 1) return [];
    const count = Math.ceil((end - start) / 800);
    const width = Math.floor((end - start) / count);
    return Array.from({ length: count }, (_, i) => ({ offset: start + i * width, width: i === count - 1 ? end - start - i * width : width }));
  }
  function cabinet(id: string, segment: Segment, runId: string, kind: Cabinet["kind"], y: number, height: number, depth: number): Cabinet {
    return { id, label: segment.role === "fridge" ? "Fridge enclosure" : segment.role === "sink" ? "Sink space" : segment.role === "stove" ? "Stove / oven space" : kind === "wall" ? "Upper cabinet" : "Base cabinet",
      kind, kitchenRole: segment.role, runId, offset: segment.offset,
      position: { x: 0, y, z: 0 }, size: { width: segment.width, height, depth },
      plinthHeight: kind === "wall" || segment.role === "fridge" ? 0 : d.plinthHeight,
      bays: [{ id: `${id}-bay`, width: segment.width - 36, fitting: segment.role ? { kind: "open" } : { kind: "shelves", count: 1, adjustable: true },
        door: segment.role === "fridge" || segment.role === "stove" ? "none" : "hinged", doorLeaves: segment.width > 600 ? 2 : 1 }],
    };
  }
  for (const placement of solved.placements) {
    const appliances = (["fridge", "sink", "stove"] as const).map((role) => ({ ...d[role], role })).filter((a) => a.runId === placement.runId).sort((a, b) => a.offset - b.offset);
    const segments: Segment[] = [];
    let end = 0;
    for (const appliance of appliances) {
      segments.push(...fill(end, appliance.offset), appliance);
      end = appliance.offset + appliance.width;
    }
    segments.push(...fill(end, placement.usableLength));
    for (const [index, segment] of segments.entries()) {
      const base = cabinet(`${placement.runId}-${index}`, segment, placement.runId,
        segment.role === "fridge" ? "tall" : /island|peninsula/.test(placement.runId) ? "island" : "base", 0,
        segment.role === "fridge" ? d.upperBottom + options.wallHeight : d.baseHeight, d.baseDepth);
      spec.cabinets.push(base);
      if (segment.role === "fridge" && options.wallCabinets && options.topHeight > 0) {
        spec.cabinets.push({ ...cabinet(`${base.id}-top`, { ...segment, role: undefined }, placement.runId, "wall", base.size.height, options.topHeight, d.baseDepth), label: "Fridge top cabinet", stackedOn: base.id });
      }
    }
    if (!options.wallCabinets || /island|peninsula/.test(placement.runId)) continue;
    // A full back row owns the wall corner; side rows butt against its face.
    // Separate upper runs avoid the base corner's 550 mm gap in a 300 mm row.
    const side = placement.runId.endsWith("left") ? "left" : placement.runId.endsWith("right") ? "right" : "back";
    const upperRun: RunSpec = { id: `upper-${placement.runId}`, label: `${placement.label} uppers`,
      length: side === "back" ? options.roomWidth : options.roomDepth - d.upperDepth,
      depth: d.upperDepth, height: options.wallHeight,
      origin: side === "back" ? { x: options.roomWidth, z: d.upperDepth } : side === "left" ? { x: d.upperDepth, z: d.upperDepth } : { x: options.roomWidth - d.upperDepth, z: options.roomDepth },
      rotation: side === "back" ? 180 : side === "left" ? 90 : 270 };
    spec.runs.push(upperRun);
    const shift = side === "back" ? options.roomWidth - placement.origin.x : side === "left" ? placement.origin.z - d.upperDepth : options.roomDepth - placement.origin.z;
    const upperSegments = [...fill(0, shift), ...segments.map((s) => ({ ...s, offset: s.offset + shift })), ...fill(shift + placement.usableLength, upperRun.length)];
    for (const [index, segment] of upperSegments.entries()) {
      if (segment.role === "fridge") continue; // Its tall side panels and overhead box already occupy this space.
      const hoodLift = segment.role === "stove" ? Math.min(400, options.wallHeight - 200) : 0;
      const wall = cabinet(`${upperRun.id}-${index}`, { ...segment, role: undefined }, upperRun.id, "wall", d.upperBottom + hoodLift, options.wallHeight - hoodLift, d.upperDepth);
      if (side === "back") {
        const cornerFront = d.upperDepth + (spec.carcass.frontBoard ?? spec.carcass.board).thickness;
        wall.frontInsets = {
          start: ["l_shaped", "u_shaped", "g_shaped"].includes(options.shape) ? Math.max(0, cornerFront - segment.offset) : 0,
          end: ["u_shaped", "g_shaped"].includes(options.shape) ? Math.max(0, segment.offset + segment.width - upperRun.length + cornerFront) : 0,
        };
      }
      if (hoodLift) { wall.label = "Extractor recess · upper cabinet"; wall.kitchenRole = "hood"; }
      spec.cabinets.push(wall);
      if (options.topHeight > 0) spec.cabinets.push({ ...cabinet(`${wall.id}-top`, { ...segment, role: undefined }, upperRun.id, "wall", d.upperBottom + options.wallHeight, options.topHeight, d.upperDepth), label: "Extra top cabinet", stackedOn: wall.id, frontInsets: wall.frontInsets });
    }
  }
  const finalLayout = solveLayout(spec.layout, spec.runs, { kitchenFacing: true });
  for (const c of spec.cabinets) {
    const placement = finalLayout.placements.find((r) => r.runId === c.runId)!;
    const p = placeOnRun(placement, c.offset ?? 0, c.size.depth);
    c.position.x = p.x; c.position.z = p.z;
  }
  spec.meta.assumptions = [
    "Reference construction: 18 mm carcass boards, aligned fronts with 3 mm gaps, connected upper wall runs and a recessed Zekolo plinth.",
    "Fridge bay width includes two side boards; the height is the clear opening including manufacturer ventilation allowances. No back, floor panel or plinth blocks the opening. Side panels join at the overhead bottom so each fits a standard sheet.",
    "Sink and stove spaces are assigned. Confirm actual appliance templates, service holes, ventilation and countertop cutouts before cutting.",
  ];
  return validateSpec(spec).spec;
}
