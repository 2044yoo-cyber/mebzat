import { LAYER_IDS, STAGE_IDS, type CategoryId, type ComponentRecord, type ConstructionModel, type CutawayMode, type LayerId, type StageId, type ViewState } from "./types";
import { DEFAULT_VIEW } from "./types";

/**
 * What the learner sees, decided from the model and a `ViewState`. Everything
 * here is a pure function: no geometry is changed, so switching a layer off,
 * isolating a part or exploding the model and then resetting always leaves the
 * model exactly as it was built.
 */

export type Visibility = "solid" | "ghost" | "hidden";

export type ModelIndex = {
  byId: Map<string, ComponentRecord>;
  children: Map<string, string[]>;
  maxPour: number;
  floors: Map<number, { floorZ: number; height: number }>;
};

export function indexModel(model: ConstructionModel): ModelIndex {
  const byId = new Map<string, ComponentRecord>();
  const children = new Map<string, string[]>();
  let maxPour = 0;
  for (const c of model.components) {
    byId.set(c.id, c);
    if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
    if (c.pour && c.pour > maxPour) maxPour = c.pour;
  }
  const floors = new Map<number, { floorZ: number; height: number }>();
  for (const s of model.storeys) floors.set(s.index, { floorZ: s.elevation, height: s.floorToFloor });
  return { byId, children, maxPour, floors };
}

/** A component and everything that hangs off it. */
export function subtreeOf(index: ModelIndex, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...(index.children.get(next) ?? []));
  }
  return out;
}

const SEVERITY: Record<Visibility, number> = { solid: 0, ghost: 1, hidden: 2 };
const worse = (a: Visibility, b: Visibility): Visibility => (SEVERITY[a] >= SEVERITY[b] ? a : b);

const isSteel = (c: ComponentRecord) => c.layer === "reinforcement";
const isTemporary = (c: ComponentRecord) => c.layer === "formwork" || c.layer === "props";
const isConcrete = (c: ComponentRecord) => c.layer === "concrete";
/** Stages whose lesson has the frame views. */
const FRAME_STAGES: readonly StageId[] = [3, 5];

/** Which choice in `ModelOptions` a variant group follows. */
function variantMatches(c: ComponentRecord, view: ViewState): boolean {
  if (!c.variant) return true;
  if (c.variant.group === "roof") return view.options.roofType === c.variant.value;
  if (c.variant.group === "floorFinish") return view.options.floorFinish === c.variant.value;
  if (c.variant.group === "blockType") return view.options.blockType === c.variant.value;
  return true;
}

export function visibilityOf(c: ComponentRecord, view: ViewState, index: ModelIndex, isolated: Set<string> | null = null): Visibility {
  if (view.hiddenIds.includes(c.id)) return "hidden";
  if (!variantMatches(c, view)) return "hidden";
  if (c.storeyId && view.storeysOff.includes(c.storeyId)) return "hidden";
  if (view.categoriesOff.includes(c.category)) return "hidden";
  if (view.layersOff.includes(c.layer)) return "hidden";

  let v: Visibility = "solid";

  // Time: not built yet, or already taken away.
  if (c.stage > view.stage) v = view.ghostFuture ? "ghost" : "hidden";
  else if (c.removedAfter !== undefined && c.removedAfter < view.stage) return "hidden";
  if (v === "hidden") return v;

  if (view.onlyThisStage && c.stage !== view.stage) v = worse(v, view.transparentContext ? "ghost" : "hidden");

  // Frame views at the foundation and frame stages, and embedded steel afterwards.
  if (c.stage === view.stage && FRAME_STAGES.includes(view.stage)) {
    if (view.stage === 5 || view.stage === 3) {
      switch (view.frameView) {
        case "complete":
          if (isConcrete(c)) v = worse(v, "ghost");
          break;
        case "reinforcement":
          if (isConcrete(c)) v = worse(v, "ghost");
          if (isTemporary(c)) v = "hidden";
          break;
        case "formwork":
          if (isConcrete(c)) v = worse(v, "ghost");
          if (isSteel(c)) v = "hidden";
          break;
        case "placement": {
          const pour = c.pour ?? 0;
          if (isConcrete(c)) v = pour <= view.pourStep ? v : "hidden";
          else if (isSteel(c) && pour <= view.pourStep && pour > 0) v = "hidden";
          break;
        }
        case "completed":
          if (isSteel(c) || isTemporary(c)) v = "hidden";
          break;
      }
    }
  } else if (c.stage < view.stage && isSteel(c)) {
    // Steel is inside the concrete once the stage is over, unless the learner has isolated layers that include it.
    if (!view.showEmbedded) v = "hidden";
  }
  if (v === "hidden") return v;

  // Services: shown through the walls, or left inside them, depending on the view.
  if (view.stage >= 9) {
    if (c.concealed && view.options.mepView === "finished" && view.stage >= coverStage(c)) return "hidden";
    if (view.options.mepView === "concealed" && view.stage <= 12 && !c.concealed && !(c.category === "electrical" || c.category === "plumbing") && isBuildingSkin(c)) v = worse(v, "ghost");
  }

  // Isolation: the isolated part and what hangs off it stay; the rest is context or gone.
  if (view.isolateId) {
    const set = isolated ?? subtreeOf(index, view.isolateId);
    if (!set.has(c.id)) v = worse(v, view.transparentContext ? "ghost" : "hidden");
  }
  return v;
}

