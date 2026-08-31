import "server-only";

import { createHash } from "node:crypto";

import type { SpaceAnalysis } from "@/lib/ai/vision.types";
import {
  configuredVisionProviders,
  visionSetupHelp,
  type VisionProvider,
  type VisionProviderName,
} from "@/lib/ai/vision-providers";

export type {
  DetectedFurniture,
  DetectedSurface,
  SpaceAnalysis,
} from "@/lib/ai/vision.types";

/**
 * Looking at a photograph.
 *
 * The redesign workflow needs to know what it is redesigning before it can
 * usefully change anything: a prompt that says "make this modern" without
 * knowing it is a kitchen produces a picture of somebody else's kitchen.
 *
 * The walk is two levels deep, which is the fix for the 404 this replaced.
 * A provider that answers "no such model" has its *next candidate model*
 * tried before the provider itself is given up on — because a retired model
 * name says nothing about whether the account works. Only an answer about the
 * account, or a second failed model, moves on to the next provider.
 */

// ---------------------------------------------------------------------------
// What we accept
// ---------------------------------------------------------------------------

export const VISION_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

/**
 * HEIC, honestly.
 *
 * No hosted vision model accepts it, so a HEIC that reaches here will fail
 * whatever we do. Saying so up front — with the camera setting to change — is
 * better than six providers failing one after another and the last one taking
 * the blame.
 */
const UNSUPPORTED_BY_PROVIDERS = new Set(["image/heic", "image/heif"]);

export type ImageCheck =
  | { ok: true; mime: string; bytes: number }
  | { ok: false; reason: string };

