"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  buildOpeningGeometry,
  frameColour,
  type Box,
} from "../../services/opening-geometry";
import type { OpeningSpec } from "../../types/openings";

/**
 * The opening, solid.
 *
 * Procedural, not a loaded model. A door whose width is a field the user is
 * dragging cannot be a GLB — every dimension, panel count and profile system
 * would need its own file, and the one that mattered would always be missing.
 * Boxes generated from the spec cost nothing to rebuild and are exactly as
 * accurate as the arithmetic behind them, which is the cut list's arithmetic.
 *
 * The orbit control is written here rather than pulled from drei: this needs
 * rotate, zoom and pan on a 250 kB budget that already carries three.js, and
 * OrbitControls plus the drei entry point is most of that budget again for
 * three interactions. The same Pointer Events pattern as the panorama viewer,
 * for the same reason — one path for a mouse, a finger and a stylus.
 */

type View = "perspective" | "front" | "side" | "top";

const VIEWS: { id: View; label: string }[] = [
  { id: "perspective", label: "3D" },
  { id: "front", label: "Front" },
  { id: "side", label: "Side" },
  { id: "top", label: "Top" },
];

export default function OpeningModel({ spec }: { spec: OpeningSpec }) {
  const [view, setView] = useState<View>("perspective");
  const geometry = useMemo(() => buildOpeningGeometry(spec), [spec]);
  const colour = useMemo(() => frameColour(spec.finish), [spec.finish]);

  // The longest side decides how far back the camera sits, so a 900 mm window
  // and a 6 m shopfront both arrive filling the frame.
  const reach = Math.max(geometry.size.width, geometry.size.height) * 1.6 + 0.6;

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: 40, near: 0.05, far: 100, position: [reach * 0.5, reach * 0.2, reach] }}
      >
        <color attach="background" args={["#eef1f3"]} />
        <hemisphereLight args={["#ffffff", "#9aa5ad", 2.2]} />
        <directionalLight position={[3, 5, 6]} intensity={1.5} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />

        <Rig view={view} reach={reach} />

        <group>
          {geometry.frame.map((box) => (
            <Part key={box.id} box={box} colour={colour} />
          ))}
          {geometry.sashes.map((box) => (
            <Part key={box.id} box={box} colour={colour} />
          ))}

          {geometry.glass.map((box) => (
            <mesh key={box.id} position={[box.x, box.y, box.z]}>
              <boxGeometry args={[box.width, box.height, box.depth]} />
              <meshPhysicalMaterial
                color={geometry.glassTint.colour}
                transparent
                opacity={geometry.glassTint.opacity}
                roughness={0.05}
                metalness={0}
                transmission={0.35}
              />
            </mesh>
          ))}

          {geometry.handles.map((box) => (
            <mesh key={box.id} position={[box.x, box.y, box.z]}>
              <boxGeometry args={[box.width, box.height, box.depth]} />
              <meshStandardMaterial color="#2b2f33" roughness={0.35} metalness={0.6} />
            </mesh>
          ))}

          {/* The floor, so the opening reads as standing rather than floating. */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -geometry.size.height / 2 - 0.002, 0]}
            receiveShadow
          >
            <planeGeometry args={[geometry.size.width * 3, geometry.size.width * 3]} />
            <meshStandardMaterial color="#dfe4e7" />
          </mesh>
        </group>
      </Canvas>

      <div className="pointer-events-auto absolute left-3 top-3 flex gap-1 rounded-full border bg-background/90 p-1 backdrop-blur">
        {VIEWS.map((one) => (
          <button
            key={one.id}
            type="button"
            onClick={() => setView(one.id)}
            aria-pressed={view === one.id}
            className={
              view === one.id
                ? "rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground"
                : "rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            }
          >
            {one.label}
          </button>
        ))}
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-[11px] tabular-nums text-muted-foreground backdrop-blur">
        {spec.width} × {spec.height} mm · daylight {geometry.daylight.width} ×{" "}
        {geometry.daylight.height}
      </p>
    </div>
  );
}

function Part({ box, colour }: { box: Box; colour: string }) {
  return (
    <mesh position={[box.x, box.y, box.z]} castShadow>
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshStandardMaterial color={colour} roughness={0.45} metalness={0.35} />
    </mesh>
  );
}

/**
 * Rotate, zoom and pan, and the four standard views.
 *
 * Spherical coordinates around a target: yaw and pitch from a drag, radius
 * from the wheel or a pinch, and the target itself shifted by a two-finger or
 * right-button drag. Choosing a named view sets the angles rather than
 * animating to them — an architect checking an elevation wants it now, and a
 * half-second swing adds nothing.
 */
function Rig({ view, reach }: { view: View; reach: number }) {
  const { camera, gl } = useThree();
  const state = useRef({
    yaw: Math.PI / 5,
    pitch: 0.25,
    radius: reach,
    target: new THREE.Vector3(),
  });

  useEffect(() => {
    const angles: Record<View, { yaw: number; pitch: number }> = {
      perspective: { yaw: Math.PI / 5, pitch: 0.25 },
      front: { yaw: 0, pitch: 0 },
      side: { yaw: Math.PI / 2, pitch: 0 },
      top: { yaw: 0, pitch: Math.PI / 2 - 0.01 },
    };
    const next = angles[view];
    state.current.yaw = next.yaw;
    state.current.pitch = next.pitch;
    state.current.radius = reach;
    state.current.target.set(0, 0, 0);
    apply();
    // `apply` is defined below and is stable for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, reach]);

  function apply() {
    const { yaw, pitch, radius, target } = state.current;
    camera.position.set(
      target.x + radius * Math.cos(pitch) * Math.sin(yaw),
      target.y + radius * Math.sin(pitch),
      target.z + radius * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.touchAction = "none";

    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "orbit" | "pan" | null = null;
    let last = { x: 0, y: 0 };
    let pinch = 0;

    function down(event: PointerEvent) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      last = { x: event.clientX, y: event.clientY };

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        mode = "pan";
      } else {
        // The middle button and shift are what CAD users already reach for.
        mode = event.button === 1 || event.shiftKey ? "pan" : "orbit";
      }
    }

    function move(event: PointerEvent) {
      if (!pointers.has(event.pointerId) || !mode) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && distance > 0) {
          state.current.radius = clamp(state.current.radius * (pinch / distance));
          pinch = distance;
          apply();
        }
        return;
      }

      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      last = { x: event.clientX, y: event.clientY };

      if (mode === "pan") {
        // Scaled by radius so panning covers the same amount of drawing
        // whether zoomed in or out.
        const scale = state.current.radius * 0.0015;
        state.current.target.x -= dx * scale;
        state.current.target.y += dy * scale;
      } else {
        state.current.yaw -= dx * 0.006;
        // Just short of the poles, where lookAt has no basis to build.
        state.current.pitch = Math.max(
          -Math.PI / 2 + 0.02,
          Math.min(Math.PI / 2 - 0.02, state.current.pitch + dy * 0.006),
        );
      }
      apply();
    }

    function up(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) mode = null;
      if (pointers.size < 2) pinch = 0;
    }

    function wheel(event: WheelEvent) {
      event.preventDefault();
      state.current.radius = clamp(state.current.radius * (1 + event.deltaY * 0.0012));
      apply();
    }

    function clamp(value: number) {
      return Math.max(reach * 0.15, Math.min(reach * 4, value));
    }

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", preventDefault);

    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", preventDefault);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, reach]);

  return null;
}

function preventDefault(event: Event) {
  event.preventDefault();
}
