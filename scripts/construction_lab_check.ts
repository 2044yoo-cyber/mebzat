/**
 * The construction learning model: the sample house, the 18 stages, the
 * exploded view, and the quantities behind it.
 *
 *   npx tsx scripts/construction_lab_check.ts
 *
 * Expected numbers are worked out here from the project's own dimensions, or
 * measured by an independent method (a voxel union of the concrete shapes), not
 * read back from the generators. Calls are asserted, not identifiers: every
 * check reaches the behaviour through the public functions the app uses.
 */
import assert from "node:assert/strict";

import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { createHouseProject, houseProjectSchema } from "../src/features/house-designer/types/project";
import {
  CATEGORY_IDS, DEFAULT_OPTIONS, DEFAULT_VIEW, LAYER_IDS, PROVENANCE, STAGES, STAGE_IDS, aggregateQuantities, buildConstructionModel, buildLearningModel, cutPlane, describeComponent, explodeInfo,
  indexModel, isolateLayer, knowledgeFor, materialOf, missingData, normalizeParams, resetView, setStage, shapeOffset, shapeVisible, showStoreysUpTo, steelKgPerMetre, stepStage, subtreeOf, toBoqDraft, totalOf, visibilityOf,
  visibleComponents,
  type ComponentRecord, type ConstructionModel, type StageId, type ViewState,
} from "../src/features/house-designer/construction";
import { constructionTakeoffPackage } from "../src/features/house-designer/construction/takeoff-handoff";
import { parseHouseTakeoffPackage } from "../src/features/house-designer/services/takeoff-adapter";
import { layoutLabels } from "../src/features/house-designer/construction/label-layout";
import type { Shape } from "../src/features/house-designer/construction/geometry";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

const sample = buildLearningModel();
const { project, model } = sample;
const index = indexModel(model);
const view = (patch: Partial<ViewState> = {}): ViewState => ({ ...DEFAULT_VIEW, stage: 18, ...patch });
const visibleIds = (v: ViewState) => new Set(visibleComponents(model, v, index).map((x) => x.component.id));
const lines = aggregateQuantities(model);
const line = (workItem: string) => lines.find((l) => l.workItem === workItem);

// ---------------------------------------------------------------------------
// The sample loads, and is valid project data
// ---------------------------------------------------------------------------
{
  equal(project.levels.length, 3, "the sample has three storeys");
  equal(sample.issues.length, 0, "the default dimensions raise no warnings");
  equal(project.metadata.title, "Medosha Three-Storey Learning House", "the sample is named so it cannot be mistaken for a user's house");
  houseProjectSchema.parse(JSON.parse(JSON.stringify(project)));
  checks += 1;
  // Floor-to-floor heights follow the dimension setting.
  equal(project.levels.map((l) => l.elevation), [0, 3200, 6400], "storeys 3200 mm apart");
  equal(project.walls.filter((w) => w.levelId === project.levels[0]!.id && w.thickness === 200).length > 0, true, "external walls are 200 mm");
  ok(project.rooms.length >= 24, "rooms on every storey");
  ok(project.structuralColumns.length >= 40 && project.structuralBeams.length >= 60, "a structural grid of columns and beams");
  ok(project.doors.length > 0 && project.windows.length > 0 && project.stairs.length === 2, "doors, windows and a stair between each pair of floors");
}

// Dimensions are configurable, with a warning for impossible values.
{
  const taller = buildLearningModel({ floorToFloor: 3500, slabThickness: 150, externalWall: 230 });
  equal(taller.project.levels.map((l) => l.elevation), [0, 3500, 7000], "floor-to-floor setting reaches the storeys");
  const wall = taller.model.components.find((c) => c.id.startsWith("masonry:") && c.dims.thickness?.value === 230);
  ok(wall, "the wall thickness setting reaches the blockwork");
  const bad = normalizeParams({ floorToFloor: 1200, doorHeight: 9000, beamDepth: 5000 });
  ok(bad.issues.length >= 2, "impossible dimensions are corrected with a message");
  ok(bad.params.floorToFloor >= 2400, "floor-to-floor is held to a usable height");
}

// ---------------------------------------------------------------------------
// The model is derived, deterministic and leaves the project alone
// ---------------------------------------------------------------------------
{
  const before = JSON.stringify(project);
  const again = buildConstructionModel(project);
  equal(JSON.stringify(project), before, "building the model does not modify the project");
  equal(again.components.map((c) => c.id), model.components.map((c) => c.id), "the same project gives the same component ids");
  equal(JSON.stringify(again.components.map((c) => c.quantities.map((q) => [q.id, q.value]))), JSON.stringify(model.components.map((c) => c.quantities.map((q) => [q.id, q.value]))), "and the same quantities");
  equal(new Set(model.components.map((c) => c.id)).size, model.components.length, "component ids are unique");
  const keys = Object.keys(project).sort();
  const plain = Object.keys(houseProjectSchema.parse(JSON.parse(JSON.stringify(project)))).sort();
  equal(keys, plain, "the project carries no construction data: nothing to break save and load");
}

// Existing (user) projects: a normal project builds, is untouched, and an empty one does not crash.
{
  const user = createHouseProject({ id: "user-house", title: "My house", room: project.levels[0]!.plan!, style: "modern", strict: false, floorCount: 2, floorToFloorHeight: 3000 });
  const before = JSON.stringify(user);
  const built = buildConstructionModel(user);
  equal(JSON.stringify(user), before, "a user's project is not modified by the model");
  ok(built.components.length > 100, "a user's own project builds into a model");
  ok(built.components.every((c) => STAGE_IDS.includes(c.stage)), "with valid stages");
  const empty = buildConstructionModel({ ...user, levels: [], walls: [], rooms: [] });
  equal(empty.components.length, 0, "a project with no plan builds nothing");
  ok(empty.warnings.length > 0, "and says why");
}

