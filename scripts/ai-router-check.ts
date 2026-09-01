/**
 * Medosha AI — does it understand what you asked for?
 *
 *   npm run check:ai-router
 *
 * The whole promise of the unified assistant is that nobody has to pick a
 * tool. That promise is kept or broken by one function, so this is the test
 * that matters most: every example from the brief, plus the phrasings people
 * actually use, plus the ones designed to trip it.
 *
 * Two failure modes are treated as much worse than the rest and are checked
 * hardest:
 *
 *   1. **Losing the building.** A facade or interior edit on a photograph must
 *      carry the geometry clause. Getting a different building back is the
 *      failure people notice in front of a client.
 *   2. **Spending a credit to answer a question.** Routing "how much does this
 *      cost" to an image model bills for a picture nobody wanted. Falling the
 *      other way — words where a picture was meant — costs a fraction of a
 *      credit and one follow-up.
 *
 * Nothing here calls a model. The router is a pure function, which is the
 * point of it being a pure function.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  agentFor,
  composeAiPrompt,
  routeRequest,
  shouldPreserveGeometry,
  GEOMETRY_CLAUSE,
  QUICK_ACTIONS,
  type AiCapability,
} from "../src/lib/ai/intent.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Asserts the capability a phrase lands on. */
function routes(
  text: string,
  hasImage: boolean,
  expected: AiCapability,
) {
  const route = routeRequest({ text, hasImage });
  check(
    `${hasImage ? "[img] " : ""}"${text}" → ${expected}`,
    route.capability === expected,
    `got ${route.capability} (${route.confidence})`,
  );
  return route;
}

/** Asserts only the family, where several capabilities would be acceptable. */
function routesToTask(text: string, hasImage: boolean, expected: "chat" | "image") {
  const route = routeRequest({ text, hasImage });
  check(
    `${hasImage ? "[img] " : ""}"${text}" is a ${expected} job`,
    route.task === expected,
    `got ${route.task} via ${route.capability}`,
  );
}

// ---------------------------------------------------------------------------
// 1. Every example the brief gave, verbatim
// ---------------------------------------------------------------------------

routes("Redesign this facade and make it modern.", true, "facade");
routes(
  "Keep the exact geometry but change the facade materials to stone and wood.",
  true,
  "facade",
);
routes("Turn this sketch into a realistic architectural render.", true, "sketch");
routes("Redesign my living room.", true, "interior");
routes("Make the kitchen modern with walnut cabinets.", true, "interior");
routes("Add warm architectural lighting.", true, "lighting");
routes("Add realistic landscaping.", true, "landscape");
routes("Render this floor plan as a furnished 3D view.", true, "floorplan");

routesToTask("Create a BOQ from this drawing.", false, "chat");
routesToTask("Estimate the construction cost.", false, "chat");
routesToTask("What is the current price of cement?", false, "chat");
routesToTask("Find suppliers for this material.", false, "chat");
routesToTask("Estimate the value of this 250 sqm property.", false, "chat");

routes("Create a BOQ from this drawing.", false, "boq");
routes("Estimate the construction cost.", false, "cost");
routes("What is the current price of cement?", false, "material-advice");
routes("Find suppliers for this material.", false, "suppliers");
routes("Estimate the value of this 250 sqm property.", false, "property");

// The three from the brief's worked example of internal identification.
routes("Change this facade to natural stone.", true, "facade");
routes("Keep the exact building shape and make it realistic.", true, "render");
routes("Make this room luxury.", true, "interior");

// And the conversation in section 12.
const villa = routeRequest({
  text: "Make this a modern Ethiopian villa. Keep the exact geometry.",
  hasImage: true,
});
check("the villa example is an image job", villa.task === "image");
check("and it holds the geometry", villa.preserveGeometry);

routes("Change the stone to darker gray.", true, "materials");
routes("Add warm lighting.", true, "lighting");

// ---------------------------------------------------------------------------
// 2. The expensive mistake: a question answered with a picture
// ---------------------------------------------------------------------------

for (const question of [
  "how much does this cost",
  "how much will it cost to build a 200sqm house",
  "what would it cost to build in Addis",
  "estimate the cost of this building",
  "bill of quantities for a two storey house",
  "who sells cement in Adama",
  "where can i buy rebar",
  "which material should i use for the roof",
  "what is the market value of this land",
]) {
  routesToTask(question, false, "chat");
}

// The same questions with a drawing attached are still questions. This is the
// one that a naive "image attached means image job" rule gets wrong, and it is
// exactly how somebody asks about a drawing they are holding.
for (const question of [
  "create a boq from this drawing",
  "estimate the construction cost of this",
  "what is the value of this property",
]) {
  routesToTask(question, true, "chat");
}

// ---------------------------------------------------------------------------
// 3. The damaging mistake: losing the building
// ---------------------------------------------------------------------------

