import {
  asNumber,
  asRef,
  asRefs,
  asString,
  attr,
  entitiesOfTypes,
  type IfcEntity,
  type IfcModel,
  type IfcValue,
} from "./parse";

/**
 * Turning IFC shapes into triangles.
 *
 * The importer next door reads quantities, which is what a bill needs. This
 * reads *geometry*, which is what a viewer needs — and they are different jobs:
 * a file can carry perfect quantities and shapes this cannot evaluate, or
 * shapes and no quantities at all. Neither is made up for by the other.
 *
 * ## What is evaluated
 *
 * Swept solids, which is what almost every wall, slab, column and beam in a
 * Revit or ArchiCAD export actually is:
 *
 *   IfcExtrudedAreaSolid  — a 2D profile pushed along a direction
 *   IfcRectangleProfileDef, IfcCircleProfileDef, IfcArbitraryClosedProfileDef
 *   IfcMappedItem         — the same shape reused at many placements
 *
 * Placement is a chain of `IfcLocalPlacement`s up to the site, composed into
 * one transform and baked into the vertices. Baking rather than keeping a
 * matrix per mesh because the viewer wants one buffer per element, and an
 * element's shape is not reused after import.
 *
 * ## What is not, and what that costs
 *
 * B-reps (`IfcFacetedBrep`), revolutions, and boolean results are not fully
 * evaluated. A `IfcBooleanClippingResult` — a wall clipped by a roof — falls
 * back to its first operand, so the wall is drawn *unclipped*: slightly too
 * tall where the roof cuts it. That is stated on the result rather than hidden,
 * because a viewer that is quietly 300 mm wrong at the eaves is worse than one
 * that says so.
 *
 * Nothing here feeds a quantity. Geometry is for looking at; the numbers come
 * from `IfcElementQuantity`, which the authoring tool measured properly.
 */

/** A 4×4 transform, row-major. Only ever applied to points here. */
export type Mat4 = number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[row * 4 + k]! * b[k * 4 + col]!;
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

export function transformPoint(
  m: Mat4,
  p: [number, number, number],
): [number, number, number] {
  return [
    m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2] + m[3]!,
    m[4]! * p[0] + m[5]! * p[1] + m[6]! * p[2] + m[7]!,
    m[8]! * p[0] + m[9]! * p[1] + m[10]! * p[2] + m[11]!,
  ];
}

/** One element's geometry, ready for a buffer. */
export type Mesh = {
  elementId: string;
  /** Flat xyz triples, in millimetres, already transformed into place. */
  positions: number[];
  /** Triangle indices into `positions`. */
  indices: number[];
  /** Axis-aligned bounds, for framing the camera and for picking. */
  min: [number, number, number];
  max: [number, number, number];
  /** Solid volume in m³, from the swept profile. Never used as a quantity. */
  volume: number;
  /** Set when the shape was approximated — a clipped wall drawn unclipped. */
  approximate: boolean;
};

export type GeometryResult = {
  meshes: Mesh[];
  /** Element ids whose shape could not be evaluated, and why. */
  skipped: { elementId: string; reason: string }[];
  warnings: string[];
};

/**
 * Reads every product's shape.
 *
 * `unitScale` converts the file's units to millimetres and comes from the same
 * `IfcUnitAssignment` the quantities use — geometry and quantities disagreeing
 * about the unit would be a thousand-fold error that only shows up as a
 * building the wrong size on screen.
 */
export function geometryFromIfc(
  model: IfcModel,
  unitScale: number,
  types: string[],
): GeometryResult {
  const meshes: Mesh[] = [];
  const skipped: { elementId: string; reason: string }[] = [];
  const warnings: string[] = [];
  let approximated = 0;

  for (const type of types) {
    for (const product of entitiesOfTypes(model, type)) {
      const shape = asRef(attr(product, 6));
      if (shape === null) {
        skipped.push({ elementId: String(product.id), reason: "no representation" });
        continue;
      }

      const placement = placementOf(model, asRef(attr(product, 5)));

      const built = buildProduct(model, shape, placement, unitScale);
      if (!built) {
        skipped.push({
          elementId: String(product.id),
          reason: "no evaluable solid — B-rep, revolution or a shape this does not read",
        });
        continue;
      }

      if (built.approximate) approximated += 1;
      meshes.push({ ...built, elementId: String(product.id) });
    }
  }

  if (approximated > 0) {
    warnings.push(
      `${approximated} shape${approximated === 1 ? " is" : "s are"} drawn unclipped — a boolean cut could not be evaluated, so ${approximated === 1 ? "it is" : "they are"} slightly larger on screen than in the model. Quantities are unaffected.`,
    );
  }
  if (skipped.length > 0) {
    warnings.push(
      `${skipped.length} element${skipped.length === 1 ? "" : "s"} could not be drawn. ${skipped.length === 1 ? "It is" : "They are"} still measured and billed — only the picture is missing.`,
    );
  }

  return { meshes, skipped, warnings };
}