// ---------------------------------------------------------------------------
// Stages, categories, lessons, knowledge
// ---------------------------------------------------------------------------
{
  equal(STAGES.length, 18, "18 stages");
  equal(STAGES.map((s) => s.id), [...STAGE_IDS], "in order");
  for (const s of STAGES) {
    ok(s.learn.length > 0 && s.sequence.length > 0 && s.qualityChecks.length > 0 && s.safety.length > 0 && s.quantityNote.length > 0, `stage ${s.id} has a lesson, a sequence, checks, safety and a quantity note`);
    ok(model.components.some((c) => c.stage === s.id), `stage ${s.id} controls components`);
  }
  for (const category of CATEGORY_IDS) ok(model.components.some((c) => c.category === category), `category ${category} is represented`);
  for (const c of model.components) {
    ok(knowledgeFor(c.kind), `${c.id}: a lesson exists for ${c.kind}`);
    ok(materialOf(c.materialId), `${c.id}: a material`);
    ok(LAYER_IDS.includes(c.layer), `${c.id}: a known layer`);
    for (const d of Object.values(c.dims)) ok(PROVENANCE.includes(d.status), `${c.id}: dimension status`);
    for (const q of c.quantities) { ok(PROVENANCE.includes(q.status), `${q.id}: status`); ok(q.formula.length > 0, `${q.id}: a formula`); }
  }
}

// ---------------------------------------------------------------------------
// The timeline drives what is built
// ---------------------------------------------------------------------------
{
  for (const stage of STAGE_IDS) {
    const shown = visibleComponents(model, view({ stage }), index);
    ok(shown.every((x) => x.component.stage <= stage), `stage ${stage}: nothing from a later stage is built`);
    ok(shown.every((x) => x.component.removedAfter === undefined || x.component.removedAfter >= stage), `stage ${stage}: temporary works are removed on time`);
    ok(model.components.filter((c) => c.stage === stage && !c.variant).every((c) => visibilityOf(c, view({ stage, frameView: "complete" }), index) !== "hidden" || c.layer === "reinforcement" || c.layer === "formwork" || c.layer === "props"), `stage ${stage}: its own components appear`);
  }
  const s1 = visibleIds(view({ stage: 1 }));
  const s3 = visibleIds(view({ stage: 3 }));
  ok(s3.size > s1.size, "the model grows from stage 1 to stage 3");
  ok(![...visibleIds(view({ stage: 2 }))].some((id) => id.startsWith("found:")), "no foundation at the excavation stage");
  ok(![...visibleIds(view({ stage: 6 }))].some((id) => id.startsWith("masonry:")), "no blockwork before the masonry stage");
  ok([...visibleIds(view({ stage: 7 }))].some((id) => id.startsWith("masonry:")), "blockwork at the masonry stage");
  // Temporary works go.
  ok(model.components.some((c) => c.layer === "formwork" && c.removedAfter !== undefined), "formwork is temporary");
  const formAt5 = visibleComponents(model, view({ stage: 5, frameView: "formwork" }), index).filter((x) => x.component.layer === "formwork").length;
  const formAt6 = visibleComponents(model, view({ stage: 6 }), index).filter((x) => x.component.layer === "formwork" && x.component.category === "frame").length;
  ok(formAt5 > 0 && formAt6 === 0, "frame formwork is there during the frame stage and gone after it");
  // Only this stage, ghost future, previous/next.
  const only = visibleComponents(model, view({ stage: 7, onlyThisStage: true, transparentContext: false }), index);
  ok(only.length > 0 && only.every((x) => x.component.stage === 7), "only-this-stage shows nothing else");
  const ctxView = visibleComponents(model, view({ stage: 7, onlyThisStage: true, transparentContext: true }), index);
  ok(ctxView.some((x) => x.visibility === "ghost") && ctxView.filter((x) => x.visibility === "solid").every((x) => x.component.stage === 7), "with a transparent context the rest is ghosted, not removed");
  const future = visibleComponents(model, view({ stage: 3, ghostFuture: true }), index);
  ok(future.some((x) => x.component.stage > 3 && x.visibility === "ghost") && future.filter((x) => x.component.stage > 3).every((x) => x.visibility === "ghost"), "later stages can be shown as ghosts");
  equal(stepStage(view({ stage: 5 }), 1).stage, 6, "next stage");
  equal(stepStage(view({ stage: 5 }), -1).stage, 4, "previous stage");
  equal(stepStage(view({ stage: 1 }), -1).stage, 1, "previous stops at the first");
  equal(stepStage(view({ stage: 18 }), 1).stage, 18, "next stops at the last");
  equal(setStage(view({ stage: 5, frameView: "formwork", pourStep: 1 }), 6).frameView, "complete", "moving stage puts the frame view back");
}

// ---------------------------------------------------------------------------
// Frame views
// ---------------------------------------------------------------------------
{
  const at = (frameView: ViewState["frameView"], pourStep = 99) => visibleComponents(model, view({ stage: 5, frameView, pourStep }), index).filter((x) => x.component.stage === 5);
  const layerCounts = (items: ReturnType<typeof at>, layer: string) => items.filter((x) => x.component.layer === layer).length;
  const complete = at("complete");
  ok(layerCounts(complete, "reinforcement") > 0 && layerCounts(complete, "formwork") > 0 && layerCounts(complete, "concrete") > 0, "complete: steel, formwork and concrete");
  ok(complete.filter((x) => x.component.layer === "concrete").every((x) => x.visibility === "ghost"), "complete: the concrete is see-through so the steel shows");
  const steel = at("reinforcement");
  ok(layerCounts(steel, "reinforcement") > 0 && layerCounts(steel, "formwork") === 0 && layerCounts(steel, "props") === 0, "reinforcement only: no formwork");
  const forms = at("formwork");
  ok(layerCounts(forms, "formwork") > 0 && layerCounts(forms, "reinforcement") === 0, "formwork only: no steel");
  const done = at("completed");
  ok(layerCounts(done, "concrete") > 0 && layerCounts(done, "reinforcement") === 0 && layerCounts(done, "formwork") === 0 && layerCounts(done, "props") === 0, "completed: concrete alone");
  ok(done.filter((x) => x.component.layer === "concrete").every((x) => x.visibility === "solid"), "completed: solid concrete");
  const none = at("placement", 0);
  const all = at("placement", 99);
  equal(layerCounts(none, "concrete"), 0, "placement sequence: nothing poured at step 0");
  ok(layerCounts(all, "concrete") === layerCounts(done, "concrete"), "placement sequence: everything poured at the end");
  const mid = at("placement", 5);
  ok(layerCounts(mid, "concrete") > 0 && layerCounts(mid, "concrete") < layerCounts(all, "concrete"), "placement sequence: part way, part poured");
  const poured = mid.filter((x) => x.component.layer === "concrete").map((x) => x.component.pour ?? 0);
  ok(poured.every((p) => p <= 5) && Math.max(...poured) === 5, "placement sequence: zones up to the step are poured, and the step itself is");
  ok(index.maxPour >= 8, "a placement sequence of several zones");
  // After the stage the steel is inside the concrete.
  ok(!visibleComponents(model, view({ stage: 9 }), index).some((x) => x.component.layer === "reinforcement" && x.component.stage < 9), "steel is inside the concrete once the stage is over");
  // Foundation stage has the same views.
  const f = visibleComponents(model, view({ stage: 3, frameView: "reinforcement" }), index).filter((x) => x.component.stage === 3);
  ok(f.some((x) => x.component.layer === "reinforcement") && !f.some((x) => x.component.layer === "formwork"), "foundation steel-only view");
}

