import "server-only";

import {
  actionFrom,
  buildArchitecturalPrompt,
} from "@/lib/ai/architectural-prompt";
import {
  generateXaiImages,
  readImageWithGrok,
  XaiImageError,
  type XaiFailure,
} from "@/lib/ai/xai-images";
import {
  IMAGE_PROVIDERS,
  dimensionsFor,
  stepsFor,
  type AspectRatio,
  type ImageModel,
  type ImageProviderName,
  type QualityLevel,
} from "@/lib/ai/image-models";

/**
 * Image generation, one adapter per provider.
 *
 * The catalogue in `image-models.ts` says what exists; this file says how to
 * call it. Every adapter takes the same request and returns the same result,
 * so the route above has no provider-specific branches and the UI has none
 * at all.
 *
 * Keys are read from the environment at call time and never leave the server.
 * This module is server-only, so importing it from a client component is a
 * build error rather than a leaked key.
 */

export type ImageRequest = {
  model: ImageModel;
  prompt: string;
  negativePrompt?: string;
  aspect: AspectRatio;
  quality: QualityLevel;
  count: number;
  /** Data URL or https URL, for image-to-image, edits and utilities. */
  image?: string;
  /** Data URL of a white-on-black mask, for inpainting. */
  mask?: string;
  seed?: number;
  signal?: AbortSignal;
};

export type GeneratedImage = {
  url: string;
  width?: number;
  height?: number;
};

export class ImageProviderError extends Error {
  constructor(
    readonly provider: ImageProviderName,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}

function keyFor(provider: ImageProviderName): string | null {
  return process.env[IMAGE_PROVIDERS[provider].keyVar] ?? null;
}

/**
 * Whether a provider has everything it needs, which is not always one key.
 * Cloudflare wants an account id alongside its token; ComfyUI wants a URL and
 * no key at all.
 */
function isReady(provider: ImageProviderName): boolean {
  if (provider === "cloudflare") {
    return (
      process.env.CLOUDFLARE_API_TOKEN !== undefined &&
      process.env.CLOUDFLARE_ACCOUNT_ID !== undefined
    );
  }
  return keyFor(provider) !== null;
}

/** Providers with a key present. Never returns the keys themselves. */
export function configuredImageProviders(): ImageProviderName[] {
  return (Object.keys(IMAGE_PROVIDERS) as ImageProviderName[]).filter(isReady);
}

export function isImageProviderConfigured(
  provider: ImageProviderName,
): boolean {
  return isReady(provider);
}

/**
 * What to tell someone who has configured nothing.
 *
 * Named variables and a signup link, because "image generation is unavailable"
 * sends a person to the logs and this sends them to the fix.
 */
export function imageConfigurationHelp(): string {
  const free = ["fal", "together", "huggingface", "replicate"] as const;
  const names = free
    .map((provider) => `${IMAGE_PROVIDERS[provider].keyVar} (${IMAGE_PROVIDERS[provider].label})`)
    .join(", ");
  return `No image provider is configured. Set one of ${names} in .env.local and restart. All three have a free tier.`;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 120_000;

async function post(
  provider: ImageProviderName,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  // A provider that never answers must not hold the route open forever.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const composed = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  const response = await fetch(url, { ...init, signal: composed });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ImageProviderError(
      provider,
      response.status,
      body.slice(0, 300) || response.statusText,
    );
  }
  return response;
}

/**
 * xAI — generation, and editing built out of two calls.
 *
 * ## Generating
 *
 * `POST /v1/images/generations`, which takes `model`, `prompt`, `n` and
 * `response_format` and 400s on anything else. `size`, `quality` and `style`
 * are all rejected, so the aspect ratio the workspace collected is folded into
 * the prompt as words rather than sent as a parameter that fails the request.
 *
 * ## Editing
 *
 * There is no `/v1/images/edits` at xAI and the generations endpoint accepts no
 * source image. So an edit is: Grok looks at the uploaded photograph and writes
 * down what is actually there, and that description — plus the member's own
 * instruction, plus the rule that nothing else may change — becomes the prompt.
 *
 * That is a real edit in the sense that matters: the output is derived from the
 * member's pixels rather than from the four words they typed. It is not a real
 * edit in the sense of compositing onto the original, and `xai-images.ts` says
 * so at length rather than letting the button imply otherwise.
 *
 * The vision read is one extra call and about a second. It is skipped when
 * there is no image, which is every from-nothing generation.
 */
