import { z } from "zod";

/**
 * The room the furniture goes in.
 *
 * ## Why this is a new file and not a wider `runs`
 *
 * `DesignSpec.runs` is a list of wall *lengths* — "Wall A is 4200" — with the
 * positions solved by services/layout.ts for the straight, L and U cases it
 * knows. That is the right model for somebody who measured two walls and wants
 * a kitchen along them, and it stays.
 *
 * A room is a different thing: a closed polygon with thickness, holes in it,
 * and walls the furniture does not touch. It cannot be expressed as a list of
 * lengths — an out-of-square room, a five-wall room, or a wall with a door two
 * thirds along it all need coordinates.
 *
 * So the room is added *above* runs rather than replacing them, and the runs
 * are derived from it when one exists. Everything downstream — the layout
 * solver, buildParts, the cut list, the price — carries on receiving exactly
 * what it receives today and needs no change at all. A design with no room is
 * a design that behaves exactly as it did before this file existed.
 *
 * ## Not to be confused with types/openings.ts
 *
 * That file models a window or a door as a **product being fabricated**:
 * profile systems, glass, sash arithmetic, a cut list. This models a **hole in
 * a room wall** that furniture must not be pushed in front of. They share a
 * word and nothing else, and merging them would be a serious mistake — the
 * fabricated one has a BOQ and the hole in the wall does not.
 */

/** Millimetres, in the plan. x runs right, y runs down the drawing. */
export const cornerSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export type Corner = z.infer<typeof cornerSchema>;

export const roomOpeningKinds = ["door", "window", "passage"] as const;
export type RoomOpeningKind = (typeof roomOpeningKinds)[number];

/** Which way a door swings, seen on the plan. */
export const swingDirections = ["in-left", "in-right", "out-left", "out-right", "none"] as const;
export type SwingDirection = (typeof swingDirections)[number];

export const roomOpeningSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(roomOpeningKinds),
  /** The wall it is in — the id of the corner that wall starts at. */
  wallId: z.string().min(1),
  /** From the wall's start corner to the opening's near edge, in mm. */
  offset: z.number().nonnegative(),
  width: z.number().positive().max(12_000),
  /** Head height above the floor. A passage has none. */
  height: z.number().positive().max(4_000).default(2100),
  /** Height of the sill above the floor. Zero for a door. */
  sill: z.number().nonnegative().max(3_000).default(0),
  swing: z.enum(swingDirections).default("in-right"),
  label: z.string().max(60).default(""),
});

export type RoomOpening = z.infer<typeof roomOpeningSchema>;

export const roomSchema = z.object({
  version: z.literal(1),

  /**
   * The corners, in order round the room. The last joins back to the first, so
   * four corners are four walls and the polygon is always closed — there is no
   * such thing as half a room, and letting one exist means every consumer has
   * to decide what to do about it.
   */
  corners: z.array(cornerSchema).min(3).max(32),

  /** Structural thickness, drawn on the plan. Does not enter the BOQ. */
  wallThickness: z.number().positive().max(600).default(150),

  /** Floor to ceiling, for the 3D view and for tall-unit checks. */
  ceilingHeight: z.number().positive().max(6_000).default(2700),

  openings: z.array(roomOpeningSchema).max(40).default([]),

  /**
   * The walls the cabinet runs sit against, in order.
   *
   * This is the join between the room and everything that already works: the
   * runs handed to the layout solver are these walls, in this order. An empty
   * list means the room is drawn but nothing is placed against it yet.
   */
  runWalls: z.array(z.string()).max(8).default([]),

  /** An uploaded plan traced over. Phase 1 stores it; tracing comes later. */
  reference: z
    .object({
      url: z.string().min(1),
      opacity: z.number().min(0).max(1).default(0.5),
      /** Millimetres per image pixel, from the calibration step. */
      scale: z.number().positive().optional(),
    })
    .optional(),
});

export type Room = z.infer<typeof roomSchema>;

/** A wall, once the polygon has been walked. Derived; never stored. */
export type Wall = {
  id: string;
  label: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Millimetres. */
  length: number;
  /** Degrees, anticlockwise from +x. */
  angle: number;
  /** Unit vector pointing into the room. */
  inward: { x: number; y: number };
};

/**
 * A rectangular room, which is what most people start from.
 *
 * Corners run clockwise on the drawing — right, down, left, up — so `inward`
 * comes out consistently and the walls are labelled A, B, C, D in the order
 * somebody reads them.
 */
export function rectangularRoom(width = 4200, length = 3600): Room {
  return {
    version: 1,
    corners: [
      { id: "c1", x: 0, y: 0 },
      { id: "c2", x: width, y: 0 },
      { id: "c3", x: width, y: length },
      { id: "c4", x: 0, y: length },
    ],
    wallThickness: 150,
    ceilingHeight: 2700,
    openings: [],
    runWalls: [],
  };
}

/** "Wall A", "Wall B" — what the dimension on the drawing is called. */
export function wallLabel(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `Wall ${letters[index % letters.length]}${
    index >= letters.length ? String(Math.floor(index / letters.length) + 1) : ""
  }`;
}