// ---------------------------------------------------------------------------
// Services: seen through the walls, or left inside them
// ---------------------------------------------------------------------------
{
  const conduit = model.components.find((c) => c.kind === "conduit" && c.category === "electrical" && c.concealed)!;
  const pipes = model.components.find((c) => c.kind === "pipe-cold" && c.concealed)!;
  const framing = model.components.find((c) => c.kind === "ceiling-channel" && c.concealed)!;
  const seen = (c: ComponentRecord, stage: StageId, mepView: "concealed" | "visible" | "finished") => visibleIds(view({ stage, options: { ...DEFAULT_OPTIONS, mepView } })).has(c.id);
  ok(seen(conduit, 9, "finished") && seen(conduit, 10, "finished"), "conduit is seen while it is being fixed");
  ok(!seen(conduit, 11, "finished") && !seen(conduit, 18, "finished"), "and is inside the plaster once the walls are finished");
  ok(seen(conduit, 18, "visible") && seen(conduit, 18, "concealed"), "the visible and concealed views keep the services on show");
  ok(!seen(pipes, 11, "finished") && seen(pipes, 10, "finished") && seen(pipes, 18, "visible"), "pipes follow the same rule");
  ok(seen(framing, 12, "finished") && !seen(framing, 13, "finished") && seen(framing, 18, "visible"), "ceiling framing is covered by the boards at the next stage");
  const wall = model.components.find((c) => c.kind === "wall-blocks")!;
  equal(visibilityOf(wall, view({ stage: 10, options: { ...DEFAULT_OPTIONS, mepView: "concealed" } }), index), "ghost", "the concealed view sees through the walls");
  equal(visibilityOf(wall, view({ stage: 10, options: { ...DEFAULT_OPTIONS, mepView: "finished" } }), index), "solid", "the finished view keeps them solid");
}

// ---------------------------------------------------------------------------
// Layers, categories, storeys, isolation
// ---------------------------------------------------------------------------
{
  const base = visibleIds(view());
  const noPaint = visibleIds(view({ layersOff: ["paint"] }));
  ok(noPaint.size < base.size && [...noPaint].every((id) => index.byId.get(id)!.layer !== "paint"), "hiding the paint layer hides paint only");
  const noMasonry = visibleIds(view({ categoriesOff: ["masonry"] }));
  ok([...noMasonry].every((id) => index.byId.get(id)!.category !== "masonry") && noMasonry.size < base.size, "hiding a category hides it");
  const first = model.storeys[1]!;
  const noFirst = visibleIds(view({ storeysOff: [first.id] }));
  ok([...noFirst].every((id) => index.byId.get(id)!.storeyId !== first.id) && noFirst.size < base.size, "a floor can be hidden");
  ok([...noFirst].some((id) => index.byId.get(id)!.storeyId === model.storeys[0]!.id) && [...noFirst].some((id) => index.byId.get(id)!.storeyId === model.storeys[2]!.id), "the floors above and below stay");
  const upTo0 = visibleIds(view(showStoreysUpTo(model, view(), 0)));
  ok([...upTo0].every((id) => { const c = index.byId.get(id)!; return c.storeyIndex <= 0; }), "floor-by-floor: only up to the chosen storey");
  const solo = visibleIds(view(isolateLayer(view(), "glass")));
  ok(solo.size > 0 && [...solo].every((id) => index.byId.get(id)!.layer === "glass"), "a layer can be shown on its own");
  const hiddenOne = [...base][5]!;
  ok(!visibleIds(view({ hiddenIds: [hiddenOne] })).has(hiddenOne), "one component can be hidden");
  // Isolating a component keeps its sub-assembly.
  const door = model.components.find((c) => c.kind === "door-frame")!;
  const sub = subtreeOf(index, door.id);
  ok(sub.size > 1, "a door frame has parts hanging off it");
  const iso = visibleComponents(model, view({ isolateId: door.id, transparentContext: false }), index);
  ok(iso.length === [...sub].filter((id) => base.has(id)).length && iso.every((x) => sub.has(x.component.id) && x.visibility === "solid"), "isolate: the part and its sub-assembly alone");
  const ghost = visibleComponents(model, view({ isolateId: door.id, transparentContext: true }), index);
  ok(ghost.length === base.size && ghost.filter((x) => x.visibility === "solid").every((x) => sub.has(x.component.id)) && ghost.some((x) => x.visibility === "ghost"), "isolate with a transparent context: the rest becomes a ghost");
  // Reset puts everything back.
  const mangled = view({ layersOff: ["paint"], categoriesOff: ["roof"], storeysOff: [first.id], hiddenIds: [hiddenOne], isolateId: door.id, explode: { amount: 0.7, floors: true, categories: true, layers: true }, cutaway: { mode: "level", position: 0.3 } });
  const fresh = resetView();
  equal(fresh, DEFAULT_VIEW, "reset gives the default view");
  equal([...visibleIds({ ...fresh, stage: 18 })].sort(), [...visibleIds(view())].sort(), "and the same visible set as a fresh start");
  ok(mangled.hiddenIds.length === 1, "the mangled view was a real change");
}

