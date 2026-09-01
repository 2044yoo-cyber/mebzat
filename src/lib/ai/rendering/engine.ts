import "server-only";

import {
  XaiImageError,
  editXaiImage,
  generateXaiImages,
  readImageWithGrok,
  xaiCanEdit,
} from "@/lib/ai/xai-images";

/**
 * Which way a render is actually produced.
 *
 * The brief draws the distinction and is right about it:
 *
 *   WRONG   image → description → "modern luxury house" → a new AI building
 *   CORRECT image → image-to-image → preserve geometry → apply changes
 *
 * Medosha was doing the first one. Not by oversight — xAI's image API accepts
 * `model`, `prompt`, `n` and `response_format` and nothing else. There is no
 * source image parameter and no `/v1/images/edits`. So with only XAI_API_KEY
 * configured, a description is genuinely the only channel through which the
 * uploaded building can reach the model, and no amount of prompt engineering
 * changes that.
 *
 * What can change is whether Medosha *uses* a real image-to-image path when one
 * is available. OpenAI's `/v1/images/edits` takes the actual pixels, and with
 * `OPENAI_API_KEY` set that is the correct engine for a locked render — it is
 * the difference between preserving a building and describing one well.
 *
 * So: the strongest available path wins, and the caller is told which one ran.
 * A render produced from a description must never be reported as though the
 * original had been edited.
 */

export type RenderPath =
  /** The pixels went to the model. Geometry genuinely preserved. */
  | "image-to-image"
  /** The image was read and redrawn. Guided, but a redraw. */
  | "described";

export type RenderOutcome = {
  images: { url: string }[];
  path: RenderPath;
  /** Grok's reading of the source. Present on both paths; used by the check. */
  description: string | null;
};

