import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectOrthogonalWalls, imageBackgroundPolarity, IMAGE_IMPORT_KEY, MAX_RASTER_WALL_CANDIDATES } from "../src/features/house-designer/services/image-line-detection";

// Synthetic clean CAD-style horizontal and vertical wall lines on a white
// opaque background. The detector has no network or AI dependency.
function image(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}
function ink(source: ImageData, x1: number, y1: number, x2: number, y2: number) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++) {
      const i = (y * source.width + x) * 4;
      source.data[i] = source.data[i + 1] = source.data[i + 2] = 0;
    }
}
const drawing = image(350, 300);
ink(drawing, 30, 40, 270, 46);
ink(drawing, 150, 80, 156, 245);
const lines = detectOrthogonalWalls(drawing, 40);
assert.ok(lines.some(line => line.orientation === "h" && line.x2 - line.x1 > 220 && line.support >= 2), "detect horizontal wall");
assert.ok(lines.some(line => line.orientation === "v" && line.y2 - line.y1 > 140 && line.support >= 2), "detect vertical wall");
assert.ok(lines.length <= MAX_RASTER_WALL_CANDIDATES, "the hand-off never exceeds its plan size limit");
// Furniture, stairs and thin text outlines must not invent phantom walls on
// white paper plans in the default Walls Only scan mode.
const printed = image(420, 320);
ink(printed, 25, 50, 370, 57);   // heavy 8 px wall
ink(printed, 25, 130, 370, 131); // thin furniture line
const heavy = detectOrthogonalWalls(printed, 40, "light", true);
assert.ok(heavy.some(line => line.orientation === "h" && line.y1 >= 48 && line.y1 <= 60), "heavy structural wall detected");
assert.ok(!heavy.some(line => line.orientation === "h" && line.y1 >= 125 && line.y1 <= 138), "thin furniture line omitted");
const all = detectOrthogonalWalls(printed, 40, "light", false);
assert.ok(all.some(line => line.orientation === "h" && line.y1 >= 125 && line.y1 <= 138), "optional relaxed scan restores thin lines");
// Screenshot of a dark AutoCAD canvas: nearly the entire bitmap is black,
// white neutral strokes are WALL candidates, orange annotation is NOT one.
const blackCad = image(420, 360);
for (let i = 0; i < blackCad.data.length; i += 4)
  blackCad.data[i] = blackCad.data[i + 1] = blackCad.data[i + 2] = 0;
for (let y = 45; y <= 52; y++)
  for (let x = 40; x <= 360; x++) {
    const p = (y * blackCad.width + x) * 4;
    blackCad.data[p] = blackCad.data[p + 1] = blackCad.data[p + 2] = 230;
  }
for (let x = 70; x <= 77; x++)
  for (let y = 90; y <= 310; y++) {
    const p = (y * blackCad.width + x) * 4;
    blackCad.data[p] = blackCad.data[p + 1] = blackCad.data[p + 2] = 170;
  }
// Long orange dimension text line: exclude this CAD annotation color.
for (let y = 150; y <= 157; y++)
  for (let x = 120; x <= 410; x++) {
    const p = (y * blackCad.width + x) * 4;
    blackCad.data[p] = 240; blackCad.data[p + 1] = 113; blackCad.data[p + 2] = 24;
  }
assert.equal(imageBackgroundPolarity(blackCad), "dark", "detect CAD background automatically");
const darkLines = detectOrthogonalWalls(blackCad, 40);
assert.ok(darkLines.some(line => line.orientation === "h" && line.y1 >= 40 && line.y1 < 60), "find neutral horizontal CAD wall");
assert.ok(darkLines.some(line => line.orientation === "v" && line.x1 >= 65 && line.x1 <= 82), "find neutral vertical CAD wall");
assert.ok(!darkLines.some(line => line.orientation === "h" && line.y1 >= 140 && line.y1 <= 170), "exclude orange dimensions");
assert.ok(darkLines.length <= MAX_RASTER_WALL_CANDIDATES, "larger plans are limited by a reviewed candidate cap");
assert.throws(() => detectOrthogonalWalls(image(60, 60)), /80/, "avoid tiny images");
assert.equal(IMAGE_IMPORT_KEY, "medosha:house-image-detection:v1");

// The browser editor must keep the safety gates while supporting PDF and
// candidate editing; a future refactor must not silently send unverified
// geometry to the House Designer or a paid AI provider.
const importer = readFileSync("src/features/house-designer/components/image-to-3d-importer.tsx", "utf8");
assert.match(importer, /pdfPageCount\(/, "PDF page selection");
assert.match(importer, /mode === "crop"/, "mobile crop removes toolbars before scan");
assert.match(importer, /"door", "window", "stair", "furniture"/, "arch objects traced separately");
assert.match(importer, /symbols,/, "annotated geometry sent through native import hand-off");
assert.match(importer, /Walls only \(recommended\)/, "structural-only raster scan is enabled by default");
assert.match(importer, /Black CAD background/, "can force dark CAD scanning");
assert.match(importer, /detectOrthogonalWalls\(ctx\.getImageData\(0, 0, width, height\), minLength, polarity\)/, "initial scan uses selected polarity");

assert.match(importer, /renderPdfPage\(/, "local PDF rasterization");
assert.match(importer, /onPointerMove=\{pointerMove\}/, "touch endpoint drag");
assert.match(importer, /function removeSelected\(/, "remove false detections");
assert.match(importer, /function undoEdit\(/, "undo geometry review");
assert.match(importer, /mode === "add"/, "add missing segments");
assert.match(importer, /!calibrated\s*\|\|\s*!lines\.length\s*\|\|\s*lines\.length > MAX_REVIEWED_WALLS/, "reject unscaled or oversized drawing");
assert.match(importer, /\|\| !reviewed/, "mandatory visual review before 3D"); 
assert.match(importer, /parseDxfWallDrawing\(await file\.text\(\)\)/, "DXF direct vector import");
assert.match(importer, /selectedLayers/, "CAD layer filter");
assert.match(importer, /automaticCadScale/, "DXF units used instead of guessed pixel dimensions");
assert.match(importer, /router\.push\("\/house-design\?import=image"\)/, "existing 3D geometry editor hand-off");
assert.doesNotMatch(importer, /\/api\/house-design\/analyze-plan/, "never use the paid AI analysis endpoint");
console.log("PASS: non-AI raster wall detection and PDF/review hand-off safety checks.");