/** Walks the `IfcLocalPlacement` chain to the top and composes it. */
export function placementOf(model: IfcModel, id: number | null): Mat4 {
  if (id === null) return IDENTITY;

  const placement = model.entities.get(id);
  if (!placement) return IDENTITY;

  if (placement.type === "IFCLOCALPLACEMENT") {
    const parent = placementOf(model, asRef(attr(placement, 0)));
    const relative = axisPlacement(model, asRef(attr(placement, 1)));
    // Parent first: a wall's placement is relative to its storey, which is
    // relative to the building. Composing the other way puts the building
    // inside the wall.
    return multiply(parent, relative);
  }

  return axisPlacement(model, id);
}

/**
 * `IfcAxis2Placement2D/3D` as a transform.
 *
 * Axis is the local Z, RefDirection the local X, and the schema says Y is the
 * cross product — computed rather than read, because a file that states all
 * three and disagrees with itself is a file that renders inside out.
 */
export function axisPlacement(model: IfcModel, id: number | null): Mat4 {
  if (id === null) return IDENTITY;
  const placement = model.entities.get(id);
  if (!placement) return IDENTITY;

  const origin = point3(model, asRef(attr(placement, 0))) ?? [0, 0, 0];

  let z: [number, number, number] = [0, 0, 1];
  let x: [number, number, number] = [1, 0, 0];

  if (placement.type === "IFCAXIS2PLACEMENT3D") {
    z = direction(model, asRef(attr(placement, 1))) ?? z;
    x = direction(model, asRef(attr(placement, 2))) ?? x;
  } else if (placement.type === "IFCAXIS2PLACEMENT2D") {
    x = direction(model, asRef(attr(placement, 1))) ?? x;
  }

  z = normalise(z);
  // Gram-Schmidt: drop the part of X that lies along Z, so the basis is
  // orthogonal even when the file's RefDirection is not perpendicular.
  const dot = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = normalise([x[0] - z[0] * dot, x[1] - z[1] * dot, x[2] - z[2] * dot]);
  const y = cross(z, x);

  return [
    x[0], y[0], z[0], origin[0],
    x[1], y[1], z[1], origin[1],
    x[2], y[2], z[2], origin[2],
    0, 0, 0, 1,
  ];
}

type Built = Omit<Mesh, "elementId">;

/** A product's representation → one merged mesh. */
function buildProduct(
  model: IfcModel,
  shapeId: number,
  placement: Mat4,
  unitScale: number,
): Built | null {
  const shape = model.entities.get(shapeId);
  if (!shape) return null;

  // IfcProductDefinitionShape → Representations
  const representations =
    shape.type === "IFCPRODUCTDEFINITIONSHAPE"
      ? asRefs(attr(shape, 2))
      : [shapeId];

  const parts: Built[] = [];

  for (const id of representations) {
    const representation = model.entities.get(id);
    if (!representation || representation.type !== "IFCSHAPEREPRESENTATION") continue;

    // "Body" is the solid; "Axis", "FootPrint" and "Box" are not worth drawing
    // and drawing them puts stray lines through every wall.
    const identifier = asString(attr(representation, 1));
    if (identifier && identifier !== "Body") continue;

    for (const itemId of asRefs(attr(representation, 3))) {
      const built = buildItem(model, itemId, placement, unitScale);
      if (built) parts.push(built);
    }
  }

  return parts.length === 0 ? null : merge(parts);
}

function buildItem(
  model: IfcModel,
  itemId: number,
  placement: Mat4,
  unitScale: number,
  depth = 0,
): Built | null {
  // Guards against a malformed file whose mapped items refer to each other.
  if (depth > 8) return null;

  const item = model.entities.get(itemId);
  if (!item) return null;

  if (item.type === "IFCEXTRUDEDAREASOLID") {
    return extrude(model, item, placement, unitScale);
  }

  if (item.type === "IFCMAPPEDITEM") {
    // Revit exports almost everything this way: one shape defined once and
    // placed many times. Without this, a whole model comes back empty.
    const source = asRef(attr(item, 0));
    const target = asRef(attr(item, 1));
    if (source === null) return null;

    const map = model.entities.get(source);
    if (!map || map.type !== "IFCREPRESENTATIONMAP") return null;

    const origin = axisPlacement(model, asRef(attr(map, 0)));
    const operator = cartesianOperator(model, target);
    const mapped = asRef(attr(map, 1));
    if (mapped === null) return null;

    const inner = multiply(multiply(placement, operator), origin);
    const representation = model.entities.get(mapped);
    if (!representation) return null;

    const parts: Built[] = [];
    for (const id of asRefs(attr(representation, 3))) {
      const built = buildItem(model, id, inner, unitScale, depth + 1);
      if (built) parts.push(built);
    }
    return parts.length === 0 ? null : merge(parts);
  }

  if (
    item.type === "IFCBOOLEANCLIPPINGRESULT" ||
    item.type === "IFCBOOLEANRESULT"
  ) {
    // The first operand is the thing being cut. Drawing it whole is wrong by
    // whatever the cut removed, which is why the result is flagged rather than
    // presented as exact.
    const first = asRef(attr(item, 1));
    if (first === null) return null;
    const built = buildItem(model, first, placement, unitScale, depth + 1);
    return built ? { ...built, approximate: true } : null;
  }

  return null;
}

