import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room.ts";
import { patchHouseObject } from "../src/features/house-designer/services/project-edit.ts";
import { applyHouseRemodelCommand } from "../src/features/house-designer/services/remodel.ts";
import { detectedPlanToRoom } from "../src/features/house-designer/services/plan-analysis.ts";
import {
  activateFacadeAlternative,
  applyFacadeReference,
  applyFacadeStyle,
  generateFacadeAlternatives,
} from "../src/features/house-designer/services/facade.ts";
import { calculateHouseQuantities, quantityCsv } from "../src/features/house-designer/services/quantities.ts";
import { createHouseTakeoffPackage, parseHouseTakeoffPackage } from "../src/features/house-designer/services/takeoff-adapter.ts";
import {
  createHouseProject,
  houseProjectSchema,
} from "../src/features/house-designer/types/project.ts";

const room = {
  ...rectangularRoom(8000, 6500),
  openings: [
    { id: "door-1", kind: "door" as const, wallId: "c1", offset: 900, width: 1000, height: 2100, sill: 0, swing: "in-left" as const, label: "Entry" },
    { id: "window-1", kind: "window" as const, wallId: "c2", offset: 1200, width: 1800, height: 1200, sill: 900, swing: "none" as const, label: "Window" },
  ],
};

let project = createHouseProject({
  title: "Phase 2 check",
  room,
  style: "modern",
  strict: true,
  floorCount: 2,
  floorToFloorHeight: 3000,
});

assert.equal(project.levels.length, 2);
assert.equal(project.walls.length, 8);
assert.equal(project.doors.length, 2);
assert.equal(project.windows.length, 2);
assert.equal(project.slabs.length, 2);
assert.equal(project.stairs.length, 1);
assert.equal(project.roofs.length, 1);
assert.equal(project.structuralColumns.length, 8);
assert.equal(project.structuralBeams.length, 8);
assert.equal(project.ceilings.length, 2);
assert(project.site);
assert.equal(project.verandas.length, 1);
assert.equal(project.balconies.length, 1);

project = patchHouseObject(project, { kind: "wall", id: "ground-floor:wall:c1" }, { endX: 8200, thickness: 200 });
assert.equal(project.levels[0]?.plan?.corners[1]?.x, 8200);
assert.equal(project.walls.find((wall) => wall.id === "ground-floor:wall:c1")?.thickness, 200);

project = patchHouseObject(project, { kind: "door", id: "ground-floor:door:door-1" }, { width: 1100 });
assert.equal(project.levels[0]?.plan?.openings[0]?.width, 1100);

project = patchHouseObject(project, { kind: "level", id: "ground-floor" }, { floorToFloorHeight: 3200 });
assert.equal(project.stairs[0]?.height, 3200);

project = patchHouseObject(project, { kind: "roof", id: "main-roof" }, { type: "gable", slope: 25 });
assert.equal(project.roofs[0]?.type, "gable");
assert.equal(project.roofs[0]?.slope, 25);

const footprint = project.walls.map(({ start, end }) => ({ start, end }));
project = applyFacadeStyle(project, "neo-classical");
assert.equal(project.designStyle, "neo-classical");
assert.equal(project.roofs[0]?.type, "hip");
assert(project.facadeElements.some((element) => element.type === "pilaster"));
assert.deepEqual(project.walls.map(({ start, end }) => ({ start, end })), footprint);

project = generateFacadeAlternatives(project, 4);
assert.equal(project.designAlternatives.length, 4);
project = activateFacadeAlternative(project, project.designAlternatives[0]!.id);
assert.deepEqual(project.walls.map(({ start, end }) => ({ start, end })), footprint);

