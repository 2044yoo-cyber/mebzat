"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useStore, useThree } from "@react-three/fiber";

import { RoomShell } from "./room-shell";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";

import { CabinetHandles, DimensionLabel, type DragChange } from "./handles";
import {
  bayDimensionsWorthDrawing,
  layOutBays,
} from "../../services/bay-layout";
import { buildParts } from "../../services/geometry";
import { visibleKitchenParts } from "../../services/kitchen-construction";
import { partCentre, partRotationRadians } from "../../services/part-transform";
import {
  designWorldBounds,
  resolveDesign,
} from "../../services/resolve";
import { boardColour, boardSheen } from "../../services/wardrobe-materials";
import type { Part } from "../../types/parts";
import type { Cabinet, DesignSpec } from "../../types/spec";
import type { SketchAxis, SketchTool } from "../../services/sketch";
import { findBoard } from "../../types/catalogue";

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
  hideCountertop = spec.furnitureType === "kitchen",
  onReady,
  selectedCabinetId = null,
  onSelectCabinet,
  onResize,
  selectedSketchId = null,
  onSelectSketch,
  sketchTool = "orbit",
  onPlaceSketch,
  onMoveSketch,
}: {
  spec: DesignSpec;
  /** Takes the doors and drawer fronts off, to show what is inside. */
  hideFronts?: boolean;
  hideCountertop?: boolean;
  /** Fired once the first frame is on screen, so the skeleton can go. */
  onReady?: () => void;
  /** Drawn lit, with its dimensions beside it. */
  selectedCabinetId?: string | null;
  /** Clicking a panel selects the cabinet it belongs to, not the panel. */
  onSelectCabinet?: (id: string | null) => void;
  /** Dragging an edge. Absent means the model is a picture, not an editor. */
  onResize?: (id: string, change: DragChange) => void;
  selectedSketchId?: string | null;
  onSelectSketch?: (id: string | null) => void;
  sketchTool?: SketchTool;
  onPlaceSketch?: (position: { x: number; y: number; z: number }, axis: SketchAxis, direction: -1 | 1) => void;
  onMoveSketch?: (position: { x: number; y: number; z: number }) => void;
}) {
  const parts = useMemo(() => {
    const all = visibleKitchenParts(buildParts(spec).parts, hideCountertop);
    if (!hideFronts) return all;
    return all.filter(
      (part) => part.role !== "door" && part.role !== "drawer_front",
    );
  }, [spec, hideFronts, hideCountertop]);

  const resolved = useMemo(() => resolveDesign(spec), [spec]);
  const bounds = useMemo(() => boundsWithSketch(spec), [spec]);
  const { width, height, depth } = bounds;
  const originX = bounds.min.x + width / 2;
  const originZ = bounds.min.z + depth / 2;
  const reach = Math.max(width, height, depth) * MM;
  const selected =
    spec.cabinets.find((cabinet) => cabinet.id === selectedCabinetId) ?? null;
  const selectedPlacement = selected
    ? resolved.cabinets.find((placed) => placed.cabinet.id === selected.id) ?? null
    : null;
  const positionedSelected =
    selected && selectedPlacement
      ? {
          ...selected,
          position: {
            ...selected.position,
            x: selectedPlacement.x,
            y: selectedPlacement.y,
            z: selectedPlacement.z,
          },
        }
      : selected;

  // Orbiting and dragging an edge are both "the pointer moved", so one of them
  // has to stand down. Without this, pulling a cabinet wider also swung the
  // camera and the cabinet appeared to resist.
  const [dragging, setDragging] = useState(false);
  const drawing = sketchTool === "rectangle" || sketchTool === "line" || sketchTool === "box";

  function designPosition(point: THREE.Vector3) {
    return {
      x: point.x / MM + originX,
      y: point.y / MM,
      z: originZ - point.z / MM,
    };
  }

  function placeSketch(point: THREE.Vector3, normal: THREE.Vector3) {
    if (!onPlaceSketch || !drawing) return;
    const designNormal = new THREE.Vector3(normal.x, normal.y, -normal.z);
    const absolute = [Math.abs(designNormal.x), Math.abs(designNormal.y), Math.abs(designNormal.z)];
    const index = absolute.indexOf(Math.max(...absolute));
    const axis: SketchAxis = index === 0 ? "x" : index === 1 ? "y" : "z";
    const direction = (designNormal[axis] < 0 ? -1 : 1) as -1 | 1;
    onPlaceSketch(designPosition(point), axis, direction);
  }

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
      onPointerMissed={() => {
        onSelectCabinet?.(null);
        onSelectSketch?.(null);
      }}
    >
      <Lighting height={height * MM} reach={reach} />

      {/* The room, when the design was drawn in one. Placed with the same
          offset as the cabinets, so the walls land where the units stand
          against them — see toDesignSpace, which is what makes that true. */}
      {spec.room ? (
        <RoomShell
          room={spec.room}
          offset={[-originX * MM, 0, originZ * MM]}
        />
      ) : null}

      <group
        // Centred left to right and front to back, standing on y = 0.
        position={[-originX * MM, 0, originZ * MM]}
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
                        const x = point.x / MM + originX;
                        const z = originZ - point.z / MM;
                        const under = resolved.cabinets.find((placed) => {
                          if (placed.cabinet.kind === "wall") return false;
                          const radians = (placed.rotation * Math.PI) / 180;
                          const localX =
                            (x - placed.x) * Math.cos(radians) +
                            (z - placed.z) * Math.sin(radians);
                          const localZ =
                            -(x - placed.x) * Math.sin(radians) +
                            (z - placed.z) * Math.cos(radians);
                          return (
                            localX >= 0 &&
                            localX <= placed.cabinet.size.width &&
                            localZ >= 0 &&
                            localZ <= placed.cabinet.size.depth
                          );
                        });
                        onSelectCabinet(under?.cabinet.id ?? null);
                      }
              }
              onDraw={drawing ? placeSketch : undefined}
            />
          )),
        )}

        {spec.sketchObjects.map((object) => (
          <SketchMesh
            key={object.id}
            object={object}
            selected={object.id === selectedSketchId}
            colour={findBoard(object.boardId ?? "")?.appearance?.hex ?? object.materialHex ?? spec.finish.hex}
            onSelect={() => onSelectSketch?.(object.id)}
            onDraw={drawing ? placeSketch : undefined}
          />
        ))}

        {positionedSelected ? (
          <>
            <SelectionBox
              cabinet={positionedSelected}
              rotation={selectedPlacement?.rotation ?? 0}
            />
            {onResize && (selectedPlacement?.rotation ?? 0) === 0 ? (
              <CabinetHandles
                cabinet={positionedSelected}
                offset={{ x: 0, z: 0 }}
                onDragState={setDragging}
                onDrag={(change) => onResize(positionedSelected.id, change)}
              />
            ) : null}
            <SelectionLabels
              cabinet={positionedSelected}
              reach={reach}
              board={spec.carcass.board.thickness}
            />
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

      <Reframe />

      <Ground
        reach={reach}
        onDraw={drawing ? placeSketch : undefined}
        onMove={sketchTool === "move" && selectedSketchId ? (point) => onMoveSketch?.(designPosition(point)) : undefined}
      />
      <Frame
        width={width * MM}
        height={height * MM}
        depth={depth * MM}
      />
      <Controls
        targetY={(height * MM) / 2}
        reach={reach}
        enabled={!dragging && !drawing && sketchTool !== "push-pull" && sketchTool !== "move"}
        panOnly={sketchTool === "pan"}
      />
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
  onDraw,
}: {
  part: Part;
  placement: { x: number; y: number; z: number };
  spec: DesignSpec;
  selected: boolean;
  /** Given the point in scene space, so a run-wide part can work out which. */
  onSelect?: (point: THREE.Vector3) => void;
  onDraw?: (point: THREE.Vector3, normal: THREE.Vector3) => void;
}) {
  const size: [number, number, number] = [
    Math.max(part.size.x * MM, 0.001),
    Math.max(part.size.y * MM, 0.001),
    Math.max(part.size.z * MM, 0.001),
  ];
  const shapedGeometry = useMemo(() => {
    if (!part.footprint) return null;
    const shape = new THREE.Shape(part.footprint.map((p) => new THREE.Vector2(
      (p.x - part.size.x / 2) * MM, (p.z - part.size.z / 2) * MM,
    )));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: part.size.y * MM, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -part.size.y * MM / 2, 0);
    return geometry;
  }, [part]);
  useEffect(() => () => { shapedGeometry?.dispose(); }, [shapedGeometry]);

  // The spec's z runs backwards from the front face; three.js runs it towards
  // the camera. Negating it is what puts the doors in front of the carcass
  // rather than behind the back panel.
  const centre = partCentre(part, placement);
  const position: [number, number, number] = [
    centre.x * MM,
    centre.y * MM,
    -centre.z * MM,
  ];

  return (
    <mesh
      position={position}
      rotation={[0, partRotationRadians(part), 0]}
      onPointerDown={
        onSelect || onDraw
          ? (event) => {
              // Only the nearest panel under the pointer. Without this the ray
              // passes through the door and selects the back of the cabinet
              // behind it as well, and a click on a kitchen selects four
              // cabinets at once.
              event.stopPropagation();
              if (onDraw && event.face) {
                const normal = event.face.normal.clone().transformDirection(event.object.matrixWorld);
                onDraw(event.point, normal);
              } else {
                onSelect?.(event.point);
              }
            }
          : undefined
      }
    >
      {shapedGeometry ? <primitive object={shapedGeometry} attach="geometry" /> : <boxGeometry args={size} />}
      <meshStandardMaterial
        color={colourFor(part, spec)}
        roughness={roughnessFor(part, spec)}
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

function SketchMesh({ object, selected, colour, onSelect, onDraw }: {
  object: DesignSpec["sketchObjects"][number];
  selected: boolean;
  colour: string;
  onSelect: () => void;
  onDraw?: (point: THREE.Vector3, normal: THREE.Vector3) => void;
}) {
  const size: [number, number, number] = [
    Math.max(object.size.width * MM, 0.001),
    Math.max(object.size.height * MM, 0.001),
    Math.max(object.size.depth * MM, 0.001),
  ];
  const position: [number, number, number] = [
    object.position.x * MM,
    object.position.y * MM,
    -object.position.z * MM,
  ];
  const rotation: [number, number, number] = [
    THREE.MathUtils.degToRad(object.rotation.x),
    -THREE.MathUtils.degToRad(object.rotation.y),
    THREE.MathUtils.degToRad(object.rotation.z),
  ];
  return (
    <group position={position} rotation={rotation}>
      <mesh onPointerDown={(event) => {
        event.stopPropagation();
        if (onDraw && event.face) {
          onDraw(event.point, event.face.normal.clone().transformDirection(event.object.matrixWorld));
        } else onSelect();
      }}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={colour} roughness={0.55} emissive={selected ? SELECTION_GLOW : BLACK} emissiveIntensity={selected ? 0.28 : 0} />
      </mesh>
      {selected ? (
        <lineSegments raycast={() => null} renderOrder={3}>
          <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
          <lineBasicMaterial color="#4c8dff" depthTest={false} />
        </lineSegments>
      ) : null}
    </group>
  );
}

function boundsWithSketch(spec: DesignSpec) {
  const base = designWorldBounds(spec);
  if (spec.sketchObjects.length === 0) return base;
  let minX = base.min.x;
  let minY = 0;
  let minZ = base.min.z;
  let maxX = base.min.x + base.width;
  let maxY = base.height;
  let maxZ = base.min.z + base.depth;
  for (const object of spec.sketchObjects) {
    minX = Math.min(minX, object.position.x - object.size.width / 2);
    maxX = Math.max(maxX, object.position.x + object.size.width / 2);
    minY = Math.min(minY, object.position.y - object.size.height / 2);
    maxY = Math.max(maxY, object.position.y + object.size.height / 2);
    minZ = Math.min(minZ, object.position.z - object.size.depth / 2);
    maxZ = Math.max(maxZ, object.position.z + object.size.depth / 2);
  }
  return { min: { x: minX, y: minY, z: minZ }, width: maxX - minX, height: maxY - minY, depth: maxZ - minZ };
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
function SelectionBox({
  cabinet,
  rotation,
}: {
  cabinet: Cabinet;
  rotation: number;
}) {
  const { position, size } = cabinet;
  const centre = partCentre(
    { size: { x: size.width, y: size.height, z: size.depth }, rotationY: rotation },
    position,
  );

  return (
    <lineSegments
      position={[
        centre.x * MM,
        centre.y * MM,
        -centre.z * MM,
      ]}
      rotation={[0, partRotationRadians({ rotationY: rotation }), 0]}
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
 * Board-driven rather than role-driven: the selected front, interior and
 * plinth boards are the same manufacturing materials used by the cut list and
 * quote. There is no visual-only tint that can drift from what gets ordered.
 */
function colourFor(part: Part, spec: DesignSpec): string {
  switch (part.role) {
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
    default:
      return boardColour(part.board, spec);
  }
}

/** Melamine is not gloss lacquer, and gloss lacquer is not matt foil. */
function roughnessFor(part: Part, spec: DesignSpec): number {
  switch (boardSheen(part.board, spec)) {
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
function Ground({ reach, onDraw, onMove }: {
  reach: number;
  onDraw?: (point: THREE.Vector3, normal: THREE.Vector3) => void;
  onMove?: (point: THREE.Vector3) => void;
}) {
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
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      onPointerDown={onDraw || onMove ? (event) => {
        event.stopPropagation();
        if (onDraw) onDraw(event.point, new THREE.Vector3(0, 1, 0));
        else onMove?.(event.point);
      } : undefined}
    >
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
/**
 * Keeps the camera honest when the box the canvas is in changes size.
 *
 * On a phone the drawing is now a sticky block whose height is measured from
 * the page, and that height moves: the browser's address bar collapses as you
 * scroll, the device rotates, the keyboard opens over the controls below. Each
 * of those resizes the canvas.
 *
 * React Three Fiber already resizes the renderer and the camera's aspect when
 * its container changes. This is here because of `frameloop="demand"`: nothing
 * repaints unless something asks it to, and a resize that is not followed by a
 * render leaves the last frame — drawn at the old aspect — stretched across the
 * new box until the next time somebody touches the model. Reasserting the
 * aspect and calling `updateProjectionMatrix` costs nothing and means this does
 * not depend on the order two effects happen to run in.
 */
function Reframe() {
  const size = useThree((state) => state.size);
  // The camera is read out of the store inside the effect rather than
  // subscribed to as a value. It is the same object either way, but a value
  // that came back from a hook is one the compiler treats as read-only, and
  // setting an aspect on a camera is a mutation — which is the whole job here.
  const store = useStore();

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;

    const { camera, invalidate } = store.getState();

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
    }

    invalidate();
  }, [size.width, size.height, store]);

  return null;
}

function Controls({
  targetY,
  reach,
  enabled = true,
  panOnly = false,
}: {
  targetY: number;
  reach: number;
  enabled?: boolean;
  panOnly?: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const orbit = new OrbitControls(camera, domElement);
    orbit.enabled = enabled;
    orbit.enableDamping = true;
    if (panOnly) {
      orbit.enableRotate = false;
      orbit.mouseButtons.LEFT = THREE.MOUSE.PAN;
      orbit.touches.ONE = THREE.TOUCH.PAN;
    }
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
  }, [camera, domElement, enabled, invalidate, panOnly, reach, targetY]);

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
  board,
}: {
  cabinet: Cabinet;
  reach: number;
  /** Carcass board thickness, which is what the openings are set in from. */
  board: number;
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

      <BayLabels cabinet={cabinet} board={board} scale={scale} />
    </>
  );
}

/**
 * The clear opening of each bay, written across the front of the bay.
 *
 * The same rule as the elevation: measured inside the opening rather than on a
 * chain below the design, because the cabinets in a kitchen stand at different
 * heights and one chain across the bottom would put a wall unit's openings on
 * the same line as a base unit's and say nothing about which was which.
 *
 * Skipped for a single-bay cabinet, where the opening is the cabinet width
 * less two boards and the W label above it already answers the question.
 */
function BayLabels({
  cabinet,
  board,
  scale,
}: {
  cabinet: Cabinet;
  board: number;
  scale: number;
}) {
  const { position, size } = cabinet;

  if (!bayDimensionsWorthDrawing(cabinet)) return null;

  // Smaller than the cabinet's own dimensions. Several of these sit side by
  // side inside one carcass, and at the same size as the W above them they
  // overlap each other on anything narrower than a kitchen run.
  const small = scale * 0.7;

  // Just below the top board, where the elevation writes them, and clear of
  // the W label sitting above the carcass.
  const y = (position.y + size.height - board) * MM - 0.07 * small;
  const front = -(position.z * MM) - 0.02;

  return (
    <>
      {layOutBays(cabinet, board).map(({ bay, x, width }) => (
        <DimensionLabel
          key={bay.id}
          text={`${Math.round(width)}`}
          position={[(position.x + x + width / 2) * MM, y, front]}
          scale={small}
          tone="muted"
        />
      ))}
    </>
  );
}