// ---------------------------------------------------------------------------
// Variants: roof type and the build options
// ---------------------------------------------------------------------------
{
  const flat = visibleIds(view({ options: { ...DEFAULT_OPTIONS, roofType: "flat" } }));
  const pitched = visibleIds(view({ options: { ...DEFAULT_OPTIONS, roofType: "pitched" } }));
  ok(flat.has("roof:flat:membrane") && !flat.has("roof:pitched:covering"), "flat roof alternative");
  ok(pitched.has("roof:pitched:covering") && !pitched.has("roof:flat:membrane"), "pitched roof alternative");
  const flatLines = aggregateQuantities(model, { ...DEFAULT_OPTIONS, roofType: "flat" });
  const pitchedLines = aggregateQuantities(model, { ...DEFAULT_OPTIONS, roofType: "pitched" });
  ok(flatLines.some((l) => l.workItem === "waterproofing.roof-membrane") && !flatLines.some((l) => l.workItem === "roof.covering"), "flat roof quantities only");
  ok(pitchedLines.some((l) => l.workItem === "roof.covering") && !pitchedLines.some((l) => l.workItem === "waterproofing.roof-membrane"), "pitched roof quantities only");
  // Plan area versus sloped area.
  const covering = model.components.find((c) => c.id === "roof:pitched:covering")!.quantities[0]!;
  const plan = Number(covering.inputs.planArea);
  const sloped = Number(covering.inputs.slopedArea);
  near(sloped / plan, 1 / Math.cos((25 * Math.PI) / 180), "the covering is the sloped area, plan ÷ cos(pitch)", 1e-3);
  ok(sloped > plan, "and larger than the plan area");
  const flatMembrane = flatLines.find((l) => l.workItem === "waterproofing.roof-membrane")!;
  near(flatMembrane.net!, model.components.find((c) => c.id === "roof:flat:membrane")!.dims.area!.value!, "a flat roof's surface equals its plan area", 0.01);
  // Block type and floor finish change what is built.
  const brick = buildLearningModel({}, { blockType: "brick" }).model;
  const hollow = model;
  ok(brick.components.filter((c) => c.kind === "wall-blocks").reduce((s, c) => s + c.shapes.length, 0) < hollow.components.filter((c) => c.kind === "wall-blocks").reduce((s, c) => s + c.shapes.length, 0), "brick is drawn course by course, hollow block by block");
  const cer = buildLearningModel({}, { floorFinish: "ceramic" }).model;
  const tilesOf = (m: ConstructionModel) => aggregateQuantities(m).find((l) => l.workItem === "flooring.tile-count")!.net!;
  ok(tilesOf(cer) > tilesOf(model), "smaller ceramic tiles need more of them than porcelain");
}

// ---------------------------------------------------------------------------
// Exploded view
// ---------------------------------------------------------------------------
{
  const snapshot = JSON.stringify(model.components);
  const amounts = [0, 1, 0.5, 0, 0.25, 1, 0];
  const centre = { x: (model.bounds.min.x + model.bounds.max.x) / 2, y: (model.bounds.min.y + model.bounds.max.y) / 2, z: 0 };
  for (let round = 0; round < 4; round += 1) {
    for (const amount of amounts) {
      const v = view({ explode: { amount, floors: true, categories: true, layers: true } });
      let moved = 0;
      for (const c of model.components) {
        const info = explodeInfo(c, v, model);
        const off = shapeOffset(c.shapes[0] ?? { t: "box", c: centre, s: centre }, info, centre);
        if (amount === 0) assert.deepEqual(off, { x: 0, y: 0, z: 0 });
        else if (Math.abs(off.x) + Math.abs(off.y) + Math.abs(off.z) > 0) moved += 1;
      }
      if (amount > 0) ok(moved > model.components.length / 2, `exploding by ${amount} moves most components`);
      else checks += 1;
    }
  }
  equal(JSON.stringify(model.components), snapshot, "exploding and assembling repeatedly leaves the geometry exactly as it was");
  // Floors separate upward, layers fan out along their direction, and the switches work independently.
  const col0 = model.components.find((c) => c.kind === "column" && c.storeyIndex === 0)!;
  const col2 = model.components.find((c) => c.kind === "column" && c.storeyIndex === 2)!;
  const v1 = view({ explode: { amount: 1, floors: true, categories: false, layers: false } });
  ok(explodeInfo(col2, v1, model).base.z > explodeInfo(col0, v1, model).base.z, "higher storeys rise further");
  const none = view({ explode: { amount: 1, floors: false, categories: false, layers: false } });
  equal(explodeInfo(col2, none, model).base, { x: 0, y: 0, z: 0 }, "with every switch off nothing moves");
  const catOnly = view({ explode: { amount: 1, floors: false, categories: true, layers: false } });
  ok(explodeInfo(col2, catOnly, model).base.z === 0 && Math.abs(explodeInfo(col2, catOnly, model).base.x) + Math.abs(explodeInfo(col2, catOnly, model).base.y) > 0, "categories separate sideways, not up");
  const layered = model.components.filter((c) => c.id.startsWith("masonry:") && !c.id.includes(":")).slice(0, 1);
  void layered;
  const wall = model.components.find((c) => c.kind === "wall-blocks")!;
  const mortar = model.components.find((c) => c.kind === "mortar" && c.parentId === wall.id)!;
  const lay = view({ explode: { amount: 1, floors: false, categories: false, layers: true } });
  equal(explodeInfo(mortar, view({ explode: { amount: 1, floors: true, categories: true, layers: false } }), model).layerDistance, 0, "with the layers switch off layers stay together");
  const dWall = explodeInfo(wall, lay, model).layerDistance;
  const dMortar = explodeInfo(mortar, lay, model).layerDistance;
  ok(dMortar > dWall, "the mortar layer sits further out than the blocks");
  ok(Math.abs(explodeInfo(wall, lay, model).dir.x) + Math.abs(explodeInfo(wall, lay, model).dir.y) > 0, "wall layers separate along the wall's face normal");
}

