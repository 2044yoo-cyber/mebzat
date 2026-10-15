"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useStore, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";

import { materialOf } from "../construction/catalogue";
import { buildDrawList, toViewer, viewerCentre, type DrawGroup, type DrawList, type PrismDraw } from "../construction/draw-list";
import { explodeInfo } from "../construction/explode";
import { boundsOf } from "../construction/model";
import type { Shape } from "../construction/geometry";
import type { ComponentRecord, ConstructionModel, ViewState } from "../construction/types";
import { cutPlane, indexModel, visibleComponents, type ModelIndex } from "../construction/view";

const MM = 0.001;
const BRAND = "#1473e6";
const PICK = "#ffb703";

export type CameraPreset = "orbit" | "top" | "front" | "side";
export type ScreenLabel = { id: string; text: string; x: number; y: number; z: number; width: number; height: number };

export function ConstructionScene({
  model,
  view,
  preset,
  resetKey,
  focusKey,
  onPick,
  onMiss,
  onLabels,
}: {
  model: ConstructionModel;
  view: ViewState;
  preset: CameraPreset;
  resetKey: number;
  focusKey: number;
  onPick: (componentId: string, instance: number | null) => void;
  onMiss: () => void;
  onLabels: (labels: ScreenLabel[]) => void;
}) {
  const index = useMemo(() => indexModel(model), [model]);
  const centre = useMemo(() => viewerCentre(model), [model]);
  const building = useMemo(() => buildingBounds(model, view.stage <= 2), [model, view.stage <= 2]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => visibleComponents(model, view, index), [model, view, index]);
  const list = useMemo(() => buildDrawList(model, index, view, visible, centre), [model, index, view, visible, centre]);
  const plane = useMemo(() => clipPlane(model, view, centre), [model, view, centre]);
  const selected = view.selectedId ? index.byId.get(view.selectedId) ?? null : null;
  const focusTarget = useMemo(() => (selected ? componentCentre(selected, centre) : null), [selected, centre]);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 38, near: 0.05, far: 400 }}
      gl={{ antialias: true, alpha: true, localClippingEnabled: true }}
      style={{ width: "100%", height: "100%", maxWidth: "100%", minWidth: 0, touchAction: "none" }}
      onPointerMissed={onMiss}
    >
      <ambientLight intensity={0.78} />
      <directionalLight position={[10, 18, 12]} intensity={1.35} />
      <directionalLight position={[-9, 9, -7]} intensity={0.4} />
      {list.groups.map((group) => (
        <InstancedGroup key={`${group.key}:${group.count}`} group={group} owners={list.owners} plane={plane} onPick={onPick} />
      ))}
      {list.prisms.map((prism) => (
        <PrismGroup key={`${prism.owner}:${view.stage}:${prism.shapes.length}:${prism.highlight}:${prism.ghost}`} prism={prism} list={list} centre={centre} plane={plane} onPick={onPick} />
      ))}
      <LabelProbe list={list} model={model} view={view} centre={centre} onLabels={onLabels} />
      <CameraRig building={building} preset={preset} resetKey={resetKey} focusKey={focusKey} focusTarget={focusTarget} />
    </Canvas>
  );
}

function clipPlane(model: ConstructionModel, view: ViewState, centre: { x: number; y: number }): THREE.Plane | null {
  const cut = cutPlane(model, view);
  if (!cut) return null;
  if (cut.axis === "z") return new THREE.Plane(new THREE.Vector3(0, -1, 0), cut.value * MM);
  if (cut.axis === "x") return new THREE.Plane(new THREE.Vector3(1, 0, 0), -(cut.value - centre.x) * MM);
  return new THREE.Plane(new THREE.Vector3(0, 0, -1), -(cut.value - centre.y) * MM);
}

function useMaterial(materialId: string, ghost: boolean, highlight: DrawGroup["highlight"], plane: THREE.Plane | null, doubleSided = false) {
  return useMemo(() => {
    const def = materialOf(materialId);
    const material = new THREE.MeshStandardMaterial({
      color: highlight === "instance" ? PICK : def.color,
      roughness: def.roughness,
      metalness: def.metalness ?? 0,
      transparent: ghost || (def.opacity ?? 1) < 1,
      opacity: ghost ? 0.12 : def.opacity ?? 1,
      depthWrite: !ghost && (def.opacity ?? 1) >= 1,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      emissive: highlight === "instance" ? PICK : highlight === "component" ? BRAND : "#000000",
      emissiveIntensity: highlight === "instance" ? 0.55 : highlight === "component" ? 0.34 : 0,
      clippingPlanes: plane ? [plane] : null,
    });
    return material;
  }, [materialId, ghost, highlight, plane, doubleSided]);
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1);

