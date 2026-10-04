import "server-only";

/**
 * What is actually about to be sent to xAI.
 *
 * Written because "the render redesigned my building" and "the request was
 * wrong" are different diagnoses with the same symptom, and until now the only
 * way to tell them apart was to read the source. A wrong endpoint, a wrong
 * model, a source image that never got attached and a prompt that quietly asks
 * for a new building all produce the same complaint from the person looking at
 * the result.
 *
 * Off unless `MEDOSHA_RENDER_DEBUG=1`. It prints a prompt, and a prompt is the
 * rendering knowledge — the thing the client is specifically not supposed to
 * see. Server console only, opt-in only, never in a response body.
 *
 * ## What is deliberately not printed
 *
 * The API key, obviously, and not a prefix of it either. And the image is
 * reported by *shape* — kind, mime type, size — rather than by content: a
 * base64 data URL is a megabyte of noise that would bury everything else in
 * the log, and its first forty characters tell you nothing its type and size
 * do not.
 */

export type RenderRequestDebug = {
  endpoint: string;
  model: string;
  /** "edit" or "generate" — the distinction that matters most. */
  operation: "edit" | "generate";
  image: string | null;
  preserveArchitecture: boolean;
  creativeFreedom: string;
  prompt: string;
};

/** How the source image is being carried, and how big it is. */
export function describeImageInput(image: string | null): string {
  if (!image) return "NONE — no source image is being sent";

  if (image.startsWith("data:")) {
    const comma = image.indexOf(",");
    const mime = image.slice(5, image.indexOf(";"));
    const bytes = Math.round(((image.length - comma - 1) * 3) / 4);
    return `base64 data URI · ${mime} · ${(bytes / 1024).toFixed(0)} KB`;
  }

  if (image.startsWith("https://")) {
    // The host, not the path. A signed storage URL's path contains a token.
    try {
      return `URL · ${new URL(image).host}`;
    } catch {
      return "URL · unparseable";
    }
  }

  return `UNRECOGNISED · starts "${image.slice(0, 12)}"`;
}

/**
 * Prints the request, once, immediately before it is made.
 *
 * The order is the order somebody debugging asks the questions in: am I calling
 * the right thing, with the right model, is my image in there at all, did my
 * settings survive the trip, and only then — what did it actually say.
 */
export function logRenderRequest(debug: RenderRequestDebug): void {
  if (process.env.MEDOSHA_RENDER_DEBUG !== "1") return;

  const line = "─".repeat(72);

  console.log(`\n${line}`);
  console.log("MEDOSHA RENDER REQUEST");
  console.log(line);
  console.log(`  operation             ${debug.operation.toUpperCase()}`);
  console.log(`  endpoint              ${debug.endpoint}`);
  console.log(`  model                 ${debug.model}`);
  console.log(`  source image          ${describeImageInput(debug.image)}`);
  console.log(`  preserveArchitecture  ${debug.preserveArchitecture}`);
  console.log(`  creativeFreedom       ${debug.creativeFreedom}`);

  // The verdict line. This is the one worth reading first, because it is the
  // failure being hunted: an edit with no image attached is a generation
  // wearing an edit's name, and it will return a different building every time.
  if (debug.operation === "edit" && !debug.image) {
    console.log(`  ⚠ PROBLEM             editing with no source image attached`);
  }
  if (debug.operation === "generate" && debug.preserveArchitecture) {
    console.log(
      `  ⚠ PROBLEM             preserveArchitecture is ON but this is a text-to-image call —`,
    );
    console.log(
      `                        the building cannot be preserved because it is not being sent`,
    );
  }

  console.log(`${line}`);
  console.log("PROMPT");
  console.log(line);
  console.log(debug.prompt);
  console.log(`${line}\n`);
}