// ---------------------------------------------------------------------------
// Cut-away and the masonry build-up
// ---------------------------------------------------------------------------
{
  equal(cutPlane(model, view()), null, "no cut-away by default");
  const level = cutPlane(model, view({ cutaway: { mode: "level", position: 0.5 } }))!;
  near(level.value, (model.bounds.min.z + model.bounds.max.z) / 2, "level cut at half height", 1e-6);
  equal(level.keep, "below", "a level cut keeps what is below it");
  const sx = cutPlane(model, view({ cutaway: { mode: "section-x", position: 0.25 } }))!;
  equal(sx.axis, "x", "section along x");
  const wall = model.components.find((c) => c.kind === "wall-blocks" && c.storeyIndex === 0)!;
  const idx = indexModel(model);
  const count = (p: number) => wall.shapes.filter((_, i) => shapeVisible(wall, i, view({ stage: 7, wallProgress: p }), idx)).length;
  ok(count(0.25) < count(0.5) && count(0.5) < count(1) && count(1) === wall.shapes.length, "partial walls: more courses as progress rises");
  equal(wall.shapes.filter((_, i) => shapeVisible(wall, i, view({ stage: 8, wallProgress: 0.2 }), idx)).length, wall.shapes.length, "progress applies only while the masonry stage is taught");
}

// ---------------------------------------------------------------------------
// Labels never overlap and never leave the view
// ---------------------------------------------------------------------------
{
  const anchors = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, text: `Label number ${i}`, x: 120 + (i % 3) * 14, y: 160 + (i % 2) * 6 }));
  const boxes = layoutLabels(anchors, 360, 300);
  ok(boxes.length >= 8, "crowded labels are mostly placed");
  for (const a of boxes) {
    ok(a.bx >= 0 && a.by >= 0 && a.bx + a.w <= 360 && a.by + a.h <= 300, `${a.id} stays inside the view`);
    for (const b of boxes) if (a !== b) ok(a.bx >= b.bx + b.w || b.bx >= a.bx + a.w || a.by >= b.by + b.h || b.by >= a.by + a.h, `${a.id} and ${b.id} do not overlap`);
  }
  equal(layoutLabels([{ id: "x", text: "Lonely", x: 100, y: 100 }], 360, 300).length, 1, "a single label is placed");
  equal(layoutLabels([{ id: "x", text: "Lonely", x: 100, y: 100 }], 20, 20).length, 0, "a label that cannot fit is left out rather than overlapping");
}

// ---------------------------------------------------------------------------
// Selection and the learning panel
// ---------------------------------------------------------------------------
{
  const col = model.components.find((c) => c.kind === "column" && c.storeyIndex === 1 && c.grid)!;
  const info = describeComponent(model, col.id)!;
  equal(info.id, col.id, "the panel describes the selected component");
  equal(info.storey, "First Floor", "its storey");
  equal(info.stage.id, 5, "its construction stage");
  ok(info.grid && info.grid === col.grid, "its grid reference");
  equal(info.geometrySource, "project", "a column is read from the project");
  ok(info.dims.some((d) => d.key === "volume" && d.dim.status === "calculated"), "with a calculated volume");
  ok(info.knowledge.qualityChecks.length > 0 && info.knowledge.safety.length > 0 && info.knowledge.commonDefects.length > 0 && info.knowledge.maintenance.length > 0, "quality, safety, defects and maintenance");
  ok(info.quantities.some((q) => q.workItem === "concrete.column") && info.quantityMethod.length > 0, "how it is quantified");
  const schematic = describeComponent(model, model.components.find((c) => c.kind === "column-bars")!.id)!;
  equal(schematic.geometrySource, "schematic", "bars are labelled a schematic");
  ok(/not taken from the drawing/i.test(schematic.geometryLabel), "and say so");
  equal(describeComponent(model, "no-such-id"), null, "an unknown id is not described");
  const panels = model.components.find((c) => c.instanceNames && c.kind === "cabinet-panel")!;
  const inst = describeComponent(model, panels.id, 3)!;
  equal(inst.instance?.name, panels.instanceNames![3]!, "a selected instance carries its own name");
  const child = model.components.find((c) => c.parentId)!;
  equal(describeComponent(model, child.id)!.parent?.id, child.parentId, "the parent assembly is named");
  for (const c of model.components) { const i = describeComponent(model, c.id)!; ok(i.status && i.stage && i.storey, `${c.id}: describable`); }
}

