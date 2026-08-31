"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useStore, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";

import { CabinetHandles, DimensionLabel, type DragChange } from "./handles";
import { buildParts } from "../../services/geometry";
import type { Part } from "../../types/parts";
import type { Cabinet, DesignSpec } from "../../types/spec";

/**
 * The design in three dimensions.
 *
 * Every box on screen is a part from `buildParts` — the same list the cut list
 * prints and the same list the price is a sum over. That is the whole argument
 * for the spec-first architecture: there is no separate "visual model" that
 * could drift, so a wardrobe that looks right on screen is a wardrobe somebody
 * can cut, and one that looks wrong is telling you the quote is wrong too.
 *
 * This module is loaded only when the viewer is opened. Three.js and the
 * renderer are the largest thing Medosha ships, and most people on a phone
 * will never open it, so it is behind a dynamic import and costs them nothing.
 *
 * Millimetres go in, metres come out: three.js behaves badly with a camera
 * 4000 units from the origin and a near plane of 0.1, and a 2.4 m wardrobe
 * drawn 2400 units wide gets shadow acne and z-fighting on the door gaps.
 */

/** Spec millimetres to scene metres. */
const MM = 0.001;

export default function Model({
  spec,
  hideFronts = false,
  onReady,
  selectedCabinetId = null,
  onSelectCabinet,
  onResize,
}: {
  spec: DesignSpec;
  /** Takes the doors and drawer fronts off, to show what is inside. */
  hideFronts?: boolean;
  /** Fired once the first frame is on screen, so the skeleton can go. */
  onReady?: () => void;
  /** Drawn lit, with its dimensions beside it. */
  selectedCabinetId?: string | null;
  /** Clicking a panel selects the cabinet it belongs to, not the panel. */
  onSelectCabinet?: (id: string | null) => void;
  /** Dragging an edge. Absent means the model is a picture, not an editor. */
  onResize?: (id: string, change: DragChange) => void;
}) {
  const parts = useMemo(() => {
    const all = buildParts(spec).parts;
    if (!hideFronts) return all;
    return all.filter(
      (part) => part.role !== "door" && part.role !== "drawer_front",
    );
  }, [spec, hideFronts]);

  const { width, height, depth } = spec.envelope;
  const reach = Math.max(width, height, depth) * MM;
  const selected =
    spec.cabinets.find((cabinet) => cabinet.id === selectedCabinetId) ?? null;

  // Orbiting and dragging an edge are both "the pointer moved", so one of them
  // has to stand down. Without this, pulling a cabinet wider also swung the
  // camera and the cabinet appeared to resist.
  const [dragging, setDragging] = useState(false);

  return (
    <Canvas
      // Only renders when something asks it to. A static wardrobe on a phone
      // should not be repainting sixty times a second for as long as the tab
      // is open — it is a drawing, not a game.
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.05, far: 100 }}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        onReady?.();
      }}
      style={{ touchAction: "none" }}
      // Clicking the floor or the sky lets go of the selection. Without this
      // the only way to deselect was to select something else, which makes the
      // highlight feel like something you are stuck with.
      onPointerMissed={onSelectCabinet ? () => onSelectCabinet(null) : undefined}
    >
      <Lighting height={height * MM} reach={reach} />

      <group
        // Centred left to right and front to back, standing on y = 0.
        position={[-(width * MM) / 2, 0, (depth * MM) / 2]}
      >
        {parts.map((part) =>
          part.placements.map((placement, index) => (
            <PartMesh
              key={`${part.id}-${index}`}
              part={part}
              placement={placement}
              spec={spec}
              selected={
                selectedCabinetId !== null && part.cabinetId === selectedCabinetId
              }
              // A design with nothing selected is not clickable at all, so a
              // published design stays a picture rather than becoming an editor
              // that does nothing.
              onSelect={
                !onSelectCabinet
                  ? undefined
                  : part.cabinetId
                    ? () => onSelectCabinet(part.cabinetId!)
                    : // A worktop belongs to a run rather than to one cabinet,
                      // and it covers every base unit under it. Clicking it
                      // used to do nothing at all, which reads as the viewer
                      // being broken — so it selects the cabinet beneath the
                      // point that was actually clicked.
                      (point) => {
                        const local = point.x / MM + width / 2;
                        const under = spec.cabinets.find(
                          (cabinet) =>
                            cabinet.position.x <= local &&
                            cabinet.position.x + cabinet.size.width >= local &&
                            cabinet.kind !== "wall",
                        );
                        onSelectCabinet(under?.id ?? null);
                      }
              }
            />
          )),
        )}

        {selected ? (
          <>
            <SelectionBox cabinet={selected} />
            {onResize ? (
              <CabinetHandles
                cabinet={selected}
                offset={{ x: 0, z: 0 }}
                onDragState={setDragging}
                onDrag={(change) => onResize(selected.id, change)}
              />
            ) : null}
            <SelectionLabels cabinet={selected} reach={reach} />
          </>
        ) : null}
      </group>

      {/* The overall size, under the design, always. It is the number
          somebody checks against the wall they are fitting this into. */}
      <DimensionLabel
        text={`W ${width} × H ${height} × D ${depth}`}
        position={[0, -0.12, (depth * MM) / 2 + 0.15]}
        scale={Math.max(1, reach * 0.55)}
        tone="muted"
      />

      <Ground reach={reach} />
      <Frame
        width={width * MM}
        height={height * MM}
        depth={depth * MM}
      />
      <Controls targetY={(height * MM) / 2} reach={reach} enabled={!dragging} />
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// One part
// ---------------------------------------------------------------------------

