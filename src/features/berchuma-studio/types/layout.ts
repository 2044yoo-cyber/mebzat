import { z } from "zod";

/**
 * Wall runs, layouts and corners.
 *
 * Its own module rather than part of `spec.ts` because the solver, the check
 * script and the viewer all need these types and none of them needs the whole
 * design schema. No `server-only` guard: there is nothing secret in a list of
 * shapes, and the check script imports it under plain Node.
 *
 * ## Why a run is not just a cabinet with a rotation
 *
 * A run is the thing a customer measures. "The back wall is three metres" is a
 * fact about the room that survives every change to what goes against it, and
 * the cabinets are consequences of it. Storing the wall and deriving the
 * cabinets means changing the wall moves the cabinets; storing the cabinets
 * and inferring the wall means changing the wall is a manual re-layout, which
 * is exactly what Part 59 forbids.
 */

/** How the runs are arranged. */
export const layoutKinds = [
  "straight",
  "l_shaped",
  "u_shaped",
  "custom",
] as const;

export type LayoutKind = (typeof layoutKinds)[number];

export function layoutLabel(kind: LayoutKind): string {
  switch (kind) {
    case "straight":
      return "Straight";
    case "l_shaped":
      return "L-shaped";
    case "u_shaped":
      return "U-shaped";
    case "custom":
      return "Custom";
  }
}

/**
 * What is being built.
 *
 * Separate from `DesignKind`, which already exists and mixes the two ideas —
 * `wardrobe`, `kitchen`, `tv_unit`, `vanity`, `bookshelf`. Those are useful
 * starting points and are kept, but the brief asks for a furniture *type* that
 * decides which components are offered, and "bookshelf" is a preset rather
 * than a family of components.
 */
export const furnitureTypes = [
  "wardrobe",
  "kitchen",
  "cabinet",
  "custom",
] as const;

export type FurnitureType = (typeof furnitureTypes)[number];

export function furnitureLabel(type: FurnitureType): string {
  switch (type) {
    case "wardrobe":
      return "Wardrobe";
    case "kitchen":
      return "Kitchen";
    case "cabinet":
      return "Cabinet";
    case "custom":
      return "Custom furniture";
  }
}

/**
 * How two runs meet.
 *
 * All four fill the same `d × d` square and differ in what is inside it:
 *
 *   l_corner  — an L-shaped carcass reaching into both runs. Most storage,
 *               most panels, and a door on each face.
 *   blind     — a box that faces one run only. The far part is reachable but
 *               awkward; it is the cheapest and by far the commonest.
 *   diagonal  — a single door across the 45° face. Elegant, wasteful of the
 *               square's volume, and needs both runs at one depth.
 *   custom    — the author has drawn something; the solver leaves it alone.
 */
export const cornerKinds = [
  "l_corner",
  "blind",
  "diagonal",
  "custom",
] as const;

export type CornerKind = (typeof cornerKinds)[number];

export function cornerLabel(kind: CornerKind): string {
  switch (kind) {
    case "l_corner":
      return "L-shaped corner";
    case "blind":
      return "Blind corner";
    case "diagonal":
      return "Diagonal corner";
    case "custom":
      return "Custom corner";
  }
}

export type WallRunId = string;

/**
 * One wall's worth of cabinetry, as authored.
 *
 * `origin` and `rotation` are optional and only read for a custom layout. For
 * straight, L and U they are computed by the solver and anything stored here
 * is ignored — a stored position that disagreed with the solver is the bug
 * this whole file exists to prevent.
 */
export const runSchema = z.object({
  id: z.string().min(1),
  /** "Wall A", "Back wall". Shown in the rail and on the dimension. */
  label: z.string().min(1).max(60),

  /**
   * The wall, not the cabinets. The corner is taken out of this.
   *
   * No upper bound here, deliberately, and it matches `envelope` in the design
   * schema. Berchuma's contract with the model is *repair, do not reject*: a
   * spec proposing a 4.2 m tall run is clamped to something buildable with a
   * correction the customer can read, because refusing it outright throws away
   * an otherwise good design over one number. A `.max()` in the schema would
   * turn that repair into a parse failure — which is exactly what it did the
   * first time this file was written.
   */
  length: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),

  /** Custom layouts only. */
  origin: z.object({ x: z.number(), z: z.number() }).optional(),
  rotation: z.number().optional(),
});

export type RunSpec = z.infer<typeof runSchema>;

/** A run after the solver has placed it. Derived; never stored. */
export type RunPlacement = {
  runId: WallRunId;
  label: string;
  origin: { x: number; z: number };
  /** Degrees anticlockwise about y. 0 travels along +x, 90 along +z. */
  rotation: number;
  /** What the customer measured. */
  wallLength: number;
  /**
   * What is left for cabinets once the corners are taken out.
   *
   * The number that matters when filling a run, and the one that changes when
   * the *other* wall's depth changes — which is why it is computed rather than
   * being the same field as `wallLength`.
   */
  usableLength: number;
  depth: number;
  height: number;
};

/* -------------------------------------------------------------------------- */
/* Sensible defaults                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The depth a run starts at, by furniture type.
 *
 * A kitchen base run is 600 and a wardrobe is 600; a wall unit is 350. These
 * are the Ethiopian market's standard carcass depths, and they are starting
 * points rather than limits — every one is editable.
 */
export function defaultDepth(type: FurnitureType): number {
  switch (type) {
    case "kitchen":
      return 600;
    case "wardrobe":
      return 600;
    case "cabinet":
      return 450;
    case "custom":
      return 500;
  }
}

/** The height a run starts at. */
export function defaultHeight(type: FurnitureType): number {
  switch (type) {
    case "kitchen":
      // Worktop height. Wall and tall units sit above it and carry their own.
      return 900;
    case "wardrobe":
      return 2400;
    case "cabinet":
      return 900;
    case "custom":
      return 900;
  }
}

/** How many runs a layout needs, and what they are called. */
export function runLabelsFor(kind: LayoutKind): string[] {
  switch (kind) {
    case "straight":
      return ["Wall A"];
    case "l_shaped":
      return ["Wall A", "Wall B"];
    case "u_shaped":
      return ["Left wall", "Back wall", "Right wall"];
    case "custom":
      return ["Run 1"];
  }
}

/**
 * A fresh set of runs for a layout.
 *
 * Lengths are the ones people actually ask for in Addis — a 3 m back wall and
 * 2.4 m returns — so the first thing somebody sees after choosing "L-shaped"
 * is a plausible kitchen rather than three zero-length walls.
 */
export function defaultRuns(
  kind: LayoutKind,
  type: FurnitureType,
): RunSpec[] {
  const depth = defaultDepth(type);
  const height = defaultHeight(type);
  const labels = runLabelsFor(kind);

  const lengths =
    kind === "straight"
      ? [type === "wardrobe" ? 2400 : 3600]
      : kind === "l_shaped"
        ? [3000, 2400]
        : kind === "u_shaped"
          ? [2400, 3000, 2400]
          : [3000];

  return labels.map((label, index) => ({
    id: `run-${index + 1}`,
    label,
    length: lengths[index] ?? 2400,
    depth,
    height,
  }));
}
