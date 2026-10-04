import { measured, type BuildingElement } from "../model";

/**
 * Reading a DXF.
 *
 * DXF is a flat sequence of group-code / value pairs, two lines each:
 *
 *   0
 *   LINE
 *   8
 *   WALLS
 *   10
 *   1000.0
 *
 * Code 0 starts a new entity, 8 is the layer, 10/20/30 are the first point,
 * 11/21/31 the second. That is most of what a floor plan needs.
 *
 * ## What a DXF can and cannot tell you
 *
 * It carries geometry, not meaning. A line on a layer called `WALLS` is a line
 * that somebody drew on a layer called `WALLS` — its length is measurable to
 * the millimetre, and whether it is a wall at all is a convention. Nothing in
 * the file states a wall thickness, a storey height, or which side of the line
 * the wall is on.
 *
 * So everything from here is marked `drawing`, never `bim`: measured off real
 * vector geometry, which is far better than a guess, and not the same thing as
 * a parameter the authoring tool wrote down. Heights and thicknesses have to
 * come from somewhere else — a schedule, a specification, or a person — and
 * until they do the elements have a length and nothing more.
 */

export type DxfEntity = {
  type: string;
  layer: string;
  /** Group code → the values that appeared under it, in order. */
  codes: Map<number, (string | number)[]>;
  /** Vertices, for polylines. */
  vertices: { x: number; y: number }[];
};

export type DxfModel = {
  entities: DxfEntity[];
  layers: string[];
  /** `$INSUNITS`, resolved to millimetres per drawing unit. */
  unitScale: number;
  /** True when the file said what its units were. */
  unitStated: boolean;
  warnings: string[];
};

/** `$INSUNITS` values that matter. 0 means unitless. */
const INSUNITS_MM: Record<number, number> = {
  1: 25.4, // inches
  2: 304.8, // feet
  4: 1, // millimetres
  5: 10, // centimetres
  6: 1000, // metres
};

export function parseDxf(text: string): DxfModel {
  // DXF is line-oriented and tolerant of both line endings; values may have
  // trailing whitespace that matters to nothing.
  const lines = text.split(/\r\n|\r|\n/);
  const entities: DxfEntity[] = [];
  const layers = new Set<string>();
  const warnings: string[] = [];

  let unitScale = 1;
  let unitStated = false;

  let section = "";
  let current: DxfEntity | null = null;
  let pendingVertexX: number | null = null;
  let headerVariable = "";

  const finish = () => {
    if (current && current.type !== "SEQEND") entities.push(current);
    current = null;
    pendingVertexX = null;
  };

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const value = lines[i + 1]!.trim();
    if (!Number.isFinite(code)) continue;

    if (code === 0) {
      if (value === "SECTION") {
        finish();
        section = "";
        continue;
      }
      if (value === "ENDSEC" || value === "EOF") {
        finish();
        section = "";
        continue;
      }

      finish();

      if (section === "ENTITIES") {
        current = { type: value, layer: "0", codes: new Map(), vertices: [] };
      }
      continue;
    }

    if (code === 2 && section === "") {
      section = value.toUpperCase();
      continue;
    }

    if (section === "HEADER") {
      if (code === 9) {
        headerVariable = value.toUpperCase();
        continue;
      }
      if (headerVariable === "$INSUNITS" && code === 70) {
        const units = Number(value);
        const scale = INSUNITS_MM[units];
        if (scale) {
          unitScale = scale;
          unitStated = true;
        }
      }
      continue;
    }

    if (!current) continue;

    if (code === 8) {
      current.layer = value;
      layers.add(value);
      continue;
    }

    const numeric = Number(value);
    const stored: string | number = Number.isFinite(numeric) ? numeric : value;
    current.codes.set(code, [...(current.codes.get(code) ?? []), stored]);

    // Polyline vertices arrive as repeated 10/20 pairs on one LWPOLYLINE.
    if (code === 10 && current.type === "LWPOLYLINE") {
      pendingVertexX = Number.isFinite(numeric) ? numeric : null;
    } else if (code === 20 && current.type === "LWPOLYLINE" && pendingVertexX !== null) {
      current.vertices.push({ x: pendingVertexX, y: numeric });
      pendingVertexX = null;
    }
  }

  finish();

  if (!unitStated) {
    warnings.push(
      "The drawing does not state its units ($INSUNITS). Drawing units are being read as millimetres — check one known dimension before trusting any quantity.",
    );
  }
  if (entities.length === 0) {
    warnings.push("No entities were found in the drawing.");
  }

  return {
    entities,
    layers: [...layers].sort(),
    unitScale,
    unitStated,
    warnings,
  };
}

function first(entity: DxfEntity, code: number): number | null {
  const value = entity.codes.get(code)?.[0];
  return typeof value === "number" ? value : null;
}

