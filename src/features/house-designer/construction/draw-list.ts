import * as THREE from "three";

import { explodeInfo, shapeOffset } from "./explode";
import type { Shape } from "./geometry";
import type { ComponentRecord, ConstructionModel, ViewState } from "./types";
import { shapeVisible, type ModelIndex, type Visible } from "./view";

/**
 * The model turned into what a renderer draws: boxes and cylinders as
 * instance matrices grouped by material, prisms as per-component lists. All of
 * it is in metres in the viewer's frame (X east, Y up, Z south), and it is
 * rebuilt from the model whenever the view changes — the model itself is never
 * touched, so assembling again restores the geometry exactly.
 */

const MM = 0.001;

export type Highlight = "none" | "component" | "instance";

export type DrawGroup = {
  key: string;
  kind: "box" | "cyl";
  materialId: string;
  ghost: boolean;
  highlight: Highlight;
  count: number;
  /** 16 numbers per instance. */
  matrices: Float32Array;
  /** The component (index into `owners`) and the shape within it, for picking. */
  owner: Int32Array;
  shape: Int32Array;
};

export type PrismDraw = {
  owner: number;
  shapes: number[];
  ghost: boolean;
  highlight: Highlight;
  /** Whole-group offset, metres in the viewer frame. */
  offset: [number, number, number];
};

export type DrawList = {
  owners: ComponentRecord[];
  groups: DrawGroup[];
  prisms: PrismDraw[];
  instanceCount: number;
};

type Builder = { kind: "box" | "cyl"; materialId: string; ghost: boolean; highlight: Highlight; matrices: number[]; owner: number[]; shape: number[] };

const EULER = new THREE.Euler();
const Q = new THREE.Quaternion();
const POS = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const M = new THREE.Matrix4();
const QX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const QZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

const TILT_AXIS_Z = new THREE.Vector3(0, 0, 1);
const TILT_AXIS_X = new THREE.Vector3(1, 0, 0);
const TILT = new THREE.Quaternion();

/**
 * The turn that stands a unit cylinder (along the viewer's up axis) along the shape's axis,
 * tipped by its fall: a positive tilt lowers the +axis end, as `cylEnds` in the audit reads it.
 */
export function cylinderQuaternion(shape: Extract<Shape, { t: "cyl" }>, out: THREE.Quaternion): THREE.Quaternion {
  if (shape.axis === "z") out.identity();
  else if (shape.axis === "x") out.copy(QZ);
  else out.copy(QX);
  const tilt = shape.tilt ?? 0;
  if (tilt !== 0 && shape.axis !== "z") {
    // The viewer's up is the model's z and its depth axis is the model's -y, so a fall about x lowers +x with a turn about the viewer's z, and +y with a turn about its x.
    TILT.setFromAxisAngle(shape.axis === "x" ? TILT_AXIS_Z : TILT_AXIS_X, -tilt);
    out.premultiply(TILT);
  }
  return out;
}

export function buildDrawList(model: ConstructionModel, index: ModelIndex, view: ViewState, visible: Visible[], centre: { x: number; y: number }): DrawList {
  const owners: ComponentRecord[] = [];
  const builders = new Map<string, Builder>();
  const prisms: PrismDraw[] = [];
  const modelCentre = { x: centre.x, y: centre.y, z: 0 };
  let instanceCount = 0;
  const get = (kind: "box" | "cyl", materialId: string, ghost: boolean, highlight: Highlight) => {
    const key = `${kind}|${materialId}|${ghost ? "g" : "s"}|${highlight}`;
    let b = builders.get(key);
    if (!b) { b = { kind, materialId, ghost, highlight, matrices: [], owner: [], shape: [] }; builders.set(key, b); }
    return b;
  };
  for (const { component: c, visibility } of visible) {
    const ownerIndex = owners.length;
    owners.push(c);
    const ghost = visibility === "ghost";
    const info = explodeInfo(c, view, model);
    const selectedComponent = view.selectedId === c.id || view.highlightIds.includes(c.id);
    const prismShapes: number[] = [];
    c.shapes.forEach((shape, i) => {
      if (!shapeVisible(c, i, view, index)) return;
      const highlight: Highlight = selectedComponent ? (view.selectedId === c.id && view.selectedInstance === i ? "instance" : "component") : "none";
      if (shape.t === "prism") { prismShapes.push(i); return; }
      const off = shapeOffset(shape, info, modelCentre);
      const b = get(shape.t === "box" ? "box" : "cyl", c.materialId, ghost, highlight);
      POS.set((shape.c.x - centre.x + off.x) * MM, (shape.c.z + off.z) * MM, -(shape.c.y - centre.y + off.y) * MM);
      if (shape.t === "box") {
        EULER.set(shape.rx ?? 0, shape.rz ?? 0, -(shape.ry ?? 0), "YZX");
        Q.setFromEuler(EULER);
        SCALE.set(shape.s.x * MM, shape.s.z * MM, shape.s.y * MM);
      } else {
        cylinderQuaternion(shape, Q);
        SCALE.set(shape.r * MM, shape.len * MM, shape.r * MM);
      }
      M.compose(POS, Q, SCALE);
      for (let k = 0; k < 16; k += 1) b.matrices.push(M.elements[k]!);
      b.owner.push(ownerIndex);
      b.shape.push(i);
      instanceCount += 1;
    });
    if (prismShapes.length) {
      // One offset for the whole prism group: the first shape's, which is the component's for all but radial layers.
      const first = c.shapes[prismShapes[0]!]!;
      const off = shapeOffset(first, info, modelCentre);
      const highlight: Highlight = selectedComponent ? (view.selectedId === c.id && view.selectedInstance !== null && prismShapes.includes(view.selectedInstance) ? "instance" : "component") : "none";
      prisms.push({ owner: ownerIndex, shapes: prismShapes, ghost, highlight, offset: [off.x * MM, off.z * MM, -off.y * MM] });
      instanceCount += prismShapes.length;
    }
  }
  const groups: DrawGroup[] = [...builders.entries()].map(([key, b]) => ({
    key, kind: b.kind, materialId: b.materialId, ghost: b.ghost, highlight: b.highlight, count: b.owner.length, matrices: new Float32Array(b.matrices), owner: Int32Array.from(b.owner), shape: Int32Array.from(b.shape),
  }));
  return { owners, groups, prisms, instanceCount };
}

/** The point the viewer orbits, in its own frame (metres). */
export function viewerCentre(model: ConstructionModel) {
  const { min, max } = model.bounds;
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 };
}

/** Model-frame position (mm) to the viewer's frame (metres). */
export function toViewer(p: { x: number; y: number; z: number }, centre: { x: number; y: number }): [number, number, number] {
  return [(p.x - centre.x) * MM, p.z * MM, -(p.y - centre.y) * MM];
}
