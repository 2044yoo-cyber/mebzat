import { CATEGORY_LABELS, LAYER_LABELS, PROVENANCE_LABELS, type ComponentKnowledge, type ComponentRecord, type ConstructionModel, type Dimension, type DimensionKey, type Provenance, type QuantityItem, type StageDef } from "./types";
import { knowledgeFor, materialOf } from "./catalogue";
import { STAGE_BY_ID } from "./stages";

/** Everything the learning panel shows about one component (and, for a repeated one, one instance of it). */
export type ComponentInfo = {
  id: string;
  name: string;
  title: string;
  category: string;
  subcategory: string;
  storey: string;
  room: string | null;
  grid: string | null;
  layer: string;
  material: string;
  stage: StageDef;
  removedAfter: StageDef | null;
  parent: { id: string; name: string } | null;
  children: { id: string; name: string }[];
  connected: { id: string; name: string }[];
  sequence: number;
  knowledge: ComponentKnowledge;
  dims: { key: DimensionKey; label: string; dim: Dimension }[];
  /** Real project geometry, or a schematic illustration. */
  geometrySource: "project" | "schematic";
  geometryLabel: string;
  sourceRef: string | null;
  /** The worst status among its dimensions and quantities. */
  status: Provenance;
  statusLabel: string;
  quantities: QuantityItem[];
  quantityMethod: string;
  instance: { index: number; name: string } | null;
  repeated: string | null;
  note: string | null;
  loose: boolean;
  concealed: boolean;
};

function fallbackKnowledge(c: ComponentRecord): ComponentKnowledge {
  return { title: c.name, summary: "No lesson text is written for this kind of component yet.", materials: materialOf(c.materialId).name, installation: [], connections: "Not stated.", maintenance: [], qualityChecks: [], commonDefects: [], safety: [], quantityMethod: "Not stated." };
}

const DIM_LABELS: Record<DimensionKey, string> = { length: "Length", width: "Width", height: "Height", thickness: "Thickness", area: "Area", volume: "Volume" };
const RANK: Record<Provenance, number> = { measured: 0, calculated: 1, assumed: 2, review: 3, missing: 4 };

export function describeComponent(model: ConstructionModel, id: string, instance: number | null = null): ComponentInfo | null {
  const c = model.components.find((x) => x.id === id);
  if (!c) return null;
  const knowledge = knowledgeFor(c.kind) ?? fallbackKnowledge(c);
  const byId = (i: string) => model.components.find((x) => x.id === i);
  const parent = c.parentId ? byId(c.parentId) : null;
  const children = model.components.filter((x) => x.parentId === c.id).slice(0, 12);
  const dims = (Object.keys(c.dims) as DimensionKey[]).map((key) => ({ key, label: DIM_LABELS[key], dim: c.dims[key]! }));
  let status: Provenance = c.geometrySource === "project" ? "measured" : "assumed";
  for (const d of dims) if (RANK[d.dim.status] > RANK[status]) status = d.dim.status;
  for (const q of c.quantities) if (RANK[q.status] > RANK[status]) status = q.status;
  const name = c.instanceNames && instance !== null ? c.instanceNames[instance] : null;
  return {
    id: c.id, name: c.name, title: knowledge.title, category: CATEGORY_LABELS[c.category], subcategory: c.subcategory, storey: c.storeyName ?? "Site and below ground", room: c.room, grid: c.grid, layer: LAYER_LABELS[c.layer],
    material: materialOf(c.materialId).name, stage: STAGE_BY_ID[c.stage], removedAfter: c.removedAfter ? STAGE_BY_ID[c.removedAfter] : null,
    parent: parent ? { id: parent.id, name: parent.name } : null, children: children.map((x) => ({ id: x.id, name: x.name })),
    connected: [...c.connectedIds, ...(parent ? [parent.id] : [])].map(byId).filter((x): x is ComponentRecord => !!x).map((x) => ({ id: x.id, name: x.name })),
    sequence: c.sequence, knowledge, dims, geometrySource: c.geometrySource,
    geometryLabel: c.geometrySource === "project" ? "Taken from the project's own geometry" : "Schematic illustration: not taken from the drawing",
    sourceRef: c.sourceRef, status, statusLabel: PROVENANCE_LABELS[status], quantities: c.quantities, quantityMethod: knowledge.quantityMethod,
    instance: instance !== null ? { index: instance, name: name ?? `${c.repeated?.noun ?? "item"} ${instance + 1}` } : null, repeated: c.repeated?.noun ?? null, note: c.note ?? null, loose: !!c.loose, concealed: !!c.concealed,
  };
}
