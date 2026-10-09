import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dxfWallPreview,
  extractDxfWallDrawing,
  MAX_REVIEWED_WALLS,
} from "../src/features/house-designer/services/dxf-wall-import";

// Small architectural DXF-like parsed fixture. All coordinates are ORIGINAL
// CAD units, not pixels; exact drawing scale must survive the preview step.
const mmDrawing = extractDxfWallDrawing({
  header: { "$INSUNITS": 4 }, // Millimetres
  entities: [
    { type: "LINE", layer: "A-WALL", vertices: [{ x: 0, y: 0 }, { x: 5000, y: 0 }] },
    { type: "LWPOLYLINE", layer: "A-WALL", vertices: [
      { x: 5000, y: 0 }, { x: 5000, y: 3000 }, { x: 0, y: 3000 },
    ] },
    { type: "LINE", layer: "A-DIM", vertices: [{ x: 0, y: -600 }, { x: 5000, y: -600 }] },
    { type: "LINE", layer: "FURNITURE", vertices: [{ x: 800, y: 500 }, { x: 2400, y: 500 }] },
    { type: "ARC", layer: "A-WALL", vertices: [{ x: 0, y: 0 }, { x: 200, y: 200 }] },
    { type: "LWPOLYLINE", layer: "A-WALL", vertices: [
      { x: 0, y: 0, bulge: 1 }, { x: 0, y: 3000 },
    ] },
  ],
});
assert.equal(mmDrawing.mmPerDrawingUnit, 1, "read $INSUNITS as millimetres");
assert.equal(mmDrawing.segments.length, 5, "extract only straight LINE and POLYLINE edges, not arcs");
assert.ok(mmDrawing.skipped >= 2, "report ignored arcs and bulged polyline edges");
assert.ok(mmDrawing.layers.find(layer => layer.name === "A-WALL")?.suggested);
assert.equal(mmDrawing.layers.find(layer => layer.name === "A-DIM")?.suggested, false);
assert.equal(mmDrawing.layers.find(layer => layer.name === "FURNITURE")?.suggested, false);

const wallsOnly = dxfWallPreview(mmDrawing, new Set(["A-WALL"]));
assert.equal(wallsOnly.total, 3, "selected wall layers only");
assert.equal(wallsOnly.lines.length, 3);
assert.ok(wallsOnly.lines.every(line => line.layer === "A-WALL"), "no dimension/furniture line is imported");
assert.ok(wallsOnly.mmPerPixel !== null);
const main = wallsOnly.lines.find(line => line.orientation === "h" && line.x2 > line.x1)!;
assert.ok(Math.abs((main.x2 - main.x1) * wallsOnly.mmPerPixel! - 5000) < 0.01, "a 5m wall keeps its actual length");
assert.ok(wallsOnly.lines.some(line => line.orientation === "v"), "polyline edges preserved");

const full = dxfWallPreview(mmDrawing, new Set(["A-WALL", "A-DIM", "FURNITURE"]));
assert.equal(full.total, 5, "all layers available for deliberate manual selection");
assert.ok(full.lines.some(line => line.layer === "A-DIM"), "dimension line exists only if selected");
assert.equal(dxfWallPreview(mmDrawing, new Set()).total, 0, "no silently chosen geometry");

// Unitless DXF must require explicit scale calibration before 3D.
const unitless = extractDxfWallDrawing({
  header: { "$INSUNITS": 0 },
  entities: [{ type: "LINE", layer: "0", vertices: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }],
});
assert.equal(dxfWallPreview(unitless, new Set(["0"])).mmPerPixel, null);
assert.equal(unitless.layers[0]?.suggested, true, "unlabelled CAD layer remains selectable");

// A huge CAD file must not silently truncate its geometry for a 3D import.
const crowded = extractDxfWallDrawing({
  header: { "$INSUNITS": 4 },
  entities: Array.from({ length: MAX_REVIEWED_WALLS + 8 }, (_, i) => ({
    type: "LINE", layer: "A-WALL",
    vertices: [{ x: i * 20, y: 0 }, { x: i * 20, y: 500 }],
  })),
});
const crowdedPreview = dxfWallPreview(crowded, new Set(["A-WALL"]));
assert.equal(crowdedPreview.total, MAX_REVIEWED_WALLS + 8);
assert.equal(crowdedPreview.lines.length, MAX_REVIEWED_WALLS + 1, "one extra candidate signals oversized import");
assert.ok(crowdedPreview.total > MAX_REVIEWED_WALLS, "must narrow CAD layers before importing");

// Wiring: the handoff validates max size before building the saved 3D model.
const house = readFileSync("src/features/house-designer/components/house-designer-workspace.tsx", "utf8");
assert.match(house, /payload\.lines\.length > MAX_REVIEWED_WALLS/, "hard limit enforced at 3D handoff");
console.log("DXF import: layer filters, 1:1 units, polyline extraction, skipped arcs and import limits passed.");