/** `IfcCartesianTransformationOperator3D`, as used by mapped items. */
function cartesianOperator(model: IfcModel, id: number | null): Mat4 {
  if (id === null) return IDENTITY;
  const operator = model.entities.get(id);
  if (!operator || !operator.type.startsWith("IFCCARTESIANTRANSFORMATIONOPERATOR")) {
    return IDENTITY;
  }

  const origin = point3(model, asRef(attr(operator, 2))) ?? [0, 0, 0];
  const scale = asNumber(attr(operator, 3)) ?? 1;
  const x = normalise(direction(model, asRef(attr(operator, 0))) ?? [1, 0, 0]);
  const z = normalise(direction(model, asRef(attr(operator, 4))) ?? [0, 0, 1]);
  const y = cross(z, x);

  return [
    x[0] * scale, y[0] * scale, z[0] * scale, origin[0],
    x[1] * scale, y[1] * scale, z[1] * scale, origin[1],
    x[2] * scale, y[2] * scale, z[2] * scale, origin[2],
    0, 0, 0, 1,
  ];
}

/** The one solid that matters: a profile pushed along a direction. */
function extrude(
  model: IfcModel,
  solid: IfcEntity,
  placement: Mat4,
  unitScale: number,
): Built | null {
  const profileId = asRef(attr(solid, 0));
  const profile = profileId === null ? null : profilePoints(model, profileId);
  if (!profile || profile.length < 3) return null;

  const local = axisPlacement(model, asRef(attr(solid, 1)));
  const dir = normalise(direction(model, asRef(attr(solid, 2))) ?? [0, 0, 1]);
  const depth = asNumber(attr(solid, 3)) ?? 0;
  if (depth === 0) return null;

  const transform = multiply(placement, local);

  const positions: number[] = [];
  const indices: number[] = [];

  const bottom: [number, number, number][] = profile.map(([x, y]) =>
    transformPoint(transform, [x * unitScale, y * unitScale, 0]),
  );
  const top: [number, number, number][] = profile.map(([x, y]) =>
    transformPoint(transform, [
      x * unitScale + dir[0] * depth * unitScale,
      y * unitScale + dir[1] * depth * unitScale,
      dir[2] * depth * unitScale,
    ]),
  );

  for (const p of bottom) positions.push(...p);
  for (const p of top) positions.push(...p);

  const n = profile.length;

  // Sides.
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    indices.push(i, next, n + i);
    indices.push(next, n + next, n + i);
  }

  // Caps, triangulated in 2D where the profile is flat.
  for (const triangle of triangulate(profile)) {
    indices.push(triangle[2], triangle[1], triangle[0]);
    indices.push(n + triangle[0], n + triangle[1], n + triangle[2]);
  }

  const area = Math.abs(polygonArea(profile)) * unitScale * unitScale;
  const volume = (area * Math.abs(depth) * unitScale) / 1e9;

  return { positions, indices, ...bounds(positions), volume, approximate: false };
}

/** A profile as a closed 2D polygon, in file units. */
export function profilePoints(
  model: IfcModel,
  id: number,
): [number, number][] | null {
  const profile = model.entities.get(id);
  if (!profile) return null;

  const position = axisPlacement(model, asRef(attr(profile, 2)));
  const place = (x: number, y: number): [number, number] => {
    const [px, py] = transformPoint(position, [x, y, 0]);
    return [px, py];
  };

  if (profile.type === "IFCRECTANGLEPROFILEDEF") {
    const width = asNumber(attr(profile, 3)) ?? 0;
    const height = asNumber(attr(profile, 4)) ?? 0;
    if (width === 0 || height === 0) return null;
    // Centred on its own origin, which is what the schema says and what makes
    // a wall sit on its centreline rather than beside it.
    const hw = width / 2;
    const hh = height / 2;
    return [place(-hw, -hh), place(hw, -hh), place(hw, hh), place(-hw, hh)];
  }

  if (profile.type === "IFCCIRCLEPROFILEDEF") {
    const radius = asNumber(attr(profile, 3)) ?? 0;
    if (radius === 0) return null;
    const segments = 24;
    return Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return place(Math.cos(angle) * radius, Math.sin(angle) * radius);
    });
  }

  if (
    profile.type === "IFCARBITRARYCLOSEDPROFILEDEF" ||
    profile.type === "IFCARBITRARYPROFILEDEFWITHVOIDS"
  ) {
    const curve = asRef(attr(profile, 2 + 0));
    // Attribute 2 is Position on parameterised profiles and OuterCurve here, so
    // the curve is read from index 2 only when it resolves to a polyline.
    const outer = asRef(attr(profile, 2));
    const points = polylinePoints(model, outer ?? curve);
    return points && points.length >= 3 ? points.map(([x, y]) => place(x, y)) : null;
  }

  return null;
}

