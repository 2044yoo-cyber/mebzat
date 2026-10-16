import type { HouseProject } from "../types/project";
import { buildLearningHouseProject, DEFAULT_LEARNING_PARAMS, LEARNING_HOUSE_ID, type LearningHouseParams } from "./learning-house";
import type { ApprovedBar } from "./helpers";
import { buildConstructionModel } from "./model";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type ConstructionModel, type EstimatingRules, type ModelOptions } from "./types";

export * from "./types";
export { STAGES, STAGE_BY_ID, ENGINEERING_DISCLAIMER } from "./stages";
export { MATERIALS, CATEGORY_COLORS, materialOf, knowledgeFor } from "./catalogue";
export { buildConstructionModel, boundsOf } from "./model";
export { buildLearningHouseProject, DEFAULT_LEARNING_PARAMS, LEARNING_HOUSE_ID, normalizeParams } from "./learning-house";
export type { LearningHouseParams } from "./learning-house";
export { BUILDING_TEMPLATES, TEMPLATES, areaRange, areasOf, buildBuilding, configForArea, defaultConfig, normalizeConfig, roofAreaOf, widthBounds } from "./building-config";
export type { BuildingAreas, BuildingConfig, BuildingTemplateId, BuiltBuilding, StructureOverrides } from "./building-config";
export { indexModel, subtreeOf, visibilityOf, visibleComponents, shapeVisible, cutPlane, resetView, setStage, stepStage, toggleIn, isolateLayer, showAll, showStoreysUpTo, categoriesPresent } from "./view";
export type { ModelIndex, Visibility, Visible, CutPlane } from "./view";
export { explodeInfo, shapeOffset, isAssembled, FLOOR_STEP, CATEGORY_STEP, LAYER_STEP } from "./explode";
export { aggregateQuantities, countedComponents, floorOf, missingData, toBoqDraft, totalOf, worstStatus, ROOF_FLOOR, SITE_FLOOR } from "./quantities";
export type { QuantityLine, QuantityPart, QuantityScope } from "./quantities";
export { buildBill, floorsOf, groupBill } from "./boq";
export type { Bill, BillFloor, BillGroup, BillGrouping, BillLine, BillRow } from "./boq";
export { auditBill, CARRIED_BY_PARENT, EXEMPT_KINDS, shapeVolume } from "./boq-audit";
export type { BillAudit } from "./boq-audit";
export { applyReinforcementRule, barWeightKg } from "./reinforcement-rule";
export { describeComponent } from "./inspect";
export { constructionTakeoffPackage, elementKindOf } from "./takeoff-handoff";
export type { ComponentInfo } from "./inspect";
export type { ApprovedBar } from "./helpers";
export { steelKgPerMetre, steelWeightKg } from "./helpers";

export type LearningModel = { project: HouseProject; model: ConstructionModel; params: LearningHouseParams; issues: { field: string; message: string }[] };

/** The sample house and the construction model read from it. Neither is saved anywhere. */
export function buildLearningModel(params: Partial<LearningHouseParams> = {}, options: Partial<ModelOptions> = {}, rules: Partial<EstimatingRules> = {}, approvedBars: ApprovedBar[] = []): LearningModel {
  const built = buildLearningHouseProject({ ...DEFAULT_LEARNING_PARAMS, ...params });
  const model = buildConstructionModel(built.project, { ...DEFAULT_OPTIONS, ...options }, { ...DEFAULT_RULES, ...rules }, { approvedBars });
  return { project: built.project, model, params: built.params, issues: built.issues };
}

export function isLearningHouse(project: Pick<HouseProject, "id">): boolean {
  return project.id === LEARNING_HOUSE_ID;
}
