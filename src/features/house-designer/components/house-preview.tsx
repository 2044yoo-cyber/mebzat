"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useStore, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";

import { RoomShell } from "@/features/berchuma-studio/components/viewer/room-shell";
import type { Room } from "@/features/berchuma-studio/types/room";
import { cn } from "@/lib/utils";

const MM = 0.001;

type View = "3d" | "top" | "front";

export function HousePreview({ room, className }: { room: Room; className?: string }) {
  const bounds = useMemo(() => roomBounds(room), [room]);
  const [view, setView] = useState<View>("3d");

  return (
    <div className={cn("relative min-h-[320px] w-full min-w-0 overflow-hidden rounded-xl border bg-muted/25", className)}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 38, near: 0.02, far: 200 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", maxWidth: "100%", minWidth: 0, touchAction: "none" }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[8, 12, 9]} intensity={1.35} />
        <directionalLight position={[-7, 6, -5]} intensity={0.4} />
        <RoomShell
          room={room}
          offset={[-bounds.centreX * MM, 0, bounds.centreY * MM]}
          showFloor={false}
        />
        <HouseFloor room={room} bounds={bounds} />
        <CameraRig bounds={bounds} view={view} />
      </Canvas>
      <ViewButtons view={view} onChange={setView} />
    </div>
  );
}

function HouseFloor({ room, bounds }: { room: Room; bounds: ReturnType<typeof roomBounds> }) {
  const shape = useMemo(() => {
    const next = new THREE.Shape();
    room.corners.forEach((point, index) => {
      const x = (point.x - bounds.centreX) * MM;
      const y = (point.y - bounds.centreY) * MM;
      if (index === 0) next.moveTo(x, y);
      else next.lineTo(x, y);
    });
    next.closePath();
    return next;
  }, [bounds.centreX, bounds.centreY, room.corners]);

  return (
    <mesh position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#d8d2c8" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function CameraRig({ bounds, view }: { bounds: ReturnType<typeof roomBounds>; view: View }) {
  const store = useStore();
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);

  useEffect(() => {
    const { camera } = store.getState();
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width === 0) return;
    const span = Math.max(bounds.width, bounds.depth, bounds.height) * MM;
    const distance = Math.max(4, span * 1.65);
    const target = new THREE.Vector3(0, bounds.height * MM * 0.42, 0);
    camera.aspect = size.width / size.height;
    if (view === "top") camera.position.set(0, distance * 1.2, 0.001);
    else if (view === "front") camera.position.set(0, bounds.height * MM * 0.45, distance);
    else camera.position.set(distance * 0.72, distance * 0.6, distance);
    camera.near = Math.max(0.01, distance / 100);
    camera.far = distance * 15;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [bounds, invalidate, size.height, size.width, store, view]);

  useEffect(() => {
    const { camera } = store.getState();
    const target = new THREE.Vector3(0, bounds.height * MM * 0.42, 0);
    const orbit = new OrbitControls(camera, element);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.target.copy(target);
    const changed = () => invalidate();
    orbit.addEventListener("change", changed);
    orbit.update();
    return () => {
      orbit.removeEventListener("change", changed);
      orbit.dispose();
    };
  }, [bounds.height, element, invalidate, store, view]);

  return null;
}

function ViewButtons({ view: currentView, onChange }: { view: View; onChange: (view: View) => void }) {
  const views: { id: View; label: string }[] = [
    { id: "3d", label: "3D" },
    { id: "top", label: "Top" },
    { id: "front", label: "Front" },
  ];

  return (
    <div className="pointer-events-none absolute left-3 top-3 flex rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur">
      {views.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={item.id === currentView}
          className={cn(
            "pointer-events-auto rounded-full px-3 py-1 text-xs",
            item.id === currentView ? "bg-brand text-brand-foreground" : "text-muted-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function roomBounds(room: Room) {
  const xs = room.corners.map((point) => point.x);
  const ys = room.corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    centreX: (minX + maxX) / 2,
    centreY: (minY + maxY) / 2,
    width: maxX - minX,
    depth: maxY - minY,
    height: room.ceilingHeight,
  };
}
