import "server-only";

/**
 * Grok, doing pictures.
 *
 * Everything Medosha asks xAI for that ends in an image goes through here:
 * making one from words, and changing one that already exists. Both are one
 * HTTP call away, and the whole of the difficulty is in the second.
 *
 * ## Three calls, and which one to reach for
 *
 * `editXaiImage` — `POST /v1/images/edits`, multipart, with the source image
 * attached as a real file part. **This is the one that preserves a building.**
 * The pixels go to the model, so the roof stays where the roof is. Anything
 * rendering somebody's own drawing should be using it.
 *
 * `generateXaiImages` — `POST /v1/images/generations`. Text to image. It takes
 * `model`, `prompt`, `n` and `response_format` and no source image at all, so a
 * building described to it comes back as *a* building, not *the* building. It
 * is correct for making something from nothing and wrong for editing.
 *
 * `readImageWithGrok` — a multimodal chat completion. It looks and reports; it
 * draws nothing.
 *
 * An earlier version of this comment claimed xAI had no editing endpoint, and
 * the whole pipeline was built around that belief: read the image, describe it,
 * generate from the description. That produced a different building every time,
 * which is exactly what it sounds like it would produce. It was wrong, and the
 * note is left here because a file that quietly corrects itself teaches nobody
 * why the code is shaped the way it is.
 *
 * ## The key
 *
 * `XAI_API_KEY`, read from the environment at call time, on the server, in a
 * module marked `server-only` so that importing it from a component is a build
 * error rather than a leaked key. It is never returned, never logged, never
 * put in an error message, and never sent anywhere except api.x.ai.
 */

import { logRenderRequest } from "@/lib/ai/rendering/debug";

const API = "https://api.x.ai/v1";

/** Long enough for a slow image, short enough that a hung request ends. */
const IMAGE_TIMEOUT_MS = 120_000;
/** The vision read is a chat completion and should be quick. */
const VISION_TIMEOUT_MS = 60_000;

/**
 * The fallback image model.
 *
 * `grok-2-image-1212` is xAI's published image model and what an account gets
 * today. It is the *last* resort rather than the default: `xaiImageModel()`
 * asks the account which image models it actually has before falling back to
 * this, so an account with something newer uses the newer one without a code
 * change, and nothing here is a model name somebody guessed.
 */
const FALLBACK_IMAGE_MODEL = "grok-2-image-1212";

/**
 * The model used when editing an image rather than making one.
 *
 * Grok Imagine's editing model. Overridable with `XAI_EDIT_MODEL` because model
 * names move and a pinned one is a feature that works until it does not — the
 * environment variable is how an operator follows a rename without waiting for
 * a deploy.
 */
const EDIT_MODEL = "grok-imagine-image-quality";

/** The editing endpoint path, overridable for the same reason. */
const EDIT_PATH = "/images/edits";

export function xaiEditModel(): string {
  return process.env.XAI_EDIT_MODEL?.trim() || EDIT_MODEL;
}

/** The reasoning model. Multimodal, so it is also what reads a photograph. */
export function xaiTextModel(): string {
  return process.env.XAI_MODEL?.trim() || "grok-4.5";
}

export function xaiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key ? key : null;
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * Why a call failed, in the vocabulary the UI needs.
 *
 * Not the provider's own words. xAI's error bodies carry endpoint paths,
 * account identifiers and occasionally the beginning of the key, and the whole
 * point of a typed reason is that the sentence shown to a member is written
 * here rather than forwarded from somewhere else.
 */
export type XaiFailure =
  | "not_configured"
  | "invalid_key"
  | "no_credit"
  | "rate_limited"
  | "model_unavailable"
  | "bad_image"
  | "unreachable"
  | "provider_error"
  | "no_image";

export class XaiImageError extends Error {
  constructor(
    readonly failure: XaiFailure,
    /** The technical detail. Logged on the server; never sent to a browser. */
    readonly detail: string,
  ) {
    super(detail);
    this.name = "XaiImageError";
  }
}

/**
 * What a member reads.
 *
 * Every sentence names a thing somebody can do about it, and none of them is
 * "did not accept its API key" — that told the member, who cannot see the
 * environment, about a problem only the operator can fix.
 */
