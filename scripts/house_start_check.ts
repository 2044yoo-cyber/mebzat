import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { roomSchema } from "../src/features/berchuma-studio/types/room";
import { PLAN_TEMPLATES } from "../src/features/house-designer/services/plan-templates";
import { createHouseProject, houseProjectSchema } from "../src/features/house-designer/types/project";

// ---------------------------------------------------------------------------
// Templates are real plans: valid, hosted, inside their outline.
// ---------------------------------------------------------------------------
assert.ok(PLAN_TEMPLATES.length >= 3);
for (const template of PLAN_TEMPLATES) {
  const plan = template.build();
  assert.ok(roomSchema.safeParse(plan).success, `${template.id} is a valid plan`);
  const project = createHouseProject({ title: template.name, room: plan, style: "modern", strict: false, floorCount: 1, floorToFloorHeight: 3000 });
  assert.ok(houseProjectSchema.safeParse(project).success, `${template.id} builds a valid project`);
  for (const opening of [...project.doors, ...project.windows]) {
    const wall = project.walls.find((item) => item.id === opening.wallId);
    assert.ok(wall, `${template.id}: ${opening.id} is in a wall`);
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    assert.ok(opening.offset >= 0 && opening.offset + opening.width <= length, `${template.id}: ${opening.id} fits its wall`);
  }
  const xs = plan.corners.map((corner) => corner.x);
  const ys = plan.corners.map((corner) => corner.y);
  for (const zone of plan.zones ?? []) {
    assert.ok(zone.boundary.every((point) => point.x >= Math.min(...xs) && point.x <= Math.max(...xs) && point.y >= Math.min(...ys) && point.y <= Math.max(...ys)), `${template.id}: ${zone.name} is inside the house`);
  }
  assert.equal(project.rooms.length, plan.zones?.length, `${template.id}: every room it names exists`);
  assert.ok(project.doors.some((door) => plan.corners.some((corner) => door.wallId.endsWith(`:${corner.id}`))), `${template.id}: there is a way in`);
}
assert.equal(new Set(PLAN_TEMPLATES.map((template) => template.id)).size, PLAN_TEMPLATES.length, "template ids are unique");

// ---------------------------------------------------------------------------
// A hand sketch reaches the model as a sketch. Checked on the calls, with
// comments stripped, scoped to the function that makes them.
// ---------------------------------------------------------------------------
const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const workspace = code("src/features/house-designer/components/house-designer-workspace.tsx");
const open = workspace.slice(workspace.indexOf("async function openVerification("), workspace.indexOf("function restore()"));
assert.match(open, /fetch\("\/api\/house-design\/analyze-plan"/, "the client calls plan analysis");
assert.match(open, /JSON\.stringify\(\{[^}]*kind: nextSource === "sketch" \? "sketch" : "plan"/, "and says whether it is a sketch");
assert.match(open, /if \(uploaded && ai && plan\?\.mediaType === "image"\)/, "AI runs only when asked for");
const route = code("src/app/api/house-design/analyze-plan/route.ts");
assert.match(route, /text: body\.kind === "sketch" \? SKETCH_INSTRUCTION : /, "the route reads a sketch differently");
assert.match(route, /const SKETCH_INSTRUCTION = \[[\s\S]*hand-drawn sketch/, "and says so to the model");

console.log("House start: templates are valid, hosted plans; sketches reach the model as sketches");
