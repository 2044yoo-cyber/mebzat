import assert from "node:assert/strict";
import { wardrobeShapeDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { readFileSync } from "node:fs";

for (const shape of ["l_shaped", "u_shaped"] as const) {
  const spec = wardrobeShapeDesign({ shape, walls: shape === "u_shaped" ? [1800, 3000, 1800] : [3000, 1800], depth: 600, height: 2400 });
  const ids = shape === "u_shaped" ? ["corner-left", "corner-right"] : ["corner-ab"];
  const original = buildParts(spec).parts;
  for (const id of ids) {
    const resized = buildParts({ ...spec, cornerKinds: { [id]: "diagonal" }, cornerSettings: { [id]: { width: 650.5, depth: 700.25 } } }).parts.filter(p => p.cabinetId === id);
    const resizedDoor = resized.find(p => p.id.endsWith("/diagonal-face"))!;
    const resizedShelf = resized.find(p => p.footprint)!;
    assert.ok(resizedShelf);
    assert.ok(Math.abs(resizedDoor.size.x - Math.hypot(resizedShelf.size.x, resizedShelf.size.z)) < 0.001, "resized diagonal follows both dimensions");
    for (const kind of ["l_corner", "hanging", "diagonal", "custom"] as const) {
      const edited = { ...spec, cornerKinds: { [id]: kind } };
      const all = buildParts(edited).parts;
      assert.deepEqual(all.filter(p => p.cabinetId !== id), original.filter(p => p.cabinetId !== id), "only selected corner changes");
      const parts = all.filter(p => p.cabinetId === id);
      assert.ok(parts.length > 0);
      if (kind === "diagonal") {
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
        assert.equal(parts.some(p => p.role === "rail"), kind === "hanging");
        assert.equal(parts.some(p => p.id.endsWith("/corner-shelves")), kind !== "hanging");
      }
    }
  }
}
const model = readFileSync("src/features/berchuma-studio/components/viewer/model.tsx", "utf8");
assert.match(model, /new THREE\.ExtrudeGeometry\(shape/);
assert.match(model, /<primitive object=\{shapedGeometry\} attach="geometry"/);
console.log("PASS: independent corner types, mirrored diagonal endpoints, visible triangular interiors, cutting blanks and active renderer");
