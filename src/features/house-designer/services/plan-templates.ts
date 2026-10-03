import { roomSchema, type Room } from "@/features/berchuma-studio/types/room";

export type PlanTemplate = { id: string; name: string; summary: string; build: () => Room };

/**
 * Starting points, not finished designs: a measured outline with rooms,
 * inside walls, doors and windows already in place, every one of them
 * editable afterwards like anything drawn by hand.
 *
 * Plans run clockwise from the back-left corner: c1 back-left, c2 back-right,
 * c3 front-right, c4 front-left. An opening's offset is measured from its
 * wall's start corner, so on the front wall (c3 → c4) it runs right to left.
 */
export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "studio",
    name: "Studio or shop",
    summary: "6 × 4 m · one open room",
    build: () => plan(6000, 4000, [], [zone("studio", "Studio", [0, 0], [6000, 4000])], [
      door("entrance", "c3", 2500, 1000, "Entrance"),
      window("back-1", "c1", 1000, 1500),
      window("back-2", "c1", 3500, 1500),
    ]),
  },
  {
    id: "two-bedroom",
    name: "Two-bedroom house",
    summary: "10 × 8 m · 2 bedrooms, living and kitchen",
    build: () => plan(10000, 8000, [
      wall("hall", [0, 4500], [10000, 4500]),
      wall("between-bedrooms", [5000, 0], [5000, 4500]),
    ], [
      zone("bedroom-1", "Bedroom 1", [0, 0], [5000, 4500]),
      zone("bedroom-2", "Bedroom 2", [5000, 0], [10000, 4500]),
      zone("living", "Living and kitchen", [0, 4500], [10000, 8000]),
    ], [
      door("entrance", "c3", 4000, 1000, "Entrance"),
      door("bedroom-1-door", "hall", 3600, 900, "Bedroom 1"),
      door("bedroom-2-door", "hall", 5500, 900, "Bedroom 2"),
      window("bedroom-1-window", "c1", 1750, 1500),
      window("bedroom-2-window", "c1", 6750, 1500),
      window("living-window", "c3", 6500, 1800),
    ]),
  },
  {
    id: "three-bedroom",
    name: "Three-bedroom house",
    summary: "12 × 10 m · 3 bedrooms, living and kitchen",
    build: () => plan(12000, 10000, [
      wall("hall", [0, 5000], [12000, 5000]),
      wall("between-1-2", [4000, 0], [4000, 5000]),
      wall("between-2-3", [8000, 0], [8000, 5000]),
    ], [
      zone("bedroom-1", "Bedroom 1", [0, 0], [4000, 5000]),
      zone("bedroom-2", "Bedroom 2", [4000, 0], [8000, 5000]),
      zone("bedroom-3", "Bedroom 3", [8000, 0], [12000, 5000]),
      zone("living", "Living and kitchen", [0, 5000], [12000, 10000]),
    ], [
      door("entrance", "c3", 5000, 1000, "Entrance"),
      door("bedroom-1-door", "hall", 2800, 900, "Bedroom 1"),
      door("bedroom-2-door", "hall", 5500, 900, "Bedroom 2"),
      door("bedroom-3-door", "hall", 8300, 900, "Bedroom 3"),
      window("bedroom-1-window", "c1", 1250, 1500),
      window("bedroom-2-window", "c1", 5250, 1500),
      window("bedroom-3-window", "c1", 9250, 1500),
      window("living-window", "c3", 8000, 2000),
    ]),
  },
];

function plan(width: number, depth: number, interiorWalls: Room["interiorWalls"], zones: Room["zones"], openings: Room["openings"]): Room {
  return roomSchema.parse({
    version: 1,
    corners: [{ id: "c1", x: 0, y: 0 }, { id: "c2", x: width, y: 0 }, { id: "c3", x: width, y: depth }, { id: "c4", x: 0, y: depth }],
    wallThickness: 200,
    ceilingHeight: 2800,
    openings,
    runWalls: [],
    interiorWalls,
    zones,
    planColumns: [],
    planStairs: [],
    dimensions: [],
    planPlatforms: [],
  });
}

function wall(id: string, start: [number, number], end: [number, number]) {
  return { id, start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, thickness: 120, height: 2800, label: "Interior wall" };
}

function zone(id: string, name: string, from: [number, number], to: [number, number]) {
  return { id, name, boundary: [{ x: from[0], y: from[1] }, { x: to[0], y: from[1] }, { x: to[0], y: to[1] }, { x: from[0], y: to[1] }], floorMaterial: "Unspecified", wallMaterial: "Paint", ceilingMaterial: "Gypsum board" };
}

function door(id: string, wallId: string, offset: number, width: number, label: string) {
  return { id, kind: "door" as const, wallId, offset, width, height: 2100, sill: 0, swing: "in-right" as const, label };
}

function window(id: string, wallId: string, offset: number, width: number) {
  return { id, kind: "window" as const, wallId, offset, width, height: 1200, sill: 900, swing: "none" as const, label: "Window" };
}
