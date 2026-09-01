/**
 * Berchuma Studio — the model contract.
 *
 *   npm run check:berchuma-ai
 *
 * `berchuma-check.ts` proves the arithmetic is right. This proves the layer
 * above it survives what a language model actually sends, which is a different
 * problem and a nastier one: the model's output is untrusted input that
 * happens to look cooperative. It arrives wrapped in a markdown fence, or with
 * a sentence of preamble, or naming a board nobody stocks, or as an object
 * where an id belongs — and every one of those has to end in either a
 * buildable design or a message that names the field, never in a crash and
 * never in a silently wrong price.
 *
 * No provider is called. Every reply below is a canned string, so this runs
 * offline, in CI, and in under a second.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  extractJson,
  hydrateSpec,
} from "../src/features/berchuma-studio/services/hydrate.ts";
import {
  imagePrompt,
  systemPrompt,
} from "../src/features/berchuma-studio/services/prompt.ts";
import { looksLikeVision } from "../src/lib/ai/vision-models.ts";
import { allBays } from "../src/features/berchuma-studio/types/spec.ts";
import { calculateCost } from "../src/features/berchuma-studio/services/costing.ts";
import { buildParts } from "../src/features/berchuma-studio/services/geometry.ts";
import {
  BOARDS,
  EDGE_BANDS,
  HARDWARE,
} from "../src/features/berchuma-studio/types/catalogue.ts";

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

/** A well-formed reply, of the shape the prompt asks for. */
const GOOD_SPEC = {
  version: 1,
  kind: "wardrobe",
  units: "mm",
  title: "Two-bay bedroom wardrobe",
  envelope: { width: 1800, height: 2100, depth: 600 },
  bays: [
    {
      id: "bay-1",
      width: 873,
      fitting: { kind: "hanging", rails: 1, shelfAbove: true },
      door: "hinged",
      doorLeaves: 2,
    },
    {
      id: "bay-2",
      width: 873,
      fitting: { kind: "shelves", count: 5, adjustable: true },
      door: "hinged",
      doorLeaves: 2,
    },
  ],
  carcass: {
    board: "mdf-18-walnut",
    backBoard: "hdf-4-white",
    edgeBand: "pvc-2-walnut",
    plinthHeight: 100,
    doorGap: 2,
    shelfSetback: 10,
  },
  hardware: ["hinge-soft-close", "handle-bar", "shelf-pin", "hanging-rail"],
  finish: { colour: "Walnut", hex: "#6b4a2f", sheen: "satin" },
  lighting: { ledStrip: false, colourTemperature: 3000 },
  meta: {
    style: "modern",
    prompt: "",
    assumptions: ["Depth assumed at 600 mm"],
    corrections: [],
  },
};

const BRIEF = "A walnut wardrobe about 1.8 m wide for a bedroom in Bahir Dar.";

// ---------------------------------------------------------------------------
// extractJson — every way a model wraps its answer
// ---------------------------------------------------------------------------

{
  const payload = '{"reply":"Here you go.","spec":null}';

  check("bare JSON is read", extractJson(payload) !== null);

  check(
    "a markdown fence is survived",
    (extractJson("```json\n" + payload + "\n```") as { reply?: string } | null)
      ?.reply === "Here you go.",
  );

  check(
    "a sentence of preamble is survived",
    (extractJson("Sure! Here is the design:\n\n" + payload) as
      | { reply?: string }
      | null)?.reply === "Here you go.",
  );

  check(
    "trailing chatter is survived",
    (extractJson(payload + "\n\nLet me know if you want it wider.") as
      | { reply?: string }
      | null)?.reply === "Here you go.",
  );

  // The brace scan has to track string state, or a label containing a brace
  // ends the object early and the reply parses as something shorter than it is.
  const braced = '{"reply":"Use the {big} handles","spec":null}';
  check(
    "a brace inside a string does not end the object",
    (extractJson(braced) as { reply?: string } | null)?.reply ===
      "Use the {big} handles",
  );

  const escaped = '{"reply":"He said \\"wider\\" twice","spec":null}';
  check(
    "an escaped quote does not end the string",
    (extractJson(escaped) as { reply?: string } | null)?.reply ===
      'He said "wider" twice',
  );

  check("prose with no JSON returns null", extractJson("I cannot do that.") === null);
  check(
    "a truncated object returns null",
    extractJson('{"reply":"Here you go.","spec":{"version":1') === null,
  );
}

// ---------------------------------------------------------------------------
// hydrateSpec — ids in, materials out
// ---------------------------------------------------------------------------