function polylinePoints(
  model: IfcModel,
  id: number | null,
): [number, number][] | null {
  if (id === null) return null;
  const polyline = model.entities.get(id);
  if (!polyline || polyline.type !== "IFCPOLYLINE") return null;

  const points: [number, number][] = [];
  for (const pointId of asRefs(attr(polyline, 0))) {
    const p = point3(model, pointId);
    if (p) points.push([p[0], p[1]]);
  }

  // A closed polyline repeats its first point; the extruder closes it itself.
  if (points.length > 1) {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) {
      points.pop();
    }
  }

  return points.length >= 3 ? points : null;
}

/**
 * Ear clipping.
 *
 * A fan triangulation is one line shorter and wrong for any profile that is not
 * convex — an L-shaped column comes out with a triangle across the notch. Real
 * profiles are L-shaped often enough to be worth the forty lines.
 */
export function triangulate(polygon: [number, number][]): [number, number, number][] {
  const n = polygon.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];

  const indices = Array.from({ length: n }, (_, i) => i);
  const wind = polygonArea(polygon) > 0 ? 1 : -1;
  const triangles: [number, number, number][] = [];

  let guard = 0;
  while (indices.length > 3 && guard < n * n) {
    guard += 1;
    let clipped = false;

    for (let i = 0; i < indices.length; i += 1) {
      const previous = indices[(i - 1 + indices.length) % indices.length]!;
      const current = indices[i]!;
      const next = indices[(i + 1) % indices.length]!;

      const a = polygon[previous]!;
      const b = polygon[current]!;
      const c = polygon[next]!;

      // Convex in the polygon's own winding direction?
      const cross2 =
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross2 * wind <= 0) continue;

      // And empty of any other vertex.
      let contains = false;
      for (const other of indices) {
        if (other === previous || other === current || other === next) continue;
        if (inTriangle(polygon[other]!, a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;

      triangles.push([previous, current, next]);
      indices.splice(i, 1);
      clipped = true;
      break;
    }

    // A self-intersecting profile has no ear to clip. Falling back to a fan
    // gives something drawable rather than nothing.
    if (!clipped) break;
  }

  if (indices.length === 3) {
    triangles.push([indices[0]!, indices[1]!, indices[2]!]);
  } else if (indices.length > 3) {
    for (let i = 1; i < indices.length - 1; i += 1) {
      triangles.push([indices[0]!, indices[i]!, indices[i + 1]!]);
    }
  }

  return triangles;
}

function inTriangle(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  c: [number, number],
): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

function sign(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  return (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
}

/** Signed area. Positive is counter-clockwise. */
export function polygonArea(polygon: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function merge(parts: Built[]): Built {
  const positions: number[] = [];
  const indices: number[] = [];
  let volume = 0;
  let approximate = false;

  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.positions);
    for (const index of part.indices) indices.push(index + offset);
    volume += part.volume;
    approximate = approximate || part.approximate;
  }

  return { positions, indices, ...bounds(positions), volume, approximate };
}

function bounds(positions: number[]): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }

  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

function point3(model: IfcModel, id: number | null): [number, number, number] | null {
  if (id === null) return null;
  const entity = model.entities.get(id);
  if (!entity || entity.type !== "IFCCARTESIANPOINT") return null;
  return triple(attr(entity, 0));
}

function direction(
  model: IfcModel,
  id: number | null,
): [number, number, number] | null {
  if (id === null) return null;
  const entity = model.entities.get(id);
  if (!entity || entity.type !== "IFCDIRECTION") return null;
  return triple(attr(entity, 0));
}

function triple(value: IfcValue): [number, number, number] | null {
  if (value.kind !== "list") return null;
  const numbers = value.items.map((item) => asNumber(item) ?? 0);
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
}

function normalise(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length === 0 ? [0, 0, 1] : [v[0] / length, v[1] / length, v[2] / length];
}

function cross(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
