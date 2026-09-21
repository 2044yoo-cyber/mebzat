import assert from "node:assert/strict";
import { wardrobeShapeDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve";
import { readFileSync } from "node:fs";

const ownershipSpec = wardrobeShapeDesign({ shape: "l_shaped", walls: [2724, 1543], depth: 600, height: 2400 });
const ownership = resolveDesign(ownershipSpec);
const [runA, runB] = ownershipSpec.runs;
assert.equal(ownership.layout.corners[0]?.ownerRunId, runB?.id);
assert.equal(ownership.layout.corners[0]?.width, 600);
assert.equal(ownership.layout.corners[0]?.depth, 600);
assert.equal(ownership.layout.placements.find(p => p.runId === runA?.id)?.usableLength, 2124);
assert.equal(ownership.layout.placements.find(p => p.runId === runB?.id)?.usableLength, 1543);
assert.equal(ownership.cabinets.find(c => c.runId === runA?.id)?.cabinet.size.width, 2124);
assert.equal(ownership.cabinets.find(c => c.runId === runB?.id)?.cabinet.size.width, 1543);
const ownershipParts = buildParts(ownershipSpec).parts;
assert.ok(!ownershipParts.some(p => p.id.startsWith("corner-ab/")), "hosted corner has no third carcass");
assert.ok(ownershipParts.some(p => p.cabinetId === "corner-ab" && p.role === "shelf"), "host shelf selects the editable corner");
assert.ok(!ownershipParts.some(p => p.label === "Corner access rear support"), "both run ends retain full vertical MDF");
assert.ok(ownershipParts.filter(p => p.role === "gable").every(p => p.size.z > 500), "end gables retain cabinet depth");

const uSpec = wardrobeShapeDesign({ shape: "u_shaped", walls: [1543, 3000, 1800], depth: 600, height: 2400 });
const u = resolveDesign(uSpec);
assert.equal(u.layout.corners[0]?.ownerRunId, uSpec.runs[0]?.id);
assert.equal(u.layout.corners[1]?.ownerRunId, uSpec.runs[2]?.id);
assert.deepEqual(u.layout.corners.map(c => [c.width, c.depth]), [[600, 600], [600, 600]]);
assert.deepEqual(u.layout.placements.map(p => p.usableLength), [1543, 1800, 1800]);

const tightU = resolveDesign(wardrobeShapeDesign({ shape: "u_shaped", walls: [1200, 900, 1200], depth: 600, height: 2400 }));
assert.deepEqual(tightU.layout.corners.map(c => [c.width, c.depth]), [[600, 600], [600, 600]], "host corners remain square");

for (const shape of ["l_shaped", "u_shaped"] as const) {
  const spec = wardrobeShapeDesign({ shape, walls: shape === "u_shaped" ? [1800, 3000, 1800] : [3000, 1800], depth: 600, height: 2400 });
  const ids = shape === "u_shaped" ? ["corner-left", "corner-right"] : ["corner-ab"];
  for (const id of ids) {
    const resized = buildParts({ ...spec, cornerKinds: { [id]: "diagonal" }, cornerSettings: { [id]: { width: 650.5, depth: 700.25 } } }).parts.filter(p => p.cabinetId === id);
    const resizedDoor = resized.find(p => p.id.endsWith("/diagonal-face"))!;
    const resizedShelf = resized.find(p => p.footprint)!;
    assert.ok(resizedShelf);
    assert.ok(Math.abs(resizedDoor.size.x - Math.hypot(resizedShelf.size.x, resizedShelf.size.z)) < 0.001, "resized diagonal follows both dimensions");
    for (const kind of ["l_corner", "hanging", "diagonal", "custom"] as const) {
      const edited = { ...spec, cornerKinds: { [id]: kind } };
      const all = buildParts(edited).parts;
      const parts = all.filter(p => p.cabinetId === id);
      if (kind === "diagonal") {
        assert.ok(parts.length > 0);
        const door = parts.find(p => p.id.endsWith("/diagonal-face"))!;
        assert.ok(door);
        const angle = door.rotationY! * Math.PI / 180;
        const a = door.placements[0];
        const b = { x: a.x + door.size.x * Math.cos(angle), z: a.z + door.size.x * Math.sin(angle) };
        assert.ok(Math.abs(b.x - a.x - 564) < 0.001);
        assert.ok(Math.abs(Math.abs(b.z - a.z) - 576) < 0.001);
        assert.equal(Math.sign(b.z - a.z), id === "corner-left" ? -1 : 1);
        const shelves = parts.filter(p => p.role === "shelf" || p.role === "top");
        assert.ok(shelves.length >= 3);
        assert.ok(shelves.every(p => p.footprint?.length === 3), "Show inside retains triangular silhouette");
        assert.ok(shelves.every(p => p.footprint!.every(v => v.x >= 0 && v.x <= p.size.x && v.z >= 0 && v.z <= p.size.z)));
        assert.ok(shelves.every(p => p.length === p.size.x && p.width === p.size.z), "cut list retains full cutting blanks");
      } else {
        assert.ok(!parts.some(p => p.role === "door"));
        assert.equal(parts.filter(p => p.role === "rail").length, kind === "hanging" ? 2 : 0);
        assert.ok(parts.length > 0, "host storage remains the corner selection target");
        assert.ok(!parts.some(p => p.id.startsWith(`${id}/`) && p.role !== "rail"), "open corner has no separate carcass");
      }
    }
  }
}
const model = readFileSync("src/features/berchuma-studio/components/viewer/model.tsx", "utf8");
assert.match(model, /new THREE\.ExtrudeGeometry\(shape/);
assert.match(model, /<primitive object=\{shapedGeometry\} attach="geometry"/);
console.log("PASS: independent corner types, mirrored diagonal endpoints, visible triangular interiors, cutting blanks and active renderer");
