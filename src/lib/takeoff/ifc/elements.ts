import {
  measured,
  type BuildingElement,
  type ElementKind,
} from "../model";
import {
  asNumber,
  asRef,
  asRefs,
  asString,
  attr,
  entitiesOfTypes,
  type IfcEntity,
  type IfcModel,
} from "./parse";

/**
 * IFC entities into Medosha's element model.
 *
 * The join between a BIM file and everything downstream. Once an IFC model is
 * `BuildingElement[]`, the measurement, trade, BOQ and pricing code that
 * already exists works on it unchanged — which is the whole reason the element
 * model was defined independently of where elements come from.
 *
 * ## Quantities come from the file, not from a guess
 *
 * A properly exported IFC carries `IfcElementQuantity` sets — `Qto_WallBase
 * Quantities`, `Qto_SlabBaseQuantities` and so on — holding lengths, areas and
 * volumes the authoring tool measured from its own solids. Those are read
 * directly and marked `bim` with full confidence.
 *
 * Where a quantity set is missing, the element still comes through with its
 * name, type, storey and material, and simply has no dimensions. That is the
 * honest outcome: the brief said not to present estimates as BIM data, and the
 * corollary is that missing BIM data must look missing rather than being
 * quietly filled in.
 */

/** IFC type → what Medosha calls it. */
const KIND_BY_TYPE: Record<string, ElementKind> = {
  IFCWALL: "wall",
  IFCWALLSTANDARDCASE: "wall",
  IFCWALLELEMENTEDCASE: "wall",
  IFCCURTAINWALL: "wall",
  IFCDOOR: "door",
  IFCDOORSTANDARDCASE: "door",
  IFCWINDOW: "window",
  IFCWINDOWSTANDARDCASE: "window",
  IFCCOLUMN: "column",
  IFCCOLUMNSTANDARDCASE: "column",
  IFCBEAM: "beam",
  IFCBEAMSTANDARDCASE: "beam",
  IFCSLAB: "slab",
  IFCSLABSTANDARDCASE: "slab",
  IFCFOOTING: "foundation",
  IFCPILE: "foundation",
  IFCSTAIR: "stair",
  IFCSTAIRFLIGHT: "stair",
  IFCROOF: "roof",
  IFCCOVERING: "ceiling",
  IFCSPACE: "room",
  IFCFURNISHINGELEMENT: "furniture",
  IFCFURNITURE: "furniture",
  IFCRAILING: "fixture",
  IFCSANITARYTERMINAL: "fixture",
};

/**
 * Quantity names IFC uses, mapped onto the dimension they mean.
 *
 * The names are schema-defined, which is what makes reading them safe. `Length`
 * on a wall is its run; `Width` on a wall is its thickness — the same word
 * means different things on different types, so the mapping is per kind rather
 * than global.
 */
const QUANTITY_ALIASES: Record<string, string[]> = {
  length: ["length", "netlength", "grosslength", "perimeter"],
  width: ["width", "netwidth", "grosswidth"],
  height: ["height", "netheight", "grossheight"],
  thickness: ["width", "thickness", "netthickness", "grossthickness"],
  area: ["netsidearea", "grosssidearea", "netarea", "grossarea", "netfloorarea", "grossfloorarea"],
  volume: ["netvolume", "grossvolume"],
};

export type IfcImport = {
  elements: BuildingElement[];
  /** Storeys found, in the order the file lists them. */
  levels: string[];
  /** Counts by kind, for the "what did we get" summary. */
  counts: Record<string, number>;
  /** How many elements arrived with usable dimensions. */
  withQuantities: number;
  warnings: string[];
};

/**
 * Turns a parsed IFC model into elements.
 *
 * Relationships are resolved first — storey containment, openings, and property
 * sets — because every element needs them and walking the relationship entities
 * once is cheaper than searching them per element.
 */
