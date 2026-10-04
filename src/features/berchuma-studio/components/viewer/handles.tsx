"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { Cabinet } from "../../types/spec";

/**
 * Grab the edge of a cabinet and pull.
 *
 * Sliders in the panel are precise and a drag is not, which is exactly why
 * both exist: somebody who knows the cupboard is 800 types 800, and somebody
 * who wants it "a bit wider than the window" pulls it. Neither is a substitute
 * for the other.
 *
 * Written against three.js directly rather than with a helper library. The
 * usual answer here is drei's TransformControls, which is a 250 kB dependency
 * that draws arrows in the middle of the object — and the object is a kitchen
 * cabinet whose edges are the thing being dragged. Six small boxes on the
 * faces and a closest-point-on-an-axis calculation is the whole mechanism.
 */

/** Spec millimetres to scene metres. Same convention as the model. */
const MM = 0.001;
/** How big a handle is on screen, in metres, before distance scaling. */
const HANDLE = 0.055;
/** Nothing snaps finer than this. A 3 mm cabinet edit is a mis-drag. */
const STEP = 5;

export type HandleAxis = "width" | "height" | "depth" | "move";

export type DragChange = {
  axis: HandleAxis;
  /** The new value in millimetres, already snapped and clamped. */
  value: number;
};

/**
 * The point on an infinite line closest to a ray.
 *
 * This is what makes a drag feel right at any camera angle. Projecting the
 * pointer onto the screen-space direction of the axis works while the camera
 * looks straight on and falls apart the moment it does not: pulling the right
 * edge of a cabinet seen at forty degrees moved it half as fast as the pointer.
 * Solving for the closest approach between the pointer's ray and the axis
 * itself has no such angle in it.
 */
function closestOnAxis(
  ray: THREE.Ray,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): number {
  const w0 = new THREE.Vector3().subVectors(origin, ray.origin);
  const a = direction.dot(direction);
  const b = direction.dot(ray.direction);
  const c = ray.direction.dot(ray.direction);
  const d = direction.dot(w0);
  const e = ray.direction.dot(w0);

  const denominator = a * c - b * b;
  // The axis is edge-on to the camera, so there is no sensible answer. Holding
  // still is better than lurching.
  if (Math.abs(denominator) < 1e-9) return 0;

  return (b * e - c * d) / denominator;
}

const AXIS_DIRECTION: Record<HandleAxis, THREE.Vector3> = {
  width: new THREE.Vector3(1, 0, 0),
  height: new THREE.Vector3(0, 1, 0),
  // The spec's z runs backwards from the front face and three.js runs it
  // towards the camera, so a deeper cabinet is a smaller world z.
  depth: new THREE.Vector3(0, 0, -1),
  move: new THREE.Vector3(1, 0, 0),
};

export function CabinetHandles({
  cabinet,
  offset,
  onDrag,
  onDragState,
}: {
  cabinet: Cabinet;
  /** The group transform the model applies, so handles land on the cabinet. */
  offset: { x: number; z: number };
  onDrag: (change: DragChange) => void;
  /** Fired while a drag is running, so the orbit controls can stand down. */
  onDragState: (dragging: boolean) => void;
}) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  const [active, setActive] = useState<HandleAxis | null>(null);

  // Everything the drag needs, in a ref rather than in state: it is read
  // inside a pointermove listener sixty times a second and re-rendering on
  // each one would fight the thing being dragged.
  const drag = useRef<{
    axis: HandleAxis;
    startT: number;
    startValue: number;
  } | null>(null);

  const { position, size } = cabinet;
  /**
   * How far a handle stands outside the face it belongs to.
   *
   * Not decoration. A handle sitting exactly on the right face of a cabinet is
   * also sitting exactly on the left face of the cabinet next to it, and the
   * ray hits whichever is marginally nearer — so grabbing the right edge of the
   * sink unit kept selecting the hob unit instead. Outside the carcass, there
   * is nothing to compete with.
   */
  const OUT = 0.045;

  const left = (position.x + offset.x) * MM - OUT;
  const right = (position.x + size.width + offset.x) * MM + OUT;
  const centreX = (position.x + size.width / 2 + offset.x) * MM;
  const bottom = position.y * MM;
  const top = (position.y + size.height) * MM + OUT;
  const centreY = (position.y + size.height / 2) * MM;
  const centreZ = -(position.z + size.depth / 2 + offset.z) * MM;
  /**
   * Handles stand proud of the front face.
   *
   * The first version put the width handles at mid-depth, which is inside the
   * cabinet and behind its own doors — so the ray hit the door, or the door of
   * the cabinet next along, and the handle could not be grabbed at all. It is
   * a resize handle for the box; it belongs in front of the box.
   */
  const front = -(position.z + offset.z) * MM + 0.05;

  const scale = handleScale(camera, new THREE.Vector3(centreX, centreY, centreZ));



  useEffect(() => {
    if (!active) return;

    const raycaster = new THREE.Raycaster();

    const rayFrom = (event: PointerEvent): THREE.Ray => {
      const rect = domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray;
    };

    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (!state) return;

      const t = closestOnAxis(
        rayFrom(event),
        new THREE.Vector3(centreX, centreY, centreZ),
        AXIS_DIRECTION[state.axis],
      );

      // Metres of travel along the axis, back into millimetres.
      const moved = (t - state.startT) / MM;
      const raw = state.startValue + moved;
      const snapped = Math.round(raw / STEP) * STEP;

      onDrag({ axis: state.axis, value: snapped });
      invalidate();
    };

    const onUp = () => {
      drag.current = null;
      setActive(null);
      onDragState(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    active,
    camera,
    centreX,
    centreY,
    centreZ,
    domElement,
    invalidate,
    onDrag,
    onDragState,
  ]);

  const begin = (
    axis: HandleAxis,
    startValue: number,
    event: { ray: THREE.Ray; stopPropagation: () => void },
  ) => {
    event.stopPropagation();
    const startT = closestOnAxis(
      event.ray,
      new THREE.Vector3(centreX, centreY, centreZ),
      AXIS_DIRECTION[axis],
    );
    drag.current = { axis, startT, startValue };
    setActive(axis);
    onDragState(true);
  };

  return (
    <group>
      {/* Width, from either end. Dragging the left edge moves the left edge,
          which is what somebody pulling it expects — the panel's slider grows
          the cabinet to the right instead, and both are correct. */}
      <Handle
        position={[right, centreY, front]}
        scale={scale}
        active={active === "width"}
        onDown={(event) => begin("width", size.width, event)}
      />
      <Handle
        position={[left, centreY, front]}
        scale={scale}
        active={active === "width"}
        onDown={(event) => begin("width", -size.width, event)}
      />

      <Handle
        position={[centreX, top, front]}
        scale={scale}
        active={active === "height"}
        onDown={(event) => begin("height", size.height, event)}
      />

      <Handle
        position={[centreX, centreY, front]}
        scale={scale}
        active={active === "depth"}
        onDown={(event) => begin("depth", size.depth, event)}
      />

      {/* Move, at the foot, where a handle cannot be confused for a resize. */}
      <Handle
        position={[centreX, bottom + HANDLE * scale, front]}
        scale={scale}
        active={active === "move"}
        tone="move"
        onDown={(event) => begin("move", position.x, event)}
      />
    </group>
  );
}