// ---------------------------------------------------------------------------
// Quantities: concrete counted once
// ---------------------------------------------------------------------------
function inPoly(x: number, y: number, poly: readonly { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function bounds(s: Shape) {
  if (s.t === "box") {
    const r = Math.abs(s.rz ?? 0) > 1e-9 || s.rx || s.ry ? Math.hypot(s.s.x, s.s.y) / 2 : null;
    return r !== null ? { x0: s.c.x - r, x1: s.c.x + r, y0: s.c.y - r, y1: s.c.y + r, z0: s.c.z - s.s.z / 2, z1: s.c.z + s.s.z / 2 } : { x0: s.c.x - s.s.x / 2, x1: s.c.x + s.s.x / 2, y0: s.c.y - s.s.y / 2, y1: s.c.y + s.s.y / 2, z0: s.c.z - s.s.z / 2, z1: s.c.z + s.s.z / 2 };
  }
  if (s.t === "prism") { const xs = s.poly.map((p) => p.x); const ys = s.poly.map((p) => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: s.z0, z1: s.z1 }; }
  return { x0: s.c.x - s.r, x1: s.c.x + s.r, y0: s.c.y - s.r, y1: s.c.y + s.r, z0: s.c.z - s.len / 2, z1: s.c.z + s.len / 2 };
}
function covers(s: Shape, x: number, y: number, z: number): boolean {
  if (s.t === "prism") return z > s.z0 && z < s.z1 && inPoly(x, y, s.poly) && !(s.holes ?? []).some((h) => inPoly(x, y, h));
  if (s.t === "box") {
    if (s.rx || s.ry) return false;
    const rz = s.rz ?? 0;
    const dx = x - s.c.x;
    const dy = y - s.c.y;
    const lx = dx * Math.cos(rz) + dy * Math.sin(rz);
    const ly = -dx * Math.sin(rz) + dy * Math.cos(rz);
    return Math.abs(lx) < s.s.x / 2 && Math.abs(ly) < s.s.y / 2 && Math.abs(z - s.c.z) < s.s.z / 2;
  }
  return false;
}
function polyArea(poly: readonly { x: number; y: number }[]): number {
  return Math.abs(poly.reduce((sum, a, i) => { const b = poly[(i + 1) % poly.length]!; return sum + (a.x * b.y - b.x * a.y); }, 0)) / 2;
}
function shapeVolumeM3(s: Shape): number {
  if (s.t === "box") return (s.s.x * s.s.y * s.s.z) * 1e-9;
  if (s.t === "prism") return (polyArea(s.poly) - (s.holes ?? []).reduce((sum, h) => sum + polyArea(h), 0)) * (s.z1 - s.z0) * 1e-9;
  return 0;
}
{
  // The structural concrete that was netted exactly by the generator.
  const NETTED = ["concrete.column", "concrete.beam", "concrete.slab"];
  const comps = model.components.filter((c) => c.quantities.some((q) => NETTED.includes(q.workItem)));
  ok(comps.length > 100, "columns, beams and slabs to check");
  const R = 50;
  const x0 = Math.floor(model.bounds.min.x / R) * R;
  const y0 = Math.floor(model.bounds.min.y / R) * R;
  const z0 = Math.floor(-100 / R) * R;
  const nx = Math.ceil((model.bounds.max.x - x0) / R) + 1;
  const ny = Math.ceil((model.bounds.max.y - y0) / R) + 1;
  const nz = Math.ceil((model.bounds.max.z - z0) / R) + 1;
  const grid = new Uint8Array(nx * ny * nz);
  let naive = 0;
  for (const c of comps) {
    for (const s of c.shapes) {
      naive += shapeVolumeM3(s);
      const b = bounds(s);
      // Sample at the middle of each cell, nudged 7 mm off so no sample sits exactly on a face.
      for (let ix = Math.max(0, Math.floor((b.x0 - x0) / R) - 1); ix <= Math.min(nx - 1, Math.ceil((b.x1 - x0) / R) + 1); ix += 1) {
        const x = x0 + (ix + 0.5) * R + 7;
        if (x <= b.x0 || x >= b.x1) continue;
        for (let iy = Math.max(0, Math.floor((b.y0 - y0) / R) - 1); iy <= Math.min(ny - 1, Math.ceil((b.y1 - y0) / R) + 1); iy += 1) {
          const y = y0 + (iy + 0.5) * R + 7;
          if (y <= b.y0 || y >= b.y1) continue;
          for (let iz = Math.max(0, Math.floor((b.z0 - z0) / R) - 1); iz <= Math.min(nz - 1, Math.ceil((b.z1 - z0) / R) + 1); iz += 1) {
            const z = z0 + (iz + 0.5) * R + 7;
            if (z <= b.z0 || z >= b.z1) continue;
            if (covers(s, x, y, z)) grid[(iz * ny + iy) * nx + ix] = 1;
          }
        }
      }
    }
  }
  let filled = 0;
  for (let i = 0; i < grid.length; i += 1) filled += grid[i]!;
  const union = filled * R ** 3 * 1e-9;
  const counted = NETTED.reduce((s, w) => s + (line(w)?.net ?? 0), 0);
  near(counted / union, 1, "structural concrete equals the independent voxel union (no double counting at joins)", 0.02);
  const slabAndColumnsAndBeams = comps.reduce((s, c) => s + c.shapes.reduce((t, sh) => t + shapeVolumeM3(sh), 0), 0);
  ok(naive > counted * 1.01 && slabAndColumnsAndBeams === naive, "the plain sum of shapes would double count at the joins, so this check has teeth");
  // Column/beam intersections are counted once: a beam's net volume is less than its gross.
  const beam = model.components.find((c) => c.kind === "beam")!;
  const gross = beam.shapes.reduce((s, sh) => s + shapeVolumeM3(sh), 0);
  const q = beam.quantities.find((x) => x.workItem === "concrete.beam")!;
  ok(q.value! < gross, "a beam's concrete is net of the columns it frames into");
  // Slab concrete has the stair opening taken out.
  const slabWithHole = model.components.find((c) => c.kind === "slab" && c.shapes.some((s) => s.t === "prism" && (s.holes?.length ?? 0) > 0))!;
  const area = Number(slabWithHole.dims.area!.value);
  ok(area > 0 && slabWithHole.quantities[0]!.value! < (area + 7.2) * slabWithHole.dims.thickness!.value! * 1e-3, "slabs with stair openings are net of the opening");
  // Allowance kept apart.
  const concreteLine = lines.find((l) => l.workItem === "concrete.slab")!;
  near(concreteLine.allowanceQuantity!, concreteLine.net! * 0.05, "the concrete allowance is its own figure", 1e-4);
  equal(concreteLine.allowancePercent, 5, "stated as 5%");
  const flat = model.components.find((c) => c.id === "ground:slab")!;
  const slabQ = flat.quantities[0]!;
  ok(slabQ.allowance?.percent === 5 && slabQ.value === Math.round(slabQ.value! * 1e4) / 1e4, "the net quantity does not include the allowance");
}

// ---------------------------------------------------------------------------
// Steel only from an approved schedule
// ---------------------------------------------------------------------------
{
  const steel = lines.filter((l) => l.unit === "kg" && l.section === "D");
  ok(steel.length > 0, "reinforcement lines exist");
  ok(steel.every((l) => l.net === null && l.status === "missing"), "with no approved bar schedule none has a weight, and each says missing");
  ok(steel.every((l) => l.items.every((i) => i.value === null && /approved bar schedule/.test(i.formula))), "and says what is needed");
  ok(missingData(lines).length >= steel.length, "missing data is listed");
  const draft = toBoqDraft(lines);
  ok(!draft.some((d) => d.section === "D" && d.unit === "kg"), "missing lines stay out of the draft bill");
  // The model's drawn bars do not feed a weight.
  const bars = model.components.filter((c) => c.layer === "reinforcement").reduce((s, c) => s + c.shapes.length, 0);
  ok(bars > 1000, "there are plenty of schematic bars drawn");
  // An approved schedule gives the theoretical weight, π/4·d²·7850.
  const column = model.components.find((c) => c.kind === "column-bars")!;
  const approved = buildLearningModel({}, {}, {}, [{ componentId: column.id, mark: "A", diameterMm: 16, lengthMm: 3000, count: 8 }, { componentId: column.id, mark: "B", diameterMm: 8, lengthMm: 1200, count: 20 }]);
  const item = approved.model.components.find((c) => c.id === column.id)!.quantities.find((q) => q.unit === "kg")!;
  const expected = steelKgPerMetre(16) * 3 * 8 + steelKgPerMetre(8) * 1.2 * 20;
  near(item.value!, Math.round(expected * 100) / 100, "weight is π/4 · d² · 7850 per metre, times length and count", 0.01);
  near(steelKgPerMetre(16), 1.5791, "a 16 mm bar weighs 1.579 kg/m", 0.001);
  equal(item.status, "review", "an approved-schedule weight is still marked for review");
  equal(approved.model.components.find((c) => c.id === column.id)!.shapes.length, column.shapes.length, "the drawn bars are unchanged by the schedule");
}

// ---------------------------------------------------------------------------
// Masonry, finishes, joinery
// ---------------------------------------------------------------------------
{
  const area = line("masonry.wall-area")!;
  const blocks = line("masonry.blocks")!;
  near(blocks.net! / (area.net! + line("masonry.parapet")!.net!), 12.5, "blocks per m² = 1 / (0.4 × 0.2) = 12.5 over the walls and the parapet", 0.01);
  // The blocks drawn in 3D cover the wall except for the joints: their face area is 390×190 of every 400×200.
  let placedArea = 0;
  for (const c of model.components.filter((x) => x.kind === "wall-blocks")) {
    const thickness = c.dims.thickness!.value!;
    for (const s of c.shapes) if (s.t === "box") placedArea += (s.s.x * s.s.y * s.s.z) / thickness;
  }
  near((placedArea * 1e-6) / area.net!, (390 * 190) / (400 * 200), "the blocks drawn cover the counted wall area less the joints", 0.06);
  equal(blocks.allowancePercent, 5, "block breakage is a separate 5%");
  near(blocks.allowanceQuantity!, blocks.net! * 0.05, "and not in the net count", 0.01);
  // Lintels are not in the masonry area.
  const wallMock = model.components.find((c) => c.kind === "wall-blocks" && c.dims.length && c.id.includes("ground-floor-wall-c1"))!;
  ok(wallMock.dims.area!.value! > 0, "wall areas are stated");
  const lintels = line("concrete.lintel")!;
  ok(lintels.net! > 1 && lintels.componentIds.length >= 20, "lintels over the openings are concrete of their own");
  // Opening deduction rules.
  const rule = (openingDeduction: "all" | "none" | "over-threshold") => buildLearningModel({}, {}, { openingDeduction }).model;
  const area_ = (m: ConstructionModel, w: string) => aggregateQuantities(m).find((l) => l.workItem === w)!.net!;
  const none = area_(rule("none"), "plaster.base");
  const over = area_(rule("over-threshold"), "plaster.base");
  const all = area_(rule("all"), "plaster.base");
  ok(none > over && over > all, "plaster area: none deducted > over the threshold > all deducted");
  const windows = project.windows.length;
  ok(windows > 0 && none - all > 10, "the difference is the openings");
  // Plaster layers: one line per coat, in the stated order.
  for (const w of ["plaster.bonding", "plaster.base", "plaster.mid", "plaster.final"]) ok(line(w)?.net, `${w} is quantified`);
  near(line("plaster.base")!.net!, line("plaster.mid")!.net!, "coats cover the same wall", 1e-6);
  // Paint area follows the plastered area where there are no tiles.
  ok(line("paint.walls")!.net! + line("paint.wet-walls")!.net! < line("plaster.base")!.net!, "paint stops at the tile line in wet rooms");
  // Per-room breakdown on a component.
  const ceil = model.components.find((c) => c.id === "plaster:0:base")!;
  ok(new Set(ceil.quantities.map((q) => q.room)).size >= 9, "plaster is quantified room by room");
  // Floors: the tile count matches the tile size.
  const tiles = line("flooring.tile-count")!;
  const tileArea = line("flooring.tile-area")!;
  near(tiles.net! / tileArea.net!, 1 / (0.603 * 0.603), "tiles per m² follow the tile and joint size", 0.5);
  // Ceilings.
  const ceilings = line("ceiling.area")!;
  ok(ceilings.net! > 200, "ceiling area");
  near(line("ceiling.board")!.net!, ceilings.net! / (1.2 * 2.4), "boards = ceiling area ÷ board area", 0.5);
  // Doors and windows are counted as separate items.
  equal(line("openings.window-frame")!.net, project.windows.length, "a window frame for each window");
  equal(line("openings.door-frame")!.net, project.doors.length, "a door frame for each door");
  ok(line("openings.glass")!.net! > 20 && line("openings.door-hardware") && line("openings.window-hardware"), "glass area and hardware sets");
  // Joinery is made of Berchuma's real parts.
  const kitchen = model.components.find((c) => c.id.includes(":kitchen:kitchen:carcass"))!;
  ok(kitchen && kitchen.instanceNames!.length === kitchen.shapes.length, "kitchen carcass panels are named");
  const parts = buildParts(startingDesign("kitchen", { width: Math.round(Number(model.components.find((c) => c.id.endsWith(":kitchen:run"))!.dims.length!.value)) }));
  const roles = new Set(["gable", "divider", "top", "bottom", "shelf", "back", "rail"]);
  const expectedPanels = parts.parts.filter((p) => roles.has(p.role)).reduce((s, p) => s + p.placements.length, 0);
  equal(kitchen.shapes.length, expectedPanels, "one 3D panel for each part placement on Berchuma's own list");
  const hw = lines.filter((l) => l.workItem.startsWith("joinery.hardware."));
  ok(hw.some((l) => l.workItem === "joinery.hardware.hinge-soft-close" && l.net! > 0), "hardware counts come from the same list");
  ok(lines.some((l) => l.workItem.startsWith("joinery.edge-band.")), "edge banding in metres");
  // Furniture is loose and kept apart.
  const loose = aggregateQuantities(model, model.options, "loose");
  ok(loose.length > 5 && loose.every((l) => l.items.every((i) => model.components.find((c) => c.id === i.componentId)!.loose)), "loose furniture is a separate list");
  ok(lines.every((l) => l.items.every((i) => !index.byId.get(i.componentId)!.loose)), "and out of the building quantities");
}

// ---------------------------------------------------------------------------
// The hand-off to the takeoff page
// ---------------------------------------------------------------------------
{
  const pkg = constructionTakeoffPackage(model);
  const parsed = parseHouseTakeoffPackage(JSON.stringify(pkg));
  ok(parsed, "the takeoff page's own parser accepts the package");
  const elementIds = new Set(pkg.elements.map((e) => e.id));
  ok(pkg.quantities.length > 100, "a hundred-odd bill lines are handed over");
  ok(pkg.quantities.every((q) => elementIds.has(q.representativeElementId) && q.quantity.elementIds.length > 0 && q.quantity.elementIds.every((id) => elementIds.has(id))), "every line points at elements that are in the package, so a line can light up its parts");
  for (const q of pkg.quantities) {
    const l = line(q.id.split("|")[0]!);
    ok(l && l.net !== null && q.quantity.value === l.net && q.quantity.unit === l.unit, `${q.id}: the quantity is the bill line's net figure`);
  }
  ok(!pkg.quantities.some((q) => q.section === "D" && q.quantity.unit === "kg"), "reinforcement with no approved schedule is not handed over as a weight");
  ok(pkg.warnings.some((w) => /^Missing:.*approved bar schedule/i.test(w)), "and is listed as missing");
  ok(pkg.warnings.some((w) => /no prices/i.test(w)), "the package says it carries no prices");
  const concrete = pkg.quantities.find((q) => q.id === "concrete.column|m³")!;
  ok(/allowance 5%/.test(concrete.quantity.formula) && /not in this figure/.test(concrete.quantity.formula), "the allowance is in the working, not in the number");
  equal(concrete.quantity.value, line("concrete.column")!.net, "the concrete figure has no allowance added");
  ok(JSON.stringify(pkg).indexOf('"rate"') === -1 && JSON.stringify(pkg).indexOf('"amount"') === -1, "no rate or amount anywhere in the package");
  ok(pkg.quantities.every((q) => q.quantity.source === "bim" || q.quantity.source === "calculated"), "sources are the takeoff domain's own");
  equal(line("openings.window-opening")!.status, "measured", "window openings are read from the project");
  equal(pkg.quantities.find((q) => q.id === "openings.window-opening|piece")!.quantity.source, "bim", "a measured line is sourced from the model");
  equal(pkg.quantities.find((q) => q.id === "masonry.blocks|piece")!.quantity.source, "calculated", "an assumed line is not passed off as measured");
  ok(pkg.quantities.find((q) => q.id === "masonry.blocks|piece")!.quantity.confidence < pkg.quantities.find((q) => q.id === "openings.window-opening|piece")!.quantity.confidence, "and carries less confidence");
  const roofs = constructionTakeoffPackage(model, { ...DEFAULT_OPTIONS, roofType: "pitched" });
  ok(roofs.quantities.some((q) => q.id === "roof.covering|m²") && !pkg.quantities.some((q) => q.id === "roof.covering|m²"), "the roof alternative that is chosen is the one handed over");
  const withBars = buildLearningModel({}, {}, {}, [{ componentId: model.components.find((c) => c.kind === "column-bars")!.id, mark: "A", diameterMm: 16, lengthMm: 3000, count: 8 }]).model;
  ok(constructionTakeoffPackage(withBars).quantities.some((q) => q.quantity.unit === "kg"), "with an approved schedule the steel weight is handed over");
  ok(constructionTakeoffPackage(model, model.options, "loose").quantities.every((q) => q.id.startsWith("furniture.") || q.id.includes("|")), "loose furniture can be handed over on its own");
  ok(!pkg.quantities.some((q) => q.id.startsWith("furniture.chair")), "and is not in the building package");
}

// ---------------------------------------------------------------------------
// Missing data, status, and no invented prices
// ---------------------------------------------------------------------------
{
  const allItems = model.components.flatMap((c) => c.quantities);
  ok(allItems.length > 1500, "thousands of traceable quantity items");
  ok(allItems.every((q) => q.cost.unitMaterial === null && q.cost.unitLabour === null && q.cost.unitEquipment === null && q.cost.priceSource === null && q.cost.priceDate === null && q.cost.currency === null), "no price is invented anywhere");
  ok(allItems.every((q) => q.id && q.componentId && q.workItem && q.description && q.section && q.unit && q.formula && q.sourceGeometry && q.materialSpec !== undefined), "every item carries the fields a bill needs");
  ok(allItems.every((q) => q.value === null ? q.status === "missing" : q.status !== "missing"), "a missing number is marked missing and nothing else is");
  ok(lines.every((l) => l.cost.unitMaterial === null), "bill lines have empty cost fields too");
  ok(allItems.some((q) => q.status === "assumed") && allItems.some((q) => q.status === "calculated") && allItems.some((q) => q.status === "measured") && allItems.some((q) => q.status === "missing"), "the statuses are all in use");
  // A number that is missing is flagged whatever status the item claims.
  const tampered = structuredClone(model);
  const victim = tampered.components.find((c) => c.quantities.some((q) => q.workItem === "concrete.column"))!;
  victim.quantities.find((q) => q.workItem === "concrete.column")!.value = null;
  const tamperedLines = aggregateQuantities(tampered);
  equal(tamperedLines.find((l) => l.workItem === "concrete.column")!.status, "missing", "a line with an item that has no number is marked missing");
  ok(missingData(tamperedLines).some((l) => l.workItem === "concrete.column"), "and listed as missing data");
  const draft = toBoqDraft(lines);
  ok(draft.every((d) => d.quantity !== null && d.elementIds.length > 0 && d.formula), "draft bill items keep their formulas and element ids");
  ok(draft.every((d) => d.rate === undefined), "and carry no rate");
  const concrete = draft.find((d) => d.description.startsWith("Suspended") || d.section === "C")!;
  ok(concrete, "concrete is in the draft bill");
  ok(Math.abs(totalOf(lines, "concrete.", "m³") - lines.filter((l) => l.workItem.startsWith("concrete.")).reduce((s, l) => s + l.net!, 0)) < 1e-9, "totals add up");
  // Every opening in the bill traces to the project.
  const frame = model.components.find((c) => c.kind === "window-frame" && c.sourceRef)!;
  ok(project.windows.some((w) => w.id === frame.sourceRef), "an opening component names the project window it came from");
}

console.log(`Construction learning model: ${checks} checks passed.`);