export function elementsFromIfc(model: IfcModel): IfcImport {
  const warnings = [...model.warnings];

  // ---- Storeys -----------------------------------------------------------
  const storeyName = new Map<number, string>();
  const levels: string[] = [];
  for (const storey of entitiesOfTypes(model, "IFCBUILDINGSTOREY")) {
    const name = asString(attr(storey, 2)) ?? `Level ${storey.id}`;
    storeyName.set(storey.id, name);
    levels.push(name);
  }

  // ---- Which storey each element is on ------------------------------------
  const levelOf = new Map<number, string>();
  for (const relation of entitiesOfTypes(model, "IFCRELCONTAINEDINSPATIALSTRUCTURE")) {
    const structure = asRef(attr(relation, 5));
    const name = structure === null ? null : storeyName.get(structure);
    if (!name) continue;
    for (const id of asRefs(attr(relation, 4))) levelOf.set(id, name);
  }

  // ---- Openings ----------------------------------------------------------
  //
  // IFC says it in two steps: a wall is voided by an opening, and the opening
  // is filled by a door. So the door belongs to the wall only through the
  // opening between them, and following just one of the two relations finds
  // nothing.
  const openingOfWall = new Map<number, number[]>();
  for (const relation of entitiesOfTypes(model, "IFCRELVOIDSELEMENT")) {
    const wall = asRef(attr(relation, 4));
    const opening = asRef(attr(relation, 5));
    if (wall === null || opening === null) continue;
    openingOfWall.set(wall, [...(openingOfWall.get(wall) ?? []), opening]);
  }

  const fillerOfOpening = new Map<number, number>();
  for (const relation of entitiesOfTypes(model, "IFCRELFILLSELEMENT")) {
    const opening = asRef(attr(relation, 4));
    const filler = asRef(attr(relation, 5));
    if (opening === null || filler === null) continue;
    fillerOfOpening.set(opening, filler);
  }

  // ---- Quantities and properties -----------------------------------------
  const quantitiesOf = new Map<number, Map<string, number>>();
  const propertiesOf = new Map<number, Map<string, string>>();

  for (const relation of entitiesOfTypes(model, "IFCRELDEFINESBYPROPERTIES")) {
    const definition = asRef(attr(relation, 5));
    if (definition === null) continue;
    const set = model.entities.get(definition);
    if (!set) continue;

    const targets = asRefs(attr(relation, 4));

    if (set.type === "IFCELEMENTQUANTITY") {
      const values = readQuantities(model, set);
      for (const target of targets) {
        const existing = quantitiesOf.get(target) ?? new Map();
        for (const [name, value] of values) existing.set(name, value);
        quantitiesOf.set(target, existing);
      }
    } else if (set.type === "IFCPROPERTYSET") {
      const values = readProperties(model, set);
      for (const target of targets) {
        const existing = propertiesOf.get(target) ?? new Map();
        for (const [name, value] of values) existing.set(name, value);
        propertiesOf.set(target, existing);
      }
    }
  }

  // ---- Materials ---------------------------------------------------------
  const materialOf = new Map<number, string>();
  for (const relation of entitiesOfTypes(model, "IFCRELASSOCIATESMATERIAL")) {
    const material = asRef(attr(relation, 5));
    const name = material === null ? null : materialName(model, material);
    if (!name) continue;
    for (const id of asRefs(attr(relation, 4))) materialOf.set(id, name);
  }

  // ---- The elements themselves -------------------------------------------
  const elements: BuildingElement[] = [];
  const counts: Record<string, number> = {};
  let withQuantities = 0;
  let unitScale = lengthScale(model);

  if (unitScale === null) {
    warnings.push(
      "The file does not state its length unit. Millimetres assumed — check any quantity that looks wrong by a factor of a thousand.",
    );
    unitScale = 1;
  }

  for (const [type, kind] of Object.entries(KIND_BY_TYPE)) {
    for (const entity of entitiesOfTypes(model, type)) {
      const quantities = quantitiesOf.get(entity.id) ?? new Map<string, number>();
      const properties = propertiesOf.get(entity.id) ?? new Map<string, string>();

      const dimension = (which: keyof typeof QUANTITY_ALIASES) => {
        for (const alias of QUANTITY_ALIASES[which] ?? []) {
          const value = quantities.get(alias);
          // Read straight from the file, so it is BIM data at full confidence —
          // this is the distinction the whole provenance system exists for.
          if (value !== undefined) return measured(value * unitScale!, "bim", 1);
        }
        return undefined;
      };

      const openings = (openingOfWall.get(entity.id) ?? [])
        .map((opening) => fillerOfOpening.get(opening))
        .filter((filler): filler is number => filler !== undefined)
        .map((filler) => String(filler));

      const element: BuildingElement = {
        id: String(entity.id),
        kind,
        name:
          asString(attr(entity, 2)) ??
          asString(attr(entity, 7)) ??
          `${kind} ${entity.id}`,
        level: levelOf.get(entity.id) ?? null,
        location: null,
        drawingRef: null,
        length: dimension("length"),
        width: dimension("width"),
        height: dimension("height"),
        thickness: kind === "wall" || kind === "slab" ? dimension("thickness") : undefined,
        openings: openings.length > 0 ? openings : undefined,
        material: materialOf.get(entity.id) ?? null,
        properties: Object.fromEntries(properties),
      };

      if (element.length || element.width || element.height) withQuantities += 1;

      elements.push(element);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }

  const missing = elements.length - withQuantities;
  if (missing > 0) {
    warnings.push(
      `${missing} element${missing === 1 ? "" : "s"} carry no quantity set, so ${missing === 1 ? "it has" : "they have"} no dimensions. Export the model with base quantities enabled, or measure them by hand — nothing has been estimated for them.`,
    );
  }

  return { elements, levels, counts, withQuantities, warnings };
}

/** `IfcQuantityLength/Area/Volume/Count` inside an `IfcElementQuantity`. */
function readQuantities(model: IfcModel, set: IfcEntity): Map<string, number> {
  const values = new Map<string, number>();

  for (const id of asRefs(attr(set, 5))) {
    const quantity = model.entities.get(id);
    if (!quantity) continue;

    const name = asString(attr(quantity, 0))?.toLowerCase();
    if (!name) continue;

    // The value sits at index 3 on every IfcPhysicalSimpleQuantity subtype.
    const value = asNumber(attr(quantity, 3));
    if (value === null) continue;

    values.set(name, value);
  }

  return values;
}

/** `IfcPropertySingleValue` inside an `IfcPropertySet`. */
function readProperties(model: IfcModel, set: IfcEntity): Map<string, string> {
  const values = new Map<string, string>();

  for (const id of asRefs(attr(set, 4))) {
    const property = model.entities.get(id);
    if (!property || property.type !== "IFCPROPERTYSINGLEVALUE") continue;

    const name = asString(attr(property, 0));
    if (!name) continue;

    const raw = attr(property, 2);
    const text = asString(raw) ?? asNumber(raw)?.toString() ?? null;
    if (text !== null) values.set(name, text);
  }

  return values;
}

/** Material names arrive four different ways depending on the exporter. */
function materialName(model: IfcModel, id: number): string | null {
  const entity = model.entities.get(id);
  if (!entity) return null;

  if (entity.type === "IFCMATERIAL") return asString(attr(entity, 0));

  if (entity.type === "IFCMATERIALLAYERSETUSAGE") {
    const layerSet = asRef(attr(entity, 0));
    return layerSet === null ? null : materialName(model, layerSet);
  }

  if (entity.type === "IFCMATERIALLAYERSET") {
    const name = asString(attr(entity, 1));
    if (name) return name;
    const layers = asRefs(attr(entity, 0));
    const names = layers
      .map((layer) => materialName(model, layer))
      .filter((value): value is string => value !== null);
    return names.length > 0 ? names.join(" / ") : null;
  }

  if (entity.type === "IFCMATERIALLAYER") {
    const material = asRef(attr(entity, 0));
    return material === null ? null : materialName(model, material);
  }

  if (entity.type === "IFCMATERIALLIST") {
    const names = asRefs(attr(entity, 0))
      .map((material) => materialName(model, material))
      .filter((value): value is string => value !== null);
    return names.length > 0 ? names.join(" / ") : null;
  }

  return null;
}

/**
 * How many millimetres one file unit is.
 *
 * IFC states its units in `IfcUnitAssignment`, usually metres with a prefix.
 * Getting this wrong is a thousand-fold error in every quantity, so it is read
 * rather than assumed — and when it cannot be read, that is said out loud.
 */
export function lengthScale(model: IfcModel): number | null {
  for (const unit of entitiesOfTypes(model, "IFCSIUNIT")) {
    // IfcSIUnit is (Dimensions, UnitType, Prefix, Name) — the first attribute
    // is inherited from IfcNamedUnit. Reading these one place to the right
    // found no length unit at all, fell back to "millimetres assumed", and made
    // every quantity in a metre-based file a thousand times too small.
    const type = asString(attr(unit, 1));
    if (type !== "LENGTHUNIT") continue;

    const prefix = asString(attr(unit, 2));
    const name = asString(attr(unit, 3));
    if (name !== "METRE") continue;

    switch (prefix) {
      case "MILLI":
        return 1;
      case "CENTI":
        return 10;
      case "DECI":
        return 100;
      case null:
      case undefined:
        return 1000;
      default:
        return 1000;
    }
  }

  return null;
}
