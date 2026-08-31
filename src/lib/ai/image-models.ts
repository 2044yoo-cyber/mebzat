/**
 * The image-model catalogue.
 *
 * Client-safe on purpose: the model picker, the quality modes, the Auto
 * router, the free-tier filter, the provider manager and the API route's
 * validation all read this one array.
 *
 * Adding a model is one entry here. Adding a *provider* is one entry in
 * IMAGE_PROVIDERS plus one adapter in `image-provider.ts` — nothing in the UI
 * changes either way, which is what "add providers without changing the UI"
 * has to mean in practice.
 *
 * No keys and no endpoints live in this file. Those are server-only.
 */

export type ImageProviderName =
  | "xai"
  | "fal"
  | "replicate"
  | "huggingface"
  | "stability"
  | "openai"
  | "gemini"
  | "together"
  | "cloudflare"
  | "comfyui";

/** What a model can be asked to do. */
export type ImageCapability =
  | "text-to-image"
  | "image-to-image"
  | "inpaint"
  | "upscale"
  | "background-removal"
  | "variations";

/** What a model is good at, for the model card and the Auto router. */
export type ImageStrength =
  | "interior"
  | "architecture"
  | "furniture"
  | "product"
  | "logo"
  | "text";

export type CostBand = "free" | "low" | "medium" | "high";

export type ImageModel = {
  id: string;
  label: string;
  provider: ImageProviderName;
  /** The provider's own identifier, passed straight through. */
  ref: string;
  capabilities: ImageCapability[];
  strengths: ImageStrength[];
  /** Usable on the provider's free tier without a paid plan. */
  free: boolean;
  /** 1–5. Comparative, not absolute — it orders the picker. */
  quality: 1 | 2 | 3 | 4 | 5;
  /** 1–5, higher is faster. */
  speed: 1 | 2 | 3 | 4 | 5;
  cost: CostBand;
  /** Rough USD per image, for the estimate in the model card. Zero when free. */
  costPerImage: number;
  blurb: string;
};

export const IMAGE_PROVIDERS: Record<
  ImageProviderName,
  {
    label: string;
    keyVar: string;
    signupUrl: string;
    blurb: string;
    /** Self-hosted providers need a URL, not a key. */
    selfHosted?: boolean;
  }
> = {
  xai: {
    label: "xAI",
    keyVar: "XAI_API_KEY",
    signupUrl: "https://console.x.ai",
    blurb:
      "Grok Image. Shares the key the assistant already uses. Text to image only — it cannot edit an existing photo.",
  },
  fal: {
    label: "Fal.ai",
    keyVar: "FAL_KEY",
    signupUrl: "https://fal.ai/dashboard/keys",
    blurb: "Fast hosted FLUX, SDXL, Recraft and Ideogram. Has a free tier.",
  },
  replicate: {
    label: "Replicate",
    keyVar: "REPLICATE_API_TOKEN",
    signupUrl: "https://replicate.com/account/api-tokens",
    blurb: "Runs most open models. Free credits on signup.",
  },
  huggingface: {
    label: "Hugging Face",
    keyVar: "HUGGINGFACE_API_KEY",
    signupUrl: "https://huggingface.co/settings/tokens",
    blurb: "Free Inference API. Slower, and models sleep when idle.",
  },
  together: {
    label: "Together AI",
    keyVar: "TOGETHER_API_KEY",
    signupUrl: "https://api.together.xyz/settings/api-keys",
    blurb: "Free FLUX Schnell endpoint with a generous daily allowance.",
  },
  cloudflare: {
    label: "Cloudflare AI",
    keyVar: "CLOUDFLARE_API_TOKEN",
    signupUrl: "https://dash.cloudflare.com/profile/api-tokens",
    blurb:
      "Workers AI. Free daily quota. Also needs CLOUDFLARE_ACCOUNT_ID.",
  },
  stability: {
    label: "Stability AI",
    keyVar: "STABILITY_API_KEY",
    signupUrl: "https://platform.stability.ai/account/keys",
    blurb: "Stable Diffusion 3 and SD3 Turbo, direct from Stability.",
  },
  openai: {
    label: "OpenAI",
    keyVar: "OPENAI_API_KEY",
    signupUrl: "https://platform.openai.com/api-keys",
    blurb: "GPT Image. Strong at edits and following written instructions.",
  },
  gemini: {
    label: "Google",
    keyVar: "GEMINI_API_KEY",
    signupUrl: "https://aistudio.google.com/apikey",
    blurb: "Imagen. Shares the key the chat assistant already uses.",
  },
  comfyui: {
    label: "ComfyUI",
    keyVar: "COMFYUI_URL",
    signupUrl: "https://github.com/comfyanonymous/ComfyUI",
    blurb: "Your own machine. No key, no cost, no rate limit — set the URL.",
    selfHosted: true,
  },
};