project = applyFacadeReference(project, "facade-image", {
  spaceType: "Building facade",
  estimatedDimensions: null,
  lighting: "Daylight",
  walls: "Warm stone and render",
  windows: "Black aluminium frames",
  doors: "Recessed timber entry",
  ceiling: "Not applicable",
  floor: "Not applicable",
  surfaces: [{ element: "facade wall", material: "Local stone" }],
  furniture: [],
  emptyAreas: [],
  currentStyle: "Modern",
  problems: [],
  summary: "Modern facade with local stone accents.",
  suggestedStyles: ["modern"],
});
assert.equal(project.facade.source, "reference");
assert.equal(project.facade.wallMaterial, "Local stone");
assert.deepEqual(project.walls.map(({ start, end }) => ({ start, end })), footprint);

project = patchHouseObject(project, { kind: "column", id: "ground-floor:column:c1" }, { width: 350, depth: 400 });
assert.equal(project.structuralColumns.find((column) => column.id === "ground-floor:column:c1")?.width, 350);
project = patchHouseObject(project, { kind: "beam", id: "ground-floor:beam:c1" }, { width: 250, depth: 450 });
assert.equal(project.structuralBeams.find((beam) => beam.id === "ground-floor:beam:c1")?.depth, 450);

const balconyId = project.balconies[0]!.id;
project = patchHouseObject(project, { kind: "balcony", id: balconyId }, { width: 2600, railingHeight: 1100 });
assert.equal(project.balconies[0]?.width, 2600);
assert.equal(project.balconies[0]?.railingHeight, 1100);
project = patchHouseObject(project, { kind: "site", id: project.site!.id }, { width: 15000, depth: 12000 });
const siteXs = project.site!.boundary.map((point) => point.x);
const siteYs = project.site!.boundary.map((point) => point.y);
assert.equal(Math.max(...siteXs) - Math.min(...siteXs), 15000);
assert.equal(Math.max(...siteYs) - Math.min(...siteYs), 12000);

const quantities = calculateHouseQuantities(project);
assert(quantities.find((item) => item.code === "CON-02")!.quantity > 0);
assert(quantities.find((item) => item.code === "CON-05")!.quantity > 0);
assert(quantities.find((item) => item.code === "MAS-01")!.quantity > 0);
assert(quantities.find((item) => item.code === "FIN-05")!.quantity > 0);
assert(quantities.find((item) => item.code === "EXT-01")!.quantity > 0);
assert(quantityCsv(project).includes("PRELIMINARY"));

const protectedWall = project.walls[0]!;
const protectedStart = { ...protectedWall.start };
const strictResult = applyHouseRemodelCommand(project, { kind: "wall", id: protectedWall.id }, {
  action: "patch_object",
  patch: { startX: protectedWall.start.x + 500, material: "Local stone" },
  explanation: "Use local stone without moving the verified wall.",
});
assert.deepEqual(strictResult.project.walls.find((wall) => wall.id === protectedWall.id)?.start, protectedStart);
assert.equal(strictResult.project.walls.find((wall) => wall.id === protectedWall.id)?.material, "Local stone");
assert.deepEqual(strictResult.blockedFields, ["startX"]);

const editableProject = { ...project, originalPlanStrict: false };
const editableResult = applyHouseRemodelCommand(editableProject, { kind: "level", id: "ground-floor" }, {
  action: "patch_object",
  patch: { floorToFloorHeight: 3_250 },
  explanation: "Raise the floor-to-floor height.",
});
assert.equal(editableResult.project.levels[0]?.floorToFloorHeight, 3_250);

const handoff = createHouseTakeoffPackage(project);
assert(handoff.elements.some((element) => element.id === protectedWall.id));
assert(handoff.elements.some((element) => element.id === balconyId));
assert(handoff.quantities.some((item) => item.id === "house:MAS-01"));
assert.equal(handoff.quantities.find((item) => item.id === "house:FIN-05")?.section, "N");
assert.equal(handoff.quantities.find((item) => item.id === "house:EXT-01")?.section, "W");
assert.equal(parseHouseTakeoffPackage(JSON.stringify(handoff))?.projectId, project.id);
houseProjectSchema.parse(project);