export function messageFor(failure: XaiFailure): string {
  switch (failure) {
    case "not_configured":
    case "invalid_key":
      return "Medosha AI is not configured. Please contact the administrator.";
    case "no_credit":
      return "Medosha AI is temporarily unavailable because the AI credit balance is insufficient.";
    case "rate_limited":
      return "Medosha AI is busy right now. Please try again in a moment.";
    case "bad_image":
      return "Please upload a supported image.";
    case "model_unavailable":
    case "provider_error":
    case "unreachable":
    case "no_image":
      return "Medosha AI could not generate the image. Please try again.";
  }
}

/**
 * An HTTP status and a response body, turned into a reason.
 *
 * The body is read because status alone is ambiguous — xAI returns 403 for
 * both a rejected key and an account that cannot use a model, which need
 * opposite responses — and then discarded.
 */
export function classifyXai(status: number, body: string): XaiFailure {
  const text = body.toLowerCase();

  const quota =
    text.includes("credit") ||
    text.includes("quota") ||
    text.includes("billing") ||
    text.includes("insufficient") ||
    text.includes("spending limit");

  if (status === 401) return "invalid_key";
  if (status === 402) return "no_credit";
  if (status === 403) return quota ? "no_credit" : "invalid_key";
  if (status === 429) return quota ? "no_credit" : "rate_limited";
  if (status === 404) return "model_unavailable";
  if (status === 400) {
    // A 400 mentioning the image is the member's file, not the request shape.
    if (text.includes("image") && (text.includes("decode") || text.includes("invalid") || text.includes("unsupported"))) {
      return "bad_image";
    }
    if (text.includes("model")) return "model_unavailable";
    return "provider_error";
  }
  if (status === 408 || status === 504) return "unreachable";
  return "provider_error";
}

