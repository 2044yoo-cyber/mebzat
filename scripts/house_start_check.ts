import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { roomSchema } from "../src/features/berchuma-studio/types/room";
import { PLAN_TEMPLATES } from "../src/features/house-designer/services/plan-templates";
import { planDescriptionError } from "../src/features/house-designer/services/plan-analysis";
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

// ---------------------------------------------------------------------------
// Describe it (AI): validated, rate-limited, read like a detected plan.
// ---------------------------------------------------------------------------
assert.equal(planDescriptionError(undefined), "Describe the house you want.");
assert.ok(planDescriptionError("tiny"), "too short to draw anything from");
assert.ok(planDescriptionError("x".repeat(2001)), "too long");
assert.equal(planDescriptionError("A three-bedroom house, 12 by 10 metres"), null);
const generate = code("src/app/api/house-design/generate-plan/route.ts");
assert.match(generate, /const invalid = planDescriptionError\(body\.description\);\s*if \(invalid\) return NextResponse\.json\(\{ error: invalid \}, \{ status: 400 \}\)/, "the route refuses a description it cannot use");
assert.match(generate, /supabase\.rpc\("ai_feature_requests_in_window", \{ feature_name: "house_plan_generation"/, "it is rate limited");
assert.match(generate, /if \(!user\) return NextResponse\.json/, "and needs a signed-in person");
assert.match(generate, /for \(const \[index, provider\] of providerChain\(\)\.entries\(\)\)/, "it falls back through the text providers");
assert.match(generate, /const result = detectedPlanToRoom\(extractJson\(output\), \{ ceilingHeight \}\);/, "and its answer goes through the same checks as a detected plan");
assert.match(generate, /\$\{DETECTED_PLAN_SHAPE\}/, "asking for the same shape");
assert.match(route, /\$\{DETECTED_PLAN_SHAPE\}/, "as plan detection does");
const describe = open.slice(open.indexOf('if (nextSource === "describe")'));
assert.match(describe, /fetch\("\/api\/house-design\/generate-plan"[\s\S]{0,200}JSON\.stringify\(\{ description, ceilingHeight: floorHeight \}\)/, "the client sends the description");
assert.match(describe, /roomSchema\.safeParse\(payload\.plan\)/, "and checks what comes back before using it");

// Strict has no switch on screen any more, so it starts off.
assert.match(workspace, /const \[strict, setStrict\] = useState\(false\);/, "Original Floor Plan Strict starts off");
assert.doesNotMatch(workspace, /Design setup/, "and the setup panel is gone");

// Structure is never generated automatically — not on open, Finish, restore
// or from a command.
assert.match(open, /const built = ensureHouseBimState\(\{ \.\.\.withoutStructure\(applyModelingOptions\(createHouseProject\(/, "a template, upload or description starts without structure");
const verify = workspace.slice(workspace.indexOf("<VerifyScreen"), workspace.indexOf("/>", workspace.indexOf("<VerifyScreen")));
assert.match(verify, /onDone=\{\(\) => \{ setStage\("model"\); setView\("3d"\); \}\}/, "finishing the design only changes the view");
const restoreFn = workspace.slice(workspace.indexOf("function restore()"), workspace.indexOf("\n  }\n", workspace.indexOf("function restore()")));
assert.match(restoreFn, /const restored = ensureHouseBimState\(withoutStructure\(/, "a restored draft comes back without generated structure");
assert.doesNotMatch(restoreFn, /ensurePhaseFourProject\(/, "and none is generated for it");
for (const path of ["src/features/house-designer/components/house-designer-workspace.tsx", "src/features/house-designer/components/house-structure-panel.tsx", "src/features/house-designer/services/project-edit.ts", "src/features/house-designer/services/model-state.ts", "src/features/house-designer/services/command-registry.ts", "src/features/house-designer/components/house-modeling-chrome.tsx"]) {
  assert.doesNotMatch(code(path), /\b(generateStructureFromGrid|generatePreliminaryStructure|ensurePhaseFourProject|buildStructuralColumns|buildStructuralBeams)\(/, `${path} generates no structure`);
  assert.doesNotMatch(code(path), /"generate-structure"/, `${path} offers no generate-structure command`);
}
assert.doesNotMatch(code("src/features/house-designer/services/model-state.ts"), /id: `foundation:\$\{column\.id\}`/, "no footings are made up for columns");

console.log("House start: templates are valid, hosted plans; sketches reach the model as sketches");