const detected = detectedPlanToRoom({
  outerBoundary: [
    { id: "outer-a", x: 0, y: 0 },
    { id: "outer-b", x: 8000, y: 0 },
    { id: "outer-c", x: 8000, y: 6500 },
    { id: "outer-d", x: 0, y: 6500 },
  ],
  wallThickness: 200,
  interiorWalls: [{ id: "partition", start: { x: 4000, y: 0 }, end: { x: 4000, y: 6500 }, thickness: 120, label: "Hall wall" }],
  rooms: [
    { id: "living", name: "Living", boundary: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 6500 }, { x: 0, y: 6500 }] },
    { id: "bed", name: "Bedroom", boundary: [{ x: 4000, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 6500 }, { x: 4000, y: 6500 }] },
  ],
  openings: [{ id: "inside-door", kind: "door", wallId: "partition", offset: 900, width: 900 }],
  columns: [{ id: "column-a", x: 4000, y: 3250, width: 300, depth: 350 }],
  stairs: [{ id: "stair-a", x: 6000, y: 3000, width: 1000, length: 3200, rotation: 90 }],
  dimensions: [{ id: "dim-a", start: { x: 0, y: 0 }, end: { x: 8000, y: 0 }, label: "8000" }],
  platforms: [{ id: "balcony-a", kind: "balcony", x: 4000, y: -600, width: 2800, depth: 1200, wallId: "outer-a" }],
  confidence: 0.9,
  notes: ["Verified test plan"],
}, { ceilingHeight: 3000 });
assert.equal(detected.room.interiorWalls?.length, 1);
assert.equal(detected.room.openings[0]?.wallId, "iw1");
assert.equal(detected.room.zones?.length, 2);
assert.equal(detected.room.planPlatforms?.[0]?.wallId, "c1");

let detailedProject = createHouseProject({
  title: "Structured plan check",
  room: detected.room,
  style: "modern",
  strict: false,
  floorCount: 2,
  floorToFloorHeight: 3000,
});
assert.equal(detailedProject.rooms.length, 4);
assert.equal(detailedProject.walls.filter((item) => item.levelId === "ground-floor").length, 5);
assert.equal(detailedProject.structuralColumns.filter((item) => item.levelId === "ground-floor").length, 1);
assert.equal(detailedProject.stairs[0]?.x, 6000);
assert.equal(detailedProject.balconies[0]?.width, 2800);
assert(detailedProject.structuralGrid.length >= 4);
assert(detailedProject.facadeElements.some((item) => item.type === "parapet"));

const roomId = detailedProject.rooms[0]!.id;
detailedProject = patchHouseObject(detailedProject, { kind: "room", id: roomId }, { floorMaterial: "Timber", wallMaterial: "Stone" });
assert.equal(detailedProject.rooms[0]?.floorMaterial, "Timber");
const gridId = detailedProject.structuralGrid[0]!.id;
detailedProject = patchHouseObject(detailedProject, { kind: "grid", id: gridId }, { label: "A1" });
assert.equal(detailedProject.structuralGrid[0]?.label, "A1");
const facadeId = detailedProject.facadeElements[0]!.id;
detailedProject = patchHouseObject(detailedProject, { kind: "facade", id: facadeId }, { color: "#123456", depth: 125 });
assert.equal(detailedProject.facadeElements[0]?.color, "#123456");
const balconyCount = detailedProject.balconies.length;
const withAddedBalcony = applyHouseRemodelCommand(detailedProject, { kind: "wall", id: "ground-floor:wall:c1" }, {
  action: "add_object",
  objectType: "balcony",
  explanation: "Add a balcony above the selected wall.",
});
assert.equal(withAddedBalcony.project.balconies.length, balconyCount + 1);

const strictAdd = applyHouseRemodelCommand({ ...detailedProject, originalPlanStrict: true }, null, {
  action: "add_object",
  objectType: "stair",
  explanation: "Add a stair.",
});
assert.deepEqual(strictAdd.blockedFields, ["stair"]);

console.log("House model checks passed");