export function checkImage(dataUrl: string, maxBytes: number): ImageCheck {
  if (dataUrl.startsWith("https://")) {
    return { ok: true, mime: "image/unknown", bytes: 0 };
  }

  const match = /^data:([^;,]+)[^,]*,/.exec(dataUrl);
  const mime = match?.[1]?.toLowerCase() ?? "";

  if (!mime.startsWith("image/")) {
    return { ok: false, reason: "That file is not an image." };
  }

  if (UNSUPPORTED_BY_PROVIDERS.has(mime)) {
    return {
      ok: false,
      reason:
        "That is an iPhone HEIC photo, which no vision model can read. On the iPhone: Settings → Camera → Formats → Most Compatible, or share the photo to convert it to JPEG first.",
    };
  }

  if (!VISION_MIME_TYPES.includes(mime as (typeof VISION_MIME_TYPES)[number])) {
    return {
      ok: false,
      reason: `${mime} is not supported. Use JPEG, PNG or WebP.`,
    };
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > maxBytes) {
    return {
      ok: false,
      reason: `That image is ${(bytes / 1024 / 1024).toFixed(1)}MB. The limit is ${maxBytes / 1024 / 1024}MB.`,
    };
  }

  return { ok: true, mime, bytes };
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

const SYSTEM = `You are a senior interior architect looking at a photograph of a real space in Ethiopia.

Describe only what you can actually see. This is a survey, not a proposal.

Rules:
- Never invent a measurement. If you estimate dimensions, say "approximately" and keep it coarse. If you cannot tell, use null.
- Name materials as they appear — "ceramic floor tile", "painted plaster", "timber veneer" — and say "unclear" rather than guessing.
- Problems are things visibly wrong or limiting: poor natural light, damp staining, cramped circulation, dated finishes, exposed services. Not opinions about taste.
- If the image is a floor plan, a sketch, or a CAD or Revit screenshot rather than a photograph, say so in spaceType and describe the drawing.
- Use metric units.

Reply with JSON only. No prose before or after, no code fences.`;

const SCHEMA = `{
  "spaceType": string,
  "estimatedDimensions": string | null,
  "lighting": string,
  "walls": string,
  "windows": string,
  "doors": string,
  "ceiling": string,
  "floor": string,
  "surfaces": [{ "element": string, "material": string, "condition": string }],
  "furniture": [{ "item": string, "position": string }],
  "emptyAreas": [string],
  "currentStyle": string,
  "problems": [string],
  "summary": string,
  "suggestedStyles": [string]
}`;

const STYLE_IDS = [
  "modern", "luxury", "minimalist", "industrial", "scandinavian", "japandi",
  "classic", "contemporary", "ethiopian", "hotel", "office", "restaurant",
  "african-luxury",
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON object in the reply.");
  }

  return JSON.parse(text.slice(start, end + 1));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

/** Trust nothing from a model: a missing field must not crash the panel. */
function normalise(raw: unknown): SpaceAnalysis {
  const input = (raw ?? {}) as Record<string, unknown>;

  const surfaces = Array.isArray(input.surfaces)
    ? (input.surfaces as Record<string, unknown>[])
        .map((entry) => ({
          element: asString(entry?.element),
          material: asString(entry?.material, "unclear"),
          condition: asString(entry?.condition) || undefined,
        }))
        .filter((entry) => entry.element)
        .slice(0, 12)
    : [];

  const furniture = Array.isArray(input.furniture)
    ? (input.furniture as Record<string, unknown>[])
        .map((entry) => ({
          item: asString(entry?.item),
          position: asString(entry?.position) || undefined,
        }))
        .filter((entry) => entry.item)
        .slice(0, 16)
    : [];

  return {
    spaceType: asString(input.spaceType, "Space"),
    estimatedDimensions:
      typeof input.estimatedDimensions === "string" &&
      input.estimatedDimensions.trim()
        ? input.estimatedDimensions.trim()
        : null,
    lighting: asString(input.lighting, "Not clear from the image"),
    walls: asString(input.walls, "Not clear from the image"),
    windows: asString(input.windows, "Not clear from the image"),
    doors: asString(input.doors, "Not clear from the image"),
    ceiling: asString(input.ceiling, "Not clear from the image"),
    floor: asString(input.floor, "Not clear from the image"),
    surfaces,
    furniture,
    emptyAreas: asStringArray(input.emptyAreas),
    currentStyle: asString(input.currentStyle, "Not clear"),
    problems: asStringArray(input.problems),
    summary: asString(input.summary, "The image could not be described."),
    // An empty list is better than a wrong one; the UI shows every style then.
    suggestedStyles: asStringArray(input.suggestedStyles)
      .map((style) => style.toLowerCase().replace(/\s+/g, "-"))
      .filter((style) => STYLE_IDS.includes(style))
      .slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

type Verdict =
  /** This model is wrong; the account may be fine. Try the next model. */
  | "next_model"
  /** This account is the problem. Try the next provider. */
  | "next_provider";

/**
 * What a failed call means for the walk.
 *
 * The distinction that matters is 404. It almost always means the *model* name
 * is retired, not that anything is wrong with the key — so it must try the
 * next model on the same provider. Treating it as a provider failure, which is
 * what produced the reported error, threw away a working account over a
 * renamed model.
 */
export function classifyVisionFailure(status: number, body: string): Verdict {
  const text = body.toLowerCase();

  if (status === 404) return "next_model";
  if (
    status === 400 &&
    (text.includes("model") ||
      text.includes("does not exist") ||
      text.includes("decommission"))
  ) {
    return "next_model";
  }
  // How OpenAI reports a retired name, sometimes under a 403.
  if (text.includes("model_not_found") || text.includes("model not found")) {
    return "next_model";
  }
  if (status === 403 && text.includes("model")) return "next_model";

  return "next_provider";
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Successful analyses, keyed by the image itself.
 *
 * Analysis is the slowest step in the redesign workflow, and a seller who
 * reloads the page or re-uploads the same photo should not pay for it twice.
 * Keyed on a hash of the bytes, so the same photo under a different filename
 * still hits.
 *
 * In-memory and bounded. A restart loses it, which is the right trade for
 * something this cheap to recompute and this awkward to invalidate.
 */
const CACHE_MAX = 200;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry = {
  analysis: SpaceAnalysis;
  provider: VisionProviderName;
  model: string;
  at: number;
};

const cache = new Map<string, CacheEntry>();

export function imageKey(dataUrl: string): string {
  return createHash("sha256").update(dataUrl).digest("hex").slice(0, 32);
}

function readCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency so the busiest images survive eviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function writeCache(key: string, entry: CacheEntry): void {
  cache.set(key, entry);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

export type VisionAttempt = {
  provider: VisionProviderName;
  label: string;
  model: string;
  ok: boolean;
  status?: number;
  ms: number;
  /** Already fit to read. The raw body goes to the server log only. */
  reason?: string;
};

export type VisionEvent =
  | { type: "trying"; provider: VisionProviderName; label: string; model: string }
  | { type: "failed"; provider: VisionProviderName; label: string; reason: string }
  | { type: "cached"; provider: VisionProviderName; label: string };

export type VisionResult = {
  analysis: SpaceAnalysis;
  provider: VisionProviderName;
  model: string;
  attempts: VisionAttempt[];
  cached: boolean;
};

export class VisionUnavailableError extends Error {
  readonly attempts: VisionAttempt[];
  constructor(message: string, attempts: VisionAttempt[] = []) {
    super(message);
    this.name = "VisionUnavailableError";
    this.attempts = attempts;
  }
}

export function visionProviders(): VisionProviderName[] {
  return configuredVisionProviders().map((provider) => provider.name);
}

const TIMEOUT_MS = 45_000;

async function callProvider(
  provider: VisionProvider,
  model: string,
  image: string,
  signal?: AbortSignal,
): Promise<
  { ok: true; content: string } | { ok: false; status: number; body: string }
> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch(provider.endpoint, {
    method: "POST",
    signal: composed,
    headers: {
      "content-type": "application/json",
      ...provider.headers(provider.apiKey()),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1600,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Survey this space and reply with JSON matching exactly this shape:\n${SCHEMA}\n\nFor "suggestedStyles", choose up to four from: ${STYLE_IDS.join(", ")}.`,
            },
            // A base64 data URL, inline. None of these providers take
            // multipart/form-data on their chat endpoint — that is the images
            // API, which is a different thing and does not do analysis.
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, status: response.status, body };
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content) {
    return { ok: false, status: 200, body: "Empty reply from the model." };
  }

  return { ok: true, content };
}

/** The provider's status, rewritten for a person. Never their raw text. */
function humanReason(
  provider: VisionProvider,
  status: number,
  verdict: Verdict,
): string {
  if (verdict === "next_model") {
    return `${provider.label} no longer has that model.`;
  }
  if (status === 401) return `${provider.label} did not accept its API key.`;
  if (status === 403) return `${provider.label} refused the request.`;
  if (status === 429) return `${provider.label} is rate limited.`;
  if (status === 402) return `${provider.label} reports no credit left.`;
  if (status >= 500) return `${provider.label} is temporarily unavailable.`;
  return `${provider.label} could not read the image.`;
}

/**
 * What to say when every provider is exhausted.
 *
 * Leads with the reason rather than the count. "Tried 2 providers" tells the
 * reader nothing they can act on; naming the rejected key or the retired model
 * tells them exactly what to change.
 */
function summarise(attempts: VisionAttempt[]): string {
  if (attempts.length === 0) return visionSetupHelp();

  const keyProblem = attempts.find((attempt) =>
    attempt.reason?.includes("API key"),
  );
  if (keyProblem?.reason) {
    return `${keyProblem.reason} Fix that key, or add another provider — GEMINI_API_KEY and HUGGINGFACE_API_KEY both have free tiers.`;
  }

  if (attempts.every((attempt) => attempt.reason?.includes("no longer has"))) {
    return "Every vision model this deployment knows about has been retired by its provider. Set OPENAI_VISION_MODEL or GEMINI_VISION_MODEL to a current model name.";
  }

  return attempts.at(-1)?.reason ?? "No vision provider could read the image.";
}

/**
 * Describes what is in an image.
 *
 * Tries every configured provider, and within each provider every candidate
 * model, until one answers. `onEvent` fires before each attempt so the caller
 * can say which provider is working — the wait is long enough that a bare
 * "analysing" reads as a hang.
 */
export async function analyzeImage(
  image: string,
  signal?: AbortSignal,
  onEvent?: (event: VisionEvent) => void,
): Promise<VisionResult> {
  const providers = configuredVisionProviders();
  if (providers.length === 0) {
    throw new VisionUnavailableError(visionSetupHelp());
  }

  const key = imageKey(image);
  const hit = readCache(key);
  if (hit) {
    onEvent?.({
      type: "cached",
      provider: hit.provider,
      label:
        providers.find((entry) => entry.name === hit.provider)?.label ??
        hit.provider,
    });
    return {
      analysis: hit.analysis,
      provider: hit.provider,
      model: hit.model,
      attempts: [],
      cached: true,
    };
  }

  const attempts: VisionAttempt[] = [];

  for (const provider of providers) {
    for (const model of provider.models) {
      if (signal?.aborted) {
        throw new VisionUnavailableError("Cancelled.", attempts);
      }

      onEvent?.({
        type: "trying",
        provider: provider.name,
        label: provider.label,
        model,
      });

      const startedAt = Date.now();

      try {
        const result = await callProvider(provider, model, image, signal);

        if (result.ok) {
          const analysis = normalise(extractJson(result.content));
          attempts.push({
            provider: provider.name,
            label: provider.label,
            model,
            ok: true,
            ms: Date.now() - startedAt,
          });
          writeCache(key, {
            analysis,
            provider: provider.name,
            model,
            at: Date.now(),
          });
          return {
            analysis,
            provider: provider.name,
            model,
            attempts,
            cached: false,
          };
        }

        // The real answer, in full, in the server log. This is the line that
        // turns "groq 404" into something an operator can act on.
        console.error(
          `[medosha:vision] ${provider.name}/${model} → HTTP ${result.status}\n` +
            `  endpoint: ${provider.endpoint}\n` +
            `  body: ${result.body.slice(0, 1200) || "(empty)"}`,
        );

        const verdict = classifyVisionFailure(result.status, result.body);
        const reason = humanReason(provider, result.status, verdict);

        attempts.push({
          provider: provider.name,
          label: provider.label,
          model,
          ok: false,
          status: result.status,
          ms: Date.now() - startedAt,
          reason,
        });

        // A retired model name is not a broken account: try the next model on
        // this same provider before giving up on it.
        if (verdict === "next_model") continue;

        onEvent?.({
          type: "failed",
          provider: provider.name,
          label: provider.label,
          reason,
        });
        break;
      } catch (error) {
        if (signal?.aborted) {
          throw new VisionUnavailableError("Cancelled.", attempts);
        }

        const timedOut = (error as { name?: string })?.name === "TimeoutError";
        const reason = timedOut
          ? `${provider.label} took too long.`
          : `${provider.label} could not be reached.`;

        console.error(
          `[medosha:vision] ${provider.name}/${model} threw:`,
          error instanceof Error ? error.message : error,
        );

        attempts.push({
          provider: provider.name,
          label: provider.label,
          model,
          ok: false,
          ms: Date.now() - startedAt,
          reason,
        });

        onEvent?.({
          type: "failed",
          provider: provider.name,
          label: provider.label,
          reason,
        });
        break;
      }
    }
  }

  throw new VisionUnavailableError(summarise(attempts), attempts);
}
