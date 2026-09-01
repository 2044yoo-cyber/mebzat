/**
 * Reading an IFC file.
 *
 * IFC ships as STEP Physical File — ISO 10303-21 — which is a flat list of
 * numbered entity instances that refer to each other by number:
 *
 *   #42= IFCWALLSTANDARDCASE('3vB2YO$MX4xv5uCqZZG05x',#5,'Basic Wall:200mm',$,…);
 *
 * This reads that list. It does **not** evaluate swept solids or B-reps, and
 * that is a deliberate boundary rather than a shortcut: an IFC file that has
 * been exported properly carries its own quantities in `IfcElementQuantity`,
 * measured by the authoring tool from the real geometry. Those numbers are
 * better than anything a re-implementation of Revit's solid modeller would
 * produce here, and they are what the brief means by *use actual BIM data*.
 *
 * Where quantities are absent the elements still come through with their names,
 * types, materials and relationships — and are marked as lacking dimensions,
 * rather than having plausible ones invented for them.
 *
 * Pure and synchronous: text in, entities out. No file system, no network.
 */

/** One `#n= TYPE(args);` record. */
export type IfcEntity = {
  id: number;
  type: string;
  /** Positional attributes, in schema order. */
  attributes: IfcValue[];
};

export type IfcValue =
  | { kind: "ref"; id: number }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "enum"; value: string }
  | { kind: "list"; items: IfcValue[] }
  /** `$` — not supplied. */
  | { kind: "null" }
  /** `*` — derived by the schema from something else. */
  | { kind: "derived" }
  /** `IFCLABEL('x')` and friends: a typed wrapper around one value. */
  | { kind: "typed"; type: string; value: IfcValue };

export type IfcModel = {
  /** Every entity, by its instance number. */
  entities: Map<number, IfcEntity>;
  /** Instance numbers grouped by type, upper case. */
  byType: Map<string, number[]>;
  /** The `FILE_DESCRIPTION` / `FILE_NAME` header lines, unparsed. */
  header: string[];
  /** IFC2X3, IFC4, IFC4X3 … as declared in FILE_SCHEMA. */
  schema: string | null;
  /** Problems worth telling somebody about rather than throwing on. */
  warnings: string[];
};

/**
 * Splits the file into records.
 *
 * A semicolon inside a quoted string does not end a record, and IFC strings are
 * quoted with single quotes and escape a literal quote by doubling it. A naive
 * `split(";")` breaks on any wall named "Level 1; Type A", which is not a rare
 * thing to find in a real model.
 */