async function call(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const key = xaiKey();
  if (!key) {
    throw new XaiImageError("not_configured", "XAI_API_KEY is not set.");
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${key}`,
      },
      signal: composed,
    });
  } catch (error) {
    // A thrown fetch never reached xAI, so there is no status to classify.
    throw new XaiImageError(
      "unreachable",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new XaiImageError(
      classifyXai(response.status, body),
      `HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  return response;
}

// ---------------------------------------------------------------------------
// Which image model this account has
// ---------------------------------------------------------------------------

type ModelCache = { model: string; at: number };
let cached: ModelCache | null = null;
const MODEL_TTL_MS = 30 * 60 * 1000;

/**
 * The image model to use, asked for rather than assumed.
 *
 * Order: whatever the operator pinned, then whatever the account says it has,
 * then the published fallback. The middle step is the point — xAI renames and
 * retires image models, and a hardcoded name is a feature that works until the
 * day it silently does not. Nothing here is a name invented by this codebase.
 *
 * A failed lookup is not an error. It falls back, because being unable to list
 * models is not a reason to refuse to generate one.
 */
export async function xaiImageModel(signal?: AbortSignal): Promise<string> {
  const pinned = process.env.XAI_IMAGE_MODEL?.trim();
  if (pinned) return pinned;

  if (cached && Date.now() - cached.at < MODEL_TTL_MS) return cached.model;

  try {
    const response = await call(`${API}/models`, {}, VISION_TIMEOUT_MS, signal);
    const payload = (await response.json()) as { data?: { id?: string }[] };
    const ids = (payload.data ?? [])
      .map((entry) => entry.id ?? "")
      .filter(Boolean);

    // "image" in the name is how xAI marks them, and the list is sorted so a
    // dated name (grok-2-image-1212) beats a bare one when both are present.
    const images = ids.filter((id) => id.includes("image")).sort().reverse();
    const model = images[0] ?? FALLBACK_IMAGE_MODEL;

    cached = { model, at: Date.now() };
    return model;
  } catch {
    return FALLBACK_IMAGE_MODEL;
  }
}

/** Forgets the discovered model. Used by the doctor script between runs. */
export function forgetImageModel(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Generating
// ---------------------------------------------------------------------------

export type XaiGeneratedImage = { url: string };

/**
 * An image from words.
 *
 * `b64_json` rather than `url` on purpose. xAI's hosted URLs expire, and the
 * whole of Medosha's image workflow depends on the last picture still being
 * there when the member types "now make it warmer" ten minutes later. A data
 * URL cannot expire, and it is the same thing the Hugging Face, Stability and
 * Google adapters already return, so nothing downstream needed changing.
 */
export async function generateXaiImages(input: {
  prompt: string;
  count?: number;
  signal?: AbortSignal;
  /** Carried for the debug line only. Never sent to xAI. */
  preserveArchitecture?: boolean;
  creativeFreedom?: string;
}): Promise<XaiGeneratedImage[]> {
  const model = await xaiImageModel(input.signal);

  // Logged even though there is no image, and *especially* because there is no
  // image: a generation reached while preservation is on is the exact failure
  // being hunted, and the debug line says so in as many words.
  logRenderRequest({
    endpoint: `${API}/images/generations`,
    model,
    operation: "generate",
    image: null,
    preserveArchitecture: input.preserveArchitecture ?? false,
    creativeFreedom: input.creativeFreedom ?? "unknown",
    prompt: input.prompt,
  });

  const response = await call(
    `${API}/images/generations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        // The API caps n at 10 and 400s above it.
        n: Math.min(Math.max(input.count ?? 1, 1), 10),
        response_format: "b64_json",
      }),
    },
    IMAGE_TIMEOUT_MS,
    input.signal,
  );

  const payload = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };

  const images = (payload.data ?? [])
    .map((entry) =>
      entry.b64_json
        ? { url: `data:image/jpeg;base64,${entry.b64_json}` }
        : entry.url
          ? { url: entry.url }
          : null,
    )
    .filter((entry): entry is XaiGeneratedImage => entry !== null);

  if (images.length === 0) {
    throw new XaiImageError("no_image", "The response carried no image.");
  }

  return images;
}

/**
 * Editing an image, with the image.
 *
 * The point of this function, and the reason it exists at all: the uploaded
 * building goes to the model *as pixels*. Everything else Medosha had was
 * generation — a prompt describing a building, and a model drawing whatever
 * that described. Which is why a four-storey block came back with a different
 * roof: the roof was never sent.
 *
 * Multipart, matching the OpenAI-compatible shape xAI uses for its other image
 * endpoint: `model`, `image`, `prompt`, `n`, `response_format`. The source is
 * attached as a file part, which is the form that works for a data URI, a
 * fetched URL and an uploaded file alike.
 *
 * `response_format: b64_json` for the same reason as generation — a hosted URL
 * expires and the whole carry-forward workflow depends on the last picture
 * still being there.
 */
export async function editXaiImage(input: {
  image: string;
  prompt: string;
  count?: number;
  signal?: AbortSignal;
  /** Carried for the debug line only. Never sent to xAI. */
  creativeFreedom?: string;
}): Promise<XaiGeneratedImage[]> {
  if (!isUsableImage(input.image)) {
    throw new XaiImageError("bad_image", "The source is not a data URL or https URL.");
  }

  const { blob, filename } = await asBlob(input.image);

  const form = new FormData();
  form.append("model", xaiEditModel());
  form.append("image", blob, filename);
  form.append("prompt", input.prompt);
  form.append("n", String(Math.min(Math.max(input.count ?? 1, 1), 10)));
  form.append("response_format", "b64_json");

  const endpoint = `${API}${process.env.XAI_EDIT_PATH?.trim() || EDIT_PATH}`;

  logRenderRequest({
    endpoint,
    model: xaiEditModel(),
    operation: "edit",
    image: input.image,
    // An edit is only reached under the lock, so this is true by construction —
    // stated rather than assumed, because "by construction" is exactly the kind
    // of claim that stops being true after a refactor.
    preserveArchitecture: true,
    creativeFreedom: input.creativeFreedom ?? "unknown",
    prompt: input.prompt,
  });

  const response = await call(
    endpoint,
    {
      method: "POST",
      // No content-type: fetch sets it with the multipart boundary, and setting
      // it by hand omits the boundary and produces a 400 nobody can read.
      body: form,
    },
    IMAGE_TIMEOUT_MS,
    input.signal,
  );

  const payload = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };

  const images = (payload.data ?? [])
    .map((entry) =>
      entry.b64_json
        ? { url: `data:image/jpeg;base64,${entry.b64_json}` }
        : entry.url
          ? { url: entry.url }
          : null,
    )
    .filter((entry): entry is XaiGeneratedImage => entry !== null);

  if (images.length === 0) {
    throw new XaiImageError("no_image", "The edit returned no image.");
  }
  return images;
}

/** A data URL or an https URL, as the bytes a multipart part needs. */
async function asBlob(
  image: string,
): Promise<{ blob: Blob; filename: string }> {
  if (image.startsWith("data:")) {
    const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(image);
    if (!match) throw new XaiImageError("bad_image", "Unreadable data URL.");
    const mime = match[1]!.toLowerCase();
    const extension =
      mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    return {
      blob: new Blob([new Uint8Array(Buffer.from(match[2]!, "base64"))], {
        type: mime,
      }),
      filename: `source.${extension}`,
    };
  }

  const response = await fetch(image, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new XaiImageError(
      "bad_image",
      `Could not fetch the source image (${response.status}).`,
    );
  }
  return { blob: await response.blob(), filename: "source.jpg" };
}

/**
 * Whether this account can edit rather than only generate.
 *
 * Asked rather than assumed: the model list is the account's own answer, and a
 * deployment whose account has the editing model should use it without anybody
 * editing code. A pinned `XAI_EDIT_MODEL` is taken as a statement of intent and
 * short-circuits the lookup.
 */
export async function xaiCanEdit(signal?: AbortSignal): Promise<boolean> {
  if (process.env.XAI_EDIT_MODEL?.trim()) return true;

  try {
    const response = await call(`${API}/models`, {}, VISION_TIMEOUT_MS, signal);
    const payload = (await response.json()) as { data?: { id?: string }[] };
    const ids = (payload.data ?? []).map((entry) => entry.id ?? "");
    return ids.some((id) => id.includes("imagine") || id === EDIT_MODEL);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Looking
// ---------------------------------------------------------------------------

/**
 * Grok, reading a photograph.
 *
 * The instruction below is written for one job: produce a description precise
 * enough that regenerating from it lands on the same building. So it asks for
 * counts — storeys, bays, windows per floor — rather than adjectives, because
 * "a modern apartment block" regenerates as any modern apartment block and
 * "four storeys, five window bays, balconies on the middle two floors"
 * regenerates as something recognisably this one.
 */
const READ_SYSTEM = `You are an architectural observer for Medosha, an Ethiopian construction platform.

Describe the building or space in the image so precisely that an image model could redraw it. Report only what you can see. Never invent a detail you cannot make out, and never guess a location, an architect or a date.

Cover, in this order and in one flowing paragraph:
- building type and how many storeys
- the overall form and roof shape
- how many window bays across the visible face, and the window shape and proportion
- balconies, canopies, parapets, railings and where they are
- the entrance and doors
- every visible material and its colour, surface by surface
- the camera: eye level or raised, straight on or at an angle, how much of the building is in frame
- the light: time of day, direction of the sun, sky, shadows
- the ground and immediate surroundings

Be specific about counts and positions. Do not comment on quality, do not suggest changes, and do not use the words "modern", "beautiful" or "stunning". Under 220 words.`;

/**
 * What is in this image, in words, from Grok.
 *
 * Accepts a data URL or an https URL — the same two shapes the rest of the
 * image pipeline passes around.
 */
export async function readImageWithGrok(input: {
  image: string;
  /** Extra direction, when the caller wants the read pointed somewhere. */
  focus?: string;
  signal?: AbortSignal;
  /**
   * A different job entirely.
   *
   * The default system prompt asks for a description. The fidelity check asks
   * the same model to compare a render against one, which is a different task
   * with a different output shape — so it supplies its own instruction rather
   * than trying to coax a comparison out of a describer.
   */
  system?: string;
  /** Text placed before the image, when the task needs context first. */
  prefix?: string;
}): Promise<string> {
  if (!isUsableImage(input.image)) {
    throw new XaiImageError("bad_image", "The image is not a data URL or https URL.");
  }

  const response = await call(
    `${API}/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: xaiTextModel(),
        messages: [
          { role: "system", content: input.system ?? READ_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  input.prefix,
                  input.system
                    ? undefined
                    : input.focus
                      ? `Describe this. Pay particular attention to: ${input.focus}`
                      : "Describe this.",
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
              { type: "image_url", image_url: { url: input.image, detail: "high" } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    },
    VISION_TIMEOUT_MS,
    input.signal,
  );

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new XaiImageError("provider_error", "The vision call returned no text.");
  }
  return text;
}

/** The two image shapes the pipeline uses. Anything else is a bad upload. */
export function isUsableImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("data:image/") || value.startsWith("https://"))
  );
}