for (const edit of [
  "make this modern and luxurious",
  "change the facade to natural stone",
  "redesign my living room",
  "make the front wall stone",
  "change the stone to darker gray",
  "add warm lighting",
  "make it look more expensive",
]) {
  const route = routeRequest({ text: edit, hasImage: true });
  check(`"${edit}" holds the geometry by default`, route.preserveGeometry);
  check(
    `and the prompt carries the clause`,
    composeAiPrompt(edit, route).includes("the same window and door positions"),
  );
}

// Asked for explicitly, the building may change.
for (const change of [
  "add a floor to this building",
  "make it taller",
  "change the shape of the roof",
  "add a balcony on the first floor",
  "redesign the whole building from scratch",
]) {
  check(
    `"${change}" releases the geometry`,
    !routeRequest({ text: change, hasImage: true }).preserveGeometry,
  );
}

// Said both ways, the explicit hold wins. Somebody who writes "keep the exact
// geometry" has been unambiguous and should be believed over a keyword.
check(
  "an explicit hold beats a change word",
  routeRequest({
    text: "keep the exact geometry but make it taller looking with darker cladding",
    hasImage: true,
  }).preserveGeometry,
);

// Nothing to preserve without an image.
check(
  "geometry is not preserved when there is no image",
  !routeRequest({ text: "design a modern villa facade", hasImage: false })
    .preserveGeometry,
);
check(
  "and the clause is not appended to a text-to-image prompt",
  !composeAiPrompt(
    "design a modern villa facade",
    routeRequest({ text: "design a modern villa facade", hasImage: false }),
  ).includes(GEOMETRY_CLAUSE),
);

// Utilities have no subject to hold.
check(
  "removing a background does not talk about geometry",
  !routeRequest({ text: "remove the background", hasImage: true })
    .preserveGeometry,
);
check(
  "nor does upscaling",
  !routeRequest({ text: "upscale this", hasImage: true }).preserveGeometry,
);

check(
  "the clause names things a model can see, not the word geometry alone",
  GEOMETRY_CLAUSE.includes("number of floors") &&
    GEOMETRY_CLAUSE.includes("window and door positions") &&
    GEOMETRY_CLAUSE.includes("camera"),
);

// ---------------------------------------------------------------------------
// 4. Utilities
// ---------------------------------------------------------------------------

routes("remove the background", true, "background-removal");
routes("cut out the background please", true, "background-removal");
routes("upscale this to a higher resolution", true, "upscale");

// Without an image there is nothing to remove a background from, so these must
// not silently become a generation.
check(
  "remove the background with no image is not an image job",
  routeRequest({ text: "remove the background", hasImage: false }).task === "chat",
);

check(
  "background removal asks for a model that can do it",
  routeRequest({ text: "remove the background", hasImage: true })
    .imageCapability === "background-removal",
);
check(
  "upscaling asks for an upscaler",
  routeRequest({ text: "upscale this", hasImage: true }).imageCapability ===
    "upscale",
);
check(
  "a surface swap asks for inpainting",
  routeRequest({ text: "change the floor to travertine", hasImage: true })
    .imageCapability === "inpaint",
);
check(
  "an edit with an image asks for image-to-image",
  routeRequest({ text: "make this modern", hasImage: true }).imageCapability ===
    "image-to-image",
);
check(
  "and a fresh design asks for text-to-image",
  routeRequest({ text: "design a modern villa facade", hasImage: false })
    .imageCapability === "text-to-image",
);

// ---------------------------------------------------------------------------
// 5. An attached image with words nothing matched
// ---------------------------------------------------------------------------

const vague = routeRequest({ text: "something nicer please", hasImage: true });
check("an image plus vague words is still an edit", vague.task === "image");
check("and it holds the geometry", vague.preserveGeometry);

// But an image with no words at all is not an instruction to do anything.
check(
  "an image with no words is not acted on",
  routeRequest({ text: "", hasImage: true }).task === "chat",
);

// ---------------------------------------------------------------------------
// 6. Confidence
// ---------------------------------------------------------------------------

const clear = routeRequest({
  text: "turn this sketch into a realistic architectural render",
  hasImage: true,
});
const murky = routeRequest({ text: "something nicer please", hasImage: true });

check(
  "a clear request is more confident than a vague one",
  clear.confidence > murky.confidence,
  `${clear.confidence} vs ${murky.confidence}`,
);
check("confidence stays in range", clear.confidence <= 1 && murky.confidence >= 0);
check(
  "every route carries a reading a person could read back",
  routeRequest({ text: "redesign my kitchen", hasImage: true }).reading.length >
    0,
);

// ---------------------------------------------------------------------------
// 7. Words route to the agents that already exist
// ---------------------------------------------------------------------------