{
  const result = hydrateSpec(GOOD_SPEC, BRIEF);
  if (!result.ok) {
    check("a well-formed reply hydrates", false, result.error);
  } else {
    passed += 1;
    const { spec } = result;

    check(
      "the board id became the board",
      spec.carcass.board.id === "mdf-18-walnut" &&
        spec.carcass.board.thickness === 18,
    );
    check(
      "the price key came with it",
      spec.carcass.board.priceKey === "MDF 18mm walnut",
    );
    check("the edge band resolved", spec.carcass.edgeBand.id === "pvc-2-walnut");
    check("all four hardware ids resolved", spec.hardware.length === 4);

    // The one string the model is not allowed to write. What appears on the
    // public design page has to be what the customer actually asked for, not
    // the model's tidier restatement of it.
    check("meta.prompt is the customer's own words", spec.meta.prompt === BRIEF);
    check(
      "the model's assumptions are kept",
      spec.meta.assumptions.includes("Depth assumed at 600 mm"),
    );
  }
}

{
  // A model that echoes back whole objects instead of ids. It happens on edit
  // turns, and refusing it costs the user a round trip for something they did
  // not do.
  const objectForm = {
    ...GOOD_SPEC,
    carcass: {
      ...GOOD_SPEC.carcass,
      board: BOARDS.find((board) => board.id === "mdf-18-oak"),
      edgeBand: EDGE_BANDS.find((band) => band.id === "pvc-2-oak"),
    },
    hardware: [HARDWARE.find((item) => item.id === "hinge-standard")],
  };

  const result = hydrateSpec(objectForm, BRIEF);
  check(
    "a material sent as an object still resolves",
    result.ok && result.spec.carcass.board.id === "mdf-18-oak",
    result.ok ? "" : result.error,
  );
}

{
  // Inventing a product is the failure this whole design exists to prevent: an
  // unknown board has no price key, so it would cost nothing at all.
  const invented = {
    ...GOOD_SPEC,
    carcass: { ...GOOD_SPEC.carcass, board: "mdf-22-walnut-premium" },
  };
  const result = hydrateSpec(invented, BRIEF);
  check("an invented board is refused", !result.ok);
  check(
    "and the refusal names the field",
    !result.ok && result.error.startsWith("carcass.board"),
    result.ok ? "" : result.error,
  );
}

{
  // Unknown hardware is dropped rather than fatal. A missing shelf-pin line is
  // a slightly cheap wardrobe; a refused design is a wasted turn.
  const result = hydrateSpec(
    { ...GOOD_SPEC, hardware: ["hinge-soft-close", "brass-cup-handle-vintage"] },
    BRIEF,
  );
  check(
    "unknown hardware is dropped, not fatal",
    result.ok && result.spec.hardware.length === 1,
    result.ok ? "" : result.error,
  );
}

{
  // The most common omission, with an obvious right answer.
  const carcass: Record<string, unknown> = { ...GOOD_SPEC.carcass };
  delete carcass.backBoard;
  const result = hydrateSpec({ ...GOOD_SPEC, carcass }, BRIEF);
  check(
    "a missing back board is filled in",
    result.ok && result.spec.carcass.backBoard.id === "hdf-4-white",
    result.ok ? "" : result.error,
  );
}

{
  check("a non-object is refused", !hydrateSpec("a nice wardrobe", BRIEF).ok);
  check("null is refused", !hydrateSpec(null, BRIEF).ok);
  check("an array is refused", !hydrateSpec([GOOD_SPEC], BRIEF).ok);
  check(
    "a spec with no bays is refused",
    !hydrateSpec({ ...GOOD_SPEC, bays: [] }, BRIEF).ok,
  );
}

// ---------------------------------------------------------------------------
// Physical repair — a design that parses but cannot be built
// ---------------------------------------------------------------------------

{
  // One 1750 mm bay behind a single hinged leaf: legal JSON, unbuildable
  // furniture. The leaf must become a pair and the span must be flagged.
  const wrong = {
    ...GOOD_SPEC,
    bays: [
      {
        id: "bay-1",
        width: 1750,
        fitting: { kind: "shelves", count: 4, adjustable: true },
        door: "hinged",
        doorLeaves: 1,
      },
    ],
  };

  const result = hydrateSpec(wrong, BRIEF);
  if (!result.ok) {
    check("an unbuildable bay is repaired rather than refused", false, result.error);
  } else {
    passed += 1;
    check(
      "the single wide leaf became a pair",
      allBays(result.spec)[0]?.doorLeaves === 2,
    );
    check(
      "the sagging shelf span was reported",
      result.issues.some((issue) => issue.message.includes("sag")),
    );
    check(
      "every repair is recorded on the spec",
      result.spec.meta.corrections.length > 0,
    );
  }
}