export const IMAGE_MODELS: ImageModel[] = [
  // ---- Free tier ----------------------------------------------------------
  {
    id: "flux-schnell",
    label: "FLUX.1 Schnell",
    provider: "fal",
    ref: "fal-ai/flux/schnell",
    capabilities: ["text-to-image", "variations"],
    strengths: ["interior", "architecture", "furniture"],
    free: true,
    quality: 3,
    speed: 5,
    cost: "free",
    costPerImage: 0,
    blurb: "Four steps, a second or two. The default for concepts.",
  },
  {
    id: "together-flux-schnell",
    label: "FLUX.1 Schnell (Together)",
    provider: "together",
    ref: "black-forest-labs/FLUX.1-schnell-Free",
    capabilities: ["text-to-image"],
    strengths: ["interior", "architecture"],
    free: true,
    quality: 3,
    speed: 4,
    cost: "free",
    costPerImage: 0,
    blurb: "Together's free endpoint. Same model, no credit needed.",
  },
  {
    id: "cf-flux-schnell",
    label: "FLUX.1 Schnell (Cloudflare)",
    provider: "cloudflare",
    ref: "@cf/black-forest-labs/flux-1-schnell",
    capabilities: ["text-to-image"],
    strengths: ["interior", "architecture"],
    free: true,
    quality: 3,
    speed: 4,
    cost: "free",
    costPerImage: 0,
    blurb: "Workers AI free daily quota. Small output sizes.",
  },
  {
    id: "sdxl",
    label: "Stable Diffusion XL",
    provider: "fal",
    ref: "fal-ai/fast-sdxl",
    capabilities: ["text-to-image", "image-to-image", "inpaint", "variations"],
    strengths: ["interior", "furniture", "product"],
    free: true,
    quality: 3,
    speed: 4,
    cost: "free",
    costPerImage: 0,
    blurb: "Reliable all-rounder. Good with interiors and materials.",
  },
  {
    id: "hf-sdxl",
    label: "SDXL (Hugging Face)",
    provider: "huggingface",
    ref: "stabilityai/stable-diffusion-xl-base-1.0",
    capabilities: ["text-to-image"],
    strengths: ["interior", "product"],
    free: true,
    quality: 3,
    speed: 1,
    cost: "free",
    costPerImage: 0,
    blurb: "Free Inference API. First call may wait for a cold model.",
  },
  {
    id: "hf-flux-schnell",
    label: "FLUX.1 Schnell (Hugging Face)",
    provider: "huggingface",
    ref: "black-forest-labs/FLUX.1-schnell",
    capabilities: ["text-to-image"],
    strengths: ["interior", "architecture"],
    free: true,
    quality: 3,
    speed: 1,
    cost: "free",
    costPerImage: 0,
    blurb: "Same model, free host, longer queue.",
  },
  {
    id: "replicate-flux-schnell",
    label: "FLUX.1 Schnell (Replicate)",
    provider: "replicate",
    ref: "black-forest-labs/flux-schnell",
    capabilities: ["text-to-image"],
    strengths: ["interior", "architecture"],
    free: true,
    quality: 3,
    speed: 3,
    cost: "free",
    costPerImage: 0,
    blurb: "Runs on Replicate's free signup credit.",
  },
  {
    id: "comfy-local",
    label: "ComfyUI (local)",
    provider: "comfyui",
    ref: "default",
    capabilities: ["text-to-image", "image-to-image"],
    strengths: ["interior", "architecture", "furniture", "product"],
    free: true,
    quality: 4,
    speed: 2,
    cost: "free",
    costPerImage: 0,
    blurb: "Whatever workflow your own instance is running. No limits.",
  },

  // ---- Paid ---------------------------------------------------------------
  {
    id: "flux-dev",
    label: "FLUX.1 Dev",
    provider: "fal",
    ref: "fal-ai/flux/dev",
    capabilities: ["text-to-image", "image-to-image", "variations"],
    strengths: ["interior", "architecture", "furniture"],
    free: false,
    quality: 5,
    speed: 3,
    cost: "low",
    costPerImage: 0.025,
    blurb: "Slower than Schnell and noticeably better at architecture.",
  },
  {
    id: "sd3",
    label: "Stable Diffusion 3.5",
    provider: "stability",
    ref: "sd3.5-large",
    capabilities: ["text-to-image", "image-to-image"],
    strengths: ["architecture", "text"],
    free: false,
    quality: 4,
    speed: 3,
    cost: "medium",
    costPerImage: 0.065,
    blurb: "Strong prompt adherence and legible text in signage.",
  },
  {
    id: "ideogram",
    label: "Ideogram v2",
    provider: "fal",
    ref: "fal-ai/ideogram/v2",
    capabilities: ["text-to-image"],
    strengths: ["text", "logo"],
    free: false,
    quality: 4,
    speed: 3,
    cost: "medium",
    costPerImage: 0.08,
    blurb: "The one that gets lettering right. Signage, logos, wayfinding.",
  },
  {
    id: "recraft",
    label: "Recraft v3",
    provider: "fal",
    ref: "fal-ai/recraft-v3",
    capabilities: ["text-to-image"],
    strengths: ["logo", "product"],
    free: false,
    quality: 4,
    speed: 3,
    cost: "medium",
    costPerImage: 0.04,
    blurb: "Vector-clean output. Icons, diagrams, brand marks.",
  },
  {
    id: "gpt-image",
    label: "GPT Image",
    provider: "openai",
    ref: "gpt-image-1",
    capabilities: ["text-to-image", "image-to-image", "inpaint"],
    strengths: ["interior", "product", "text"],
    free: false,
    quality: 5,
    speed: 2,
    cost: "high",
    costPerImage: 0.19,
    blurb: "Best at editing an existing photo to a written instruction.",
  },
  {
    id: "grok-image",
    label: "Grok Image",
    provider: "xai",
    // Overridable server-side with XAI_IMAGE_MODEL. Not read here: this file
    // ships to the browser, and nothing named XAI_* belongs in that bundle
    // even when it is only a model name.
    ref: "grok-2-image-1212",
    // Image-to-image, with a caveat that is stated rather than hidden.
    //
    // xAI's image endpoint still takes a prompt and nothing else. What makes
    // this an edit is the step before it: Grok looks at the uploaded photograph
    // and writes down what is actually there, and that description carries the
    // building into the prompt. See `xai-images.ts`.
    //
    // So the output is derived from the member's own image rather than from the
    // few words they typed — which is what "image-to-image" has to mean for the
    // Auto router to send an edit here — but it is a regeneration, not a
    // composite, and the blurb below says so.
    //
    // Not inpaint. That needs a mask applied to real pixels and there is no
    // honest way to do it with a text-to-image endpoint.
    capabilities: ["text-to-image", "image-to-image"],
    strengths: ["architecture", "interior", "product"],
    free: false,
    quality: 4,
    speed: 4,
    cost: "low",
    costPerImage: 0.07,
    blurb:
      "Uses the xAI key already set. Strong on architecture. Edits by reading your photo first, so the result follows it closely but is redrawn rather than retouched.",
  },
  {
    id: "imagen",
    label: "Google Imagen",
    provider: "gemini",
    ref: "imagen-3.0-generate-002",
    capabilities: ["text-to-image"],
    strengths: ["architecture", "interior"],
    free: false,
    quality: 5,
    speed: 3,
    cost: "medium",
    costPerImage: 0.04,
    blurb: "Photoreal exteriors and daylight.",
  },

  // ---- Utility ------------------------------------------------------------
  {
    id: "esrgan",
    label: "Upscaler (ESRGAN)",
    provider: "fal",
    ref: "fal-ai/esrgan",
    capabilities: ["upscale"],
    strengths: [],
    free: true,
    quality: 4,
    speed: 5,
    cost: "free",
    costPerImage: 0,
    blurb: "Enlarges without softening edges.",
  },
  {
    id: "rembg",
    label: "Background remover",
    provider: "fal",
    ref: "fal-ai/imageutils/rembg",
    capabilities: ["background-removal"],
    strengths: ["product"],
    free: true,
    quality: 4,
    speed: 5,
    cost: "free",
    costPerImage: 0,
    blurb: "Cuts the subject out. Good for product shots.",
  },
];

