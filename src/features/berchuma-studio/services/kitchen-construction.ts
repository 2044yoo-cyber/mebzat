import type { Cabinet, DesignSpec } from "../types/spec";
import type { Part } from "../types/parts";
import { constructionMaterials } from "./wardrobe-materials";

/** Refine real cutting parts; the viewer, nesting and costing share this list. */
export function kitchenConstruction(spec: DesignSpec, cabinet: Cabinet, original: Part[]): Part[] {
  const detail = spec.kitchenSetup?.details;
  if (!detail) return original;
  const materials = constructionMaterials(spec);
  const board = materials.body;
  const t = board.thickness;
  const { width, height, depth } = cabinet.size;
  const edgeBand = spec.carcass.edgeBand;
  function panel(id: string, role: Part["role"], size: Part["size"], at: Part["placements"][number], axis: Part["axis"], material = board): Part {
    const dimensions = axis === "x" ? [size.y, size.z] : axis === "y" ? [size.x, size.z] : [size.y, size.x];
    return { id, role, label: id.replaceAll("-", " "), board: material, edgeBand,
      length: dimensions[0], width: dimensions[1], quantity: 1,
      edges: { front: true, back: false, top: true, bottom: false }, size, placements: [at], axis };
  }
  if (cabinet.kitchenRole === "fridge") {
    const opening = detail.fridgeHeight;
    const ft = materials.fronts.thickness;
    const gap = spec.carcass.doorGap;
    const parts = [
      panel("fridge-left-side", "gable", { x: t, y: opening, z: depth }, { x: 0, y: 0, z: 0 }, "x"),
      panel("fridge-right-side", "gable", { x: t, y: opening, z: depth }, { x: width - t, y: 0, z: 0 }, "x"),
      panel("fridge-overhead-bottom", "bottom", { x: width, y: t, z: depth }, { x: 0, y: opening, z: 0 }, "y"),
      panel("fridge-overhead-left", "gable", { x: t, y: height - opening - t, z: depth }, { x: 0, y: opening + t, z: 0 }, "x"),
      panel("fridge-overhead-right", "gable", { x: t, y: height - opening - t, z: depth }, { x: width - t, y: opening + t, z: 0 }, "x"),
      panel("fridge-overhead-top", "top", { x: width - 2 * t, y: t, z: depth }, { x: t, y: height - t, z: 0 }, "y"),
    ];
    const leafWidth = (width - 2 * gap) / 2;
    for (let i = 0; i < 2; i++) {
      const door = panel(`fridge-overhead-door-${i}`, "door", { x: leafWidth, y: height - opening - gap, z: ft }, { x: gap / 2 + i * (leafWidth + gap), y: opening + gap / 2, z: -ft }, "z", materials.fronts);
      door.doorStyle = "hinged";
      parts.push(door);
    }
    return parts;
  }
  let aligned = original;
  const bay = cabinet.bays.length === 1 ? cabinet.bays[0] : null;
  if (bay?.door === "hinged" && !["drawers", "stack"].includes(bay.fitting.kind)) {
    const gap = spec.carcass.doorGap;
    const leaves = bay.doorLeaves;
    const frontWidth = width - (cabinet.frontInsets?.start ?? 0) - (cabinet.frontInsets?.end ?? 0);
    const leafWidth = (frontWidth - leaves * gap) / leaves;
    aligned = original.filter((p) => p.role !== "door");
    for (let i = 0; i < leaves && leafWidth > 0; i++) {
      const door = panel(`aligned-door-${i}`, "door", { x: leafWidth, y: height - cabinet.plinthHeight - gap, z: materials.fronts.thickness }, { x: (cabinet.frontInsets?.start ?? 0) + gap / 2 + i * (leafWidth + gap), y: cabinet.plinthHeight + gap / 2, z: -materials.fronts.thickness }, "z", materials.fronts);
      door.doorStyle = "hinged";
      door.bayId = bay.id;
      aligned.push(door);
    }
  }
  if (cabinet.kind !== "base" && cabinet.kind !== "island") return aligned;
  const parts = aligned.filter((p) => p.role !== "top" && p.role !== "leg" && p.role !== "plinth" && !(cabinet.kitchenRole && p.role === "shelf"));
  // Open tops with two vertical stretchers, as in the supplied OBJ. Sink and
  // stove templates remain appliance-specific; no solid board blocks them.
  for (const [label, z] of [["front", 0], ["rear", depth - materials.back.thickness - t]] as const) {
    parts.push({ ...panel(`top-stretcher-${label}`, "rail", { x: width - 2 * t, y: 60, z: t }, { x: t, y: height - 60, z }, "z"), manufacture: "cut" });
  }
  const h = cabinet.plinthHeight;
  if (h > 0) {
    const pt = materials.plinth.thickness;
    const recess = 40;
    parts.push(panel("zekolo-front", "plinth", { x: width, y: h, z: pt }, { x: 0, y: 0, z: recess }, "z", materials.plinth));
    parts.push(panel("zekolo-rear", "plinth", { x: width, y: h, z: pt }, { x: 0, y: 0, z: depth - pt }, "z", materials.plinth));
    for (const [label, x] of [["left", 0], ["right", width - pt]] as const) parts.push(panel(`zekolo-${label}`, "plinth", { x: pt, y: h, z: depth - recess - 2 * pt }, { x, y: 0, z: recess + pt }, "x", materials.plinth));
  }
  return parts;
}

export function visibleKitchenParts(parts: Part[], hideCountertop: boolean): Part[] {
  return hideCountertop ? parts.filter((part) => part.role !== "worktop" && part.role !== "backsplash") : parts;
}