function InstancedGroup({ group, owners, plane, onPick }: { group: DrawGroup; owners: ComponentRecord[]; plane: THREE.Plane | null; onPick: (id: string, instance: number | null) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMaterial(group.materialId, group.ghost, group.highlight, plane);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(group.matrices, 16);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = group.count;
    // Picking uses these; they must not outlive the matrices they were measured from.
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
    invalidate();
  }, [group, invalidate]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <instancedMesh
      ref={ref}
      args={[group.kind === "box" ? BOX : CYL, material, group.count]}
      frustumCulled={false}
      raycast={group.ghost ? () => null : undefined}
      onClick={
        group.ghost
          ? undefined
          : (event) => {
              event.stopPropagation();
              const i = event.instanceId;
              if (i === undefined) return;
              const owner = owners[group.owner[i]!];
              if (owner) onPick(owner.id, owner.shapes.length > 1 ? group.shape[i]! : null);
            }
      }
    />
  );
}

function prismGeometry(shapes: Shape[], centre: { x: number; y: number }) {
  const parts: THREE.BufferGeometry[] = [];
  const triangles: number[] = [];
  for (const shape of shapes) {
    if (shape.t !== "prism" || shape.poly.length < 3) continue;
    const outline = new THREE.Shape(shape.poly.map((p) => new THREE.Vector2((p.x - centre.x) * MM, (p.y - centre.y) * MM)));
    for (const hole of shape.holes ?? []) outline.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2((p.x - centre.x) * MM, (p.y - centre.y) * MM))));
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: Math.max(0.001, (shape.z1 - shape.z0) * MM), bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, shape.z0 * MM, 0);
    parts.push(geometry);
    triangles.push(geometry.getAttribute("position").count / 3);
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ? { geometry: merged, triangles } : null;
}

function PrismGroup({ prism, list, centre, plane, onPick }: { prism: PrismDraw; list: DrawList; centre: { x: number; y: number }; plane: THREE.Plane | null; onPick: (id: string, instance: number | null) => void }) {
  const owner = list.owners[prism.owner]!;
  const built = useMemo(() => prismGeometry(prism.shapes.map((i) => owner.shapes[i]!), centre), [prism.shapes, owner, centre]);
  const material = useMaterial(owner.materialId, prism.ghost, prism.highlight, plane, true);
  useEffect(() => () => { built?.geometry.dispose(); }, [built]);
  useEffect(() => () => material.dispose(), [material]);
  if (!built) return null;
  return (
    <mesh
      geometry={built.geometry}
      material={material}
      position={prism.offset}
      raycast={prism.ghost ? () => null : undefined}
      onClick={
        prism.ghost
          ? undefined
          : (event) => {
              event.stopPropagation();
              let face = event.faceIndex ?? 0;
              let which = 0;
              for (let i = 0; i < built.triangles.length; i += 1) {
                if (face < built.triangles[i]!) { which = i; break; }
                face -= built.triangles[i]!;
              }
              onPick(owner.id, owner.shapes.length > 1 ? prism.shapes[which] ?? null : null);
            }
      }
    />
  );
}

