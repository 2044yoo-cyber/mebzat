"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

import {
  clampFov,
  clampPitch,
  dragSpeed,
  lookTarget,
  normaliseDegrees,
  projectHotspot,
  sphereExtents,
} from "@/lib/tour/panorama-math";

/**
 * An equirectangular panorama, and the camera inside it.
 *
 * Three.js is already in the project for the studio viewer, so this adds no
 * dependency. A panorama is a sphere turned inside out with the image on its
 * inner face and the camera at the centre — there is no scene graph to speak
 * of, which is why a library like Pannellum would be a second WebGL runtime
 * on a phone that already carries Three and MapLibre.
 *
 * Pointer Events throughout rather than separate mouse and touch handlers:
 * one code path for a mouse, a finger and a stylus, and setPointerCapture
 * means a drag that leaves the canvas still ends correctly instead of the
 * camera sticking mid-turn.
 */

export type PanoramaHotspot = {
  id: string;
  yaw: number;
  pitch: number;
  title: string;
  kind: string;
};

/**
 * Whether this browser can give us a WebGL context at all. Probed once and
 * cached: it cannot change for the life of the page, so subscribing to it is
 * a no-op and the server answers "yes" — the server has no canvas, and
 * assuming support there means the markup it sends is the loading state,
 * which is what a supported browser hydrates into anyway.
 */
let webglProbe: boolean | null = null;