function records(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (inString) {
      if (char === "'") {
        // A doubled quote is an escaped quote, not the end of the string.
        if (text[i + 1] === "'") {
          current += "''";
          i += 1;
          continue;
        }
        inString = false;
      }
      current += char;
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }

    if (char === ";") {
      const trimmed = current.trim();
      if (trimmed) out.push(trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Splits an argument list on top-level commas.
 *
 * Nested lists and typed values both contain commas, and strings contain
 * everything, so depth and quoting are both tracked.
 */
function splitArgs(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (inString) {
      if (char === "'") {
        if (text[i + 1] === "'") {
          current += "''";
          i += 1;
          continue;
        }
        inString = false;
      }
      current += char;
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail || out.length > 0) out.push(tail);
  return out;
}

/** IFC escapes: doubled quotes, and \X2\…\X0\ for non-ASCII. */
function unescapeString(raw: string): string {
  return raw
    .replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) =>
      (hex.match(/.{1,4}/g) ?? [])
        .map((code) => String.fromCharCode(parseInt(code, 16)))
        .join(""),
    )
    .replace(/\\S\\(.)/g, (_, char: string) =>
      String.fromCharCode(char.charCodeAt(0) + 128),
    );
}

export function parseValue(text: string): IfcValue {
  const trimmed = text.trim();

  if (trimmed === "" || trimmed === "$") return { kind: "null" };
  if (trimmed === "*") return { kind: "derived" };

  if (trimmed.startsWith("#")) {
    const id = Number(trimmed.slice(1));
    return Number.isFinite(id) ? { kind: "ref", id } : { kind: "null" };
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return { kind: "string", value: unescapeString(trimmed.slice(1, -1)) };
  }

  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return { kind: "list", items: [] };
    return { kind: "list", items: splitArgs(inner).map(parseValue) };
  }

  if (trimmed.startsWith(".") && trimmed.endsWith(".")) {
    return { kind: "enum", value: trimmed.slice(1, -1) };
  }

  // IFCLABEL('x'), IFCREAL(1.5), IFCBOOLEAN(.T.) — a type wrapping one value.
  const typed = /^([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/.exec(trimmed);
  if (typed) {
    return {
      kind: "typed",
      type: typed[1]!.toUpperCase(),
      value: parseValue(typed[2]!),
    };
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return { kind: "number", value: numeric };

  return { kind: "enum", value: trimmed };
}

/**
 * Reads a whole file.
 *
 * Malformed records are skipped and counted rather than thrown on. A 200 MB
 * export with three unreadable lines is still worth ninety-nine percent of a
 * takeoff, and refusing the file outright helps nobody.
 */
export function parseIfc(text: string): IfcModel {
  const entities = new Map<number, IfcEntity>();
  const byType = new Map<string, number[]>();
  const header: string[] = [];
  const warnings: string[] = [];
  let schema: string | null = null;
  let malformed = 0;

  let section: "none" | "header" | "data" = "none";

  for (const record of records(text)) {
    const upper = record.toUpperCase();

    if (upper === "HEADER") {
      section = "header";
      continue;
    }
    if (upper === "DATA") {
      section = "data";
      continue;
    }
    if (upper === "ENDSEC") {
      section = "none";
      continue;
    }
    if (upper.startsWith("ISO-10303-21") || upper.startsWith("END-ISO-10303-21")) {
      continue;
    }

    if (section === "header") {
      header.push(record);
      const schemaMatch = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(record);
      if (schemaMatch) schema = schemaMatch[1]!.toUpperCase();
      continue;
    }

    if (section !== "data") continue;

    const match = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)$/.exec(record);
    if (!match) {
      malformed += 1;
      continue;
    }

    const id = Number(match[1]);
    const type = match[2]!.toUpperCase();
    const attributes = splitArgs(match[3]!).map(parseValue);

    entities.set(id, { id, type, attributes });
    byType.set(type, [...(byType.get(type) ?? []), id]);
  }

  if (malformed > 0) {
    warnings.push(
      `${malformed} record${malformed === 1 ? "" : "s"} in the file could not be read and were skipped.`,
    );
  }
  if (entities.size === 0) {
    warnings.push("No IFC entities were found. Is this an IFC-SPF file?");
  }
  if (!schema) {
    warnings.push("The file does not declare an IFC schema version.");
  }

  return { entities, byType, header, schema, warnings };
}

// ---------------------------------------------------------------------------
// Getting at values
// ---------------------------------------------------------------------------

export function attr(entity: IfcEntity | undefined, index: number): IfcValue {
  return entity?.attributes[index] ?? { kind: "null" };
}

export function asString(value: IfcValue | undefined): string | null {
  if (!value) return null;
  if (value.kind === "string") return value.value;
  if (value.kind === "typed") return asString(value.value);
  if (value.kind === "enum") return value.value;
  return null;
}

export function asNumber(value: IfcValue | undefined): number | null {
  if (!value) return null;
  if (value.kind === "number") return value.value;
  if (value.kind === "typed") return asNumber(value.value);
  return null;
}

export function asRef(value: IfcValue | undefined): number | null {
  if (!value) return null;
  return value.kind === "ref" ? value.id : null;
}

export function asRefs(value: IfcValue | undefined): number[] {
  if (!value) return [];
  if (value.kind === "ref") return [value.id];
  if (value.kind === "list") {
    return value.items
      .map((item) => (item.kind === "ref" ? item.id : null))
      .filter((id): id is number => id !== null);
  }
  return [];
}

/** Every entity of a type, including subtypes named explicitly. */
export function entitiesOfTypes(model: IfcModel, ...types: string[]): IfcEntity[] {
  return types
    .flatMap((type) => model.byType.get(type.toUpperCase()) ?? [])
    .map((id) => model.entities.get(id))
    .filter((entity): entity is IfcEntity => entity !== undefined);
}