async function generateXai(request: ImageRequest): Promise<GeneratedImage[]> {
  const aspect = ASPECT_WORDS[request.aspect];

  // What the member actually asked for, untouched. Everything below is
  // appended; nothing rewrites their words.
  let prompt = request.prompt;

  if (request.image) {
    // The edit path. A failed read is not a failed edit — falling through to a
    // text-only generation would produce a picture of a different building,
    // which is exactly the behaviour this exists to prevent — so a read that
    // fails fails the request.
    const description = await readImageWithGrok({
      image: request.image,
      focus: request.prompt.slice(0, 200),
      signal: request.signal,
    });

    prompt = buildArchitecturalPrompt({
      instruction: request.prompt,
      description,
      action: actionFrom(request.prompt, true),
    });
  } else {
    prompt = buildArchitecturalPrompt({
      instruction: request.prompt,
      action: "generate",
    });
  }

  const full = [
    prompt,
    aspect ? `Composition: ${aspect}.` : "",
    request.negativePrompt ? `Avoid: ${request.negativePrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    return await generateXaiImages({
      prompt: full,
      count: request.count,
      signal: request.signal,
    });
  } catch (error) {
    // The chain above this speaks in ImageProviderError. Translating here keeps
    // the typed reason — which decides whether the chain retries and what the
    // member is told — rather than flattening everything to "provider failed".
    if (error instanceof XaiImageError) {
      throw new ImageProviderError("xai", statusForFailure(error.failure), error.detail);
    }
    throw error;
  }
}

/**
 * A typed xAI failure, as the HTTP status the fallback chain classifies on.
 *
 * The chain reads statuses, not reasons, so the reason is mapped back to the
 * status that means the same thing to it. Round-tripping rather than inventing:
 * a rejected key must still look like 401 upstream or the diagnostics page will
 * report it as an outage.
 */
function statusForFailure(failure: XaiFailure): number {
  switch (failure) {
    case "not_configured":
    case "invalid_key":
      return 401;
    case "no_credit":
      return 402;
    case "rate_limited":
      return 429;
    case "model_unavailable":
      return 404;
    case "bad_image":
      return 400;
    case "unreachable":
      return 504;
    default:
      return 502;
  }
}

/**
 * The aspect ratio as words, since it cannot be sent as a parameter.
 *
 * A weaker instruction than a width and a height — the model may ignore it —
 * but "wide 16:9 landscape framing" in the prompt moves the composition, and
 * silently returning a square when somebody asked for a banner moves nothing.
 */
const ASPECT_WORDS: Record<string, string> = {
  "1:1": "square framing",
  "16:9": "wide 16:9 landscape framing",
  "9:16": "tall 9:16 portrait framing",
  "4:3": "4:3 landscape framing",
  "3:4": "3:4 portrait framing",
  "3:2": "3:2 landscape framing",
  "2:3": "2:3 portrait framing",
};

/** fal.ai — synchronous queue endpoint, returns hosted URLs. */
async function generateFal(request: ImageRequest): Promise<GeneratedImage[]> {
  const key = keyFor("fal");
  if (!key) throw new ImageProviderError("fal", 401, "FAL_KEY is not set.");

  const { width, height } = dimensionsFor(request.aspect);
  const body: Record<string, unknown> = {
    prompt: request.prompt,
    num_images: request.count,
    image_size: { width, height },
    num_inference_steps: stepsFor(request.quality),
    enable_safety_checker: true,
  };
  if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
  if (request.seed !== undefined) body.seed = request.seed;
  if (request.image) body.image_url = request.image;
  if (request.mask) body.mask_url = request.mask;

  const response = await post(
    "fal",
    `https://fal.run/${request.model.ref}`,
    {
      method: "POST",
      headers: {
        authorization: `Key ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    request.signal,
  );

  const payload = (await response.json()) as {
    images?: { url: string; width?: number; height?: number }[];
    image?: { url: string };
  };

  // Utility models return a single `image`; generators return `images`.
  if (payload.images?.length) return payload.images;
  if (payload.image?.url) return [{ url: payload.image.url }];
  throw new ImageProviderError("fal", 502, "No image in the response.");
}

/** Replicate — create a prediction, then poll until it settles. */
async function generateReplicate(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("replicate");
  if (!key) {
    throw new ImageProviderError(
      "replicate",
      401,
      "REPLICATE_API_TOKEN is not set.",
    );
  }

  const { width, height } = dimensionsFor(request.aspect);
  const created = await post(
    "replicate",
    `https://api.replicate.com/v1/models/${request.model.ref}/predictions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // Ask Replicate to wait a little before returning, which usually
        // avoids polling entirely for the fast models.
        prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt: request.prompt,
          num_outputs: request.count,
          width,
          height,
          ...(request.negativePrompt
            ? { negative_prompt: request.negativePrompt }
            : {}),
          ...(request.image ? { image: request.image } : {}),
        },
      }),
    },
    request.signal,
  );

  let prediction = (await created.json()) as {
    id: string;
    status: string;
    output?: string[] | string;
    error?: string;
  };

  const deadline = Date.now() + TIMEOUT_MS;
  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled" &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await post(
      "replicate",
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { authorization: `Bearer ${key}` } },
      request.signal,
    );
    prediction = await poll.json();
  }

  if (prediction.status !== "succeeded") {
    throw new ImageProviderError(
      "replicate",
      502,
      prediction.error ?? `Prediction ${prediction.status}.`,
    );
  }

  const output = prediction.output;
  const urls = Array.isArray(output) ? output : output ? [output] : [];
  if (urls.length === 0) {
    throw new ImageProviderError("replicate", 502, "No image in the output.");
  }
  return urls.map((url) => ({ url }));
}