function hasWebgl() {
  if (webglProbe !== null) return webglProbe;
  try {
    const canvas = document.createElement("canvas");
    webglProbe = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

function neverChanges() {
  return () => {};
}

function assumeSupported() {
  return true;
}

export function PanoramaViewer({
  src,
  initialYaw = 0,
  initialPitch = 0,
  initialZoom = 75,
  width,
  height,
  hotspots = [],
  onHotspot,
  onAim,
  className,
}: {
  src: string;
  /**
   * The panorama's own pixel dimensions, used to decide how much of the sphere
   * it covers. Without them a non-2:1 image is stretched over the full sphere;
   * with them it keeps its proportions and leaves a gap where it has no
   * picture. Absent on scenes saved before this was recorded, which fall back
   * to the full sphere they were already being shown as.
   */
  width?: number | null;
  height?: number | null;
  initialYaw?: number;
  initialPitch?: number;
  initialZoom?: number;
  hotspots?: PanoramaHotspot[];
  onHotspot?: (id: string) => void;
  /**
   * Where the view is pointed, in degrees, reported when a turn or a zoom
   * ends rather than while it is happening. The builder places a hotspot at
   * whatever the viewer is facing, and a callback fired on every frame would
   * re-render the form sixty times a second for a number nobody reads until
   * they press the button.
   */
  onAim?: (aim: { yaw: number; pitch: number }) => void;
  className?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(neverChanges, hasWebgl, assumeSupported);

  // The hotspot markers are ordinary DOM — a real button is focusable, reads
  // to a screen reader and takes a 44px tap target, none of which a sprite in
  // the canvas would give for free. They are *positioned* imperatively from
  // the animation loop, though: putting their coordinates in state would mean
  // a React render on every frame, which on a phone costs more than the
  // panorama itself.
  const markers = useRef(new Map<string, HTMLButtonElement>());

  const holdMarker = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) markers.current.set(id, element);
    else markers.current.delete(id);
  }, []);

  // Read by the animation loop rather than closed over, so that a caller
  // passing an inline array does not tear the WebGL scene down and rebuild it
  // on every render of the parent.
  const current = useRef(hotspots);
  useEffect(() => {
    current.current = hotspots;
  }, [hotspots]);

  // Same reason: an inline arrow function as onAim would otherwise rebuild the
  // WebGL scene on every render of the parent.
  const reportAim = useRef(onAim);
  useEffect(() => {
    reportAim.current = onAim;
  }, [onAim]);

  useEffect(() => {
    const node = mount.current;
    if (!node || !supported) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(initialZoom, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    node.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";

    // Only as much of the sphere as the image actually covers. Centred on both
    // axes, so a panorama short of a full turn opens facing the middle of what
    // it does have rather than at the edge of the gap.
    const { haov, vaov } = sphereExtents(width, height);
    const geometry = new THREE.SphereGeometry(
      500,
      60,
      40,
      -haov / 2,
      haov,
      (Math.PI - vaov) / 2,
      vaov,
    );

    // Scale -1 on x turns it inside out, which is cheaper than rendering back
    // faces and keeps the texture the right way round. Centring the phi range
    // above is what makes this safe for a partial sphere: mirroring a centred
    // range leaves it centred.
    geometry.scale(-1, 1, 1);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    let mesh: THREE.Mesh | null = null;
    let disposed = false;

    loader.load(
      src,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
        scene.add(mesh);
        setLoading(false);
      },
      undefined,
      () => {
        if (disposed) return;
        setFailed(true);
        setLoading(false);
      },
    );

    let yaw = (initialYaw * Math.PI) / 180;
    let pitch = (initialPitch * Math.PI) / 180;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    // Pinch is two pointers, so they are tracked rather than counted.
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let fovStart = camera.fov;

    const canvas = renderer.domElement;

    let warnedAboutSize = false;

    function resize() {
      const { clientWidth, clientHeight } = node!;
      if (clientWidth === 0 || clientHeight === 0) {
        // A container with no height renders a black rectangle and reports
        // nothing — the texture loads, the loop runs, and there is simply
        // nowhere to draw. Said out loud once, because the cause is never
        // guessable from the symptom.
        if (!warnedAboutSize) {
          warnedAboutSize = true;
          console.error(
            "[panorama] the viewer has no size (" +
              `${clientWidth}x${clientHeight}). Give it a height — a class ` +
              "like size-full or h-[60vh]. Note that the root sets " +
              "position:relative inline, so an `absolute inset-0` class on it " +
              "will not take effect.",
          );
        }
        return;
      }
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();

    function down(event: PointerEvent) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 1) {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
      } else if (pointers.size === 2) {
        dragging = false;
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        fovStart = camera.fov;
      }
    }

    function move(event: PointerEvent) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0 && distance > 0) {
          camera.fov = clampFov(fovStart * (pinchStart / distance));
          camera.updateProjectionMatrix();
        }
        return;
      }

      if (!dragging) return;
      const speed = dragSpeed(camera.fov);
      yaw -= (event.clientX - lastX) * speed;
      pitch = clampPitch(pitch + (event.clientY - lastY) * speed);
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function announce() {
      reportAim.current?.({
        yaw: normaliseDegrees((yaw * 180) / Math.PI),
        pitch: (pitch * 180) / Math.PI,
      });
    }

    function up(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      if (pointers.size === 0) {
        dragging = false;
        announce();
      }
    }

    function wheel(event: WheelEvent) {
      event.preventDefault();
      camera.fov = clampFov(camera.fov + event.deltaY * 0.05);
      camera.updateProjectionMatrix();
      announce();
    }

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });

    let frame = 0;
    const target = new THREE.Vector3();
    const projected = new THREE.Vector3();

    function place() {
      if (markers.current.size === 0) return;
      const { clientWidth: w, clientHeight: h } = node!;

      for (const hotspot of current.current) {
        const element = markers.current.get(hotspot.id);
        if (!element) continue;

        const at = projectHotspot(camera, hotspot.yaw, hotspot.pitch, w, h, projected);
        if (!at.visible) {
          element.style.visibility = "hidden";
          continue;
        }
        element.style.visibility = "visible";
        element.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`;
      }
    }

    function render() {
      frame = requestAnimationFrame(render);

      lookTarget(yaw, pitch, target);
      camera.lookAt(target);
      renderer.render(scene, camera);
      place();
    }
    render();
    announce();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      geometry.dispose();
      if (mesh) {
        (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (mesh.material as THREE.MeshBasicMaterial).dispose();
      }
      renderer.dispose();
      node.removeChild(canvas);
    };
  }, [src, initialYaw, initialPitch, initialZoom, width, height, supported]);

  const broken = failed || !supported;

  return (
    <div className={className} style={{ position: "relative", overflow: "hidden" }}>
      <div ref={mount} style={{ position: "absolute", inset: 0 }} />

      {loading && !broken && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-950 text-sm text-neutral-400">
          Loading the view…
        </div>
      )}

      {broken && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-950 p-6 text-center text-sm text-neutral-400">
          {supported
            ? "This panorama could not be displayed."
            : "This browser cannot display 360° views."}
        </div>
      )}

      {!loading &&
        !broken &&
        hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            ref={(element) => holdMarker(hotspot.id, element)}
            type="button"
            onClick={() => onHotspot?.(hotspot.id)}
            // Positioned by the animation loop; hidden until it has run once
            // so a marker never flashes at the top-left corner.
            style={{ left: 0, top: 0, visibility: "hidden" }}
            className="absolute z-10 flex h-11 items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-black/75"
          >
            {hotspot.kind === "scene" && <span aria-hidden>→</span>}
            {hotspot.title}
          </button>
        ))}
    </div>
  );
}
