/**
 * The exact request Medosha would send, printed without sending it.
 *
 *   npx tsx scripts/render-request-dump.ts
 *   npx tsx scripts/render-request-dump.ts --image path/to/sketchup.png
 *
 * "Verify the actual API request" is a fair thing to ask and was not, until
 * now, answerable without reading the source. This composes a real request from
 * real settings and prints every value that decides whether the building
 * survives — endpoint, model, operation, how the source image is carried, both
 * settings, and the full prompt.
 *
 * Nothing is sent. No key is needed, no credit is spent, and the same output
 * appears in the server log during a genuine render when
 * `MEDOSHA_RENDER_DEBUG=1` is set.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import { composeRenderPrompt } from "../src/lib/ai/rendering/compose.ts";
import { describeImageInput } from "../src/lib/ai/rendering/debug.ts";
import { DEFAULT_SETTINGS } from "../src/lib/ai/rendering/options.ts";

const args = process.argv.slice(2);
const imageArg = args.indexOf("--image");

/**
 * The source image.
 *
 * A real file when one is given, so the size and mime reported are the ones
 * that would actually be sent. Otherwise a placeholder, which still proves the
 * request *shape* — that an image is attached at all is the fact in question.
 */
const image =
  imageArg !== -1 && args[imageArg + 1]
    ? (() => {
        const path = args[imageArg + 1]!;
        const bytes = readFileSync(path);
        const mime = path.endsWith(".png")
          ? "image/png"
          : path.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
        return `data:${mime};base64,${bytes.toString("base64")}`;
      })()
    : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8z8Dwn4GBgYEJRDAyMgIAJIQDAf3jbXQAAAAASUVORK5CYII=";

/** The brief's own test case: Golden Hour, Clear, Warm, Modern, locked. */
const settings = {
  ...DEFAULT_SETTINGS,
  selections: {
    ...DEFAULT_SETTINGS.selections,
    scene: ["exterior"],
    time: ["golden-hour"],
    weather: ["clear"],
    lighting: ["warm"],
    style: ["modern"],
    sky: ["sunset-sky"],
    quality: ["high"],
  },
  preserveDesign: true,
  creative: "strict" as const,
  instruction: "",
};

/**
 * The description Grok would produce from the source.
 *
 * Stubbed, because producing a real one needs the API. It matters only to the
 * *generation* prompt — the edit prompt deliberately excludes it, and proving
 * that is half the point of this dump.
 */
const description =
  "[Grok's reading of the source image would appear here — a live call is needed to produce it]";

const composed = composeRenderPrompt({ settings, description });

const locked = settings.preserveDesign;
const editModel = process.env.XAI_EDIT_MODEL?.trim() || "grok-imagine-image-quality";
const editPath = process.env.XAI_EDIT_PATH?.trim() || "/images/edits";

const line = "═".repeat(74);
const thin = "─".repeat(74);

console.log(`\n${line}`);
console.log("  WHAT MEDOSHA WOULD SEND — Preserve Original Architecture = ON");
console.log(line);
console.log(`  operation             EDIT`);
console.log(`  endpoint              https://api.x.ai/v1${editPath}`);
console.log(`  model                 ${editModel}`);
console.log(`  source image          ${describeImageInput(image)}`);
console.log(`  transport             multipart/form-data, "image" file part`);
console.log(`  preserveArchitecture  ${settings.preserveDesign}`);
console.log(`  creativeFreedom       ${settings.creative}`);
console.log(`  geometry locked       ${locked}`);
console.log(`\n${thin}`);
console.log("  EDIT PROMPT — what actually goes with the image");
console.log(thin);
console.log(composed.editPrompt);

console.log(`\n${line}`);
console.log("  THE FALLBACK, if the edits endpoint is unavailable");
console.log(line);
console.log(`  operation             GENERATE  ← the source image is NOT sent`);
console.log(`  endpoint              https://api.x.ai/v1/images/generations`);
console.log(`  model                 ${process.env.XAI_IMAGE_MODEL?.trim() || "discovered from /v1/models"}`);
console.log(`  source image          NONE`);
console.log(`\n${thin}`);
console.log("  GENERATION PROMPT — note it must describe the building");
console.log(thin);
console.log(composed.prompt.slice(0, 1200) + (composed.prompt.length > 1200 ? "\n  […]" : ""));

console.log(`\n${line}`);
console.log("  READ THIS");
console.log(line);
console.log(`
  The two prompts above are different documents on purpose.

  The EDIT prompt says nothing about what the building is. The endpoint is
  already looking at it; describing it in words would invite a redraw of what
  it can see.

  The GENERATION prompt has to describe the whole building, because that call
  sends no image at all. If your renders are coming back as a different
  building, the question to answer first is which of these two ran — and
  \`npm run check:xai -- --edit\` answers it in one call.

  Rendering knowledge version: ${composed.version}
`);