check("cost goes to the cost agent", agentFor("cost") === "cost");
check("boq goes to the boq agent", agentFor("boq") === "boq");
check("materials go to the materials agent", agentFor("material-advice") === "materials");
check("suppliers go to the marketplace agent", agentFor("suppliers") === "marketplace");
check("documents go to the drawings agent", agentFor("documents") === "drawings");
// No property agent exists. Saying so out loud beats inventing one that is a
// construction agent wearing a hat.
check("property falls back to construction", agentFor("property") === "construction");
check("a general question pins no agent", agentFor("general") === undefined);
check("an image capability pins no agent", agentFor("facade") === undefined);

// ---------------------------------------------------------------------------
// 8. The chips are shortcuts, not modes
// ---------------------------------------------------------------------------

check("there are a handful of chips, not fifteen", QUICK_ACTIONS.length <= 8);
for (const action of QUICK_ACTIONS) {
  // The test that makes them shortcuts rather than modes: the phrase each one
  // inserts must route on its own, exactly as if it had been typed. If a chip
  // needed special handling it would be a mode wearing a chip's clothes.
  const route = routeRequest({
    text: action.phrase,
    hasImage: action.needsImage ?? false,
  });
  check(
    `the "${action.label}" chip routes as typed text`,
    route.capability !== "general",
    route.capability,
  );
}

check(
  "the redesign chip asks to keep the geometry",
  QUICK_ACTIONS.find((a) => a.id === "redesign")?.phrase.includes(
    "Keep the exact geometry",
  ) ?? false,
);

// ---------------------------------------------------------------------------
// 9. Nothing here is a mode the user has to choose
// ---------------------------------------------------------------------------

check(
  "shouldPreserveGeometry is exported so the server can re-derive it",
  typeof shouldPreserveGeometry === "function",
);

// ---------------------------------------------------------------------------
// 10. The navigation actually got simpler
//
// The brief listed thirteen rows to remove from primary navigation and was
// explicit that their functionality must survive. Both halves are checked:
// the rows are gone, and every tool they pointed at still exists and is still
// reachable.
// ---------------------------------------------------------------------------

const nav = readFileSync(
  join(import.meta.dirname, "../src/lib/workspace/navigation.ts"),
  "utf8",
);

const REMOVED = [
  "Redesign a Room",
  "Redesign My Space",
  "AI Image Generator",
  "Interior Design",
  "Interior Designer",
  "Facade Design",
  "Facade Designer",
  "Furniture Designer",
  "AI Image Editor",
  "Material Replacer",
  "Sketch → Render",
  "Floor Plan AI",
  "Floor Plan",
  "Landscape Designer",
  "Lighting Designer",
  "Product Renderer",
  "Background Remover",
  "Image Upscaler",
  "Rendering Assistant",
  "Project Planner",
];

for (const label of REMOVED) {
  check(
    `"${label}" is no longer a navigation row`,
    !nav.includes(`label: "${label}"`),
  );
}

check("Medosha AI is one row", nav.includes('label: "Medosha AI"'));
check(
  "and it points at the conversation, not a tool",
  /label: "Medosha AI"[\s\S]{0,200}?href: "\/ai"/.test(nav),
);

// The other half of the promise. Every tool that came out of the sidebar has
// to still exist behind /ai?tool=, or this was a deletion dressed as a
// simplification.
const studio = readFileSync(
  join(import.meta.dirname, "../src/lib/ai/studio.ts"),
  "utf8",
);

for (const tool of [
  "redesign",
  "image",
  "interior",
  "facade",
  "furniture",
  "editor",
  "materials",
  "sketch",
  "floorplan",
  "landscape",
  "lighting",
  "product",
  "background",
  "upscale",
]) {
  check(`the ${tool} workspace still exists`, studio.includes(`id: "${tool}"`));
}

const page = readFileSync(
  join(import.meta.dirname, "../src/app/ai/page.tsx"),
  "utf8",
);

check(
  "and ?tool= still opens it",
  page.includes("findTool(tool)") && page.includes("AiStudio"),
);
check(
  "while the conversation is what /ai gives you by default",
  page.includes("MedoshaAi"),
);
check(
  "?agent= still pins an assistant, so Construction links keep working",
  page.includes("AGENTS.includes"),
);

// The command palette is how somebody who learned the old names finds the new
// place. Losing the words would make the simplification feel like a removal.
for (const word of ["facade", "interior", "upscale", "background", "sketch"]) {
  check(`"${word}" still finds Medosha AI in the palette`, nav.includes(`"${word}"`));
}

check(
  "Berchuma Studio is its own section",
  nav.includes('label: "Berchuma Studio"'),
);
for (const row of ["Design Studio", "My Projects", "Gallery"]) {
  check(`with a ${row} row`, nav.includes(`label: "${row}"`));
}

for (const row of [
  "Cost Estimator",
  "BOQ Generator",
  "Material Advisor",
  "Supplier Finder",
  "AI Document Reader",
]) {
  check(`Construction keeps ${row}`, nav.includes(`label: "${row}"`));
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}medosha ai: understanding the request without being told which tool${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);