/** The stage at which a buried component is covered: services by the plaster, anything else by the next stage's work. */
export function coverStage(c: ComponentRecord): number {
  return c.category === "electrical" || c.category === "plumbing" ? 11 : c.stage + 1;
}

/** The surfaces that would hide services inside them. */
function isBuildingSkin(c: ComponentRecord): boolean {
  return c.layer === "masonry" || c.layer === "plaster" || c.layer === "paint" || c.layer === "ceiling" || c.layer === "concrete" || c.layer === "tile" || c.layer === "screed";
}

export type Visible = { component: ComponentRecord; visibility: Exclude<Visibility, "hidden"> };

export function visibleComponents(model: ConstructionModel, view: ViewState, index: ModelIndex = indexModel(model)): Visible[] {
  const isolated = view.isolateId ? subtreeOf(index, view.isolateId) : null;
  const out: Visible[] = [];
  for (const component of model.components) {
    const visibility = visibilityOf(component, view, index, isolated);
    if (visibility !== "hidden") out.push({ component, visibility });
  }
  return out;
}

/** Instances of a repeated component that are shown: walls are built up course by course while masonry is taught. */
export function shapeVisible(c: ComponentRecord, shapeIndex: number, view: ViewState, index: ModelIndex): boolean {
  if (view.stage !== 7 || view.wallProgress >= 1) return true;
  if (c.category !== "masonry" || (c.kind !== "wall-blocks" && c.kind !== "mortar")) return true;
  const floor = index.floors.get(c.storeyIndex);
  const shape = c.shapes[shapeIndex];
  if (!floor || !shape) return true;
  const z = shape.t === "box" ? shape.c.z : shape.t === "cyl" ? shape.c.z : (shape.z0 + shape.z1) / 2;
  return z - floor.floorZ <= Math.max(0, view.wallProgress) * floor.height;
}

// ---------------------------------------------------------------------------
// Cut-away
// ---------------------------------------------------------------------------

export type CutPlane = { axis: "x" | "y" | "z"; value: number; keep: "below" | "above" };

/** A plane that slices the model, or null when no cut-away is on. The viewer clips everything on one side of it. */
export function cutPlane(model: ConstructionModel, view: ViewState): CutPlane | null {
  const mode: CutawayMode = view.cutaway.mode;
  if (mode === "off") return null;
  const { min, max } = model.bounds;
  const f = Math.max(0, Math.min(1, view.cutaway.position));
  if (mode === "level") return { axis: "z", value: min.z + (max.z - min.z) * f, keep: "below" };
  if (mode === "section-x") return { axis: "x", value: min.x + (max.x - min.x) * f, keep: "above" };
  return { axis: "y", value: min.y + (max.y - min.y) * f, keep: "above" };
}

// ---------------------------------------------------------------------------
// View-state helpers
// ---------------------------------------------------------------------------

export function resetView(options: ViewState["options"] = DEFAULT_VIEW.options): ViewState {
  return { ...DEFAULT_VIEW, options };
}

/** Move to a stage, putting the per-stage choices back to their start. */
export function setStage(view: ViewState, stage: StageId): ViewState {
  return { ...view, stage, frameView: "complete", pourStep: 99, wallProgress: 1, selectedId: null, selectedInstance: null, isolateId: null };
}

export function stepStage(view: ViewState, by: 1 | -1): ViewState {
  const next = STAGE_IDS[Math.max(0, Math.min(STAGE_IDS.length - 1, STAGE_IDS.indexOf(view.stage) + by))]!;
  return setStage(view, next);
}

export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** Show one layer on its own: every other layer off. */
export function isolateLayer(view: ViewState, layer: LayerId): ViewState {
  return { ...view, layersOff: LAYER_IDS.filter((l) => l !== layer), showEmbedded: true };
}

export function showAll(view: ViewState): ViewState {
  return { ...view, storeysOff: [], categoriesOff: [], layersOff: [], hiddenIds: [], isolateId: null, showEmbedded: false };
}

/** Floor-by-floor visibility: show only the storeys up to and including this one. */
export function showStoreysUpTo(model: ConstructionModel, view: ViewState, index: number): ViewState {
  return { ...view, storeysOff: model.storeys.filter((s) => s.index > index).map((s) => s.id) };
}

export function categoriesPresent(model: ConstructionModel): CategoryId[] {
  const seen = new Set<CategoryId>();
  for (const c of model.components) seen.add(c.category);
  return [...seen];
}
