/**
 * Everything about the xAI integration that can be checked without calling it.
 *
 *   npx tsx scripts/xai-check.ts
 *
 * The live calls — does the key work, does Grok answer, does an image come
 * back — need network access to api.x.ai and a real key, so they live in
 * `scripts/xai-doctor.ts`, which is run on the machine that has both.
 *
 * What is checked here is everything that would still be wrong if the key were
 * perfect: the query parser, the provider wiring, and the one property that
 * matters more than any of it — that XAI_API_KEY cannot reach the browser.
 */

// First, and deliberately: it patches module resolution so the imports below
// can reach `router.ts`, which is server-only. See the file for why.
import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  hasAmharic,
  looksLikeProperty,
  normalise,
  parsePropertyQuery,
} from "../src/lib/ai/property-query.ts";
import { looksLikeVision } from "../src/lib/ai/vision-models.ts";
import { friendlyProviderMessage, worthFallingBack } from "../src/lib/ai/failure.ts";
import { openPropertyId } from "../src/lib/ai/open-property.ts";
import { boundsOf } from "../src/lib/map/ai-highlight.ts";
import { routeAgent } from "../src/lib/ai/router.ts";
import {
  AUTO_PREFERENCE,
  autoChain,
  findModel,
} from "../src/lib/ai/image-models.ts";
import {
  actionFrom,
  buildArchitecturalPrompt,
} from "../src/lib/ai/architectural-prompt.ts";
import { classifyXai, messageFor } from "../src/lib/ai/xai-images.ts";
import { memberMessageFor } from "../src/lib/ai/provider-status.ts";
import {
  CATEGORY_ORDER,
  DEFAULT_SETTINGS,
  RENDER_OPTIONS,
  RENDER_PRESETS,
  applyPreset,
  findOption,
  optionsIn,
} from "../src/lib/ai/rendering/options.ts";
import {
  EDIT_LOCK,
  GEOMETRY_LOCK,
  KNOWLEDGE,
  RENDERING_KNOWLEDGE_VERSION,
} from "../src/lib/ai/rendering/knowledge.ts";
import {
  composeRenderPrompt,
  resolveConflicts,
} from "../src/lib/ai/rendering/compose.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** The gazetteer names the parser is given at runtime, in miniature. */
const PLACES = [
  "Bole Medhanialem",
  "Bole",
  "CMC",
  "Megenagna",
  "Summit",
  "Ayat",
  "Sarbet",
  "Gerji",
];

/* -------------------------------------------------------------------------- */
/* The five questions from the brief                                          */
/* -------------------------------------------------------------------------- */

const english = parsePropertyQuery("Show me 3 bedroom apartments in Bole.", PLACES);
check("english: three bedrooms", english.bedrooms === 3, `${english.bedrooms}`);
check("english: Bole", english.place === "Bole", `${english.place}`);
check(
  "english: no price invented",
  english.minPrice === null && english.maxPrice === null,
  `${english.minPrice} / ${english.maxPrice}`,
);

const cap = parsePropertyQuery("Find rentals under 50,000 ETB in Addis Ababa.", PLACES);
check("cap: rent", cap.kind === "rent", `${cap.kind}`);
check("cap: 50000 as a ceiling", cap.maxPrice === 50_000, `${cap.maxPrice}`);
check("cap: no floor", cap.minPrice === null, `${cap.minPrice}`);
check(
  "cap: the comma did not split the number",
  cap.maxPrice !== 50 && cap.maxPrice !== 0,
  `${cap.maxPrice}`,
);

const amharic = parsePropertyQuery("ቦሌ ውስጥ የሚከራይ 3 መኝታ ቤት አሳየኝ", PLACES);
check("amharic: detected as amharic", hasAmharic("ቦሌ ውስጥ የሚከራይ 3 መኝታ ቤት አሳየኝ"));
check("amharic: three bedrooms", amharic.bedrooms === 3, `${amharic.bedrooms}`);
check("amharic: Bole", amharic.place === "Bole", `${amharic.place}`);
check("amharic: rent", amharic.kind === "rent", `${amharic.kind}`);
check("amharic: reads as property", looksLikeProperty("ቦሌ ውስጥ የሚከራይ 3 መኝታ ቤት አሳየኝ"));

const amharicCap = parsePropertyQuery(
  "ቦሌ ውስጥ 3 መኝታ ቤት ከ50 ሺህ ብር በታች አሳየኝ",
  PLACES,
);
check("amharic cap: three bedrooms", amharicCap.bedrooms === 3, `${amharicCap.bedrooms}`);
check("amharic cap: 50,000 ceiling", amharicCap.maxPrice === 50_000, `${amharicCap.maxPrice}`);
check("amharic cap: Bole", amharicCap.place === "Bole", `${amharicCap.place}`);

const mixed = parsePropertyQuery("bole lay 3 bedroom rent 50k laye", PLACES);
check("mixed: three bedrooms", mixed.bedrooms === 3, `${mixed.bedrooms}`);
check("mixed: Bole", mixed.place === "Bole", `${mixed.place}`);
check("mixed: rent", mixed.kind === "rent", `${mixed.kind}`);
check("mixed: 50k is fifty thousand", mixed.maxPrice === 50_000, `${mixed.maxPrice}`);
check(
  "mixed: 'laye' did not become a search term",
  !mixed.terms.includes("laye") && !mixed.terms.includes("lay"),
  mixed.terms.join(","),
);

/* -------------------------------------------------------------------------- */
/* The failures that look like an empty database                              */
/* -------------------------------------------------------------------------- */

// Every one of these returns zero rows if parsed wrongly, and zero rows reads
// as "Medosha has no stock" rather than as a bug.
const bedroomOnly = parsePropertyQuery("3 bedroom house", PLACES);
check(
  "a bedroom count is never read as a price",
  bedroomOnly.maxPrice === null && bedroomOnly.minPrice === null,
  `${bedroomOnly.maxPrice}`,
);

const twoMillion = parsePropertyQuery("villa for sale under 2m", PLACES);
check("2m is two million", twoMillion.maxPrice === 2_000_000, `${twoMillion.maxPrice}`);
check("and it is a sale", twoMillion.kind === "sale", `${twoMillion.kind}`);

const millionWord = parsePropertyQuery("house under 2 million birr", PLACES);
check(
  "'million' beats the bare 'm'",
  millionWord.maxPrice === 2_000_000,
  `${millionWord.maxPrice}`,
);

const range = parsePropertyQuery("rentals between 20k and 50k", PLACES);
check("a range reads as a range", range.minPrice === 20_000 && range.maxPrice === 50_000,
  `${range.minPrice} / ${range.maxPrice}`);

const backwards = parsePropertyQuery("rentals between 50k and 20k", PLACES);
check(
  "a backwards range is straightened rather than emptied",
  backwards.minPrice === 20_000 && backwards.maxPrice === 50_000,
  `${backwards.minPrice} / ${backwards.maxPrice}`,
);

const longest = parsePropertyQuery("apartments in Bole Medhanialem", PLACES);
check(
  "the longest place name wins",
  longest.place === "Bole Medhanialem",
  `${longest.place}`,
);

const both = parsePropertyQuery("rent to buy scheme", PLACES);
check(
  "a question naming both rent and sale filters on neither",
  both.kind === null,
  `${both.kind}`,
);

const nothing = parsePropertyQuery("hello medosha", PLACES);
check("a greeting matches nothing", !nothing.matched);
check("and does not look like property", !looksLikeProperty("Hello Medosha."));

check(
  "a cement question is not a property question",
  !looksLikeProperty("What is the price of cement?"),
);
check(
  "but a rental question is",
  looksLikeProperty("Find rentals under 50,000 ETB in Addis Ababa."),
);

check(
  "amharic digits are converted",
  normalise("፫ መኝታ").startsWith("3"),
  normalise("፫ መኝታ"),
);

/* -------------------------------------------------------------------------- */
/* Provider wiring                                                            */
/* -------------------------------------------------------------------------- */

const provider = readFileSync("src/lib/ai/provider.ts", "utf8");