function PartMesh({
  part,
  placement,
  spec,
  selected,
  onSelect,
}: {
  part: Part;
  placement: { x: number; y: number; z: number };
  spec: DesignSpec;
  selected: boolean;
  /** Given the point in scene space, so a run-wide part can work out which. */
  onSelect?: (point: THREE.Vector3) => void;
}) {
  const size: [number, number, number] = [
    Math.max(part.size.x * MM, 0.001),
    Math.max(part.size.y * MM, 0.001),
    Math.max(part.size.z * MM, 0.001),
  ];

  // The spec's z runs backwards from the front face; three.js runs it towards
  // the camera. Negating it is what puts the doors in front of the carcass
  // rather than behind the back panel.
  const position: [number, number, number] = [
    (placement.x + part.size.x / 2) * MM,
    (placement.y + part.size.y / 2) * MM,
    -(placement.z + part.size.z / 2) * MM,
  ];

  return (
    <mesh
      position={position}
      onPointerDown={
        onSelect
          ? (event) => {
              // Only the nearest panel under the pointer. Without this the ray
              // passes through the door and selects the back of the cabinet
              // behind it as well, and a click on a kitchen selects four
              // cabinets at once.
              event.stopPropagation();
              onSelect(event.point);
            }
          : undefined
      }
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={colourFor(part, spec)}
        roughness={roughnessFor(spec)}
        metalness={0.02}
        // Lit rather than tinted. Tinting the selection changed what the
        // material looked like, which is the one thing somebody choosing a
        // finish must be able to trust.
        emissive={selected ? SELECTION_GLOW : BLACK}
        emissiveIntensity={selected ? 0.22 : 0}
      />
    </mesh>
  );
}

const SELECTION_GLOW = new THREE.Color("#4c8dff");
const BLACK = new THREE.Color("#000000");

/**
 * A wireframe box around the selected cabinet.
 *
 * Drawn from the cabinet rather than from its parts, so it wraps the carcass
 * even where the doors stand proud of it, and so an empty-looking selection
 * still reads as a selection.
 */
function SelectionBox({ cabinet }: { cabinet: Cabinet }) {
  const { position, size } = cabinet;

  return (
    <lineSegments
      position={[
        (position.x + size.width / 2) * MM,
        (position.y + size.height / 2) * MM,
        -(position.z + size.depth / 2) * MM,
      ]}
      renderOrder={2}
      // Not pickable, and this one cost an afternoon. Three.js raycasts lines
      // against a threshold measured in world units, and it defaults to 1 —
      // which in a scene where a kitchen is 3.6 units wide is a metre-thick
      // slab of nothing wrapped around the selected cabinet. It swallowed every
      // click on the cabinet and every grab of a handle, silently, because a
      // hit with no handler is not a miss either.
      raycast={() => null}
    >
      <edgesGeometry
        args={[
          new THREE.BoxGeometry(
            size.width * MM,
            size.height * MM,
            size.depth * MM,
          ),
        ]}
      />
      <lineBasicMaterial color="#4c8dff" depthTest={false} transparent />
    </lineSegments>
  );
}

/**
 * What a part is made of, as a colour.
 *
 * Board-driven rather than role-driven: the back panel is a different product
 * from the carcass and it looks like one, and the plinth is set back in shadow
 * so it reads darker even though it is the same board. Fronts are lifted
 * slightly, which is how a real unit looks under a ceiling light and, more
 * usefully, is what makes the door gaps legible.
 */