function Handle({
  position,
  scale,
  active,
  tone,
  onDown,
}: {
  position: [number, number, number];
  scale: number;
  active: boolean;
  tone?: "move";
  onDown: (event: { ray: THREE.Ray; stopPropagation: () => void }) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const size = HANDLE * scale;

  return (
    <mesh
      position={position}
      onPointerDown={onDown}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      renderOrder={3}
    >
      <boxGeometry args={[size, size, size]} />
      <meshBasicMaterial
        color={active || hovered ? "#ffffff" : tone === "move" ? "#f4a63a" : "#4c8dff"}
        // Drawn over the cabinet rather than inside it. A handle half-buried in
        // the panel it resizes is a handle people miss.
        depthTest={false}
        transparent
        opacity={0.95}
      />
    </mesh>
  );
}

/**
 * Keeps a handle roughly the same size on screen however far away the camera
 * is. Without it, handles on a 6 m kitchen are specks and handles on a 450 mm
 * vanity swallow the thing they are attached to.
 *
 * Read at render rather than tracked in state. The camera is a mutable object
 * that moves without React knowing, so a value held in state would be stale
 * until something else re-rendered — and holding it in state meant writing to
 * it from an effect, which is the pattern the compiler is right to refuse.
 * Re-reading it whenever the design or the selection changes is close enough
 * for a handle, and correct for free.
 */
function handleScale(camera: THREE.Camera, at: THREE.Vector3): number {
  return Math.max(0.5, Math.min(3, camera.position.distanceTo(at) / 3));
}

// ---------------------------------------------------------------------------
// Dimension labels
// ---------------------------------------------------------------------------

/**
 * The numbers, floating beside what they measure.
 *
 * Drawn into a canvas and shown on a sprite, which always faces the camera —
 * so the labels stay readable from every angle without a font loader, a text
 * geometry, or a second package.
 */
export function DimensionLabel({
  text,
  position,
  scale = 1,
  tone = "brand",
}: {
  text: string;
  position: [number, number, number];
  scale?: number;
  tone?: "brand" | "muted";
}) {
  const texture = useMemo(() => makeLabel(text, tone), [text, tone]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  // The canvas is 256 × 64, so the sprite is kept at 4:1 or the text stretches.
  const height = 0.09 * scale;

  return (
    <sprite
      position={position}
      scale={[height * 4, height, 1]}
      renderOrder={4}
      // Readable, not clickable — see the note on the selection box.
      raycast={() => null}
    >
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

function makeLabel(text: string, tone: "brand" | "muted"): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = tone === "brand" ? "rgba(76,141,255,0.92)" : "rgba(20,20,24,0.82)";
  roundedRect(context, 4, 10, 248, 44, 12);
  context.fill();

  context.font = "600 30px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 33, 236);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
