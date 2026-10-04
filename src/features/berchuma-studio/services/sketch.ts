import type { DesignSpec, SketchObject } from "../types/spec";

export type SketchAxis = "x" | "y" | "z";
export type SketchTool =
  | "select" | "rectangle" | "line" | "box" | "push-pull"
  | "move" | "rotate" | "scale" | "measure" | "orbit" | "pan";

const FACE = 1;
const GRID = 10;

export function snapMillimetres(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid;
}

export function sketchId(objects: SketchObject[], prefix = "sketch"): string {
  let index = objects.length + 1;
  while (objects.some((object) => object.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function createSketchObject(
  spec: DesignSpec,
  shape: SketchObject["shape"],
  position = { x: 0, y: 0, z: 0 },
  axis: SketchAxis = "y",
): SketchObject {
  const face = shape === "face";
  const line = shape === "line";
  const size = line
    ? { width: 1000, height: 18, depth: 18 }
    : face
      ? {
          width: axis === "x" ? FACE : 600,
          height: axis === "y" ? FACE : 500,
          depth: axis === "z" ? FACE : 500,
        }
      : { width: 600, height: 400, depth: 500 };
  return {
    id: sketchId(spec.sketchObjects),
    name: shape === "box" ? "Box" : shape === "line" ? "Line" : "Rectangle",
    shape,
    objectType: "generic",
    position: {
      x: snapMillimetres(position.x),
      y: snapMillimetres(position.y),
      z: snapMillimetres(position.z),
    },
    size,
    rotation: { x: 0, y: 0, z: 0 },
    extrusionAxis: axis,
    boardId: spec.carcass.board.id,
    materialHex: spec.carcass.board.appearance?.hex ?? spec.finish.hex,
    thickness: spec.carcass.board.thickness,
  };
}

export function addSketchObject(spec: DesignSpec, object: SketchObject): DesignSpec {
  return { ...spec, sketchMode: true, sketchObjects: [...spec.sketchObjects, object] };
}

export function updateSketchObject(
  spec: DesignSpec,
  id: string,
  update: Partial<SketchObject>,
): DesignSpec {
  return {
    ...spec,
    sketchObjects: spec.sketchObjects.map((object) =>
      object.id === id ? { ...object, ...update } : object,
    ),
  };
}

export function pushPullSketchObject(
  spec: DesignSpec,
  id: string,
  distance: number,
): DesignSpec {
  const amount = Math.max(0.1, Math.abs(distance));
  return {
    ...spec,
    sketchObjects: spec.sketchObjects.map((object) => {
      if (object.id !== id) return object;
      const axis = object.extrusionAxis;
      const size = { ...object.size };
      if (axis === "x") size.width = amount;
      if (axis === "y") size.height = amount;
      if (axis === "z") size.depth = amount;
      return { ...object, shape: "box", size };
    }),
  };
}

export function duplicateSketchObject(spec: DesignSpec, id: string): DesignSpec {
  const source = spec.sketchObjects.find((object) => object.id === id);
  if (!source) return spec;
  const copy: SketchObject = {
    ...structuredClone(source),
    id: sketchId(spec.sketchObjects),
    name: `${source.name} copy`,
    position: { ...source.position, x: source.position.x + 50, z: source.position.z + 50 },
  };
  return { ...spec, sketchObjects: [...spec.sketchObjects, copy] };
}

export function removeSketchObject(spec: DesignSpec, id: string): DesignSpec {
  return { ...spec, sketchObjects: spec.sketchObjects.filter((object) => object.id !== id) };
}

export function groupSketchObjects(spec: DesignSpec, ids: string[]): DesignSpec {
  if (ids.length < 2) return spec;
  const groupId = `group-${Date.now().toString(36)}`;
  return {
    ...spec,
    sketchObjects: spec.sketchObjects.map((object) =>
      ids.includes(object.id) ? { ...object, groupId } : object,
    ),
  };
}
