import assert from "node:assert/strict";

import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { FURNITURE_CATALOG, furnitureItem } from "../src/features/house-designer/services/furniture-catalog";
import { formatArea, formatLength, formatSize, letters, levelMeasurements, measurementText, wallLabels, wallRooms } from "../src/features/house-designer/services/measurements";
import { createHouseObjectFromGesture, createRoomFromGesture, roomOutline } from "../src/features/house-designer/services/model-commands";
import { ensureHouseBimState } from "../src/features/house-designer/services/model-state";
import { establishLevelOutline, openSpace, patchHouseObject, splitRoomAlong } from "../src/features/house-designer/services/project-edit";
import { applyModelingOptions, modelingPreset } from "../src/features/house-designer/services/workspace-options";
import { createHouseProject } from "../src/features/house-designer/types/project";

// ---------------------------------------------------------------------------
// Units: millimetres inside, the project's unit outside.
// ---------------------------------------------------------------------------
assert.equal(formatLength(3625, "mm"), "3625 mm");
assert.equal(formatLength(3625.4, "mm"), "3625 mm", "whole millimetres");
assert.equal(formatLength(3625, "cm"), "362.5 cm");
assert.equal(formatLength(3620, "cm"), "362 cm", "no trailing .0");
assert.equal(formatLength(3625, "m"), "3.625 m", "metres to the millimetre");
assert.equal(formatLength(4200, "m", 2), "4.20 m", "or to the centimetre for a room");
assert.equal(formatSize(900, 2100, "mm"), "900 × 2100 mm", "a size writes its unit once");
assert.equal(formatSize(4200, 5100, "m", 2), "4.20 × 5.10 m");
assert.equal(formatArea(21.42), "21.42 m²");
assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(letters), ["A", "B", "Z", "AA", "AB", "AZ", "BA"], "wall letters never run out");

// ---------------------------------------------------------------------------
// A plan's measurements, the way they are listed and copied.
// ---------------------------------------------------------------------------
const base = openSpace(ensureHouseBimState(applyModelingOptions(createHouseProject({ title: "Measure", room: { ...rectangularRoom(8000, 6500), ceilingHeight: 3000 }, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 }), modelingPreset("house"))));
const ground = base.levels[0]!.id;
let project = establishLevelOutline(base, ground, roomOutline("rectangle", { x: 0, y: 0 }, { x: 8000, y: 6500 }))!;
// A wall drawn across the house splits it, as the editor does in the same step.
project = splitRoomAlong(createHouseObjectFromGesture(project, "wall", ground, { x: 4200, y: 0 }, { x: 4200, y: 6500 }, { wallThickness: 120 }).project, ground, { x: 4200, y: 0 }, { x: 4200, y: 6500 });
project = patchHouseObject(project, { kind: "room", id: project.rooms[0]!.id }, { name: "Living Room" });
project = createHouseObjectFromGesture(project, "door", ground, { x: 2000, y: 0 }, { x: 2000, y: 0 }, { width: 900, height: 2100 }).project;
project = createHouseObjectFromGesture(project, "window", ground, { x: 6000, y: 0 }, { x: 6000, y: 0 }, { width: 1800, height: 1500, sillHeight: 900 }).project;
const bed = furnitureItem("bed");
project = createHouseObjectFromGesture(project, "furniture", ground, { x: 6000, y: 3000 }, { x: 6000, y: 3000 }, { ...bed, name: bed.name }).project;
project = createHouseObjectFromGesture(project, "dimension", ground, { x: 0, y: 1000 }, { x: 3625, y: 1000 }).project;

const items = levelMeasurements(project, ground, "m");
const line = (label: string) => items.find((item) => item.label === label);
const rooms = items.filter((item) => item.group === "Rooms").map((item) => `${item.label}: ${item.value}`).sort();
assert.equal(rooms.length, 2, "the wall divided the floor into two rooms");
assert.ok(rooms.some((text) => /^Living Room: 4\.20 × 6\.50 m · 27\.30 m² · perimeter 21\.40 m$/.test(text)), `a room is its size, area and perimeter (${rooms.join(" | ")})`);
assert.ok(rooms.some((text) => /: 3\.80 × 6\.50 m · 24\.70 m² · perimeter 20\.60 m$/.test(text)), "and so is the other");

