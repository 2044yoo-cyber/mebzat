import {
  BOARDS,
  EDGE_BANDS,
  HARDWARE,
  findBoard,
  findEdgeBand,
  findHardware,
} from "../types/catalogue";
import { parseSpec, type DesignSpec, type SpecIssue } from "../types/spec";

/**
 * Turning what the model wrote into what the spec stores.
 *
 * The two are deliberately different. Berchuma AI writes material *ids* —
 * `"mdf-18-walnut"` — because that is the only way to stop it inventing
 * products nobody sells. The stored spec holds the whole material *object*,
 * because a design saved today must still cost and still cut in two years,
 * after that board has been renamed, repriced or dropped from the catalogue
 * entirely. A spec holding only ids would silently become unbuildable the day
 * a supplier changed their range.
 *
 * This file is the join between those two facts, and it is also the last line
 * of defence before untrusted model output reaches the geometry engine.
 */

export type HydrateResult =
  | { ok: true; spec: DesignSpec; issues: SpecIssue[] }
  | { ok: false; error: string };

type Loose = Record<string, unknown>;

function isRecord(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Expands a material id, tolerating a model that sent the object back.
 *
 * Accepting both is not sloppiness. On an edit turn the model has just been
 * shown a spec, and about one time in twenty it echoes a whole board object
 * where an id belongs. Rejecting that costs the user a round trip to be told
 * off for something they did not do.
 */
function resolve<T extends { id: string }>(
  value: unknown,
  find: (id: string) => T | undefined,
): T | undefined {
  if (typeof value === "string") return find(value);
  if (isRecord(value) && typeof value.id === "string") return find(value.id);
  return undefined;
}

/**
 * Hydrates and validates a loose object from the model.
 *
 * Every failure names the field, because the recovery path is to tell the
 * model what it got wrong and ask again — and "invalid spec" is not something
 * it can act on.
 */
export function hydrateSpec(input: unknown, prompt: string): HydrateResult {
  if (!isRecord(input)) {
    return { ok: false, error: "The design was not an object." };
  }

  const carcass = isRecord(input.carcass) ? input.carcass : {};

  const board = resolve(carcass.board, findBoard);
  if (!board) {
    return {
      ok: false,
      error: `carcass.board must be one of: ${BOARDS.map((b) => b.id).join(", ")}.`,
    };
  }

  // A missing back board is the single most common omission, and it has an
  // obvious right answer, so it is filled rather than refused.
  const backBoard =
    resolve(carcass.backBoard, findBoard) ?? findBoard("hdf-4-white") ?? board;

  const edgeBand =
    resolve(carcass.edgeBand, findEdgeBand) ?? EDGE_BANDS[0];
  if (!edgeBand) {
    return { ok: false, error: "No edge band is available in the catalogue." };
  }

  // Unknown hardware ids are dropped rather than fatal: a wardrobe missing a
  // shelf pin line is a slightly cheap wardrobe, not a broken design, and the
  // geometry engine adds what the fittings actually require anyway.
  const hardware = Array.isArray(input.hardware)
    ? input.hardware
        .map((entry) => resolve(entry, findHardware))
        .filter((entry): entry is (typeof HARDWARE)[number] => Boolean(entry))
    : [];

  const meta = isRecord(input.meta) ? input.meta : {};

  // The model is told not to write an envelope, because the overall size
  // follows from where the cabinets stand. The schema still requires one, so a
  // placeholder goes in here and `validateSpec` replaces it with the real
  // bounding box a moment later. Requiring the model to compute it would be
  // asking it to do arithmetic it gets wrong, over a value we can derive.
  const candidate = {
    ...input,
    envelope: isRecord(input.envelope)
      ? input.envelope
      : { width: 1, height: 1, depth: 1 },
    carcass: {
      ...carcass,
      board,
      backBoard,
      edgeBand,
      plinthHeight: numberOr(carcass.plinthHeight, 100),
      doorGap: numberOr(carcass.doorGap, 2),
      shelfSetback: numberOr(carcass.shelfSetback, 10),
    },
    hardware,
    meta: {
      style: typeof meta.style === "string" ? meta.style : "modern",
      // The customer's own words, not the model's paraphrase of them. This is
      // what appears on the public design page, and it is the one string in
      // the spec the model is not allowed to write.
      prompt,
      assumptions: stringArray(meta.assumptions),
      corrections: [],
    },
  };

  const parsed = parseSpec(candidate);
  if (!parsed.ok) return parsed;
  return { ok: true, spec: parsed.spec, issues: parsed.issues };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 12);
}

/**
 * Pulls the first JSON object out of a model's reply.
 *
 * Providers are told to return bare JSON and mostly do. The exceptions are a
 * markdown fence and a sentence of preamble, both of which are cheap to
 * survive and expensive to fail on, so the brace scan below walks the string
 * tracking depth and string state rather than reaching for a regex that a
 * brace inside a label would break.
 */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
