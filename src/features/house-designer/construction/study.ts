import { BUILDING_TEMPLATES, normalizeConfig, type BuildingConfig, type StructureOverrides } from "./building-config";
import { readCostRules, type CostRules } from "./estimate";
import { readPriceBook, type PriceBook } from "./price-book";
import { DEFAULT_OPTIONS, DEFAULT_RULES, STAGE_IDS, type EstimatingRules, type ModelOptions, type StageId } from "./types";

/**
 * A study: everything the learner has set, saved under a name so that it can be opened again as it was. The building (its template, size and structure), the
 * options and rules the quantities follow, the price book and the costs that are not work on site, and the stage on show.
 *
 * It holds what was asked for, never what was worked out: the model, the bill and the estimate are all read off it again when it is opened, so a study saved
 * with an older version of the model opens with the quantities of the newer one rather than carrying stale figures.
 */

export const STUDY_VERSION = 1;
export const STUDIES_KEY = "medosha:construction-studies:v1";
/** The most studies kept, and the most characters stored, so the browser's own limit is never what decides. */
export const MAX_STUDIES = 24;
export const MAX_STORED_CHARS = 3_000_000;

export type Study = {
  version: typeof STUDY_VERSION;
  id: string;
  name: string;
  /** ISO time it was saved. */
  savedAt: string;
  building: BuildingConfig;
  overrides: StructureOverrides;
  options: ModelOptions;
  rules: EstimatingRules;
  priceBook: PriceBook;
  costRules: CostRules;
  stage: StageId;
};

export const OVERRIDE_KEYS = [
  "slabThickness", "groundSlabThickness", "externalWall", "internalWall", "columnSize", "beamWidth", "beamDepth",
  "footingSize", "footingThickness", "footingDepth", "doorWidth", "doorHeight", "windowWidth", "windowHeight", "windowSill", "stairFlightWidth",
] as const satisfies readonly (keyof StructureOverrides)[];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function readOptions(raw: unknown): ModelOptions {
  const r = isRecord(raw) ? raw : {};
  const parapet = typeof r.parapetHeight === "number" && Number.isFinite(r.parapetHeight) ? Math.min(2000, Math.max(300, r.parapetHeight)) : undefined;
  return {
    roofType: oneOf(r.roofType, ["flat", "pitched"] as const, DEFAULT_OPTIONS.roofType),
    floorFinish: oneOf(r.floorFinish, ["ceramic", "porcelain", "stone"] as const, DEFAULT_OPTIONS.floorFinish),
    blockType: oneOf(r.blockType, ["hollow", "solid", "brick"] as const, DEFAULT_OPTIONS.blockType),
    mepView: oneOf(r.mepView, ["concealed", "visible", "finished"] as const, DEFAULT_OPTIONS.mepView),
    ...(parapet === undefined ? {} : { parapetHeight: parapet }),
  };
}

/** The rules the quantities follow, read back from something saved: anything wrong is the default. */
export function readRules(raw: unknown): EstimatingRules {
  const base = DEFAULT_RULES;
  const r = isRecord(raw) ? raw : {};
  const rein = isRecord(r.reinforcement) ? r.reinforcement : {};
  const ratios: Record<string, number> = { ...base.reinforcement.ratios };
  if (isRecord(rein.ratios)) for (const [k, v] of Object.entries(rein.ratios)) if (/^concrete\.[a-z-]+$/.test(k) && typeof v === "number" && Number.isFinite(v)) ratios[k] = Math.min(1000, Math.max(0, v));
  const al = isRecord(r.allowances) ? r.allowances : {};
  const allowances = Object.fromEntries(Object.entries(base.allowances).map(([k, v]) => [k, num(al[k], v, 0, 100)])) as EstimatingRules["allowances"];
  const sv = isRecord(r.services) ? r.services : {};
  const fall = isRecord(sv.fall) ? sv.fall : {};
  return {
    openingDeduction: oneOf(r.openingDeduction, ["all", "none", "over-threshold"] as const, base.openingDeduction),
    openingThresholdM2: num(r.openingThresholdM2, base.openingThresholdM2, 0, 10),
    jointMm: num(r.jointMm, base.jointMm, 0, 50),
    steelFromSchematic: false,
    reinforcement: { basis: oneOf(rein.basis, ["ratio", "schedule"] as const, base.reinforcement.basis), ratios },
    allowances,
    services: {
      fall: { waste: num(fall.waste, base.services.fall.waste, 20, 200), soil: num(fall.soil, base.services.fall.soil, 20, 200), drain: num(fall.drain, base.services.fall.drain, 20, 200) },
      coldHeight: num(sv.coldHeight, base.services.coldHeight, 100, 2200), hotHeight: num(sv.hotHeight, base.services.hotHeight, 100, 2200),
      switchHeight: num(sv.switchHeight, base.services.switchHeight, 100, 2200), socketHeight: num(sv.socketHeight, base.services.socketHeight, 100, 2200), boardHeight: num(sv.boardHeight, base.services.boardHeight, 100, 2200),
    },
  };
}

