"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { DimensionLabel } from "./handles";
import { dragDoorEdge, type DoorEdge, type FrontRect } from "../../services/door-layout";

/**
 * The four edges of the selected door, to pull.
 *
 * A small dot on each edge, inside a much larger invisible target, so a
 * finger finds it without the dot covering the door. Nothing moves until the
 * pointer has travelled a few pixels: a tap on a handle is not a resize, and
 * neither is a finger resting on one. While an edge is held the camera stands
 * still and the size is written over the door, the way it is read off a tape:
 * "← 450 mm →".
 *
 * Works in the door's own cabinet frame — x from the cabinet's left side, y up
 * from its floor — and hands back a whole rectangle; what is allowed is for
 * the operations to say, and the snap targets come from the cabinet's real
 * boards and fronts.
 */

const MM = 0.001;
const DOT = 0.018;
/** The part a finger has to hit, several times the dot. */
const TARGET = 0.075;
/** Pixels of travel before a press on a handle becomes a drag. */
const DEAD_ZONE = 4;

const AXIS: Record<DoorEdge, THREE.Vector3> = {
  left: new THREE.Vector3(1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, 1, 0),
};

/** The point on a line closest to a ray — see `closestOnAxis` in handles.tsx. */
function along(ray: THREE.Ray, origin: THREE.Vector3, direction: THREE.Vector3): number {
  const w0 = new THREE.Vector3().subVectors(origin, ray.origin);
  const a = direction.dot(direction);
  const b = direction.dot(ray.direction);
  const c = ray.direction.dot(ray.direction);
  const d = direction.dot(w0);
  const e = ray.direction.dot(w0);
  const denominator = a * c - b * b;
  if (Math.abs(denominator) < 1e-9) return 0;
  return (b * e - c * d) / denominator;
}

export function DoorHandles({
  rect,
  origin,
  targets,
  snap,
  onDrag,
  onDragState,
}: {
  /** The door's face in its cabinet's frame, millimetres. */
  rect: FrontRect;
  /** Where the cabinet's front-left-bottom corner is, in the model group's frame: x, y and the scene z of the door's face. */
  origin: { x: number; y: number; z: number };
  targets: { x: number[]; y: number[] };
  snap: boolean;
  onDrag: (rect: FrontRect) => void;
  onDragState: (dragging: boolean) => void;
}) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const [active, setActive] = useState<DoorEdge | null>(null);
  const [live, setLive] = useState<{ rect: FrontRect; snapped: boolean } | null>(null);
  // The handles sit inside the model's centring group; the pointer's ray is in
  // world space, so the edge's line is taken into world space to meet it. And
  // the line runs through the handle that was grabbed, not along the cabinet's
  // floor: a line a metre below the pointer is foreshortened differently, and
  // the edge ran ahead of the finger by several per cent.
  const groupRef = useRef<THREE.Group>(null);
  const drag = useRef<{ edge: DoorEdge; start: FrontRect; line: THREE.Vector3; startT: number; startValue: number; x: number; y: number; moving: boolean } | null>(null);

  const scene = (x: number, y: number): [number, number, number] => [(origin.x + x) * MM, (origin.y + y) * MM, origin.z];
  const shown = live?.rect ?? rect;
  const centre = scene(shown.x + shown.width / 2, shown.y + shown.height / 2);
  const distance = camera.position.distanceTo(new THREE.Vector3(...centre));
  const scale = Math.max(0.5, Math.min(3, distance / 3));

  useEffect(() => {
    if (!active) return;
    const raycaster = new THREE.Raycaster();
    const rayFrom = (event: PointerEvent) => {
      const box = domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), camera);
      return raycaster.ray;
    };
    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      if (!state.moving && Math.hypot(event.clientX - state.x, event.clientY - state.y) < DEAD_ZONE) return;
      state.moving = true;
      event.preventDefault();
      const t = along(rayFrom(event), state.line, AXIS[state.edge]);
      const value = state.startValue + (t - state.startT) / MM;
      // The tolerance follows the zoom: about a finger's width of slack on
      // screen, never so much that a door cannot be put just short of a line.
      const result = dragDoorEdge(state.start, state.edge, value, { targets, snap, tolerance: Math.max(6, Math.min(30, 10 * scale)) });
      setLive(result);
      onDrag(result.rect);
      invalidate();
    };
    const onUp = () => {
      drag.current = null;
      setActive(null);
      setLive(null);
      onDragState(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active, camera, domElement, invalidate, onDrag, onDragState, origin.x, origin.y, origin.z, scale, snap, targets]);

  function toWorld(point: [number, number, number]) {
    const local = new THREE.Vector3(...point);
    return groupRef.current ? groupRef.current.localToWorld(local) : local;
  }

  const begin = (edge: DoorEdge, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const startValue = edge === "left" ? rect.x : edge === "right" ? rect.x + rect.width : edge === "bottom" ? rect.y : rect.y + rect.height;
    const line = toWorld(edge === "left" || edge === "right" ? scene(0, rect.y + rect.height / 2) : scene(rect.x + rect.width / 2, 0));
    drag.current = { edge, start: rect, line, startT: along(event.ray, line, AXIS[edge]), startValue, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY, moving: false };
    setActive(edge);
    onDragState(true);
  };

  const handles: { edge: DoorEdge; at: [number, number, number] }[] = [
    { edge: "left", at: scene(shown.x, shown.y + shown.height / 2) },
    { edge: "right", at: scene(shown.x + shown.width, shown.y + shown.height / 2) },
    { edge: "bottom", at: scene(shown.x + shown.width / 2, shown.y) },
    { edge: "top", at: scene(shown.x + shown.width / 2, shown.y + shown.height) },
  ];

  const outline = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(shown.width * MM, shown.height * MM)), [shown.width, shown.height]);
  useEffect(() => () => outline.dispose(), [outline]);

  const label = live
    ? active === "left" || active === "right"
      ? `← ${Math.round(live.rect.width)} mm →`
      : `↕ ${Math.round(live.rect.height)} mm`
    : null;

  return (
    <group name="door-handles" ref={groupRef}>
      {/* The door's outline, so it reads as the thing selected. */}
      <lineSegments geometry={outline} position={centre} renderOrder={3} raycast={() => null}>
        <lineBasicMaterial color={live?.snapped ? "#16a34a" : "#f4a63a"} depthTest={false} transparent />
      </lineSegments>
      {handles.map(({ edge, at }) => (
        <group key={edge} position={at}>
          {/* What the finger hits: big, and not drawn. */}
          <mesh name={`door-handle-${edge}`} onPointerDown={(event) => begin(edge, event)} renderOrder={4}>
            <sphereGeometry args={[TARGET * scale * 0.5, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
          </mesh>
          {/* What the eye sees: small. */}
          <mesh raycast={() => null} renderOrder={5}>
            <sphereGeometry args={[DOT * scale * 0.5, 16, 16]} />
            <meshBasicMaterial color={active === edge ? "#ffffff" : "#f4a63a"} depthTest={false} transparent opacity={0.95} />
          </mesh>
        </group>
      ))}
      {label ? <DimensionLabel text={label} position={[centre[0], centre[1], centre[2] + 0.02]} scale={Math.max(1, scale * 0.9)} /> : null}
    </group>
  );
}