/** Hugging Face Inference — returns raw image bytes. */
async function generateHuggingFace(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("huggingface");
  if (!key) {
    throw new ImageProviderError(
      "huggingface",
      401,
      "HUGGINGFACE_API_KEY is not set.",
    );
  }

  const { width, height } = dimensionsFor(request.aspect);

  // The Inference API returns one image per call, so N images is N calls.
  const results = await Promise.all(
    Array.from({ length: request.count }, async () => {
      const response = await post(
        "huggingface",
        `https://api-inference.huggingface.co/models/${request.model.ref}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            // Without this a sleeping model returns 503 rather than waiting.
            "x-wait-for-model": "true",
          },
          body: JSON.stringify({
            inputs: request.prompt,
            parameters: {
              width,
              height,
              num_inference_steps: stepsFor(request.quality),
              ...(request.negativePrompt
                ? { negative_prompt: request.negativePrompt }
                : {}),
            },
          }),
        },
        request.signal,
      );

      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") ?? "image/png";
      return { url: `data:${type};base64,${buffer.toString("base64")}` };
    }),
  );

  return results;
}

/** Stability AI — multipart request, base64 response. */
async function generateStability(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("stability");
  if (!key) {
    throw new ImageProviderError(
      "stability",
      401,
      "STABILITY_API_KEY is not set.",
    );
  }

  const form = new FormData();
  form.append("prompt", request.prompt);
  form.append("model", request.model.ref);
  form.append("aspect_ratio", request.aspect);
  form.append("output_format", "png");
  if (request.negativePrompt) {
    form.append("negative_prompt", request.negativePrompt);
  }

  const response = await post(
    "stability",
    "https://api.stability.ai/v2beta/stable-image/generate/sd3",
    {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      body: form,
    },
    request.signal,
  );

  const payload = (await response.json()) as { image?: string };
  if (!payload.image) {
    throw new ImageProviderError("stability", 502, "No image in the response.");
  }
  return [{ url: `data:image/png;base64,${payload.image}` }];
}

/** OpenAI — GPT Image, generation and edits. */
async function generateOpenAi(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("openai");
  if (!key) {
    throw new ImageProviderError("openai", 401, "OPENAI_API_KEY is not set.");
  }

  const { width, height } = dimensionsFor(request.aspect);
  const size =
    width === height ? "1024x1024" : width > height ? "1536x1024" : "1024x1536";

  const response = await post(
    "openai",
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model.ref,
        prompt: request.negativePrompt
          ? `${request.prompt}\n\nAvoid: ${request.negativePrompt}`
          : request.prompt,
        n: request.count,
        size,
      }),
    },
    request.signal,
  );

  const payload = (await response.json()) as {
    data?: { url?: string; b64_json?: string }[];
  };
  const images = (payload.data ?? [])
    .map((entry) =>
      entry.url
        ? { url: entry.url }
        : entry.b64_json
          ? { url: `data:image/png;base64,${entry.b64_json}` }
          : null,
    )
    .filter((entry): entry is GeneratedImage => entry !== null);

  if (images.length === 0) {
    throw new ImageProviderError("openai", 502, "No image in the response.");
  }
  return images;
}

/** Google Imagen, through the Generative Language API. */
async function generateGemini(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("gemini");
  if (!key) {
    throw new ImageProviderError("gemini", 401, "GEMINI_API_KEY is not set.");
  }

  const response = await post(
    "gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${request.model.ref}:predict?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: request.prompt }],
        parameters: {
          sampleCount: request.count,
          aspectRatio: request.aspect,
          ...(request.negativePrompt
            ? { negativePrompt: request.negativePrompt }
            : {}),
        },
      }),
    },
    request.signal,
  );

  const payload = (await response.json()) as {
    predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  };
  const images = (payload.predictions ?? [])
    .filter((entry) => entry.bytesBase64Encoded)
    .map((entry) => ({
      url: `data:${entry.mimeType ?? "image/png"};base64,${entry.bytesBase64Encoded}`,
    }));

  if (images.length === 0) {
    throw new ImageProviderError("gemini", 502, "No image in the response.");
  }
  return images;
}


/** Together AI — OpenAI-shaped images endpoint, base64 or URL back. */
async function generateTogether(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("together");
  if (!key) {
    throw new ImageProviderError("together", 401, "TOGETHER_API_KEY is not set.");
  }

  const { width, height } = dimensionsFor(request.aspect);
  const response = await post(
    "together",
    "https://api.together.xyz/v1/images/generations",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model.ref,
        prompt: request.prompt,
        // The free endpoint caps steps at 4 whatever is asked for.
        steps: Math.min(4, stepsFor(request.quality)),
        n: request.count,
        width,
        height,
        ...(request.negativePrompt
          ? { negative_prompt: request.negativePrompt }
          : {}),
      }),
    },
    request.signal,
  );

  const payload = (await response.json()) as {
    data?: { url?: string; b64_json?: string }[];
  };
  const images = (payload.data ?? [])
    .map((entry) =>
      entry.url
        ? { url: entry.url }
        : entry.b64_json
          ? { url: `data:image/png;base64,${entry.b64_json}` }
          : null,
    )
    .filter((entry): entry is GeneratedImage => entry !== null);

  if (images.length === 0) {
    throw new ImageProviderError("together", 502, "No image in the response.");
  }
  return images;
}

/** Cloudflare Workers AI — needs an account id as well as a token. */
async function generateCloudflare(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const key = keyFor("cloudflare");
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? null;
  if (!key || !account) {
    throw new ImageProviderError(
      "cloudflare",
      401,
      "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must both be set.",
    );
  }

  // Workers AI returns one image per call.
  const results = await Promise.all(
    Array.from({ length: request.count }, async () => {
      const response = await post(
        "cloudflare",
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${request.model.ref}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            prompt: request.prompt,
            steps: Math.min(8, stepsFor(request.quality)),
          }),
        },
        request.signal,
      );

      const payload = (await response.json()) as {
        result?: { image?: string };
      };
      if (!payload.result?.image) {
        throw new ImageProviderError(
          "cloudflare",
          502,
          "No image in the response.",
        );
      }
      return { url: `data:image/jpeg;base64,${payload.result.image}` };
    }),
  );

  return results;
}

/**
 * ComfyUI on the user's own machine.
 *
 * Self-hosted, so there is no key — COMFYUI_URL being set is what "configured"
 * means. The prompt is submitted to the queue and the history endpoint is
 * polled until the workflow produces an image.
 */
async function generateComfy(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  const base = process.env.COMFYUI_URL?.replace(/\/$/, "") ?? null;
  if (!base) {
    throw new ImageProviderError("comfyui", 401, "COMFYUI_URL is not set.");
  }

  const { width, height } = dimensionsFor(request.aspect);

  // A minimal text-to-image graph. A deployment with its own workflow points
  // COMFYUI_WORKFLOW at a JSON file and that is used instead.
  const workflow = process.env.COMFYUI_WORKFLOW
    ? JSON.parse(process.env.COMFYUI_WORKFLOW)
    : {
        "3": {
          class_type: "KSampler",
          inputs: {
            seed: request.seed ?? Math.floor(Math.random() * 1_000_000),
            steps: stepsFor(request.quality),
            cfg: 7,
            sampler_name: "euler",
            scheduler: "normal",
            denoise: 1,
            model: ["4", 0],
            positive: ["6", 0],
            negative: ["7", 0],
            latent_image: ["5", 0],
          },
        },
        "4": {
          class_type: "CheckpointLoaderSimple",
          inputs: {
            ckpt_name: process.env.COMFYUI_CHECKPOINT ?? "sd_xl_base_1.0.safetensors",
          },
        },
        "5": {
          class_type: "EmptyLatentImage",
          inputs: { width, height, batch_size: request.count },
        },
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: request.prompt, clip: ["4", 1] },
        },
        "7": {
          class_type: "CLIPTextEncode",
          inputs: { text: request.negativePrompt ?? "", clip: ["4", 1] },
        },
        "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
        "9": {
          class_type: "SaveImage",
          inputs: { filename_prefix: "medosha", images: ["8", 0] },
        },
      };

  const queued = await post(
    "comfyui",
    `${base}/prompt`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    },
    request.signal,
  );

  const { prompt_id: promptId } = (await queued.json()) as { prompt_id: string };
  if (!promptId) {
    throw new ImageProviderError("comfyui", 502, "The queue returned no id.");
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await post(
      "comfyui",
      `${base}/history/${promptId}`,
      {},
      request.signal,
    );
    const history = (await poll.json()) as Record<
      string,
      { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }
    >;

    const outputs = history[promptId]?.outputs;
    if (!outputs) continue;

    const files = Object.values(outputs).flatMap((node) => node.images ?? []);
    if (files.length > 0) {
      return files.map((file) => ({
        url: `${base}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder)}&type=${encodeURIComponent(file.type)}`,
      }));
    }
  }

  throw new ImageProviderError("comfyui", 504, "The workflow did not finish in time.");
}

const ADAPTERS: Record<
  ImageProviderName,
  (request: ImageRequest) => Promise<GeneratedImage[]>
> = {
  xai: generateXai,
  fal: generateFal,
  replicate: generateReplicate,
  huggingface: generateHuggingFace,
  stability: generateStability,
  openai: generateOpenAi,
  gemini: generateGemini,
  together: generateTogether,
  cloudflare: generateCloudflare,
  comfyui: generateComfy,
};

export async function generateImages(
  request: ImageRequest,
): Promise<GeneratedImage[]> {
  return ADAPTERS[request.model.provider](request);
}