export function findModel(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((model) => model.id === id);
}

export function modelsFor(capability: ImageCapability): ImageModel[] {
  return IMAGE_MODELS.filter((model) =>
    model.capabilities.includes(capability),
  );
}

export function modelsByProvider(provider: ImageProviderName): ImageModel[] {
  return IMAGE_MODELS.filter((model) => model.provider === provider);
}

export const COST_LABEL: Record<CostBand, string> = {
  free: "Free",
  low: "Low cost",
  medium: "Medium cost",
  high: "Higher cost",
};

export const CAPABILITY_LABEL: Record<ImageCapability, string> = {
  "text-to-image": "Generate",
  "image-to-image": "Edit",
  inpaint: "Inpaint",
  upscale: "Upscale",
  "background-removal": "Remove background",
  variations: "Variations",
};

export const STRENGTH_LABEL: Record<ImageStrength, string> = {
  interior: "Interior design",
  architecture: "Architecture",
  furniture: "Furniture",
  product: "Product",
  logo: "Logo & icons",
  text: "Text in image",
};

// ---------------------------------------------------------------------------
// Aspect ratio, quality, count
// ---------------------------------------------------------------------------

export const ASPECT_RATIOS = [
  { value: "1:1", label: "Square", width: 1024, height: 1024 },
  { value: "4:3", label: "Landscape", width: 1152, height: 864 },
  { value: "3:4", label: "Portrait", width: 864, height: 1152 },
  { value: "16:9", label: "Wide", width: 1344, height: 768 },
  { value: "9:16", label: "Tall", width: 768, height: 1344 },
  { value: "3:2", label: "Photo", width: 1216, height: 832 },
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

export function isAspectRatio(value: unknown): value is AspectRatio {
  return ASPECT_RATIOS.some((ratio) => ratio.value === value);
}

export function dimensionsFor(ratio: AspectRatio): {
  width: number;
  height: number;
} {
  const found = ASPECT_RATIOS.find((entry) => entry.value === ratio);
  return found
    ? { width: found.width, height: found.height }
    : { width: 1024, height: 1024 };
}

export const QUALITY_LEVELS = [
  { value: "draft", label: "Draft", steps: 4, blurb: "Fastest. For trying ideas." },
  { value: "standard", label: "Standard", steps: 20, blurb: "The usual choice." },
  { value: "high", label: "High", steps: 40, blurb: "Slower, more detail." },
] as const;

export type QualityLevel = (typeof QUALITY_LEVELS)[number]["value"];

export function isQuality(value: unknown): value is QualityLevel {
  return QUALITY_LEVELS.some((entry) => entry.value === value);
}

export function stepsFor(quality: QualityLevel): number {
  return QUALITY_LEVELS.find((entry) => entry.value === quality)?.steps ?? 20;
}

/** Most a single request may ask for. Four fits the result grid. */
export const MAX_IMAGES = 4;

// ---------------------------------------------------------------------------
// Quality modes
//
// Most people do not want to choose a model, they want to say how much they
// care. A mode is a sort order over whatever is configured, not a fixed
// choice — so "Premium" on a deployment with only free keys still generates,
// using the best free model, rather than refusing.
// ---------------------------------------------------------------------------

export type QualityMode = "fast" | "balanced" | "premium";

export const QUALITY_MODES: {
  value: QualityMode;
  emoji: string;
  label: string;
  blurb: string;
}[] = [
  { value: "fast", emoji: "⚡", label: "Fast", blurb: "Cheapest and quickest" },
  { value: "balanced", emoji: "⚖", label: "Balanced", blurb: "The usual choice" },
  { value: "premium", emoji: "🏆", label: "Premium", blurb: "Best available" },
];

export function isQualityMode(value: unknown): value is QualityMode {
  return QUALITY_MODES.some((mode) => mode.value === value);
}

/**
 * How a mode ranks two models, *within* an intent.
 *
 * Deliberately small compared with the preference bonus below. The per-intent
 * list is domain knowledge — GPT Image is the right tool for editing a
 * photograph even though FLUX Dev scores higher on raw quality — and a generic
 * quality-times-speed number must not be allowed to overrule it. The mode
 * reorders near neighbours; it does not move a first choice to sixth.
 */
function modeScore(model: ImageModel, mode: QualityMode): number {
  switch (mode) {
    case "fast":
      return model.speed * 10 - model.costPerImage * 100;
    case "premium":
      return model.quality * 10 + model.speed;
    default:
      return model.quality * 6 + model.speed * 4 - model.costPerImage * 20;
  }
}

/** Weight of one place in the per-intent preference list. */
const PREFERENCE_STEP = 20;
/** Free mode outranks everything else, which is the point of it. */
const FREE_BONUS = 10_000;

// ---------------------------------------------------------------------------
// The Auto router
//
// A published preference order per intent, not a black box. It is intersected
// with what is actually configured, so someone with only a Hugging Face key
// gets a Hugging Face model rather than an error naming a service they never
// signed up to.
// ---------------------------------------------------------------------------

export type ImageIntent =
  | "interior"
  | "exterior"
  | "edit"
  | "logo"
  | "product"
  | "sketch"
  | "upscale"
  | "background-removal"
  | "general";

export const AUTO_PREFERENCE: Record<ImageIntent, string[]> = {
  // FLUX holds geometry and perspective together better than SDXL, which
  // matters more indoors than anywhere else.
  // Grok leads everywhere it is capable.
  //
  // It was previously in none of these lists, which is the whole of the
  // reported failure: a deployment with XAI_API_KEY and nothing else built an
  // empty chain for every intent, and an empty chain is reported as "no
  // provider" or, when the probe had also failed, as the key being rejected.
  // The model existed, the adapter existed, and the router could not reach it.
  interior: ["grok-image", "flux-dev", "flux-schnell", "sdxl", "together-flux-schnell", "replicate-flux-schnell", "cf-flux-schnell", "hf-flux-schnell", "comfy-local"],
  exterior: ["grok-image", "flux-dev", "imagen", "flux-schnell", "sdxl", "together-flux-schnell", "hf-sdxl", "comfy-local"],
  // Editing a photograph is following an instruction, not painting a picture.
  // GPT Image retouches actual pixels and Grok redraws from a reading of them,
  // so GPT Image stays ahead where it is configured — but Grok is now in the
  // list, which is the difference between an edit that happens and one that
  // reports no provider.
  edit: ["gpt-image", "grok-image", "sdxl", "flux-dev", "comfy-local"],
  logo: ["recraft", "ideogram", "flux-dev", "sdxl"],
  product: ["grok-image", "flux-dev", "recraft", "sdxl", "flux-schnell"],
  sketch: ["grok-image", "flux-dev", "sdxl", "flux-schnell", "comfy-local"],
  // Utilities operate on pixels. Grok cannot upscale or cut out a background,
  // and listing it here would be the fake integration the brief forbids.
  upscale: ["esrgan"],
  "background-removal": ["rembg"],
  general: ["grok-image", "flux-schnell", "sdxl", "together-flux-schnell", "replicate-flux-schnell", "cf-flux-schnell", "hf-sdxl", "comfy-local"],
};

/**
 * The order Auto will try models in, best first.
 *
 * This is the whole fallback chain, not just a single choice — the caller
 * walks it until one succeeds. Intent decides who is eligible; the quality
 * mode and free mode decide the order among them.
 */
export function autoChain(
  intent: ImageIntent,
  configured: ImageProviderName[],
  options: { mode?: QualityMode; freeMode?: boolean } = {},
): ImageModel[] {
  const mode = options.mode ?? "balanced";
  const freeMode = options.freeMode ?? false;

  const preferred = AUTO_PREFERENCE[intent] ?? AUTO_PREFERENCE.general;

  const eligible = preferred
    .map((id, index) => ({ model: findModel(id), index }))
    .filter(
      (entry): entry is { model: ImageModel; index: number } =>
        Boolean(entry.model) && configured.includes(entry.model!.provider),
    );

  return eligible
    .map((entry) => ({
      ...entry,
      score:
        (freeMode && entry.model.free ? FREE_BONUS : 0) +
        (preferred.length - entry.index) * PREFERENCE_STEP +
        modeScore(entry.model, mode),
    }))
    // Ties fall back to the hand-written order, so the list stays predictable.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.model);
}

/** The single model Auto would start with. Null when nothing is usable. */
export function autoPick(
  intent: ImageIntent,
  configured: ImageProviderName[],
  options: { mode?: QualityMode; freeMode?: boolean } = {},
): ImageModel | null {
  return autoChain(intent, configured, options)[0] ?? null;
}

/**
 * The fallback chain for an explicitly chosen model.
 *
 * The chosen model first, then everything else Auto would have tried. Picking
 * FLUX Dev by hand should still fall through to Schnell when fal.ai is down —
 * a manual choice is a preference, not an instruction to fail.
 */
export function chainFor(
  model: ImageModel | null,
  intent: ImageIntent,
  configured: ImageProviderName[],
  options: { mode?: QualityMode; freeMode?: boolean } = {},
): ImageModel[] {
  const auto = autoChain(intent, configured, options);
  if (!model) return auto;
  return [model, ...auto.filter((entry) => entry.id !== model.id)];
}