/** Where each label's anchor falls on the screen. Reported only when it moves. */
function LabelProbe({ list, model, view, centre, onLabels }: { list: DrawList; model: ConstructionModel; view: ViewState; centre: { x: number; y: number }; onLabels: (labels: ScreenLabel[]) => void }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const last = useRef<string | null>(null);
  const anchors = useMemo(() => {
    const out: { id: string; text: string; at: THREE.Vector3; stage: number }[] = [];
    for (const c of list.owners) {
      if (!c.label) continue;
      const info = explodeInfo(c, view, model);
      const p = toViewer({ x: c.label.anchor.x + info.base.x, y: c.label.anchor.y + info.base.y, z: c.label.anchor.z + info.base.z }, centre);
      out.push({ id: c.id, text: c.label.text, at: new THREE.Vector3(...p), stage: c.stage });
    }
    // The lesson being taught first, then the rest, and not so many that they crowd the model.
    out.sort((a, b) => Number(b.stage === view.stage) - Number(a.stage === view.stage) || b.stage - a.stage);
    return out.slice(0, size.width < 520 ? 6 : 12);
  }, [list, model, view, centre, size.width]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const labels: ScreenLabel[] = [];
    for (const a of anchors) {
      v.copy(a.at).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      labels.push({ id: a.id, text: a.text, x: Math.round(((v.x + 1) / 2) * size.width), y: Math.round(((1 - v.y) / 2) * size.height), z: v.z, width: size.width, height: size.height });
    }
    const signature = labels.map((l) => `${l.id}:${l.x}:${l.y}`).join("|");
    if (signature !== last.current) { last.current = signature; onLabels(labels); }
  });
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => { last.current = null; invalidate(); }, [anchors, invalidate]);
  return null;
}

function CameraRig({ building, preset, resetKey, focusKey, focusTarget }: { building: ReturnType<typeof buildingBounds>; preset: CameraPreset; resetKey: number; focusKey: number; focusTarget: THREE.Vector3 | null }) {
  const store = useStore();
  const element = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const orbit = useRef<OrbitControls | null>(null);
  const target = useMemo(() => new THREE.Vector3(...building.centre), [building]);

  useEffect(() => {
    const { camera } = store.getState();
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width === 0) return;
    const span = Math.max(building.size[0], building.size[1], building.size[2]);
    const distance = Math.max(8, span * 1.75);
    camera.aspect = size.width / size.height;
    const [tx, ty, tz] = building.centre;
    if (preset === "top") camera.position.set(tx, ty + distance * 1.25, tz + 0.001);
    else if (preset === "front") camera.position.set(tx, ty, tz + distance);
    else if (preset === "side") camera.position.set(tx + distance, ty, tz);
    else camera.position.set(tx + distance * 0.72, ty + distance * 0.5, tz + distance * 0.9);
    camera.near = Math.max(0.05, distance / 120);
    camera.far = distance * 20;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (orbit.current) { orbit.current.target.copy(target); orbit.current.update(); }
    if ("__scenes" in window) Object.assign(window, { __constructionCamera: camera });
    invalidate();
  }, [building, invalidate, preset, resetKey, size.height, size.width, store, target]);

  useEffect(() => {
    const { camera } = store.getState();
    const controls = new OrbitControls(camera, element);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.499;
    controls.screenSpacePanning = true;
    controls.target.copy(target);
    const changed = () => invalidate();
    controls.addEventListener("change", changed);
    controls.update();
    orbit.current = controls;
    return () => {
      controls.removeEventListener("change", changed);
      controls.dispose();
      orbit.current = null;
    };
  }, [element, invalidate, store, target]);

  useEffect(() => {
    if (!focusTarget || !orbit.current) return;
    orbit.current.target.copy(focusTarget);
    orbit.current.update();
    invalidate();
    // Only when asked: a selection alone must not move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  useFrame(() => { orbit.current?.update(); });
  return null;
}

/** The building itself (frame, roof, walls), not the plot or the pits, for framing the camera. */
function buildingBounds(model: ConstructionModel, site: boolean) {
  // Setting out and excavation are about the whole plot; everything after is about the building.
  const shapes = model.components.filter((c) => (site ? c.category === "site" : c.category === "frame" || c.category === "masonry" || c.category === "roof")).flatMap((c) => c.shapes);
  const { min, max } = boundsOf(shapes);
  const centre = viewerCentre(model);
  const lo = toViewer(min, centre);
  const hi = toViewer(max, centre);
  const span: [number, number, number] = [Math.abs(hi[0] - lo[0]), Math.abs(hi[1] - lo[1]), Math.abs(hi[2] - lo[2])];
  return { centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] as [number, number, number], size: span };
}

function componentCentre(c: ComponentRecord, centre: { x: number; y: number }) {
  const { min, max } = boundsOf(c.shapes);
  const p = toViewer({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }, centre);
  return new THREE.Vector3(...p);
}

export type { ModelIndex };
