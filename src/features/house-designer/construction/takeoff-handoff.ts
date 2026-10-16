import type { BuildingElement, ElementKind } from "@/lib/takeoff/model";

import type { HousePreparedQuantity, HouseTakeoffPackage } from "../services/takeoff-adapter";
import { aggregateQuantities, type QuantityScope } from "./quantities";
import type { ComponentRecord, ConstructionModel, ModelOptions, Provenance } from "./types";

/**
 * The construction quantities as the package the takeoff page already reads.
 * Net quantities only: allowances ride in the working, lines with no figure are
 * left out and listed in the warnings, and there is no rate anywhere.
 */

const CONFIDENCE: Record<Provenance, number> = { measured: 0.95, calculated: 0.8, assumed: 0.5, review: 0.4, missing: 0 };

export function elementKindOf(c: ComponentRecord): ElementKind {
  if (c.kind === "column") return "column";
  if (c.kind === "beam") return "beam";
  if (c.kind === "slab" || c.kind === "ground-slab") return c.kind === "slab" ? "slab" : "floor";
  if (c.kind.startsWith("door") || c.kind === "door-opening") return "door";
  if (c.kind.startsWith("window")) return "window";
  if (c.kind === "ceiling-channel" || c.kind === "gypsum-board" || c.kind === "ceiling-joint" || c.kind === "ceiling-cutout" || c.kind === "ceiling-insulation" || c.kind === "access-panel") return "ceiling";
  if (c.kind === "floor-tile" || c.kind === "floor-screed" || c.kind === "floor-joint" || c.kind === "skirting" || c.kind === "threshold" || c.kind === "tile-adhesive") return "floor";
  switch (c.category) {
    case "substructure": case "earthworks": case "site": return "foundation";
    case "stairs": return "stair";
    case "masonry": return "wall";
    case "roof": return "roof";
    case "openings": return "door";
    case "finishes": return "finish";
    case "joinery": return "cabinet";
    case "furniture": return "furniture";
    case "frame": return "slab";
    default: return "fixture";
  }
}

export function constructionTakeoffPackage(model: ConstructionModel, options: ModelOptions = model.options, scope: QuantityScope = "building"): HouseTakeoffPackage {
  const lines = aggregateQuantities(model, options, scope);
  const byId = new Map(model.components.map((c) => [c.id, c]));
  const used = new Set<string>();
  const quantities: HousePreparedQuantity[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    if (line.net === null) { missing.push(`${line.description}: ${line.formulas[0] ?? "no figure yet"}`); continue; }
    const ids = line.items.filter((i) => i.value !== null).map((i) => i.componentId).filter((id, i, all) => all.indexOf(id) === i && byId.has(id));
    ids.forEach((id) => used.add(id));
    const allowance = line.allowanceQuantity !== null ? ` — allowance ${line.allowancePercent !== null ? `${line.allowancePercent}% ` : ""}(${line.allowanceQuantity} ${line.unit}) kept separate, not in this figure` : "";
    quantities.push({
      id: `${line.workItem}|${line.unit}`,
      representativeElementId: ids[0]!,
      section: line.section,
      description: line.description,
      quantity: { label: line.description, value: line.net, unit: line.unit, formula: `${line.formulas.join(" ; ")}${allowance}`, source: line.status === "measured" ? "bim" : "calculated", confidence: CONFIDENCE[line.status], elementIds: ids },
    });
    if (line.missingItems > 0) missing.push(`${line.description}: ${line.missingItems} item(s) have no figure and are not in this total`);
  }
  const elements: BuildingElement[] = [...used].map((id) => {
    const c = byId.get(id)!;
    return { id: c.id, kind: elementKindOf(c), name: c.name, level: c.storeyName ?? "Site and below ground", location: c.room, material: c.materialId };
  });
  return {
    version: 1,
    source: "house-designer",
    projectId: model.projectId,
    name: `${model.title} — construction quantities`,
    elements,
    quantities,
    levels: [...model.storeys.map((s) => s.name), "Site and below ground"],
    warnings: [
      "Illustrative learning model: dimensions and services are examples, not a design.",
      "Net quantities only. Waste allowances are in each line's working, and this package carries no prices.",
      ...missing.map((m) => `Missing: ${m}`),
    ],
  };
}