function colourFor(part: Part, spec: DesignSpec): string {
  const base = new THREE.Color(spec.finish.hex);

  if (part.board.id !== spec.carcass.board.id) {
    // A back or a drawer base: whatever it is, it is not the show face.
    return base.clone().multiplyScalar(0.55).getStyle();
  }

  switch (part.role) {
    case "door":
    case "drawer_front":
      return base.clone().multiplyScalar(1.08).getStyle();
    case "plinth":
      return base.clone().multiplyScalar(0.6).getStyle();
    // Legs are hardware, not carcass. Drawn in their own colour rather than a
    // shade of the body, because a Zekolo leg is a black steel or dark timber
    // foot and tinting it with the wardrobe's white would make it disappear
    // into the floor — which is how "the legs are missing" looks even when
    // they are there.
    case "leg":
      return "#2b2b2f";
    // A hanging rail is chromed tube. Same reasoning as the leg: tinting it
    // with the wardrobe's white puts a white bar against a white back panel,
    // which reads as nothing at all.
    case "rail":
      return "#b9bfc6";
    case "drawer_side":
    case "drawer_back":
      return base.clone().multiplyScalar(0.82).getStyle();
    default:
      return base.getStyle();
  }
}

/** Melamine is not gloss lacquer, and gloss lacquer is not matt foil. */
function roughnessFor(spec: DesignSpec): number {
  switch (spec.finish.sheen) {
    case "gloss":
      return 0.18;
    case "satin":
      return 0.45;
    default:
      return 0.72;
  }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/**
 * Three lights, no environment map.
 *
 * The usual way to light a product shot is an HDR environment, and every one
 * of them is fetched from a CDN. Medosha runs behind a strict content policy
 * and is used on connections where a 2 MB texture is a real cost, so this is
 * lit the old way: a key, a fill and a rim, positioned off the unit's own size
 * so a 3.6 m kitchen is lit like a 1.2 m vanity.
 */
function Lighting({ height, reach }: { height: number; reach: number }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[reach * 1.2, height * 2.2, reach * 1.6]}
        intensity={1.5}
      />
      <directionalLight
        position={[-reach * 1.4, height * 1.1, reach * 0.8]}
        intensity={0.45}
      />
      {/* Behind and above, to separate the carcass from the background. */}
      <directionalLight
        position={[0, height * 1.6, -reach * 2]}
        intensity={0.3}
      />
    </>
  );
}

/**
 * A soft patch under the unit.
 *
 * Not a shadow map. Turning on shadow casting for fifty boxes costs a depth
 * pass per light and is visibly slow on the phones most of Medosha runs on,
 * and it buys one thing: the sense that the unit is standing on something.
 * A blurred dark ellipse buys the same thing for nothing.
 */
