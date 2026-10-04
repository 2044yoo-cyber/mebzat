"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { Mesh as IfcMesh } from "@/lib/takeoff/ifc/geometry";
import { cn } from "@/lib/utils";

/**
 * The model, in three dimensions.
 *
 * Real triangles from the IFC's swept solids — not a diagram. Orbit, zoom, pan,
 * click an element to select it, and elements selected elsewhere light up here.
 *
 * ## Millimetres, scaled once
 *
 * Everything upstream is in millimetres because buildings are dimensioned in
 * millimetres and mixing units is how they go wrong. A camera at z = 40,000
 * with a near plane of 0.1 has a depth buffer that cannot tell a wall from the
 * one behind it, so the whole scene is scaled to metres on the way in — once,
 * here, rather than by every caller remembering to.
 *
 * ## Why the controls are hand-written
 *
 * `@react-three/drei` would supply OrbitControls, and it is not a dependency of
 * this project. Ninety lines of pointer maths is a smaller cost than another
 * package in the tree, and it means the orbit behaves the same as the Berchuma
 * viewer rather than subtly differently.
 */

const MM_TO_M = 0.001;

export function ModelView({
  meshes,
  selected,
  highlighted,
  onSelect,
  className,
}: {
  meshes: IfcMesh[];
  selected: string | null;
  highlighted: Set<string>;
  onSelect: (elementId: string | null) => void;
  className?: string;
}) {
  const bounds = useMemo(() => sceneBounds(meshes), [meshes]);

  if (meshes.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center rounded-xl border border-dashed p-8 text-center",
          className,
        )}
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          Nothing in this model could be drawn. Its quantities are still read and
          billed — open the Elements tab.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-hidden rounded-xl border bg-card", className)}>
      <Canvas
        // `demand` rather than a continuous loop: a static building does not
        // need sixty frames a second, and a laptop fan spinning up on a
        // quantity surveyor's estimate is a bug even though nothing is broken.
        frameloop="demand"
        camera={{ fov: 45, near: 0.1, far: 5000 }}
        onPointerMissed={() => onSelect(null)}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0b0d10"]} />
        <hemisphereLight intensity={1.1} groundColor="#20242b" />
        <directionalLight position={[1, 2, 1.5]} intensity={1.6} />
        <directionalLight position={[-1.5, 1, -1]} intensity={0.5} />

        <Frame bounds={bounds} />
        <Orbit bounds={bounds} />

        <group
          // Centre the building on the origin so orbiting turns around it
          // rather than around a corner of the site.
          position={[
            -bounds.centre[0] * MM_TO_M,
            -bounds.centre[2] * MM_TO_M,
            bounds.centre[1] * MM_TO_M,
          ]}
        >
          {meshes.map((mesh) => (
            <Element
              key={mesh.elementId}
              mesh={mesh}
              state={
                mesh.elementId === selected
                  ? "selected"
                  : highlighted.has(mesh.elementId)
                    ? "lit"
                    : "plain"
              }
              onSelect={onSelect}
            />
          ))}
        </group>

        <gridHelper
          args={[Math.max(bounds.size, 10) * MM_TO_M * 2, 20, "#2a2f38", "#1a1e24"]}
          position={[0, -bounds.size * MM_TO_M * 0.001, 0]}
        />
      </Canvas>
    </div>
  );
}

function Element({
  mesh,
  state,
  onSelect,
}: {
  mesh: IfcMesh;
  state: "plain" | "lit" | "selected";
  onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // IFC is Z-up and three.js is Y-up, so the axes are swapped once here.
    // Doing it in the shader or with a group rotation makes every subsequent
    // coordinate — picking, bounds, section planes — need the same correction.
    const positions = new Float32Array(mesh.positions.length);
    for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
      positions[i] = mesh.positions[i]! * MM_TO_M;
      positions[i + 1] = mesh.positions[i + 2]! * MM_TO_M;
      positions[i + 2] = -mesh.positions[i + 1]! * MM_TO_M;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(mesh.indices);
    geo.computeVertexNormals();
    return geo;
  }, [mesh]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const colour =
    state === "selected" ? "#e8a33d" : state === "lit" ? "#c8863a" : "#9aa4b2";

  return (
    <mesh
      geometry={geometry}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(mesh.elementId);
      }}
    >
      <meshStandardMaterial
        color={colour}
        roughness={0.85}
        metalness={0.05}
        flatShading
        // Both sides, because an IFC profile's winding is not reliable and a
        // wall that vanishes when you walk round it looks like a broken import.
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

type Bounds = { centre: [number, number, number]; size: number };

function sceneBounds(meshes: IfcMesh[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const mesh of meshes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, mesh.min[axis]!);
      max[axis] = Math.max(max[axis]!, mesh.max[axis]!);
    }
  }

  if (!Number.isFinite(min[0])) return { centre: [0, 0, 0], size: 1000 };

  return {
    centre: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    size: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1000),
  };
}

/** Puts the camera where the whole building is visible, once. */
function Frame({ bounds }: { bounds: Bounds }) {
  const { camera, invalidate } = useThree();
  const framed = useRef<number | null>(null);

  useEffect(() => {
    // Re-frames when a different model is loaded, not on every render.
    if (framed.current === bounds.size) return;
    framed.current = bounds.size;

    const distance = bounds.size * MM_TO_M * 1.6;
    camera.position.set(distance, distance * 0.7, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [bounds, camera, invalidate]);

  return null;
}

/**
 * Orbit, zoom and pan.
 *
 * Spherical coordinates around the origin, which the scene is centred on.
 * Polar angle is clamped short of the poles because a camera looking straight
 * down its own up-vector has no defined orientation and the view flips.
 */
function Orbit({ bounds }: { bounds: Bounds }) {
  const { camera, gl, invalidate } = useThree();
  const [target] = useState(() => new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    const element = gl.domElement;
    const spherical = new THREE.Spherical();
    let dragging: "orbit" | "pan" | null = null;
    let lastX = 0;
    let lastY = 0;

    const sync = () => {
      const offset = camera.position.clone().sub(target);
      spherical.setFromVector3(offset);
    };

    const apply = () => {
      spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));
      const offset = new THREE.Vector3().setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      invalidate();
    };

    const down = (event: PointerEvent) => {
      dragging = event.button === 2 || event.shiftKey ? "pan" : "orbit";
      lastX = event.clientX;
      lastY = event.clientY;
      sync();
      element.setPointerCapture(event.pointerId);
    };

    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      if (dragging === "orbit") {
        spherical.theta -= dx * 0.006;
        spherical.phi -= dy * 0.006;
        apply();
        return;
      }

      // Pan across the camera's own plane, scaled by distance so the building
      // moves with the cursor at any zoom.
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.matrix.extractBasis(right, up, new THREE.Vector3());
      const scale = spherical.radius * 0.0015;
      target.addScaledVector(right, -dx * scale);
      target.addScaledVector(up, dy * scale);
      apply();
    };

    const up = (event: PointerEvent) => {
      dragging = null;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      sync();
      spherical.radius = Math.max(
        bounds.size * MM_TO_M * 0.05,
        Math.min(bounds.size * MM_TO_M * 8, spherical.radius * (1 + event.deltaY * 0.001)),
      );
      apply();
    };

    const context = (event: Event) => event.preventDefault();

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("contextmenu", context);

    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("contextmenu", context);
    };
  }, [camera, gl, invalidate, target, bounds]);

  return null;
}
