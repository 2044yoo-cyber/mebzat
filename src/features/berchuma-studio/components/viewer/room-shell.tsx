"use client";

import { useMemo } from "react";

import {
  toDesignSpace,
  wallPieces,
} from "../../services/room-geometry";
import type { Room } from "../../types/room";

/**
 * The room around the furniture.
 *
 * Without it a kitchen floats in grey space, and the one question a client
 * actually has — does this fit in my kitchen — has nothing to look at. §16.
 *
 * Every wall is placed through `toDesignSpace`, which is asserted in
 * scripts/room_check.ts: the first run wall lands on the origin along +x,
 * which is exactly where the layout solver puts the first run of cabinets. Get
 * that transform wrong and the walls render beautifully half a metre from the
 * units standing against them, and it looks deliberate.
 *
 * Walls are drawn as boxes with the openings cut out of them by *drawing round
 * them* — three boxes for a wall with a window in it — rather than by
 * subtracting geometry. CSG for a hole in a wall is a mesh operation on every
 * edit of a dimension field, and a wall is a box: the arithmetic of leaving a
 * gap is a sort and a loop.
 */

const MM = 0.001;

export function RoomShell({
  room,
  /** Where the design's own group sits, so the room lands with it. */
  offset,
}: {
  room: Room;
  offset: [number, number, number];
}) {
  const pieces = useMemo(() => wallPieces(room), [room]);

  if (pieces.length === 0) return null;

  return (
    <group position={offset}>
      {pieces.map((piece) => (
        <mesh
          key={piece.id}
          position={[piece.centre.x * MM, piece.centreY * MM, -piece.centre.y * MM]}
          rotation={[0, piece.rotation, 0]}
        >
          <boxGeometry
            args={[piece.length * MM, piece.height * MM, room.wallThickness * MM]}
          />
          <meshStandardMaterial
            color="#e7e3dc"
            roughness={0.95}
            metalness={0}
            // Seen from outside, a wall would hide the room. Only the inner
            // face is drawn, so the camera can sit anywhere and still look in.
            side={2}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}

      <mesh
        position={[floorCentre(room).x * MM, -0.002, -floorCentre(room).y * MM]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[floorSize(room).x * MM, floorSize(room).y * MM]} />
        <meshStandardMaterial color="#d8d2c8" roughness={1} />
      </mesh>
    </group>
  );
}

/** The floor is drawn as a rectangle over the room's extent. */
function floorCentre(room: Room) {
  const points = room.corners.map((corner) => toDesignSpace(room, corner));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function floorSize(room: Room) {
  const points = room.corners.map((corner) => toDesignSpace(room, corner));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    y: Math.max(...ys) - Math.min(...ys),
  };
}