function Ground({ reach }: { reach: number }) {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0.3)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.11)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
  }, []);

  // Disposed on unmount; a texture per remount is a leak that only shows up
  // after somebody has opened the viewer thirty times.
  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
      {/* Square and generous. A patch shaped to the unit's own footprint read
          as a hard trapezoid in perspective — a thing on the floor rather than
          a shadow on it. */}
      <planeGeometry args={[reach * 2.4, reach * 2.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * Puts the whole unit in frame, and then leaves the camera alone.
 *
 * Framing from a fixed multiple of the largest dimension is the obvious thing
 * and it is wrong: it takes no account of the canvas aspect, so the first
 * attempt cropped the top off a 2.4 m wardrobe in a 16:10 box. This measures
 * the envelope's bounding sphere against whichever field of view is narrower —
 * vertical on a wide canvas, horizontal on a tall one — which is the only
 * version that holds for a 3.6 m kitchen run and a 450 mm vanity alike.
 *
 * It reframes when the unit no longer fits, not whenever the spec changes.
 * Reframing on every change would yank the camera back on each frame of a
 * width drag; never reframing would leave a design the user has doubled in
 * size hanging off the edge of the screen. "Has it stopped fitting?" is the
 * question that actually matters, so that is the one asked.
 */
function Frame({
  width,
  height,
  depth,
}: {
  width: number;
  height: number;
  depth: number;
}) {
  // Read out of the store inside the effect rather than through a selector.
  // The camera is a mutable three.js object and framing it means writing to
  // it; a value pulled through a hook is one the compiler is entitled to
  // assume nobody mutates, and it is right to say so.
  const store = useStore();
  const size = useThree((state) => state.size);

  useEffect(() => {
    const { camera, invalidate } = store.getState();
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const target = new THREE.Vector3(0, height / 2, 0);
    const radius = 0.5 * Math.hypot(width, height, depth);

    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    // 1.12 leaves a little air around the unit rather than pressing it against
    // the edges of the frame.
    const ideal = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.12;

    const current = camera.position.distanceTo(target);
    // Too close to contain it, or far enough back that it has shrunk into the
    // middle of the frame. 1.5 rather than something looser because switching
    // a 2.4 m wardrobe for a 1.8 × 0.45 m TV unit lands at 1.8× and looked
    // like a toy on a large empty floor.
    //
    // This only runs when the design or the canvas changes, never when the
    // camera moves, so zooming in on a hinge is never undone from under you.
    const fits = current >= ideal * 0.98 && current <= ideal * 1.5;
    if (fits) return;

    // Three-quarter view: enough of the side to read the depth, not so much
    // that the front stops being the subject.
    const direction = new THREE.Vector3(0.55, 0.4, 1).normalize();
    camera.position.copy(direction.multiplyScalar(ideal)).add(target);
    camera.near = Math.max(0.01, ideal / 100);
    camera.far = ideal * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    invalidate();
  }, [store, width, height, depth, size.width, size.height]);

  return null;
}

/**
 * Orbit, pan and zoom.
 *
 * Built imperatively rather than through `extend`, which would need a JSX
 * intrinsic declared and a module augmentation to type it. This is the same
 * object with none of that, and it is where `frameloop="demand"` gets its
 * invalidation — without the listener below the scene freezes the instant you
 * try to turn it.
 *
 * The damping loop runs only while the camera is actually moving. Damping
 * needs `update()` on a frame tick, and the obvious way to provide one is a
 * permanent `requestAnimationFrame` — which is precisely the thing
 * `frameloop="demand"` exists to avoid, so it starts on the first drag and
 * stops itself once the motion has settled.
 */
function Controls({
  targetY,
  reach,
  enabled = true,
}: {
  targetY: number;
  reach: number;
  enabled?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const orbit = new OrbitControls(camera, domElement);
    orbit.enabled = enabled;
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.minDistance = reach * 0.6;
    orbit.maxDistance = reach * 6;
    // Stop the camera dropping below the floor, which produces a view of the
    // underside of a wardrobe that nobody has ever wanted.
    orbit.maxPolarAngle = Math.PI * 0.495;
    orbit.target.set(0, targetY, 0);
    orbit.update();

    let frame = 0;
    let settleUntil = 0;

    const loop = () => {
      orbit.update();
      frame =
        performance.now() < settleUntil ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (frame === 0) frame = requestAnimationFrame(loop);
    };
    const onStart = () => {
      settleUntil = Number.POSITIVE_INFINITY;
      wake();
    };
    // 600 ms is comfortably longer than the damping takes to fall below a
    // visible step at this factor.
    const onEnd = () => {
      settleUntil = performance.now() + 600;
      wake();
    };

    // Wrapped, not passed straight in: R3F's `invalidate` takes an optional
    // frame count, and OrbitControls hands its listener an event object — which
    // would arrive as a nonsense number of frames to render.
    const onChange = () => invalidate();

    orbit.addEventListener("change", onChange);
    orbit.addEventListener("start", onStart);
    orbit.addEventListener("end", onEnd);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      orbit.removeEventListener("change", onChange);
      orbit.removeEventListener("start", onStart);
      orbit.removeEventListener("end", onEnd);
      orbit.dispose();
    };
  }, [camera, domElement, enabled, invalidate, reach, targetY]);

  return null;
}

/**
 * The selected cabinet's own dimensions, beside the edges they measure.
 *
 * Placed just outside the carcass so they do not sit on top of the doors, and
 * scaled with the design so a 6 m kitchen and a 450 mm vanity both get labels
 * you can read.
 */
function SelectionLabels({
  cabinet,
  reach,
}: {
  cabinet: Cabinet;
  reach: number;
}) {
  const { position, size } = cabinet;
  // Scaled to the whole design rather than to the cabinet. Sizing a label to
  // the thing it measures makes a 600 mm cupboard's label unreadable in a 3.6 m
  // kitchen — the camera is framed on the kitchen, not on the cupboard.
  const scale = Math.max(1, reach * 0.5);

  const centreX = (position.x + size.width / 2) * MM;
  const centreY = (position.y + size.height / 2) * MM;
  const front = -(position.z * MM) - 0.02;

  return (
    <>
      <DimensionLabel
        text={`W ${Math.round(size.width)}`}
        position={[centreX, (position.y + size.height) * MM + 0.08, front]}
        scale={scale}
      />
      <DimensionLabel
        text={`H ${Math.round(size.height)}`}
        position={[(position.x + size.width) * MM + 0.16, centreY, front]}
        scale={scale}
      />
      <DimensionLabel
        text={`D ${Math.round(size.depth)}`}
        position={[
          (position.x + size.width) * MM + 0.16,
          position.y * MM + 0.08,
          -(position.z + size.depth / 2) * MM,
        ]}
        scale={scale}
      />
    </>
  );
}