{
  // Numbers no human would type, of the kind a confused model does.
  const absurd = {
    ...GOOD_SPEC,
    envelope: { width: 120, height: 4200, depth: 600 },
  };
  const result = hydrateSpec(absurd, BRIEF);
  if (!result.ok) {
    check("absurd dimensions are repaired", false, result.error);
  } else {
    passed += 1;
    check("the height was capped", result.spec.envelope.height <= 2700);
    check("the width was raised to something buildable", result.spec.envelope.width >= 300);
  }
}

// ---------------------------------------------------------------------------
// End to end — a model reply becomes a price
// ---------------------------------------------------------------------------

{
  const reply =
    "Here's what I'd build:\n\n```json\n" +
    JSON.stringify({
      reply: "A two-bay walnut wardrobe, 1800 wide.",
      spec: GOOD_SPEC,
    }) +
    "\n```\nHappy to make it wider.";

  const parsed = extractJson(reply) as { reply: string; spec: unknown } | null;
  const hydrated = parsed ? hydrateSpec(parsed.spec, BRIEF) : null;

  if (!hydrated?.ok) {
    check("a fenced reply becomes a spec", false, hydrated?.error ?? "no JSON");
  } else {
    passed += 1;
    const parts = buildParts(hydrated.spec);
    const cost = calculateCost(hydrated.spec, parts);

    check("it produces parts", parts.parts.length > 0);
    check(
      "it produces a finite price",
      Number.isFinite(cost.price) && cost.price > 0,
      String(cost.price),
    );
    check(
      "and no line is NaN",
      cost.lines.every(
        (line) => Number.isFinite(line.amount) && Number.isFinite(line.rate),
      ),
    );
    // With no listings passed in, every rate came from the catalogue — which
    // the panel must report as an estimate rather than as a quote.
    check(
      "with no live listings the confidence is zero",
      cost.confidence === 0,
      String(cost.confidence),
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt drift — the model is offered exactly what exists
// ---------------------------------------------------------------------------

{
  const prompt = systemPrompt();

  // Searched inside the catalogue section rather than in the whole prompt.
  // The first version of this check looked at the whole string and passed
  // while a board was missing from the list, because the same id also appears
  // in the worked example — a harness reporting a pass for the wrong reason,
  // which is worse than no harness.
  const catalogueStart = prompt.indexOf("## Catalogue");
  const catalogue = catalogueStart === -1 ? "" : prompt.slice(catalogueStart);

  check("the prompt has a catalogue section", catalogue.length > 0);

  const missing = [
    ...BOARDS.map((board) => board.id),
    ...EDGE_BANDS.map((band) => band.id),
    ...HARDWARE.map((item) => item.id),
  ].filter((id) => !catalogue.includes(id));

  check(
    "every catalogue item is offered to the model",
    missing.length === 0,
    missing.join(", "),
  );

  // The worked example in the prompt is the thing the model copies most
  // closely, so an id that has been renamed out of the catalogue but left in
  // the example teaches it to emit something that no longer resolves.
  const known = new Set([
    ...BOARDS.map((board) => board.id),
    ...EDGE_BANDS.map((band) => band.id),
    ...HARDWARE.map((item) => item.id),
  ]);
  const exampleStart = prompt.indexOf("## Worked example");
  const exampleEnd = prompt.indexOf("## Rules");
  const example = prompt.slice(exampleStart, exampleEnd);
  const quoted = example.match(/"([a-z0-9]+(?:-[a-z0-9]+){1,3})"/g) ?? [];
  const stale = quoted
    .map((match) => match.slice(1, -1))
    .filter((id) => /^(mdf|hdf|ply|chipboard|pvc|hinge|handle|runner|shelf|hanging|sliding|leg|led)-/.test(id))
    .filter((id) => !known.has(id));

  check(
    "the worked example names no material that has been removed",
    stale.length === 0,
    stale.join(", "),
  );
}

// ---------------------------------------------------------------------------
// The prompt must never reach the browser
// ---------------------------------------------------------------------------

{
  // Berchuma's instructions, its rules and its whole catalogue are in
  // `prompt.ts`. Shipping that file to the client would hand anyone who opens
  // devtools the exact text to talk around, and the leak would be invisible —
  // the page would look and behave identically.
  //
  // The natural guard is `import "server-only"`, but this project has no such
  // package installed (Next aliases it at build time), so importing the prompt
  // above to check it for drift would fail. This walks the source instead,
  // which catches the same mistake at the same moment.
  const offenders: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;

      const source = readFileSync(full, "utf8");
      if (!/^\s*["']use client["']/m.test(source)) continue;
      if (/from\s+["'][^"']*services\/(prompt|ai|rates)["']/.test(source)) {
        offenders.push(full);
      }
    }
  };

  walk("src");

  check(
    "no client component imports the prompt, the provider or the rate lookup",
    offenders.length === 0,
    offenders.join(", "),
  );
}

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Image → 3D
// ---------------------------------------------------------------------------

{
  // The instruction that matters most and is easiest for a model to ignore.
  // A model shown a wardrobe returns a *nicer* wardrobe unless told not to.
  const prompt = imagePrompt();
  for (const phrase of [
    "Copy the layout you can see",
    "Do not even them up",
    "transcribing, not designing",
    "Do not add anything that is not in the picture",
  ]) {
    check(`the image prompt says: ${phrase}`, prompt.includes(phrase));
  }

  check(
    "it inherits the catalogue, so a photograph cannot invent a material",
    prompt.includes("mdf-18-white") && prompt.includes("## Catalogue"),
  );
  check(
    "and the cabinet rules, so a photograph produces the same object",
    prompt.includes("A design is a list of cabinets"),
  );

  // Measurements beat the picture. This is the one rule a customer will test
  // deliberately: they type 4000 and expect 4000.
  const measured = imagePrompt({ width: 4000, height: 3000, depth: 600 });
  check(
    "given measurements, it is told to use them exactly",
    measured.includes("width 4000 mm") &&
      measured.includes("Use those numbers exactly") &&
      measured.includes("override anything the photograph suggests"),
  );
  check(
    "and without them, it is told to estimate and say so",
    imagePrompt().includes("meta.assumptions") &&
      imagePrompt().includes("estimated"),
  );
  check(
    "and a picture with no furniture in it returns nothing rather than a guess",
    prompt.includes('return "spec": null'),
  );
}

{
  // Which models can actually see. Getting this wrong means somebody's upload
  // fails with a message about JSON rather than a message about their key.
  //
  // The provider chain itself is not exercised here — `provider.ts` is
  // server-only and cannot be imported under plain Node — but the list it
  // consults can be, and the list is the part that goes stale.
  const cases: [string, boolean][] = [
    ["gpt-4o-mini", true],
    ["gpt-4o-2024-11-20", true],
    ["openai/gpt-4o-mini", true],
    ["gpt-4.1", true],
    ["gemini-2.0-flash", true],
    ["llama-3.2-90b-vision-preview", true],
    ["pixtral-12b", true],
    ["anthropic/claude-sonnet-4", true],
    ["llama-3.3-70b-versatile", false],
    ["mixtral-8x7b-32768", false],
    ["llama3.1", false],
    ["gpt-3.5-turbo", false],
    ["deepseek-chat", false],
  ];

  for (const [model, expected] of cases) {
    check(
      `${model} ${expected ? "can" : "cannot"} read an image`,
      looksLikeVision(model) === expected,
    );
  }

  // The default model of the default provider cannot see, which is exactly why
  // the upload has to say so rather than failing strangely.
  check(
    "the default Groq model is text only",
    !looksLikeVision("llama-3.3-70b-versatile"),
  );
}

{
  // The photograph must not reach the browser. It is somebody's own kitchen.
  const clientFiles = readdirSync(
    join(process.cwd(), "src/features/berchuma-studio/components"),
    { recursive: true, encoding: "utf8" },
  ).filter((name) => typeof name === "string" && name.endsWith(".tsx"));

  const leaking = clientFiles.filter((name) => {
    const source = readFileSync(
      join(process.cwd(), "src/features/berchuma-studio/components", name),
      "utf8",
    );
    return (
      source.includes("services/vision") ||
      source.includes("from \"../services/prompt\"") ||
      source.includes("imagePrompt")
    );
  });

  check(
    "no client component imports the vision service or the image prompt",
    leaking.length === 0,
    leaking.join(", "),
  );
}

console.log(`\n${DIM}Berchuma model contract${RESET}`);
console.log(`${DIM}${"─".repeat(50)}${RESET}`);

if (failures.length === 0) {
  console.log(`${GREEN}✓ ${passed} checks passed.${RESET}`);
  console.log(
    `${DIM}Malformed, fenced, invented and unbuildable replies all end somewhere sane.${RESET}\n`,
  );
} else {
  console.log(`${GREEN}✓ ${passed} passed${RESET}`);
  console.log(`${RED}✗ ${failures.length} failed:${RESET}\n`);
  for (const failure of failures) console.log(`  ${RED}·${RESET} ${failure}`);
  console.log("");
  process.exit(1);
}