export function readOverrides(raw: unknown): StructureOverrides {
  if (!isRecord(raw)) return {};
  const out: StructureOverrides = {};
  for (const key of OVERRIDE_KEYS) { const v = raw[key]; if (typeof v === "number" && Number.isFinite(v)) out[key] = v; }
  return out;
}

const text = (v: unknown, fallback: string, max: number): string => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);

/**
 * A study read back from something saved or opened from a file. Whatever is wrong with the parts is repaired from the defaults rather than refused; what is
 * not a study at all (not an object, another version) is `null`.
 */
export function readStudy(raw: unknown): Study | null {
  if (!isRecord(raw) || raw.version !== STUDY_VERSION) return null;
  if (!isRecord(raw.building) || !BUILDING_TEMPLATES.includes(raw.building.template as (typeof BUILDING_TEMPLATES)[number])) return null;
  const savedAt = typeof raw.savedAt === "string" && !Number.isNaN(Date.parse(raw.savedAt)) ? new Date(raw.savedAt).toISOString() : new Date(0).toISOString();
  return {
    version: STUDY_VERSION,
    id: typeof raw.id === "string" && /^[\w.-]{3,64}$/.test(raw.id) ? raw.id : "study_imported",
    name: text(raw.name, "Untitled study", 80),
    savedAt,
    building: normalizeConfig(raw.building as Partial<BuildingConfig>).config,
    overrides: readOverrides(raw.overrides),
    options: readOptions(raw.options),
    rules: readRules(raw.rules),
    priceBook: readPriceBook(raw.priceBook),
    costRules: readCostRules(raw.costRules),
    stage: (STAGE_IDS as readonly number[]).includes(raw.stage as number) ? (raw.stage as StageId) : 1,
  };
}

export type StudyInput = Omit<Study, "version" | "id" | "savedAt"> & { id?: string };

/** An id that is not likely to be met again: the time and some chance. */
export function newStudyId(now: Date = new Date(), random: () => number = Math.random): string {
  return `study_${now.getTime().toString(36)}_${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
}

export function makeStudy(input: StudyInput, now: Date = new Date(), random: () => number = Math.random): Study {
  return {
    version: STUDY_VERSION, id: input.id ?? newStudyId(now, random), name: input.name.trim().slice(0, 80) || "Untitled study", savedAt: now.toISOString(),
    building: input.building, overrides: input.overrides, options: input.options, rules: input.rules, priceBook: input.priceBook, costRules: input.costRules, stage: input.stage,
  };
}

/** What a study is saved to and opened from: the part of `localStorage` it needs. */
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

/** The studies kept, the newest first. What cannot be read is left out rather than stopping the rest. */
export function listStudies(storage: StorageLike): Study[] {
  let raw: unknown;
  try { raw = JSON.parse(storage.getItem(STUDIES_KEY) ?? "null"); } catch { return []; }
  if (!isRecord(raw) || !Array.isArray(raw.studies)) return [];
  return (raw.studies as unknown[]).map(readStudy).filter((s): s is Study => s !== null).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export type SaveResult = { ok: true; studies: Study[] } | { ok: false; reason: string };

function write(storage: StorageLike, studies: Study[]): SaveResult {
  const json = JSON.stringify({ version: STUDY_VERSION, studies });
  if (json.length > MAX_STORED_CHARS) return { ok: false, reason: "Too much is saved already: delete a study first." };
  try { storage.setItem(STUDIES_KEY, json); } catch { return { ok: false, reason: "This browser would not keep it (it may be full, or saving may be turned off). Download the study as a file instead." }; }
  return { ok: true, studies };
}

/** A study saved: a study with the same id is replaced, the rest kept, the oldest dropped when there are too many. */
export function saveStudy(storage: StorageLike, study: Study): SaveResult {
  const others = listStudies(storage).filter((s) => s.id !== study.id);
  return write(storage, [study, ...others].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, MAX_STUDIES));
}

export function deleteStudy(storage: StorageLike, id: string): SaveResult {
  return write(storage, listStudies(storage).filter((s) => s.id !== id));
}

export function serializeStudy(study: Study): string {
  return JSON.stringify(study, null, 2);
}

/** A study from the text of a file. */
export function parseStudyFile(content: string): { ok: true; study: Study } | { ok: false; reason: string } {
  if (content.length > MAX_STORED_CHARS) return { ok: false, reason: "That file is too large to be a study." };
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { return { ok: false, reason: "That is not a study file: it is not readable JSON." }; }
  const study = readStudy(raw);
  return study ? { ok: true, study } : { ok: false, reason: "That is not a study this version can open." };
}

/** A name for a downloaded file: lower case, underscores, safe on Windows and in a URL. */
export function fileStem(name: string, prefix = "medosha_house"): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return slug ? `${prefix}_${slug}` : prefix;
}