/** Whether a true image-to-image engine is configured on this deployment. */
export function hasImageToImage(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const EDIT_TIMEOUT_MS = 180_000;

/** A data URL or https URL, as the bytes an upload needs. */
async function toBlob(image: string): Promise<{ blob: Blob; name: string }> {
  if (image.startsWith("data:")) {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(image);
    if (!match) throw new XaiImageError("bad_image", "Unreadable data URL.");
    const mime = match[1]!;
    const bytes = Buffer.from(match[2]!, "base64");
    const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return {
      blob: new Blob([new Uint8Array(bytes)], { type: mime }),
      name: `source.${extension}`,
    };
  }

  const response = await fetch(image, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new XaiImageError("bad_image", `Could not fetch the source (${response.status}).`);
  }
  return { blob: await response.blob(), name: "source.jpg" };
}

/**
 * A real edit: the uploaded pixels go to the model with the instruction.
 *
 * This is the path the brief asks for. The model receives the building rather
 * than a paragraph about it, so the roof stays where the roof is.
 */
async function editWithOpenAi(input: {
  image: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<{ url: string }[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new XaiImageError("not_configured", "OPENAI_API_KEY is not set.");

  const { blob, name } = await toBlob(input.image);

  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1");
  form.append("image", blob, name);
  // The edits endpoint caps the prompt; the geometry lock is long, so the
  // instruction is trimmed from the end where the environment detail sits
  // rather than the start where the lock is.
  form.append("prompt", input.prompt.slice(0, 30_000));
  form.append("n", "1");

  const timeout = AbortSignal.timeout(EDIT_TIMEOUT_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeout])
    : timeout;

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new XaiImageError(
      response.status === 401 ? "invalid_key" : "provider_error",
      `HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };

  const images = (payload.data ?? [])
    .map((entry) =>
      entry.b64_json
        ? { url: `data:image/png;base64,${entry.b64_json}` }
        : entry.url
          ? { url: entry.url }
          : null,
    )
    .filter((entry): entry is { url: string } => entry !== null);

  if (images.length === 0) {
    throw new XaiImageError("no_image", "The edit returned no image.");
  }
  return images;
}

/**
 * Renders, by the strongest path available.
 *
 * `locked` decides how hard Medosha tries. Under the geometry lock a real edit
 * is worth reaching for; without it, a redraw from a good description is
 * exactly what somebody asking for a reinterpretation wants anyway.
 *
 * The description is produced either way. On the image-to-image path it is not
 * strictly needed for generation, but it is what the fidelity check compares
 * against afterwards, and it costs one cheap call.
 */
export async function renderImage(input: {
  image: string;
  /** Built by `composeRenderPrompt`. Never leaves the server. */
  prompt: string;
  /** The same instruction written as changes to a supplied image. */
  editPrompt: string;
  locked: boolean;
  /** For the debug line. Never reaches xAI. */
  creativeFreedom?: string;
  description: string | null;
  signal?: AbortSignal;
}): Promise<RenderOutcome> {
  const { image, prompt, editPrompt, locked, description, signal } = input;
  const creativeFreedom = input.creativeFreedom ?? "unknown";

  if (locked) {
    // xAI first. It is the integration this deployment is built on, and if the
    // account has the editing model then the building can go to Grok as pixels
    // — which is the whole point and the thing that was missing.
    if (await xaiCanEdit(signal)) {
      try {
        const images = await editXaiImage({
          image,
          prompt: editPrompt,
          count: 1,
          signal,
          creativeFreedom,
        });
        return { images, path: "image-to-image", description };
      } catch (error) {
        console.error(
          "[medosha-ai:render] xAI edit failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // A second real editor, if one is configured. Better a true edit through
    // another provider than a redraw.
    if (hasImageToImage()) {
      try {
        const images = await editWithOpenAi({ image, prompt: editPrompt, signal });
        return { images, path: "image-to-image", description };
      } catch (error) {
        console.error(
          "[medosha-ai:render] image-to-image failed, falling back to described:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  // Last resort. Grounded in a reading of the original, but a redraw — and it
  // is reported as one, because a client told their model was preserved when it
  // was described has been misled by us rather than by the model.
  const images = await generateXaiImages({
    prompt,
    count: 1,
    signal,
    preserveArchitecture: locked,
    creativeFreedom,
  });
  return { images, path: "described", description };
}

/**
 * Did the render keep the building?
 *
 * A second look, by the same model that read the source. Ten elements, named by
 * the brief, answered one at a time — a model asked "is this the same building?"
 * says yes almost always, and a model asked "how many floors are in image A and
 * how many in image B" has to count.
 *
 * This is a judgement, not a measurement, and it is treated as one: a failure
 * warns and offers a regenerate rather than throwing the picture away. A
 * confident wrong verdict that discarded somebody's render would be worse than
 * the drift it was guarding against.
 */
export type FidelityVerdict = {
  ok: boolean;
  /** What changed, in the client's language. Safe to show. */
  differences: string[];
};

const FIDELITY_SYSTEM = `You are checking whether an architectural render preserved the building it was made from.

You will be given a description of the ORIGINAL building and a RENDERED image.

Compare only these, one at a time:
1. roof silhouette
2. overall building silhouette
3. number of floors
4. balcony positions and count
5. window positions and count
6. door and entrance position
7. major facade volumes
8. major vertical walls
9. entrance
10. camera composition

Ignore lighting, weather, sky, time of day, materials, colour, landscaping, people and vehicles. Those are meant to change.

Reply with a JSON object and nothing else:
{"same": true|false, "differences": ["short phrase", ...]}

"same" is false only if an element in the list above clearly changed. Count carefully before reporting a floor or window difference. If you are unsure, answer true — a wrong accusation costs the client their render.`;

export async function checkFidelity(input: {
  description: string;
  rendered: string;
  signal?: AbortSignal;
}): Promise<FidelityVerdict | null> {
  try {
    const answer = await readImageWithGrok({
      image: input.rendered,
      focus: "compare against the original description supplied in the system instruction",
      signal: input.signal,
      system: FIDELITY_SYSTEM,
      prefix: `ORIGINAL BUILDING:\n${input.description}\n\nNow examine the rendered image.`,
    });

    const match = /\{[\s\S]*\}/.exec(answer);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as {
      same?: boolean;
      differences?: unknown;
    };

    return {
      ok: parsed.same !== false,
      differences: Array.isArray(parsed.differences)
        ? parsed.differences
            .filter((entry): entry is string => typeof entry === "string")
            .slice(0, 6)
        : [],
    };
  } catch (error) {
    // The check is advisory. If it cannot run, the render still stands —
    // failing a good picture because a verification call timed out would be
    // the check causing the harm it exists to prevent.
    console.error(
      "[medosha-ai:render] fidelity check unavailable:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