const labels = wallLabels(project, ground);
assert.deepEqual([...labels.values()], ["Wall A", "Wall B", "Wall C", "Wall D", "Wall E"], "walls are lettered in order");
const inside = project.walls.find((wall) => wall.levelId === ground && wall.start.x === 4200 && wall.end.x === 4200)!;
assert.deepEqual(wallRooms(project, inside.id).sort(), ["Living Room", "Room 2"].sort(), "an inside wall is between two rooms");
const top = project.walls.find((wall) => wall.levelId === ground && wall.start.y === 0 && wall.end.y === 0 && wall.end.x === 8000)!;
assert.equal(wallRooms(project, top.id).length, 1, "an outside wall has a room on one side only");
const insideLine = items.find((item) => item.id === inside.id)!;
assert.match(insideLine.value, /^6\.500 m · thickness 0\.120 m · height 3\.000 m$/, `a wall is its length, thickness and height (${insideLine.value})`);
assert.match(insideLine.label, /^Wall E \((Living Room \/ Room 2|Room 2 \/ Living Room)\)$/, `and named with the rooms it divides (${insideLine.label})`);

assert.equal(line("Door D1")?.value, "0.900 × 2.100 m", "doors are numbered with their size");
assert.equal(line("Window W1")?.value, "1.800 × 1.500 m · sill 0.900 m", "windows with their sill");
assert.equal(line("Bed")?.value, "1.600 × 2.000 m · height 0.500 m", "furniture with its footprint");
assert.equal(line("Measurement M1")?.value, "3.625 m", "a measurement is its length");

assert.equal(levelMeasurements(project, ground, "mm").find((item) => item.label === "Door D1")?.value, "900 × 2100 mm", "and in millimetres when the project is");

const text = measurementText(items.filter((item) => ["Door D1", "Measurement M1"].includes(item.label)), "Measure — Ground Floor");
assert.equal(text, "Measure — Ground Floor\nDoor D1: 0.900 × 2.100 m\nMeasurement M1: 3.625 m", "copied text is a heading and one line each");

// An L-shaped room is not "width × length": its size is its overall extent.
const ell = establishLevelOutline(base, ground, roomOutline("l-shape", { x: 0, y: 0 }, { x: 8000, y: 6000 }))!;
const ellRoom = levelMeasurements(ell, ground, "m").find((item) => item.group === "Rooms")!;
assert.match(ellRoom.value, /^overall 8\.00 × 6\.00 m · /, `an L says its size is overall (${ellRoom.value})`);

// Four corners do not make a rectangle: a skewed room is overall too.
const skewed = establishLevelOutline(base, ground, [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 7000, y: 4000 }, { x: 1000, y: 4000 }])!;
const skewedRoom = levelMeasurements(skewed, ground, "m").find((item) => item.group === "Rooms")!;
assert.match(skewedRoom.value, /^overall 7\.00 × 4\.00 m · 24\.00 m² · /, `a parallelogram is measured overall (${skewedRoom.value})`);

// Another floor is listed apart.
assert.equal(levelMeasurements(project, "floor-2").length, 0, "a floor with nothing on it lists nothing");

// The furniture catalogue: names, sizes, and every id unique.
assert.ok(FURNITURE_CATALOG.length >= 11);
assert.equal(new Set(FURNITURE_CATALOG.map((item) => item.id)).size, FURNITURE_CATALOG.length);
for (const item of FURNITURE_CATALOG) assert.ok(item.width > 0 && item.depth > 0 && item.height > 0, `${item.name} has a size`);
const placed = createHouseObjectFromGesture(project, "furniture", ground, { x: 1000, y: 1000 }, { x: 1000, y: 1000 }, { ...furnitureItem("toilet"), name: "Toilet" }).project.components.at(-1)!;
assert.equal(placed.name, "Toilet", "placed furniture keeps its catalogue name");
assert.deepEqual([placed.width, placed.depth], [400, 700], "and its size");

// A room drawn inside the house is measured too.
const withRoom = createRoomFromGesture(project, ground, { x: 4200, y: 4000 }, { x: 8000, y: 6500 }, "rectangle", { wallThickness: 120 }).project;
assert.ok(levelMeasurements(withRoom, ground, "m").filter((item) => item.group === "Rooms").length >= 3, "a new room appears in the list");

console.log("House measurements: units, labels, rooms either side of a wall, sizes, areas, perimeters, copied text, furniture catalogue");