/** Length of one entity in drawing units, or null when it has none. */
export function entityLength(entity: DxfEntity): number | null {
  if (entity.type === "LINE") {
    const x1 = first(entity, 10);
    const y1 = first(entity, 20);
    const x2 = first(entity, 11);
    const y2 = first(entity, 21);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return Math.hypot(x2 - x1, y2 - y1);
  }

  if (entity.type === "LWPOLYLINE" && entity.vertices.length >= 2) {
    let total = 0;
    for (let i = 1; i < entity.vertices.length; i += 1) {
      const a = entity.vertices[i - 1]!;
      const b = entity.vertices[i]!;
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    // Closed polylines carry flag 70 = 1 and the closing segment is implied.
    const closed = first(entity, 70) === 1;
    if (closed && entity.vertices.length > 2) {
      const last = entity.vertices[entity.vertices.length - 1]!;
      const start = entity.vertices[0]!;
      total += Math.hypot(start.x - last.x, start.y - last.y);
    }
    return total;
  }

  return null;
}

/** Enclosed area of a closed polyline, by the shoelace formula. */
export function entityArea(entity: DxfEntity): number | null {
  if (entity.type !== "LWPOLYLINE" || entity.vertices.length < 3) return null;

  let sum = 0;
  for (let i = 0; i < entity.vertices.length; i += 1) {
    const a = entity.vertices[i]!;
    const b = entity.vertices[(i + 1) % entity.vertices.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export type LayerRule = {
  /** Matched case-insensitively against the layer name, as a substring. */
  match: string;
  kind: BuildingElement["kind"];
  /** Applied to every element from this layer, in millimetres. */
  defaultHeight?: number;
  defaultThickness?: number;
};

/**
 * Layer names to element kinds.
 *
 * A starting point, not a standard. Every office names its layers differently —
 * `A-WALL`, `WALLS`, `MUR`, `01_Wall` — so these are substrings and the caller
 * is expected to override them once, per office, rather than fight them.
 */
export const DEFAULT_LAYER_RULES: LayerRule[] = [
  { match: "wall", kind: "wall" },
  { match: "door", kind: "door" },
  { match: "window", kind: "window" },
  { match: "column", kind: "column" },
  { match: "beam", kind: "beam" },
  { match: "slab", kind: "slab" },
  { match: "room", kind: "room" },
  { match: "space", kind: "room" },
];

export type DxfImport = {
  elements: BuildingElement[];
  /**
   * Element id → its index in `model.entities`.
   *
   * Returned rather than left to be reconstructed. A viewer needs to know which
   * drawn line is which element, and working it out by re-walking the entities
   * and counting means re-implementing the exact skip conditions used here — a
   * TEXT on the WALL layer matches the rule but produces no element, and a
   * counter that does not know that assigns every id after it to the wrong line.
   */
  entityIndexById: Record<string, number>;
  /** Layers that matched no rule, so somebody can add one. */
  unmatchedLayers: string[];
  warnings: string[];
};

/**
 * Turns drawing geometry into elements.
 *
 * `defaultHeight` and `defaultThickness` are supplied by the caller and are
 * marked `user`, not `drawing` — because they were typed by a person, not
 * measured off the file, and the takeoff has to be able to tell the difference
 * when it reports where a quantity came from.
 */
export function elementsFromDxf(
  model: DxfModel,
  rules: LayerRule[] = DEFAULT_LAYER_RULES,
): DxfImport {
  const elements: BuildingElement[] = [];
  const entityIndexById: Record<string, number> = {};
  const matchedLayers = new Set<string>();
  const warnings = [...model.warnings];
  let index = 0;

  for (const [position, entity] of model.entities.entries()) {
    const rule = rules.find((candidate) =>
      entity.layer.toLowerCase().includes(candidate.match.toLowerCase()),
    );
    if (!rule) continue;

    matchedLayers.add(entity.layer);

    const lengthUnits = entityLength(entity);
    const areaUnits = entityArea(entity);

    // A block reference marks a position, not a size — a door symbol says where
    // the door is and nothing about how wide it is. Counting it is right;
    // measuring it is not.
    const isBlock = entity.type === "INSERT" || entity.type === "POINT";

    if (lengthUnits === null && areaUnits === null && !isBlock) continue;

    index += 1;

    const element: BuildingElement = {
      id: `dxf-${index}`,
      kind: rule.kind,
      name: `${rule.kind} ${index}`,
      level: null,
      location: null,
      drawingRef: entity.layer,
      // Measured off real vector geometry: better than an estimate, and not the
      // same as a parameter an authoring tool wrote down.
      length:
        lengthUnits !== null
          ? measured(lengthUnits * model.unitScale, "drawing", model.unitStated ? 0.9 : 0.6)
          : undefined,
      height: rule.defaultHeight ? measured(rule.defaultHeight, "user", 1) : undefined,
      thickness: rule.defaultThickness
        ? measured(rule.defaultThickness, "user", 1)
        : undefined,
      count: isBlock ? measured(1, "drawing", 0.9) : undefined,
      properties: areaUnits !== null
        ? { enclosedAreaM2: (areaUnits * model.unitScale ** 2) / 1_000_000 }
        : undefined,
    };

    elements.push(element);
    entityIndexById[element.id] = position;
  }

  const unmatchedLayers = model.layers.filter((layer) => !matchedLayers.has(layer));

  if (elements.length === 0 && model.entities.length > 0) {
    warnings.push(
      `No layer matched a rule. The drawing has ${model.layers.length} layer(s): ${model.layers.slice(0, 8).join(", ")}${model.layers.length > 8 ? "…" : ""}. Map them to element types to take off from this file.`,
    );
  }

  const withoutHeight = elements.filter((element) => !element.height).length;
  if (withoutHeight > 0) {
    warnings.push(
      `${withoutHeight} element${withoutHeight === 1 ? "" : "s"} have a measured length but no height — a plan does not carry one. Set a storey height, or these cannot produce an area.`,
    );
  }

  return { elements, entityIndexById, unmatchedLayers, warnings };
}
