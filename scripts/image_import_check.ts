import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectOrthogonalWalls, IMAGE_IMPORT_KEY } from "../src/features/house-designer/services/image-line-detection";

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
assert.ok(lines.length <= 80, "the hand-off never exceeds its plan size limit");
assert.throws(() => detectOrthogonalWalls(image(60, 60)), /80/, "avoid tiny images");
assert.equal(IMAGE_IMPORT_KEY, "medosha:house-image-detection:v1");

// The browser editor must keep the safety gates while supporting PDF and
// candidate editing; a future refactor must not silently send unverified
// geometry to the House Designer or a paid AI provider.
const importer = readFileSync("src/features/house-designer/components/image-to-3d-importer.tsx", "utf8");
assert.match(importer, /pdfPageCount\(/, "PDF page selection");
assert.match(importer, /renderPdfPage\(/, "local PDF rasterization");
assert.match(importer, /onPointerMove=\{pointerMove\}/, "touch endpoint drag");
assert.match(importer, /function removeSelected\(/, "remove false detections");
assert.match(importer, /function undoEdit\(/, "undo geometry review");
assert.match(importer, /mode === "add"/, "add missing segments");
assert.match(importer, /!calibrated \|\| !lines\.length \|\| lines\.length > 80 \|\| !reviewed/, "mandatory scale and review");
assert.match(importer, /router\.push\("\/house-design\?import=image"\)/, "existing 3D geometry editor hand-off");
assert.doesNotMatch(importer, /\/api\/house-design\/analyze-plan/, "never use the paid AI analysis endpoint");
console.log("PASS: non-AI raster wall detection and PDF/review hand-off safety checks.");