check(
  "xai is in the provider registry",
  /name:\s*"xai"/.test(provider),
);
check(
  "and points at the xAI endpoint",
  /https:\/\/api\.x\.ai\/v1\/chat\/completions/.test(provider),
);
check(
  "and reads XAI_API_KEY",
  /process\.env\.XAI_API_KEY/.test(provider),
);
check(
  "and the model comes from XAI_MODEL",
  /process\.env\.XAI_MODEL/.test(provider),
);
check(
  "xai is first in the fallback order",
  /const FALLBACK_ORDER[^=]*=\s*\[\s*"xai"/.test(provider),
  "a configured Grok should be tried before anything else",
);
check(
  "an XAI_API_KEY alone selects xai",
  /process\.env\.XAI_API_KEY\s*\?\s*"xai"/.test(provider),
  "otherwise the key is set and nothing uses it",
);

check("grok-4.5 is recognised as a vision model", looksLikeVision("grok-4.5"));
check("grok-4 too", looksLikeVision("grok-4"));
check(
  "grok-3 is not — it is text only",
  !looksLikeVision("grok-3"),
  "claiming vision here tells somebody their photo was read when it was not",
);

/* -------------------------------------------------------------------------- */
/* The key never reaches the browser                                          */
/* -------------------------------------------------------------------------- */

// The single most important check in this file. Everything else is a bug; this
// one is a published secret.
const clientFiles = [
  "src/lib/ai/image-models.ts",
  "src/lib/ai/property-query.ts",
  "src/lib/ai/studio.ts",
  "src/lib/ai/quick-actions.ts",
  "src/components/ai/medosha-ai.tsx",
  "src/components/ai/ai-chat.tsx",
];

for (const file of clientFiles) {
  const source = readFileSync(file, "utf8");

  // The *value*, not the name. `image-models.ts` carries the string
  // "XAI_API_KEY" so the provider manager can tell somebody which variable to
  // set, exactly as it does for FAL_KEY and OPENAI_API_KEY. That is a label.
  // `process.env.XAI_API_KEY` in a file the browser can reach is a secret.
  check(
    `${file} never reads the value of XAI_API_KEY`,
    !/process\.env\.XAI_API_KEY/.test(source),
    "this file is reachable from the browser bundle",
  );
  check(
    `${file} has no NEXT_PUBLIC_XAI variable`,
    !/NEXT_PUBLIC_XAI/.test(source),
  );
}

// And the label really is only a label: nothing in the catalogue reads any
// XAI_* value out of the environment.
check(
  "the client-safe image catalogue reads no XAI_* environment value",
  !/process\.env\.XAI/.test(readFileSync("src/lib/ai/image-models.ts", "utf8")),
);

check(
  "no file anywhere defines NEXT_PUBLIC_XAI_API_KEY",
  !/NEXT_PUBLIC_XAI_API_KEY/.test(
    ["src/lib/ai/provider.ts", "src/lib/ai/image-provider.ts", ".env.example"]
      .map((file) => {
        try {
          return readFileSync(file, "utf8");
        } catch {
          return "";
        }
      })
      .join("\n"),
  ),
);

const imageProvider = readFileSync("src/lib/ai/image-provider.ts", "utf8");
check(
  "the image adapter is server-only",
  /^import "server-only";/m.test(imageProvider),
);
check(
  "the chat provider is server-only",
  /^import "server-only";/m.test(provider),
);
check(
  "the xai image adapter exists",
  /async function generateXai/.test(imageProvider),
);
// The endpoint itself moved into `xai-images.ts` when editing was added — the
// adapter now composes a prompt and delegates, rather than holding a URL of its
// own — so that is where the wire format is checked.
const xaiService = readFileSync("src/lib/ai/xai-images.ts", "utf8");

check(
  "the adapter delegates to the xAI image service",
  /generateXaiImages\(/.test(imageProvider),
);
check(
  "and the service calls the xAI images endpoint",
  /\$\{API\}\/images\/generations/.test(xaiService) &&
    /const API = "https:\/\/api\.x\.ai\/v1"/.test(xaiService),
);
check(
  "and does not send `size`, `quality` or `style`, which xAI rejects",
  !/\bsize:/.test(xaiService) &&
    !/\bquality:/.test(xaiService) &&
    !/\bstyle:/.test(xaiService),
);
check(
  "and asks for base64 rather than a URL",
  /response_format: "b64_json"/.test(xaiService),
  "an xAI image URL expires, and the whole carry-forward workflow depends on the last image still being there",
);
check(
  "the image model is discovered rather than hardcoded",
  /\$\{API\}\/models/.test(xaiService) && /XAI_IMAGE_MODEL/.test(xaiService),
  "xAI renames image models; a pinned name is a feature that works until it does not",
);

/* -------------------------------------------------------------------------- */
/* Routing — a property question must reach the property agent                */
/* -------------------------------------------------------------------------- */

// The agent decides which tables are queried. A listing question routed to the
// construction agent retrieves nothing, and a model handed no listings and
// asked about Bole will describe one from memory.
const ROUTES: [string, string][] = [
  ["Show me 3 bedroom apartments in Bole.", "properties"],
  ["Find rentals under 50,000 ETB in Addis Ababa.", "properties"],
  ["ቦሌ ውስጥ የሚከራይ 3 መኝታ ቤት አሳየኝ", "properties"],
  ["bole lay 3 bedroom rent 50k laye", "properties"],
  ["Show me the cheapest rentals in Bole.", "properties"],
  ["Which properties are near CMC?", "properties"],
  // And the ones that must NOT move: this agent was added to an existing
  // router, and a new agent with sixty triggers is a good way to steal every
  // other agent's questions.
  ["What is the price of cement?", "materials"],
  ["How much would it cost to build a 200 m² house?", "cost"],
  ["Give me a bill of quantities for a villa", "boq"],
];

for (const [question, expected] of ROUTES) {
  const agent = routeAgent(question);
  check(
    `routes "${question.slice(0, 40)}" to ${expected}`,
    agent.name === expected,
    `got ${agent.name}`,
  );
}

const propertyAgent = routeAgent("Show me 3 bedroom apartments in Bole.");
check(
  "the property agent retrieves listings",
  propertyAgent.needs.includes("properties"),
  propertyAgent.needs.join(","),
);
check(
  "and is cold enough not to round a price",
  propertyAgent.temperature <= 0.3,
  `${propertyAgent.temperature}`,
);

/* -------------------------------------------------------------------------- */
/* Error handling                                                             */
/* -------------------------------------------------------------------------- */

const CASES: [number, RegExp][] = [
  [401, /credentials|API key/i],
  [402, /credit/i],
  [429, /rate-limit/i],
  [404, /model/i],
  [408, /too long/i],
  [503, /outage/i],
  [0, /could not reach/i],
];

for (const [status, pattern] of CASES) {
  const message = friendlyProviderMessage(status, "xai");
  check(`${status} explains itself`, pattern.test(message), message);
  check(
    `${status} names the provider`,
    message.includes("Grok") || message.includes("too large"),
    message,
  );
}

// Every message, for every status, must be free of anything a provider might
// have echoed back. This is the check that would catch somebody "improving"
// the mapper by appending the raw body.
for (const status of [400, 401, 402, 404, 408, 413, 422, 429, 500, 502, 503, 504, 0, 599]) {
  const message = friendlyProviderMessage(status, "xai");
  check(
    `${status} leaks no key material`,
    !/bearer|authorization|sk-|xai-|api[_-]?key\s*[:=]/i.test(message),
    message,
  );
  check(`${status} is a sentence, not a dump`, message.length < 200, `${message.length} chars`);
}

check(
  "a malformed request does not walk the whole provider chain",
  !worthFallingBack(400) && !worthFallingBack(422) && !worthFallingBack(413),
);
check(
  "but a rate limit does",
  worthFallingBack(429) && worthFallingBack(503) && worthFallingBack(401),
);

/* -------------------------------------------------------------------------- */
/* The open property                                                          */
/* -------------------------------------------------------------------------- */

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
check(
  "a property page yields its id",
  openPropertyId(`/property/${UUID}`) === UUID,
);
check(
  "and so does a sub-route of it",
  openPropertyId(`/property/${UUID}/photos`) === UUID,
);
check("the browse page yields nothing", openPropertyId("/property") === null);
check(
  "and neither does the create form",
  openPropertyId("/property/new") === null,
  "otherwise 'new' is looked up as a listing id on every render",
);
check("nor another section", openPropertyId("/marketplace/123") === null);
check("nor a missing path", openPropertyId(null) === null);

/* -------------------------------------------------------------------------- */
/* Map highlighting                                                           */
/* -------------------------------------------------------------------------- */

check("no pins, no bounds", boundsOf([]) === null);

const onePin = boundsOf([{ id: "a", latitude: 9.01, longitude: 38.78 }]);
check("one pin is padded into a box", onePin !== null && onePin.north > onePin.south);
check(
  "and the box is around the pin, not the equator",
  onePin !== null && onePin.south > 8.9 && onePin.north < 9.1,
  JSON.stringify(onePin),
);

const twoPins = boundsOf([
  { id: "a", latitude: 9.01, longitude: 38.78 },
  { id: "b", latitude: 9.03, longitude: 38.82 },
]);
check(
  "two pins give the box that holds both",
  twoPins !== null &&
    twoPins.south === 9.01 &&
    twoPins.north === 9.03 &&
    twoPins.west === 38.78 &&
    twoPins.east === 38.82,
  JSON.stringify(twoPins),
);

check(
  "a pin with no coordinates does not drag the box to zero",
  (() => {
    const box = boundsOf([
      { id: "a", latitude: 9.01, longitude: 38.78 },
      { id: "b", latitude: Number.NaN, longitude: Number.NaN },
    ]);
    return box !== null && box.south > 8.9;
  })(),
);

const canvas = readFileSync("src/components/property/city-canvas.tsx", "utf8");
check(
  "the map dims non-matches only while a search is running",
  /highlightIds\.size === 0 \? ""/.test(canvas),
  "otherwise every marker is a non-match on first load and the map dims to 45%",
);
check(
  "a match is marked by a halo, not by a colour swap",
  !/data-ai-match="true"[^}]*background:/.test(canvas),
  "the marker's colour is its price band; overwriting it would break the legend",
);

/* -------------------------------------------------------------------------- */
/* The listings the map gets are the ones the database returned               */
/* -------------------------------------------------------------------------- */

const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
check(
  "the route sends the searched listings, not parsed output",
  /listings: context\.pins/.test(route),
);
check(
  "the route accepts a property id",
  /propertyIdFrom\(body\.propertyId\)/.test(route),
);
check(
  "and validates it as a uuid before looking it up",
  /propertyIdFrom/.test(route) && /\{8\}-\[0-9a-f\]\{4\}/.test(route),
);
check(
  "the raw provider error is logged, not streamed",
  /console\.error\(/.test(route) && /friendlyProviderMessage\(/.test(route),
);
check(
  "the last error text never reaches the error frame",
  !/frame\("error",\s*\{\s*message:\s*`[^`]*lastError/.test(route),
);

const tools = readFileSync("src/lib/ai/property-tools.ts", "utf8");
check("the property tools are server-only", /^import "server-only";/m.test(tools));
check(
  "an unreachable table is not reported as an empty one",
  /could not be reached/.test(tools),
  "otherwise a database outage reads as 'Medosha has no listings'",
);
check(
  "the tools reuse the existing property reader",
  /from "@\/lib\/data\/properties"/.test(tools),
  "a second query layer is a second set of privacy rules to get wrong",
);
check(
  "rentals are a listing_kind, not a separate table",
  /listing_kind|kinds/.test(tools) && !/rentals_table|from\("rentals"\)/.test(tools),
);


/* -------------------------------------------------------------------------- */
/* The reported failure: Grok could not be reached by the router              */
/* -------------------------------------------------------------------------- */

// The bug was not the key and not the adapter. `grok-image` existed, the xAI
// adapter existed, and the model appeared in no AUTO_PREFERENCE list — so a
// deployment with XAI_API_KEY and nothing else built an *empty* chain for every
// intent, and an empty chain surfaces as "no provider" or, once the probe has
// also failed, as the key being rejected.
{
  const grok = findModel("grok-image");
  check("the Grok image model exists", grok !== undefined);

  // The intents the architecture features actually use.
  const architectural = [
    "exterior",
    "interior",
    "edit",
    "general",
    "sketch",
    "product",
  ] as const;

  for (const intent of architectural) {
    const chain = autoChain(intent, ["xai"]);
    check(
      `an xAI-only deployment can generate for "${intent}"`,
      chain.length > 0,
      "this is the reported failure: the chain was empty, so nothing was ever called",
    );
    check(
      `and Grok is the model it picks for "${intent}"`,
      chain[0]?.id === "grok-image",
      `picked ${chain[0]?.id ?? "nothing"}`,
    );
  }

  // The two it must stay out of. Grok cannot upscale and cannot cut out a
  // background; listing it there would be a button that promises a thing it
  // cannot do.
  for (const intent of ["upscale", "background-removal"] as const) {
    check(
      `Grok is not offered for "${intent}"`,
      !(AUTO_PREFERENCE[intent] ?? []).includes("grok-image"),
      "no text-to-image model can do a pixel utility",
    );
    check(
      `and an xAI-only deployment offers nothing for "${intent}"`,
      autoChain(intent, ["xai"]).length === 0,
      "better to say so than to return a different picture",
    );
  }

  // Editing has to be declared, or the router sends every uploaded photo
  // somewhere else and an xAI-only deployment can never edit anything.
  check(
    "Grok declares image-to-image",
    grok?.capabilities.includes("image-to-image") === true,
  );
  check(
    "and does not claim inpainting",
    grok?.capabilities.includes("inpaint") !== true,
    "a mask needs real pixels; a text-to-image endpoint cannot honour one",
  );
}

/* -------------------------------------------------------------------------- */
/* The architectural prompt                                                   */
/* -------------------------------------------------------------------------- */

{
  const description =
    "A four-storey apartment block, five window bays, red painted render, balconies on floors two and three, photographed straight on at eye level in flat midday light.";

  const materials = buildArchitecturalPrompt({
    instruction: "Make the red walls white.",
    description,
    action: "materials",
  });

  // The member's words, exactly. An assistant that paraphrases the instruction
  // is an assistant that quietly changes it.
  check(
    "the member's instruction is carried verbatim",
    materials.includes("Make the red walls white."),
  );
  check(
    "what Grok saw is in the prompt",
    materials.includes(description),
    "without it the model has nothing to preserve from and draws a different building",
  );

  // Every noun the brief names, present rather than summarised as "geometry".
  for (const kept of [
    "the same building form",
    "number of floors",
    "window positions",
    "balconies",
    "roof form",
    "proportions",
    "camera position",
  ]) {
    check(`a material change preserves ${kept}`, materials.includes(kept));
  }

  const lighting = buildArchitecturalPrompt({
    instruction: "Add warm evening lighting.",
    description,
    action: "lighting",
  });
  check(
    "a lighting change preserves the materials",
    /every material and colour exactly as described/.test(lighting),
    "otherwise 'add evening light' comes back with different walls",
  );

  const render = buildArchitecturalPrompt({
    instruction: "Make this an ultra-realistic architectural render.",
    description,
    action: "render",
  });
  check(
    "a render refuses to restyle",
    /do not redesign, do not restyle/i.test(render),
    "the input is usually a SketchUp screenshot and the member wants this building",
  );
  check(
    "a render asks for photorealism",
    render.includes("photorealistic architectural visualization") &&
      render.includes("ambient occlusion") &&
      render.includes("reflections"),
  );

  const redesign = buildArchitecturalPrompt({
    instruction: "Redesign this building with a modern luxury facade.",
    description,
    action: "redesign",
  });
  check(
    "a redesign still holds the footprint and the floor count",
    /same building footprint/.test(redesign) && /same number of floors/.test(redesign),
    "'redesign the facade' is not 'demolish it'",
  );

  // From nothing there is nothing to preserve, and preservation language would
  // be a lie about an image that does not exist.
  const fresh = buildArchitecturalPrompt({
    instruction: "Create a modern luxury villa.",
    action: "generate",
  });
  check(
    "a from-nothing prompt adds no preservation clause",
    !fresh.includes("the same camera position"),
  );
  check(
    "a from-nothing prompt is still the member's words",
    fresh.includes("Create a modern luxury villa."),
  );

  // A sketch is not a photograph.
  const sketch = buildArchitecturalPrompt({
    instruction: "Draw a quick concept sketch of a villa.",
    action: "generate",
  });
  check(
    "a sketch request is not forced into photorealism",
    !sketch.includes("photorealistic architectural visualization"),
  );
}

/* -------------------------------------------------------------------------- */
/* Reading the member's words                                                 */
/* -------------------------------------------------------------------------- */

{
  // The seven prompts the brief asks to be tested, as far as they can be
  // tested without a network: that each is read as the right kind of change.
  const cases: [string, string][] = [
    ["Make the red walls white.", "materials"],
    ["Change the exterior material to natural stone.", "materials"],
    ["Make this an ultra-realistic architectural render.", "render"],
    ["Add warm evening lighting.", "lighting"],
    ["Redesign this building with a modern luxury facade.", "redesign"],
  ];

  for (const [text, expected] of cases) {
    const got = actionFrom(text, true);
    check(`"${text}" reads as ${expected}`, got === expected, `read as ${got}`);
  }

  check(
    "with no image attached, everything is a fresh generation",
    actionFrom("Make the red walls white.", false) === "generate",
    "there is nothing to edit",
  );

  // The safe default. An instruction about an image that matches nothing is
  // still an edit, and the safest edit changes least.
  check(
    "an unrecognised instruction still edits rather than redesigns",
    actionFrom("Tidy this up a bit.", true) === "materials",
  );
}

/* -------------------------------------------------------------------------- */
/* What a member is told when it fails                                        */
/* -------------------------------------------------------------------------- */

{
  // The four sentences the brief specifies, reached from the statuses that
  // actually produce them.
  check(
    "a missing key tells the member to contact the administrator",
    messageFor("not_configured") ===
      "Medosha AI is not configured. Please contact the administrator.",
  );
  check(
    "a rejected key says the same thing",
    messageFor("invalid_key") ===
      "Medosha AI is not configured. Please contact the administrator.",
    "a member cannot tell a missing key from a wrong one, and cannot fix either",
  );
  check(
    "an empty balance says so",
    messageFor("no_credit") ===
      "Medosha AI is temporarily unavailable because the AI credit balance is insufficient.",
  );
  check(
    "a bad upload asks for a different file",
    messageFor("bad_image") === "Please upload a supported image.",
  );
  check(
    "a provider failure asks them to try again",
    messageFor("provider_error") ===
      "Medosha AI could not generate the image. Please try again.",
  );

  // The property that matters most: no sentence a member reads may name the
  // provider, the endpoint, or an environment variable. "xAI did not accept its
  // API key" was the complaint, and it named all three kinds of thing at once.
  const failures = [
    "not_configured",
    "invalid_key",
    "no_credit",
    "rate_limited",
    "model_unavailable",
    "bad_image",
    "unreachable",
    "provider_error",
    "no_image",
  ] as const;

  for (const failure of failures) {
    const message = messageFor(failure);
    check(
      `the message for "${failure}" names no provider or variable`,
      !/xai|x\.ai|grok|api[_ ]key|openai|groq|token|bearer|http \d/i.test(message),
      message,
    );
  }

  const statuses = [
    "missing_key",
    "invalid_key",
    "no_access",
    "quota_exceeded",
    "rate_limited",
    "model_unavailable",
    "network_error",
    "provider_down",
    "unchecked",
  ] as const;

  for (const status of statuses) {
    const message = memberMessageFor(status);
    check(
      `the chain's message for "${status}" names no provider`,
      !/xai|x\.ai|grok|api key|openai|groq|fal|replicate|stability/i.test(message),
      message,
    );
  }

  check(
    "nothing a member reads still says a key was not accepted",
    !failures.some((failure) => /did not accept/i.test(messageFor(failure))) &&
      !statuses.some((status) => /did not accept/i.test(memberMessageFor(status))),
    "this is the exact sentence that was reported",
  );
}

/* -------------------------------------------------------------------------- */
/* Classifying what xAI said                                                  */
/* -------------------------------------------------------------------------- */

{
  check("401 is a rejected key", classifyXai(401, "") === "invalid_key");
  check("402 is an empty balance", classifyXai(402, "") === "no_credit");
  check(
    "403 about credit is an empty balance, not a bad key",
    classifyXai(403, "Your team has insufficient credits") === "no_credit",
    "telling somebody to check the key when the account is empty sends them the wrong way",
  );
  check(
    "403 with no explanation is a bad key",
    classifyXai(403, "forbidden") === "invalid_key",
  );
  check("404 is a missing model", classifyXai(404, "") === "model_unavailable");
  check("429 is a rate limit", classifyXai(429, "slow down") === "rate_limited");
  check(
    "429 about quota is an empty balance",
    classifyXai(429, "monthly quota exceeded") === "no_credit",
    "one recovers by waiting and the other never does",
  );
  check(
    "a 400 about the image blames the image",
    classifyXai(400, "could not decode image") === "bad_image",
  );
  check(
    "a 400 about the model blames the model",
    classifyXai(400, "unknown model") === "model_unavailable",
  );
}

/* -------------------------------------------------------------------------- */
/* The key stays on the server                                                */
/* -------------------------------------------------------------------------- */

{
  const xaiImages = readFileSync("src/lib/ai/xai-images.ts", "utf8");

  check(
    "the xAI image service is server-only",
    /^import "server-only";/m.test(xaiImages),
    "without it a client import is a runtime leak rather than a build error",
  );
  check(
    "it reads XAI_API_KEY from the environment",
    /process\.env\.XAI_API_KEY/.test(xaiImages),
  );
  check(
    "it never reads a NEXT_PUBLIC key",
    !/NEXT_PUBLIC_XAI/.test(xaiImages),
  );
  check(
    "the key is only ever an Authorization header",
    !/XAI_API_KEY[^\n]*(?:body|JSON\.stringify|console\.|return )/.test(xaiImages),
  );

  // The model catalogue ships to the browser. Nothing named XAI_ may be read
  // in it, because Next inlines process.env at build time and an env read in a
  // client module is an env value in the bundle.
  const models = readFileSync("src/lib/ai/image-models.ts", "utf8");
  check(
    "the client-side model catalogue reads no XAI_ variable",
    !/process\.env\.XAI/.test(models),
  );

  const prompt = readFileSync("src/lib/ai/architectural-prompt.ts", "utf8");
  check(
    "the prompt builder is server-only",
    /^import "server-only";/m.test(prompt),
  );
  check(
    "and holds no key of its own",
    !/process\.env\.[A-Z_]*KEY/.test(prompt),
  );

  // Nowhere in the whole tree.
  const componentsWithXai = readFileSync("src/lib/ai/image-provider.ts", "utf8");
  check(
    "the image adapter is server-only",
    /^import "server-only";/m.test(componentsWithXai),
  );
}

/* -------------------------------------------------------------------------- */
/* Editing acts on the supplied image                                         */
/* -------------------------------------------------------------------------- */

{
  const adapter = readFileSync("src/lib/ai/image-provider.ts", "utf8");

  // Call syntax, not the bare name: the identifier appears in the import line
  // and in the comments whether or not it is ever used.
  check(
    "an uploaded image is read before anything is generated",
    /readImageWithGrok\(/.test(adapter),
    "otherwise 'make the walls white' generates an unrelated building",
  );
  check(
    "and the reading is what the prompt is built from",
    /buildArchitecturalPrompt\(\{[\s\S]{0,200}description,/.test(adapter),
  );

  // The failure mode this guards: a vision read that fails must fail the
  // request, not fall through to a text-only generation that returns somebody
  // else's building while the member believes it is theirs.
  const editBlock = adapter.slice(
    adapter.indexOf("if (request.image) {"),
    adapter.indexOf("const full = ["),
  );
  check(
    "a failed read is not swallowed",
    !/catch/.test(editBlock),
    "falling back to text-only here is how an edit becomes a different building",
  );
}


/* -------------------------------------------------------------------------- */
/* Images survive a reload                                                    */
/* -------------------------------------------------------------------------- */

// The regression this fixes: switching xAI to base64 stopped its URLs expiring
// and stopped the images persisting at all, because the history refuses to
// write a data URL to localStorage — correctly, since a handful would exhaust
// the quota. The bytes now go to a bucket and the history keeps a path.
{
  const history = readFileSync("src/lib/ai/image-history.ts", "utf8");
  const storage = readFileSync("src/lib/ai/image-storage.ts", "utf8");
  const route = readFileSync("src/app/api/ai/image/route.ts", "utf8");

  check(
    "the image service is server-only",
    /^import "server-only";/m.test(storage),
  );

  // Call syntax rather than the bare name: the identifier is in the import line
  // and the comments either way.
  check(
    "generated images are stored before they are announced",
    /storeImages\(/.test(route),
    "a browser handed a picture it cannot get back tomorrow is the bug being fixed",
  );
  check(
    "and on both response shapes",
    (route.match(/storeImages\(/g) ?? []).length >= 2,
    "the stream and the plain JSON are two paths and both return images",
  );

  check(
    "a stored image is durable even though its url is base64",
    /item\.path === undefined &&/.test(history),
    "this exact condition is the regression: without it every xAI image is thrown away on reload",
  );
  check(
    "the path is what gets persisted, not the signed url",
    /entry\.storagePath \? \{ \.\.\.entry, url: "" \}/.test(history),
    "a signed url written to storage is a broken image by morning",
  );
  check(
    "an entry with a path is not dropped on the way back in",
    /typeof entry\.storagePath === "string"/.test(history),
  );
  check(
    "and it is signed again after hydration",
    /refreshStoredUrls\(\)/.test(history),
  );

  // Uploaded with the member's own client, so the row-level policy is doing
  // real work rather than describing an intention.
  check(
    "uploads go through the member's session, not the service role",
    !/SERVICE_ROLE/.test(storage),
    "the service role bypasses the bucket policy, and a policy nothing exercises is one nobody notices breaking",
  );

  // The path arrives from localStorage, which a member can edit.
  check(
    "a path outside the member's own folder is refused",
    /if \(!path\.startsWith\(`\$\{userId\}\/`\)\) return null;/.test(storage),
  );
  check(
    "every stored object is written under the member's id",
    /const path = `\$\{userId\}\//.test(storage),
  );
}

/* -------------------------------------------------------------------------- */
/* The bucket itself                                                          */
/* -------------------------------------------------------------------------- */

{
  const migration = readFileSync(
    "supabase/migrations/0050_ai_images_bucket.sql",
    "utf8",
  );

  check(
    "the AI image bucket is private",
    /'ai-images',\s*\n\s*'ai-images',\s*\n\s*false,/.test(migration),
    "it holds the photograph somebody took of their own half-built house",
  );
  check(
    "it is created idempotently",
    /on conflict \(id\) do nothing/.test(migration),
    "a migration that fails on second application is one nobody can re-run",
  );

  // Four policies, and every one of them keyed on the folder rather than on
  // the bucket alone. A policy that checks only `bucket_id` would let any
  // signed-in member read every other member's renders.
  for (const action of ["select", "insert", "update", "delete"]) {
    check(
      `members have a ${action} policy`,
      new RegExp(`for ${action} to authenticated`).test(migration),
    );
  }

  const folderChecks = (
    migration.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g) ??
    []
  ).length;
  check(
    "every policy is keyed on the member's own folder",
    // Four policies, and update has both a `using` and a `with check`.
    folderChecks >= 5,
    `${folderChecks} folder conditions found`,
  );
  check(
    "no policy is satisfied by knowing a filename",
    !/using \(\s*bucket_id = 'ai-images'\s*\)/.test(migration),
  );

  // Nothing destructive. The brief has said so every time and it stays true.
  check(
    "the migration drops nothing",
    !/\bdrop\s+(table|policy|bucket|schema)\b/i.test(migration),
  );
  check(
    "and disables no row-level security",
    !/disable row level security/i.test(migration),
  );
}


/* -------------------------------------------------------------------------- */
/* AI Sketch to 3D Render — the knowledge, and where it is allowed to go       */
/* -------------------------------------------------------------------------- */

// The single most important property in this feature: the client picks the word
// "Rain" and never sees the paragraph behind it. That is enforced by which file
// a thing lives in, so the checks are about files as much as behaviour.
{
  const options = readFileSync("src/lib/ai/rendering/options.ts", "utf8");
  const knowledge = readFileSync("src/lib/ai/rendering/knowledge.ts", "utf8");
  const compose = readFileSync("src/lib/ai/rendering/compose.ts", "utf8");
  const workspace = readFileSync(
    "src/components/ai/render/sketch-workspace.tsx",
    "utf8",
  );

  check(
    "the knowledge table is server-only",
    /^import "server-only";/m.test(knowledge),
    "without it a single import from the workspace ships every instruction to the browser",
  );
  check(
    "the prompt builder is server-only",
    /^import "server-only";/m.test(compose),
  );
  check(
    "the option list is NOT server-only",
    !/^import "server-only";/m.test(options),
    "the panel renders these labels; marking it server-only would break the build instead of protecting anything",
  );

  // The mechanism, stated as a check: the client component must not import the
  // hidden knowledge, directly or through the composer.
  // Import syntax, not the bare path. Both files are named in the comments at
  // the top of the workspace — explaining *why* they cannot be imported — and
  // matching the path alone fails on the explanation rather than on an import.
  const imports = (source: string): string[] =>
    [...source.matchAll(/(?:^|\n)\s*import[\s\S]*?from\s+"([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );

  const workspaceImports = imports(workspace);

  check(
    "the workspace does not import the knowledge table",
    !workspaceImports.some((path) => path.includes("rendering/knowledge")),
    workspaceImports.filter((path) => path.includes("rendering")).join(", "),
  );
  check(
    "and does not import the prompt builder",
    !workspaceImports.some((path) => path.includes("rendering/compose")),
  );
  check(
    "the workspace imports only the labels",
    workspaceImports.some((path) => path.includes("rendering/options")),
  );

  // Belt and braces on the option list itself: no sentence in it may describe
  // how to render anything. These are the words that give a hidden instruction
  // away, and they have no business in a file of labels.
  const giveaways = [
    "photorealistic",
    "ambient occlusion",
    "global illumination",
    "wet pavement",
    "roughness",
    "reflectance",
    "diffuse",
    "atmospheric perspective",
  ];
  for (const word of giveaways) {
    check(
      `the option list does not leak "${word}"`,
      !new RegExp(word, "i").test(options),
      "labels are words somebody picks; instructions belong in knowledge.ts",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Every option is wired to an instruction                                    */
/* -------------------------------------------------------------------------- */

{
  // An option in the panel with no entry in the table is a button that looks
  // like it does something and does nothing at all — the worst kind, because it
  // fails silently and the render simply comes back ignoring the choice.
  const missing = RENDER_OPTIONS.filter((option) => !KNOWLEDGE[option.id]);
  check(
    "every option in the panel has a hidden instruction",
    missing.length === 0,
    missing.map((option) => option.id).join(", "),
  );

  // And the reverse: an instruction nobody can reach.
  const orphaned = Object.keys(KNOWLEDGE).filter((id) => !findOption(id));
  check(
    "every hidden instruction belongs to a real option",
    orphaned.length === 0,
    orphaned.join(", "),
  );

  check(
    "every category has options",
    CATEGORY_ORDER.every((category) => optionsIn(category).length > 0),
  );

  // The defaults have to be real ids or the first render is built from nothing.
  const badDefaults = Object.values(DEFAULT_SETTINGS.selections)
    .flat()
    .filter((id) => !findOption(id));
  check(
    "the default settings name real options",
    badDefaults.length === 0,
    badDefaults.join(", "),
  );

  // Presets only move controls. A preset naming an id the panel cannot show is
  // a hidden setting, which is the thing the brief says presets must not be.
  const badPreset = RENDER_PRESETS.flatMap((preset) =>
    Object.values(preset.selections)
      .flat()
      .filter((id) => !findOption(id))
      .map((id) => `${preset.id}:${id}`),
  );
  check(
    "presets only set options the panel can show",
    badPreset.length === 0,
    badPreset.join(", "),
  );

  check(
    "applying a preset leaves every other setting alone",
    (() => {
      const preset = RENDER_PRESETS[0]!;
      const applied = applyPreset(
        { ...DEFAULT_SETTINGS, instruction: "keep me", preserveDesign: true },
        preset,
      );
      return applied.instruction === "keep me" && applied.preserveDesign;
    })(),
  );
}

/* -------------------------------------------------------------------------- */
/* Conflicts are settled quietly                                              */
/* -------------------------------------------------------------------------- */

{
  // Night plus natural daylight is a reasonable pair of clicks and nonsense
  // together. The panel never scolds; night simply wins.
  const night = resolveConflicts(["night", "natural"]);
  check(
    "night beats natural daylight",
    night.kept.includes("night") && !night.kept.includes("natural"),
    night.kept.join(", "),
  );

  const foggy = resolveConflicts(["clear", "fog"]);
  check(
    "fog beats clear",
    foggy.kept.includes("fog") && !foggy.kept.includes("clear"),
  );

  const rainy = resolveConflicts(["rain", "clear-blue"]);
  check(
    "rain beats a clear blue sky",
    rainy.kept.includes("rain") && !rainy.kept.includes("clear-blue"),
  );

  // The one the brief singles out as legitimate. Warm low sun through breaking
  // rain is real, and a compatibility system that forbids it is too blunt.
  const golden = resolveConflicts(["golden-hour", "rain"]);
  check(
    "golden hour and rain are both kept",
    golden.kept.includes("golden-hour") && golden.kept.includes("rain"),
    "this combination is valid and a blunt conflict rule would destroy it",
  );

  check(
    "nothing overrules itself",
    Object.entries(KNOWLEDGE).every(
      ([id, entry]) => !(entry.overrules ?? []).includes(id),
    ),
  );

  // An option is only dropped if the member picked the thing that beats it.
  const alone = resolveConflicts(["natural"]);
  check(
    "an option alone is never dropped",
    alone.kept.includes("natural") && alone.overruled.length === 0,
  );
}

/* -------------------------------------------------------------------------- */
/* The composed prompt                                                        */
/* -------------------------------------------------------------------------- */

{
  const description =
    "A four-storey block, five window bays, red render, balconies on floors two and three.";

  const composed = composeRenderPrompt({
    settings: {
      selections: {
        scene: ["exterior"],
        time: ["golden-hour"],
        weather: ["rain"],
        lighting: ["warm"],
        style: ["modern"],
        materials: ["white-stucco", "natural-stone"],
        quality: ["high"],
      },
      preserveDesign: true,
      creative: "strict",
      instruction: "Make the entrance wall stone.",
    },
    description,
  });

  check(
    "the reading of the source image comes first",
    composed.prompt.indexOf(description) === 0 ||
      composed.prompt.indexOf(description) < 80,
    "without it there is nothing to preserve from",
  );
  check(
    "the client's own words appear verbatim",
    composed.prompt.includes("Make the entrance wall stone."),
    "an assistant that paraphrases the instruction is one that changes it",
  );
  check(
    "the hidden instructions are expanded, not the labels",
    composed.prompt.includes("wet pavement") &&
      composed.prompt.includes("golden highlights"),
  );
  check(
    "several materials all reach the prompt",
    composed.prompt.includes("plaster texture") &&
      composed.prompt.includes("colour variation between pieces"),
    "materials is the one multi-select category and dropping all but one would be silent",
  );
  // The prompt must end on preservation, whichever form applies: the ordinary
  // rule, or — under the geometry lock — the shorter, harder closing line that
  // follows it. Both are preservation; the lock is the stronger of the two.
  const ends = composed.prompt.trim();
  check(
    "preservation is stated last",
    ends.endsWith("everything else must be reproduced as it is.") ||
      ends.endsWith("Any change to its geometry is a failure."),
    `ends with: ${ends.slice(-60)}`,
  );
  check(
    "and the ordinary preservation rule is still in there",
    composed.prompt.includes("everything else must be reproduced as it is."),
  );
  check(
    "the version is stamped on the result",
    composed.version === RENDERING_KNOWLEDGE_VERSION,
  );

  // Turning preservation off must actually remove the rule, or the toggle is a
  // decoration.
  const loose = composeRenderPrompt({
    settings: {
      selections: { style: ["modern"] },
      preserveDesign: false,
      creative: "creative",
      instruction: "Reimagine it.",
    },
    description,
  });
  check(
    "preservation off removes the preservation rule",
    !loose.prompt.includes("Preserve the existing design exactly"),
  );
  check(
    "and creative freedom changes the licence given",
    loose.prompt.includes("room to interpret"),
  );

  // A render with no instruction is legitimate — the settings are the request.
  const silent = composeRenderPrompt({
    settings: { ...DEFAULT_SETTINGS, instruction: "" },
    description,
  });
  check(
    "settings alone are enough to render",
    silent.prompt.length > 200 && !silent.prompt.includes("The client asks:"),
  );
}

/* -------------------------------------------------------------------------- */
/* The render route                                                           */
/* -------------------------------------------------------------------------- */

{
  const route = readFileSync("src/app/api/ai/render/route.ts", "utf8");

  check(
    "the render route reads the image before composing",
    /readImageWithGrok\(/.test(route),
  );
  // Both comment styles stripped. The route's own comment says the prompt is
  // deliberately absent from the response, and matching that comment would fail
  // the check on the sentence explaining why it passes.
  const routeCode = route
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // The prompt legitimately appears once — passed to Grok, which is the whole
  // point. What matters is that it never appears in what is sent *back*, so the
  // check reads the response payloads rather than the whole file.
  const responses = [
    ...routeCode.matchAll(/NextResponse\.json\(([\s\S]*?)\n    \)/g),
    ...routeCode.matchAll(/NextResponse\.json\((\{[\s\S]*?\n    \})\)/g),
  ]
    .map((match) => match[1] ?? "")
    .join("\n");

  check(
    "the route does hand the prompt to Grok",
    /prompt: composed\.prompt/.test(routeCode),
    "otherwise none of the rendering knowledge reaches the model at all",
  );
  check(
    "and never returns it to the browser",
    responses.length > 0 &&
      !/composed\.prompt/.test(responses) &&
      !/overruled/.test(responses),
    "a debugging field is how hidden instructions leak",
  );
  check(
    "credits are held before the work",
    /holdCredits\(/.test(route),
  );
  check(
    "and refunded when nothing was produced",
    /hold\.refund\(/.test(route),
    "charging for a render that failed is the thing members notice first",
  );
  check(
    "the image is stored so it survives a reload",
    /storeImages\(/.test(route),
  );
  check(
    "the knowledge version is recorded with the image",
    /knowledge_version: composed\.version/.test(route),
  );
  check(
    "preservation defaults to on when the field is missing",
    /body\.preserveDesign !== false/.test(route),
    "defaulting the other way means a dropped field quietly redesigns a building",
  );
}


/* -------------------------------------------------------------------------- */
/* Strict mode is a geometry lock, not a suggestion                           */
/* -------------------------------------------------------------------------- */

// The reported bug: a four-storey building came back as a different building
// when Strict was selected. The cause was in the knowledge table rather than in
// the strict rule — "Modern" expanded to "clean contemporary geometry, simple
// volumes, crisp facade composition", which is an instruction to redesign, and
// it was winning against a single mild sentence about preserving things.
{
  const strictOf = (styleId: string) =>
    composeRenderPrompt({
      settings: {
        selections: {
          scene: ["exterior"],
          time: ["golden-hour"],
          weather: ["clear"],
          lighting: ["warm"],
          style: [styleId],
          quality: ["high"],
        },
        preserveDesign: true,
        creative: "strict",
        instruction: "",
      },
      description: "A four-storey building, five window bays, red render.",
    }).prompt;

  // Every style that describes architecture must have a presentation-only form
  // for strict mode. Without it, the design instruction is what reaches Grok.
  const designStyles = [
    "modern",
    "contemporary",
    "minimalist",
    "luxury",
    "industrial",
    "tropical",
    "traditional",
  ];

  for (const style of designStyles) {
    check(
      `"${style}" has a geometry-safe form for strict mode`,
      typeof KNOWLEDGE[style]?.strict === "string",
      "otherwise the style chip is an instruction to redesign the building",
    );
  }

  // The specific sentences that caused this. None may appear under the lock.
  const forbidden: [string, string][] = [
    ["modern", "Clean contemporary geometry"],
    ["modern", "simple volumes"],
    ["minimalist", "Simple planes"],
    ["contemporary", "refined proportions"],
    ["industrial", "structure expressed"],
  ];

  for (const [style, phrase] of forbidden) {
    check(
      `strict + ${style} does not say "${phrase}"`,
      !strictOf(style).includes(phrase),
      "this is the sentence that redesigned the building",
    );
  }

  // And the lock is actually there, at both ends.
  const modern = strictOf("modern");
  check(
    "strict mode states the geometry lock",
    modern.includes(GEOMETRY_LOCK),
  );
  check(
    "the lock comes before the style instruction",
    modern.indexOf(GEOMETRY_LOCK) < modern.indexOf("modern visual treatment"),
    "a style chip read first sets the frame for everything after it",
  );
  check(
    "and the prompt closes on it",
    /Any change to its geometry is a failure\.$/.test(modern.trim()),
    "the end of a prompt is where one sentence carries furthest",
  );

  // Named elements rather than the word "geometry", which a model can satisfy
  // loosely. Every one of these is in the brief's list.
  for (const element of [
    "number of floors",
    "roof geometry",
    "balcony",
    "window",
    "door",
    "cantilever",
    "parapet",
    "footprint",
    "proportions",
  ]) {
    check(
      `the lock names ${element}`,
      GEOMETRY_LOCK.toLowerCase().includes(element.toLowerCase()),
    );
  }

  check(
    "the lock forbids the specific verbs",
    ["add", "remove", "move", "resize", "reshape"].every((verb) =>
      GEOMETRY_LOCK.includes(verb),
    ),
    "'preserve the geometry' is a phrase a model can satisfy loosely",
  );
}

/* -------------------------------------------------------------------------- */
/* The lock applies only where it should                                      */
/* -------------------------------------------------------------------------- */

{
  const build = (preserve: boolean, creative: "strict" | "balanced" | "creative") =>
    composeRenderPrompt({
      settings: {
        selections: { style: ["modern"] },
        preserveDesign: preserve,
        creative,
        instruction: "",
      },
      description: "A four-storey building.",
    }).prompt;

  // One switch governs the geometry, and it is the toggle. Creative freedom
  // governs licence over everything else — the surroundings, the finish, the
  // staging. Somebody who asked to preserve their architecture and then nudged
  // the creative slider for nicer landscaping used to lose the lock silently.
  for (const level of ["strict", "balanced", "creative"] as const) {
    check(
      `preservation on + ${level} locks the geometry`,
      build(true, level).includes(GEOMETRY_LOCK),
      "the toggle is the only thing that may unlock it",
    );
    check(
      `preservation off + ${level} does not lock it`,
      !build(false, level).includes(GEOMETRY_LOCK),
      "turning it off is a deliberate act with a label that says what it does",
    );
  }

  // And a style chip still cannot smuggle geometry back in at any level.
  for (const level of ["strict", "balanced", "creative"] as const) {
    check(
      `preservation on + ${level} drops the redesign language`,
      !build(true, level).includes("Clean contemporary geometry"),
      "this is the sentence that redesigned the building",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Defaults protect the client                                                */
/* -------------------------------------------------------------------------- */

{
  check(
    "preserve original design is on by default",
    DEFAULT_SETTINGS.preserveDesign === true,
  );
  check(
    "and creative freedom defaults to strict",
    DEFAULT_SETTINGS.creative === "strict",
    "nobody should accidentally receive a redesigned building",
  );

  const workspace = readFileSync(
    "src/components/ai/render/sketch-workspace.tsx",
    "utf8",
  );

  check(
    "the workspace shows the lock indicator",
    /Original Geometry Protected/.test(workspace),
  );
  check(
    "the indicator follows the same rule as the server",
    /\{settings\.preserveDesign \? \(/.test(workspace) &&
      !/settings\.creative === "strict"/.test(workspace),
    "an indicator that lies about the mode is worse than none",
  );
  check(
    "the original image stays on screen beside the render",
    /ORIGINAL/.test(workspace) && /src=\{source\.url\}/.test(workspace),
  );
  check(
    "and the render is the large one",
    /min-w-0 flex-1/.test(workspace),
  );
}


/* -------------------------------------------------------------------------- */
/* Image-to-image, and telling the truth about which path ran                 */
/* -------------------------------------------------------------------------- */

// The brief draws the distinction exactly right:
//
//   WRONG   image -> description -> "modern luxury house" -> a new AI building
//   CORRECT image -> image-to-image -> preserve geometry -> apply changes
//
// Medosha was doing the first. Not by oversight: xAI's image endpoint accepts
// no source image and there is no /v1/images/edits, so with only XAI_API_KEY a
// description is the only channel the building has. What was missing was using
// a real edit path when one is available, and saying which ran.
{
  const engine = readFileSync("src/lib/ai/rendering/engine.ts", "utf8");
  const route = readFileSync("src/app/api/ai/render/route.ts", "utf8");
  const workspace = readFileSync(
    "src/components/ai/render/sketch-workspace.tsx",
    "utf8",
  );

  check(
    "there is a real image-to-image path",
    /images\/edits/.test(engine),
    "an endpoint that takes the actual pixels, not a paragraph about them",
  );
  check(
    "and it sends the source image itself",
    /form\.append\("image", blob/.test(engine),
  );
  check(
    "editing is only reached under the lock",
    /if \(locked\) \{/.test(engine),
    "an unlocked render is a reinterpretation, which is what a redraw is for",
  );
  check(
    "the route asks the engine rather than calling xAI directly",
    /renderImage\(/.test(route) && !/generateXaiImages\(/.test(route),
  );

  // The honesty requirement. A described redraw must never be reported as an
  // edit — a client told their model was preserved when it was described has
  // been misled by us rather than by the model.
  check(
    "the route reports which path produced the image",
    /renderPath: outcome\.path/.test(route),
  );
  check(
    "the workspace says so when it was only described",
    /redrawn from the original, not edited pixel-for-pixel/.test(workspace),
  );
  check(
    "and says so when it really was an edit",
    /edited from your image/.test(workspace),
  );
  check(
    "a failed edit falls back but does not lie about it",
    /path: "described"/.test(engine) &&
      /falling back to described/.test(engine),
  );

  // The log has to distinguish them too, or usage data conflates two products.
  check(
    "the usage log records the real provider",
    /provider: outcome\.path === "image-to-image" \? "openai" : "xai"/.test(route),
  );
}

/* -------------------------------------------------------------------------- */
/* The fidelity check                                                         */
/* -------------------------------------------------------------------------- */

{
  const engine = readFileSync("src/lib/ai/rendering/engine.ts", "utf8");
  const route = readFileSync("src/app/api/ai/render/route.ts", "utf8");

  check("there is a fidelity check", /export async function checkFidelity/.test(engine));

  // The ten elements the brief lists, each named in the comparison prompt.
  for (const element of [
    "roof silhouette",
    "number of floors",
    "balcony positions",
    "window positions",
    "door and entrance position",
    "major facade volumes",
    "major vertical walls",
    "camera composition",
  ]) {
    check(`the check compares ${element}`, engine.includes(element));
  }

  check(
    "and explicitly ignores what is meant to change",
    /Ignore lighting, weather, sky, time of day, materials, colour, landscaping/.test(
      engine,
    ),
    "a check that flagged the new sky would fire on every successful render",
  );
  check(
    "it errs towards accepting the render",
    /If you are unsure, answer true/.test(engine),
    "a wrong accusation costs the client their render",
  );
  check(
    "a check that cannot run does not fail the render",
    /return null;\n  }\n}/.test(engine) && /advisory/i.test(engine),
  );
  check(
    "the route only checks under the lock",
    /locked && outcome\.images\[0\]/.test(route),
    "an unlocked render is allowed to differ, so checking it would warn about the thing that was asked for",
  );
  check(
    "the verdict reaches the browser",
    /fidelity: fidelity/.test(route),
  );
}

/* -------------------------------------------------------------------------- */
/* The lock's label                                                           */
/* -------------------------------------------------------------------------- */

{
  const workspace = readFileSync(
    "src/components/ai/render/sketch-workspace.tsx",
    "utf8",
  );

  check(
    "the toggle is labelled Preserve Original Architecture",
    /Preserve Original Architecture/.test(workspace),
  );
  check(
    "on says the architecture is locked",
    /Architecture locked — only visual appearance and requested changes will be applied\./.test(
      workspace,
    ),
  );
  check(
    "off says the AI may reinterpret it",
    /AI may reinterpret architectural geometry\./.test(workspace),
  );
}


/* -------------------------------------------------------------------------- */
/* The source image reaches the image model, not just the vision model        */
/* -------------------------------------------------------------------------- */

// The reported failure, and it was exactly as described: `preserveDesign`
// arrived at the server, `locked` was computed from it, and then the render was
// produced by POST /v1/images/generations — a text-to-image call. The building
// went to /chat/completions to be *looked at* and never to the model that drew
// the picture. The roof was never sent, so the roof came back different.
{
  const xai = readFileSync("src/lib/ai/xai-images.ts", "utf8");
  const engine = readFileSync("src/lib/ai/rendering/engine.ts", "utf8");
  const compose = readFileSync("src/lib/ai/rendering/compose.ts", "utf8");

  check(
    "there is an xAI image-editing call",
    /export async function editXaiImage/.test(xai),
  );
  // The URL the edit call actually builds, not the constant sitting near it.
  // Pointing the call at /images/generations leaves `EDIT_PATH = "/images/edits"`
  // in the file untouched, so matching the string anywhere passes on the bug.
  const editBody = xai.slice(
    xai.indexOf("export async function editXaiImage"),
    xai.indexOf("async function asBlob"),
  );

  check(
    "it posts to the edits endpoint",
    /\$\{API\}\$\{[^}]*EDIT_PATH[^}]*\}/.test(editBody) &&
      /const EDIT_PATH = "\/images\/edits"/.test(xai),
    "generations takes no source image; edits is the one that does",
  );
  check(
    "and not at the generations endpoint",
    !/images\/generations/.test(editBody),
    "this is the call that was wrong",
  );
  check(
    "and it attaches the actual image",
    /form\.append\("image", blob, filename\)/.test(xai),
    "this is the line whose absence was the entire bug",
  );
  check(
    "the edit model is Grok Imagine, and overridable",
    /grok-imagine-image-quality/.test(xai) && /XAI_EDIT_MODEL/.test(xai),
  );
  // Comments stripped: the file explains *why* the header is not set, and
  // matching that explanation would fail the check on the sentence that
  // documents why it passes.
  const xaiCode = xai
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  check(
    "the multipart content-type is left to fetch",
    !/"content-type"/.test(
      xaiCode.slice(
        xaiCode.indexOf("export async function editXaiImage"),
        xaiCode.indexOf("async function asBlob"),
      ),
    ),
    "setting it by hand omits the boundary and produces an unreadable 400",
  );
  check(
    "the edit asks for base64, not an expiring url",
    /form\.append\("response_format", "b64_json"\)/.test(xai),
  );

  // Order of preference: xAI's own editor first.
  // Call sites inside renderImage, not definitions — `editWithOpenAi` is
  // *declared* near the top of the file, so a whole-file indexOf compares a
  // definition against a call and always says the wrong thing.
  const renderBody = engine.slice(engine.indexOf("export async function renderImage"));

  check(
    "a locked render tries the xAI editor first",
    renderBody.indexOf("editXaiImage(") < renderBody.indexOf("editWithOpenAi("),
    "xAI is the integration this deployment is built on",
  );
  check(
    "the editor is only used when the account has it",
    /await xaiCanEdit\(signal\)/.test(engine),
    "asked rather than assumed, so a rename does not need a code change",
  );
  check(
    "generation is the last resort, not the first",
    engine.lastIndexOf("generateXaiImages(") > engine.indexOf("editXaiImage("),
  );

  // The two prompts are genuinely different documents.
  check(
    "there is a separate prompt for editing",
    /editPrompt: string;/.test(compose) && /const editParts/.test(compose),
  );
  check(
    "the edit prompt does not describe the building",
    !/editParts\.push\([\s\S]{0,120}description/.test(compose),
    "the endpoint already has the building; describing it invites a redraw of what it can see",
  );
  check(
    "the edit lock tells it to keep the pixels",
    /pixel for pixel/.test(EDIT_LOCK) && /Edit the supplied image/.test(EDIT_LOCK),
  );
  check(
    "and forbids the same verbs",
    ["move", "add", "remove", "resize", "reshape"].every((verb) =>
      EDIT_LOCK.includes(verb),
    ),
  );
  check(
    "the edit lock is shorter than the generation lock",
    EDIT_LOCK.length < GEOMETRY_LOCK.length,
    "a long inventory of the image's own contents reads as a build specification",
  );

  const route = readFileSync("src/app/api/ai/render/route.ts", "utf8");
  check(
    "the route passes the edit prompt through",
    /editPrompt: composed\.editPrompt/.test(route),
  );
}


/* -------------------------------------------------------------------------- */
/* The request can be inspected without reading the source                    */
/* -------------------------------------------------------------------------- */

// "Verify the actual API request" was a fair thing to ask and was not, until
// now, answerable without reading the code. A wrong endpoint, a wrong model, an
// unattached source image and a prompt that quietly asks for a new building all
// produce the same complaint from whoever is looking at the result.
{
  const debug = readFileSync("src/lib/ai/rendering/debug.ts", "utf8");
  const xai = readFileSync("src/lib/ai/xai-images.ts", "utf8");

  check("there is a render request logger", /logRenderRequest/.test(debug));

  // Every value the brief lists.
  for (const field of [
    "endpoint",
    "model",
    "operation",
    "preserveArchitecture",
    "creativeFreedom",
    "prompt",
  ]) {
    check(`the debug line reports ${field}`, debug.includes(field));
  }
  check(
    "and how the image is carried",
    /base64 data URI/.test(debug) && /describeImageInput/.test(debug),
  );

  // Both call sites, or the one that matters is the one that stays silent.
  const calls = (xai.match(/logRenderRequest\(\{/g) ?? []).length;
  check(
    "both the edit and the generation are logged",
    calls >= 2,
    `${calls} call sites`,
  );

  // The failure being hunted, called out by name rather than left to be
  // inferred from a field the reader has to notice is missing.
  check(
    "a generation under preservation is flagged as a problem",
    /PROBLEM[\s\S]*preserveArchitecture is ON but this is a text-to-image call/.test(
      debug,
    ),
  );
  check(
    "and an edit with no image is too",
    /PROBLEM[\s\S]*editing with no source image attached/.test(debug),
  );

  // It prints the rendering knowledge, so it must be opt-in and server-side.
  check(
    "the logger is server-only",
    /^import "server-only";/m.test(debug),
  );
  check(
    "and off unless explicitly switched on",
    /process\.env\.MEDOSHA_RENDER_DEBUG !== "1"/.test(debug),
    "it prints the hidden instructions; it must not run by default",
  );
  check(
    "the key is never printed",
    !/XAI_API_KEY|authorization/i.test(debug),
  );
  check(
    "the image is described, not dumped",
    !/image\.slice\(0, [5-9]\d\)/.test(debug),
    "a megabyte of base64 would bury everything else in the log",
  );

  // And an offline way to see it, so nobody spends a credit to answer
  // "what is it actually sending".
  const dump = readFileSync("scripts/render-request-dump.ts", "utf8");
  check(
    "there is an offline request dump",
    /composeRenderPrompt\(/.test(dump),
  );
  check(
    "which sends nothing",
    !/fetch\(/.test(dump),
    "answering this question should not cost a credit",
  );
  check(
    "and shows both prompts side by side",
    /composed\.editPrompt/.test(dump) && /composed\.prompt/.test(dump),
    "the difference between them is the whole diagnosis",
  );
}

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} xAI checks passed`);
console.log(
  "\x1b[2mthe live calls are in scripts/xai-doctor.ts — run that where the key is\x1b[0m\n",
);
