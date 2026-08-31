module.exports = [
"[project]/supabase/migrations/src/lib/ai/image-models.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ __turbopack_context__.s([
    "ASPECT_RATIOS",
    ()=>ASPECT_RATIOS,
    "AUTO_PREFERENCE",
    ()=>AUTO_PREFERENCE,
    "CAPABILITY_LABEL",
    ()=>CAPABILITY_LABEL,
    "COST_LABEL",
    ()=>COST_LABEL,
    "IMAGE_MODELS",
    ()=>IMAGE_MODELS,
    "IMAGE_PROVIDERS",
    ()=>IMAGE_PROVIDERS,
    "MAX_IMAGES",
    ()=>MAX_IMAGES,
    "QUALITY_LEVELS",
    ()=>QUALITY_LEVELS,
    "QUALITY_MODES",
    ()=>QUALITY_MODES,
    "STRENGTH_LABEL",
    ()=>STRENGTH_LABEL,
    "autoChain",
    ()=>autoChain,
    "autoPick",
    ()=>autoPick,
    "chainFor",
    ()=>chainFor,
    "dimensionsFor",
    ()=>dimensionsFor,
    "findModel",
    ()=>findModel,
    "isAspectRatio",
    ()=>isAspectRatio,
    "isQuality",
    ()=>isQuality,
    "isQualityMode",
    ()=>isQualityMode,
    "modelsByProvider",
    ()=>modelsByProvider,
    "modelsFor",
    ()=>modelsFor,
    "stepsFor",
    ()=>stepsFor
]);
const IMAGE_PROVIDERS = {
    fal: {
        label: "Fal.ai",
        keyVar: "FAL_KEY",
        signupUrl: "https://fal.ai/dashboard/keys",
        blurb: "Fast hosted FLUX, SDXL, Recraft and Ideogram. Has a free tier."
    },
    replicate: {
        label: "Replicate",
        keyVar: "REPLICATE_API_TOKEN",
        signupUrl: "https://replicate.com/account/api-tokens",
        blurb: "Runs most open models. Free credits on signup."
    },
    huggingface: {
        label: "Hugging Face",
        keyVar: "HUGGINGFACE_API_KEY",
        signupUrl: "https://huggingface.co/settings/tokens",
        blurb: "Free Inference API. Slower, and models sleep when idle."
    },
    together: {
        label: "Together AI",
        keyVar: "TOGETHER_API_KEY",
        signupUrl: "https://api.together.xyz/settings/api-keys",
        blurb: "Free FLUX Schnell endpoint with a generous daily allowance."
    },
    cloudflare: {
        label: "Cloudflare AI",
        keyVar: "CLOUDFLARE_API_TOKEN",
        signupUrl: "https://dash.cloudflare.com/profile/api-tokens",
        blurb: "Workers AI. Free daily quota. Also needs CLOUDFLARE_ACCOUNT_ID."
    },
    stability: {
        label: "Stability AI",
        keyVar: "STABILITY_API_KEY",
        signupUrl: "https://platform.stability.ai/account/keys",
        blurb: "Stable Diffusion 3 and SD3 Turbo, direct from Stability."
    },
    openai: {
        label: "OpenAI",
        keyVar: "OPENAI_API_KEY",
        signupUrl: "https://platform.openai.com/api-keys",
        blurb: "GPT Image. Strong at edits and following written instructions."
    },
    gemini: {
        label: "Google",
        keyVar: "GEMINI_API_KEY",
        signupUrl: "https://aistudio.google.com/apikey",
        blurb: "Imagen. Shares the key the chat assistant already uses."
    },
    comfyui: {
        label: "ComfyUI",
        keyVar: "COMFYUI_URL",
        signupUrl: "https://github.com/comfyanonymous/ComfyUI",
        blurb: "Your own machine. No key, no cost, no rate limit — set the URL.",
        selfHosted: true
    }
};
const IMAGE_MODELS = [
    // ---- Free tier ----------------------------------------------------------
    {
        id: "flux-schnell",
        label: "FLUX.1 Schnell",
        provider: "fal",
        ref: "fal-ai/flux/schnell",
        capabilities: [
            "text-to-image",
            "variations"
        ],
        strengths: [
            "interior",
            "architecture",
            "furniture"
        ],
        free: true,
        quality: 3,
        speed: 5,
        cost: "free",
        costPerImage: 0,
        blurb: "Four steps, a second or two. The default for concepts."
    },
    {
        id: "together-flux-schnell",
        label: "FLUX.1 Schnell (Together)",
        provider: "together",
        ref: "black-forest-labs/FLUX.1-schnell-Free",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "interior",
            "architecture"
        ],
        free: true,
        quality: 3,
        speed: 4,
        cost: "free",
        costPerImage: 0,
        blurb: "Together's free endpoint. Same model, no credit needed."
    },
    {
        id: "cf-flux-schnell",
        label: "FLUX.1 Schnell (Cloudflare)",
        provider: "cloudflare",
        ref: "@cf/black-forest-labs/flux-1-schnell",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "interior",
            "architecture"
        ],
        free: true,
        quality: 3,
        speed: 4,
        cost: "free",
        costPerImage: 0,
        blurb: "Workers AI free daily quota. Small output sizes."
    },
    {
        id: "sdxl",
        label: "Stable Diffusion XL",
        provider: "fal",
        ref: "fal-ai/fast-sdxl",
        capabilities: [
            "text-to-image",
            "image-to-image",
            "inpaint",
            "variations"
        ],
        strengths: [
            "interior",
            "furniture",
            "product"
        ],
        free: true,
        quality: 3,
        speed: 4,
        cost: "free",
        costPerImage: 0,
        blurb: "Reliable all-rounder. Good with interiors and materials."
    },
    {
        id: "hf-sdxl",
        label: "SDXL (Hugging Face)",
        provider: "huggingface",
        ref: "stabilityai/stable-diffusion-xl-base-1.0",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "interior",
            "product"
        ],
        free: true,
        quality: 3,
        speed: 1,
        cost: "free",
        costPerImage: 0,
        blurb: "Free Inference API. First call may wait for a cold model."
    },
    {
        id: "hf-flux-schnell",
        label: "FLUX.1 Schnell (Hugging Face)",
        provider: "huggingface",
        ref: "black-forest-labs/FLUX.1-schnell",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "interior",
            "architecture"
        ],
        free: true,
        quality: 3,
        speed: 1,
        cost: "free",
        costPerImage: 0,
        blurb: "Same model, free host, longer queue."
    },
    {
        id: "replicate-flux-schnell",
        label: "FLUX.1 Schnell (Replicate)",
        provider: "replicate",
        ref: "black-forest-labs/flux-schnell",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "interior",
            "architecture"
        ],
        free: true,
        quality: 3,
        speed: 3,
        cost: "free",
        costPerImage: 0,
        blurb: "Runs on Replicate's free signup credit."
    },
    {
        id: "comfy-local",
        label: "ComfyUI (local)",
        provider: "comfyui",
        ref: "default",
        capabilities: [
            "text-to-image",
            "image-to-image"
        ],
        strengths: [
            "interior",
            "architecture",
            "furniture",
            "product"
        ],
        free: true,
        quality: 4,
        speed: 2,
        cost: "free",
        costPerImage: 0,
        blurb: "Whatever workflow your own instance is running. No limits."
    },
    // ---- Paid ---------------------------------------------------------------
    {
        id: "flux-dev",
        label: "FLUX.1 Dev",
        provider: "fal",
        ref: "fal-ai/flux/dev",
        capabilities: [
            "text-to-image",
            "image-to-image",
            "variations"
        ],
        strengths: [
            "interior",
            "architecture",
            "furniture"
        ],
        free: false,
        quality: 5,
        speed: 3,
        cost: "low",
        costPerImage: 0.025,
        blurb: "Slower than Schnell and noticeably better at architecture."
    },
    {
        id: "sd3",
        label: "Stable Diffusion 3.5",
        provider: "stability",
        ref: "sd3.5-large",
        capabilities: [
            "text-to-image",
            "image-to-image"
        ],
        strengths: [
            "architecture",
            "text"
        ],
        free: false,
        quality: 4,
        speed: 3,
        cost: "medium",
        costPerImage: 0.065,
        blurb: "Strong prompt adherence and legible text in signage."
    },
    {
        id: "ideogram",
        label: "Ideogram v2",
        provider: "fal",
        ref: "fal-ai/ideogram/v2",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "text",
            "logo"
        ],
        free: false,
        quality: 4,
        speed: 3,
        cost: "medium",
        costPerImage: 0.08,
        blurb: "The one that gets lettering right. Signage, logos, wayfinding."
    },
    {
        id: "recraft",
        label: "Recraft v3",
        provider: "fal",
        ref: "fal-ai/recraft-v3",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "logo",
            "product"
        ],
        free: false,
        quality: 4,
        speed: 3,
        cost: "medium",
        costPerImage: 0.04,
        blurb: "Vector-clean output. Icons, diagrams, brand marks."
    },
    {
        id: "gpt-image",
        label: "GPT Image",
        provider: "openai",
        ref: "gpt-image-1",
        capabilities: [
            "text-to-image",
            "image-to-image",
            "inpaint"
        ],
        strengths: [
            "interior",
            "product",
            "text"
        ],
        free: false,
        quality: 5,
        speed: 2,
        cost: "high",
        costPerImage: 0.19,
        blurb: "Best at editing an existing photo to a written instruction."
    },
    {
        id: "imagen",
        label: "Google Imagen",
        provider: "gemini",
        ref: "imagen-3.0-generate-002",
        capabilities: [
            "text-to-image"
        ],
        strengths: [
            "architecture",
            "interior"
        ],
        free: false,
        quality: 5,
        speed: 3,
        cost: "medium",
        costPerImage: 0.04,
        blurb: "Photoreal exteriors and daylight."
    },
    // ---- Utility ------------------------------------------------------------
    {
        id: "esrgan",
        label: "Upscaler (ESRGAN)",
        provider: "fal",
        ref: "fal-ai/esrgan",
        capabilities: [
            "upscale"
        ],
        strengths: [],
        free: true,
        quality: 4,
        speed: 5,
        cost: "free",
        costPerImage: 0,
        blurb: "Enlarges without softening edges."
    },
    {
        id: "rembg",
        label: "Background remover",
        provider: "fal",
        ref: "fal-ai/imageutils/rembg",
        capabilities: [
            "background-removal"
        ],
        strengths: [
            "product"
        ],
        free: true,
        quality: 4,
        speed: 5,
        cost: "free",
        costPerImage: 0,
        blurb: "Cuts the subject out. Good for product shots."
    }
];
function findModel(id) {
    return IMAGE_MODELS.find((model)=>model.id === id);
}
function modelsFor(capability) {
    return IMAGE_MODELS.filter((model)=>model.capabilities.includes(capability));
}
function modelsByProvider(provider) {
    return IMAGE_MODELS.filter((model)=>model.provider === provider);
}
const COST_LABEL = {
    free: "Free",
    low: "Low cost",
    medium: "Medium cost",
    high: "Higher cost"
};
const CAPABILITY_LABEL = {
    "text-to-image": "Generate",
    "image-to-image": "Edit",
    inpaint: "Inpaint",
    upscale: "Upscale",
    "background-removal": "Remove background",
    variations: "Variations"
};
const STRENGTH_LABEL = {
    interior: "Interior design",
    architecture: "Architecture",
    furniture: "Furniture",
    product: "Product",
    logo: "Logo & icons",
    text: "Text in image"
};
const ASPECT_RATIOS = [
    {
        value: "1:1",
        label: "Square",
        width: 1024,
        height: 1024
    },
    {
        value: "4:3",
        label: "Landscape",
        width: 1152,
        height: 864
    },
    {
        value: "3:4",
        label: "Portrait",
        width: 864,
        height: 1152
    },
    {
        value: "16:9",
        label: "Wide",
        width: 1344,
        height: 768
    },
    {
        value: "9:16",
        label: "Tall",
        width: 768,
        height: 1344
    },
    {
        value: "3:2",
        label: "Photo",
        width: 1216,
        height: 832
    }
];
function isAspectRatio(value) {
    return ASPECT_RATIOS.some((ratio)=>ratio.value === value);
}
function dimensionsFor(ratio) {
    const found = ASPECT_RATIOS.find((entry)=>entry.value === ratio);
    return found ? {
        width: found.width,
        height: found.height
    } : {
        width: 1024,
        height: 1024
    };
}
const QUALITY_LEVELS = [
    {
        value: "draft",
        label: "Draft",
        steps: 4,
        blurb: "Fastest. For trying ideas."
    },
    {
        value: "standard",
        label: "Standard",
        steps: 20,
        blurb: "The usual choice."
    },
    {
        value: "high",
        label: "High",
        steps: 40,
        blurb: "Slower, more detail."
    }
];
function isQuality(value) {
    return QUALITY_LEVELS.some((entry)=>entry.value === value);
}
function stepsFor(quality) {
    return QUALITY_LEVELS.find((entry)=>entry.value === quality)?.steps ?? 20;
}
const MAX_IMAGES = 4;
const QUALITY_MODES = [
    {
        value: "fast",
        emoji: "⚡",
        label: "Fast",
        blurb: "Cheapest and quickest"
    },
    {
        value: "balanced",
        emoji: "⚖",
        label: "Balanced",
        blurb: "The usual choice"
    },
    {
        value: "premium",
        emoji: "🏆",
        label: "Premium",
        blurb: "Best available"
    }
];
function isQualityMode(value) {
    return QUALITY_MODES.some((mode)=>mode.value === value);
}
/**
 * How a mode ranks two models, *within* an intent.
 *
 * Deliberately small compared with the preference bonus below. The per-intent
 * list is domain knowledge — GPT Image is the right tool for editing a
 * photograph even though FLUX Dev scores higher on raw quality — and a generic
 * quality-times-speed number must not be allowed to overrule it. The mode
 * reorders near neighbours; it does not move a first choice to sixth.
 */ function modeScore(model, mode) {
    switch(mode){
        case "fast":
            return model.speed * 10 - model.costPerImage * 100;
        case "premium":
            return model.quality * 10 + model.speed;
        default:
            return model.quality * 6 + model.speed * 4 - model.costPerImage * 20;
    }
}
/** Weight of one place in the per-intent preference list. */ const PREFERENCE_STEP = 20;
/** Free mode outranks everything else, which is the point of it. */ const FREE_BONUS = 10_000;
const AUTO_PREFERENCE = {
    // FLUX holds geometry and perspective together better than SDXL, which
    // matters more indoors than anywhere else.
    interior: [
        "flux-dev",
        "flux-schnell",
        "sdxl",
        "together-flux-schnell",
        "replicate-flux-schnell",
        "cf-flux-schnell",
        "hf-flux-schnell",
        "comfy-local"
    ],
    exterior: [
        "flux-dev",
        "imagen",
        "flux-schnell",
        "sdxl",
        "together-flux-schnell",
        "hf-sdxl",
        "comfy-local"
    ],
    // Editing a photograph is following an instruction, not painting a picture.
    edit: [
        "gpt-image",
        "sdxl",
        "flux-dev",
        "comfy-local"
    ],
    logo: [
        "recraft",
        "ideogram",
        "flux-dev",
        "sdxl"
    ],
    product: [
        "flux-dev",
        "recraft",
        "sdxl",
        "flux-schnell"
    ],
    sketch: [
        "flux-dev",
        "sdxl",
        "flux-schnell",
        "comfy-local"
    ],
    upscale: [
        "esrgan"
    ],
    "background-removal": [
        "rembg"
    ],
    general: [
        "flux-schnell",
        "sdxl",
        "together-flux-schnell",
        "replicate-flux-schnell",
        "cf-flux-schnell",
        "hf-sdxl",
        "comfy-local"
    ]
};
function autoChain(intent, configured, options = {}) {
    const mode = options.mode ?? "balanced";
    const freeMode = options.freeMode ?? false;
    const preferred = AUTO_PREFERENCE[intent] ?? AUTO_PREFERENCE.general;
    const eligible = preferred.map((id, index)=>({
            model: findModel(id),
            index
        })).filter((entry)=>Boolean(entry.model) && configured.includes(entry.model.provider));
    return eligible.map((entry)=>({
            ...entry,
            score: (freeMode && entry.model.free ? FREE_BONUS : 0) + (preferred.length - entry.index) * PREFERENCE_STEP + modeScore(entry.model, mode)
        }))// Ties fall back to the hand-written order, so the list stays predictable.
    .sort((a, b)=>b.score - a.score || a.index - b.index).map((entry)=>entry.model);
}
function autoPick(intent, configured, options = {}) {
    return autoChain(intent, configured, options)[0] ?? null;
}
function chainFor(model, intent, configured, options = {}) {
    const auto = autoChain(intent, configured, options);
    if (!model) return auto;
    return [
        model,
        ...auto.filter((entry)=>entry.id !== model.id)
    ];
}
}),
"[project]/supabase/migrations/src/lib/ai/provider-status.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PROVIDER_STATUS",
    ()=>PROVIDER_STATUS,
    "isTransient",
    ()=>isTransient,
    "isUsable",
    ()=>isUsable,
    "needsOperator",
    ()=>needsOperator
]);
const PROVIDER_STATUS = {
    connected: {
        label: "Connected",
        mark: "ok",
        fix: null
    },
    missing_key: {
        label: "Missing API Key",
        mark: "fail",
        fix: "Set the environment variable in .env.local and restart."
    },
    invalid_key: {
        label: "Invalid API Key",
        mark: "fail",
        fix: "The key was rejected. Copy it again from the provider's dashboard — keys are often truncated on paste."
    },
    no_access: {
        label: "No Access",
        mark: "fail",
        fix: "The key works but the account is not entitled to this model. Some providers gate image models behind a verified or paid account."
    },
    quota_exceeded: {
        label: "Quota Exceeded",
        mark: "fail",
        fix: "The account is out of credit or past its allowance. Top it up, or use a provider with a free tier."
    },
    rate_limited: {
        label: "Rate Limited",
        mark: "warn",
        fix: "Too many requests just now. This clears by itself — the chain will use it again once it does."
    },
    model_unavailable: {
        label: "Model Unavailable",
        mark: "warn",
        fix: "The provider does not recognise that model. It may have been renamed or retired."
    },
    network_error: {
        label: "Network Error",
        mark: "fail",
        fix: "The host could not be reached. Check the server's outbound network, or the URL if this is a self-hosted provider."
    },
    provider_down: {
        label: "Provider Unavailable",
        mark: "warn",
        fix: "The provider is having problems at their end. Nothing to fix here; the chain will route around it."
    },
    unchecked: {
        label: "Not checked yet",
        mark: "idle",
        fix: null
    }
};
function isUsable(status) {
    return status === "connected";
}
function isTransient(status) {
    return status === "rate_limited" || status === "provider_down" || status === "network_error";
}
function needsOperator(status) {
    return status === "missing_key" || status === "invalid_key" || status === "no_access" || status === "quota_exceeded";
}
}),
"[project]/supabase/migrations/src/lib/ai/provider-health.ts [instrumentation] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "blockedProviders",
    ()=>blockedProviders,
    "catalogueModels",
    ()=>catalogueModels,
    "classifyResponse",
    ()=>classifyResponse,
    "classifyThrow",
    ()=>classifyThrow,
    "configurationHelp",
    ()=>configurationHelp,
    "hasKeys",
    ()=>hasKeys,
    "healthSnapshot",
    ()=>healthSnapshot,
    "keyVarsFor",
    ()=>keyVarsFor,
    "reasonFor",
    ()=>reasonFor,
    "recordFailure",
    ()=>recordFailure,
    "recordSuccess",
    ()=>recordSuccess,
    "usableProviders",
    ()=>usableProviders,
    "validateAll",
    ()=>validateAll,
    "validateProvider",
    ()=>validateProvider
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/ai/image-models.ts [instrumentation] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$provider$2d$status$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/supabase/migrations/src/lib/ai/provider-status.ts [instrumentation] (ecmascript)");
;
;
;
/**
 * Which providers actually work, established by asking them.
 *
 * The studio used to treat "the environment variable is set" as "the provider
 * works". Those are different facts, and the gap between them is exactly the
 * failure the user hit: a chain built from present-but-rejected keys spends
 * the user's wait discovering, one request at a time, that none of them can
 * answer — and then reports it as if the prompt were at fault.
 *
 * So keys are validated once at startup and cached with a TTL, generation is
 * built only from providers that passed, and every outcome — success or
 * failure — is written back here. That last part is what makes the diagnostics
 * page worth opening: it reports what happened, not what was configured.
 *
 * Nothing in this module returns, logs, or derives anything from the content
 * of a key. Presence is the only fact about a key that ever leaves it.
 */ /** How long a good result stands before it is worth asking again. */ const OK_TTL_MS = 10 * 60 * 1000;
/** Bad results expire sooner: a rate limit or an outage is usually brief. */ const BAD_TTL_MS = 60 * 1000;
/** A missing or rejected key will not fix itself; do not hammer the provider. */ const OPERATOR_TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 12_000;
const ALL = Object.keys(__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["IMAGE_PROVIDERS"]);
function keyVarsFor(provider) {
    if (provider === "cloudflare") {
        return [
            "CLOUDFLARE_API_TOKEN",
            "CLOUDFLARE_ACCOUNT_ID"
        ];
    }
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["IMAGE_PROVIDERS"][provider].keyVar
    ];
}
function missingVars(provider) {
    return keyVarsFor(provider).filter((name)=>{
        const value = process.env[name];
        return value === undefined || value.trim() === "";
    });
}
function hasKeys(provider) {
    return missingVars(provider).length === 0;
}
function classifyResponse(status, body) {
    const text = body.toLowerCase();
    const mentionsQuota = text.includes("quota") || text.includes("insufficient") || text.includes("billing") || text.includes("credit") || text.includes("payment required") || text.includes("exceeded your current") || text.includes("out of funds") || text.includes("spending limit");
    const mentionsAccess = text.includes("not authorized") || text.includes("unauthorized for") || text.includes("does not have access") || text.includes("no access") || text.includes("not entitled") || text.includes("must be verified") || text.includes("permission");
    if (status === 401) return "invalid_key";
    if (status === 403) {
        // A working key without entitlement is a different fix from a bad key.
        if (mentionsQuota) return "quota_exceeded";
        if (mentionsAccess) return "no_access";
        return "invalid_key";
    }
    if (status === 402) return "quota_exceeded";
    if (status === 429) {
        return mentionsQuota ? "quota_exceeded" : "rate_limited";
    }
    if (status === 404) return "model_unavailable";
    if (status === 408 || status === 504) return "network_error";
    if (status >= 500) return "provider_down";
    if (status >= 400) {
        if (mentionsQuota) return "quota_exceeded";
        if (mentionsAccess) return "no_access";
        return "provider_down";
    }
    return "connected";
}
function classifyThrow(error) {
    const name = error?.name ?? "";
    if (name === "TimeoutError" || name === "AbortError") return "network_error";
    return "network_error";
}
function reasonFor(provider, status) {
    const label = __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["IMAGE_PROVIDERS"][provider].label;
    const missing = missingVars(provider);
    switch(status){
        case "connected":
            return `${label} is connected.`;
        case "missing_key":
            return missing.length > 1 ? `${label} needs ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}.` : `${missing[0] ?? __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["IMAGE_PROVIDERS"][provider].keyVar} is not set.`;
        case "invalid_key":
            return `${label} did not accept its API key.`;
        case "no_access":
            return `${label} accepted the key but the account cannot use this model.`;
        case "quota_exceeded":
            return `${label} reports the account is out of credit or past its quota.`;
        case "rate_limited":
            return `${label} is rate limited right now.`;
        case "model_unavailable":
            return `${label} does not recognise that model.`;
        case "network_error":
            return provider === "comfyui" ? "Could not reach the ComfyUI URL. Is the instance running?" : `${label} could not be reached.`;
        case "provider_down":
            return `${label} is temporarily unavailable.`;
        case "unchecked":
            return `${label} has not been checked yet.`;
    }
}
function bearer(name) {
    return ()=>({
            authorization: `Bearer ${process.env[name] ?? ""}`
        });
}
/** Reads a rate-limit budget out of response headers, when one is published. */ function headerQuota(headers) {
    const remaining = headers.get("x-ratelimit-remaining-requests") ?? headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining");
    if (!remaining) return null;
    const limit = headers.get("x-ratelimit-limit-requests") ?? headers.get("x-ratelimit-limit") ?? headers.get("ratelimit-limit");
    return {
        label: "Requests remaining",
        value: limit ? `${remaining} of ${limit}` : remaining
    };
}
const PROBES = {
    openai: {
        url: ()=>"https://api.openai.com/v1/models",
        headers: bearer("OPENAI_API_KEY"),
        models: (body)=>{
            const data = body?.data;
            if (!Array.isArray(data)) return null;
            return data.map((entry)=>entry.id ?? "").filter((id)=>id.includes("image") || id.startsWith("dall-e")).slice(0, 12);
        },
        quota: (_body, headers)=>headerQuota(headers)
    },
    replicate: {
        url: ()=>"https://api.replicate.com/v1/account",
        headers: bearer("REPLICATE_API_TOKEN"),
        quota: (_body, headers)=>headerQuota(headers)
    },
    huggingface: {
        url: ()=>"https://huggingface.co/api/whoami-v2",
        headers: bearer("HUGGINGFACE_API_KEY"),
        quota: (body)=>{
            // Hugging Face reports the monthly inference allowance on the account.
            const auth = body?.auth;
            const role = auth?.accessToken?.role;
            return role ? {
                label: "Token scope",
                value: role
            } : null;
        }
    },
    together: {
        url: ()=>"https://api.together.xyz/v1/models",
        headers: bearer("TOGETHER_API_KEY"),
        models: (body)=>{
            if (!Array.isArray(body)) return null;
            return body.filter((entry)=>entry.type === "image").map((entry)=>entry.id ?? "").filter(Boolean).slice(0, 12);
        },
        quota: (_body, headers)=>headerQuota(headers)
    },
    stability: {
        url: ()=>"https://api.stability.ai/v1/user/account",
        headers: bearer("STABILITY_API_KEY")
    },
    gemini: {
        url: ()=>`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY ?? ""}`,
        models: (body)=>{
            const models = body?.models;
            if (!Array.isArray(models)) return null;
            return models.map((entry)=>(entry.name ?? "").replace(/^models\//, "")).filter((name)=>name.includes("imagen") || name.includes("image")).slice(0, 12);
        }
    },
    cloudflare: {
        url: ()=>`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID ?? ""}/ai/models/search?per_page=50&task=Text-to-Image`,
        headers: bearer("CLOUDFLARE_API_TOKEN"),
        models: (body)=>{
            const result = body?.result;
            if (!Array.isArray(result)) return null;
            return result.map((entry)=>entry.name ?? "").filter(Boolean).slice(0, 12);
        }
    },
    comfyui: {
        url: ()=>`${(process.env.COMFYUI_URL ?? "").replace(/\/$/, "")}/system_stats`,
        quota: (body)=>{
            const devices = body?.devices;
            const device = devices?.[0];
            if (!device?.vram_total) return null;
            const free = Math.round((device.vram_free ?? 0) / 1024 / 1024 / 1024);
            const total = Math.round(device.vram_total / 1024 / 1024 / 1024);
            return {
                label: "VRAM free",
                value: `${free} of ${total} GB`
            };
        }
    },
    fal: {
        // fal.ai publishes no account endpoint, so this asks the queue about a
        // request id that cannot exist. 401/403 means the key was rejected;
        // anything else means it was accepted and the id simply is not there.
        url: ()=>"https://queue.fal.run/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status",
        headers: ()=>({
                authorization: `Key ${process.env.FAL_KEY ?? ""}`
            }),
        okStatuses: [
            400,
            404,
            422
        ],
        quota: (_body, headers)=>headerQuota(headers)
    }
};
// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------
function blank(provider) {
    return {
        provider,
        status: "unchecked",
        reason: null,
        checkedAt: null,
        ms: null,
        models: null,
        quota: null,
        lastSuccessAt: null,
        lastSuccessModel: null,
        lastErrorAt: null,
        lastError: null,
        keyVars: keyVarsFor(provider),
        keyPresent: hasKeys(provider)
    };
}
const registry = new Map();
/** Probes in flight, so ten concurrent callers make one request each. */ const inFlight = new Map();
function current(provider) {
    const existing = registry.get(provider);
    if (existing) return {
        ...existing,
        keyPresent: hasKeys(provider)
    };
    const fresh = blank(provider);
    registry.set(provider, fresh);
    return fresh;
}
function ttlFor(status) {
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$provider$2d$status$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isUsable"])(status)) return OK_TTL_MS;
    if (status === "missing_key" || status === "invalid_key" || status === "quota_exceeded" || status === "no_access") {
        return OPERATOR_TTL_MS;
    }
    return BAD_TTL_MS;
}
function isFresh(health) {
    if (health.status === "unchecked" || health.checkedAt === null) return false;
    return Date.now() - health.checkedAt < ttlFor(health.status);
}
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
async function probe(provider) {
    const before = current(provider);
    const startedAt = Date.now();
    const missing = missingVars(provider);
    if (missing.length > 0) {
        return {
            ...before,
            status: "missing_key",
            reason: reasonFor(provider, "missing_key"),
            checkedAt: Date.now(),
            ms: 0,
            keyPresent: false
        };
    }
    const spec = PROBES[provider];
    try {
        const response = await fetch(spec.url(), {
            headers: spec.headers?.() ?? {},
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            cache: "no-store"
        });
        const ms = Date.now() - startedAt;
        const accepted = response.ok || (spec.okStatuses?.includes(response.status) ?? false);
        if (!accepted) {
            // Read the body only to classify it. It is never returned or logged
            // verbatim towards the browser.
            const body = await response.text().catch(()=>"");
            const status = classifyResponse(response.status, body);
            const reason = reasonFor(provider, status);
            console.error(`[medosha-ai:health] ${provider} probe ${response.status} -> ${status}`);
            return {
                ...before,
                status,
                reason,
                checkedAt: Date.now(),
                ms,
                keyPresent: true,
                lastErrorAt: Date.now(),
                lastError: reason
            };
        }
        let body = null;
        try {
            body = await response.json();
        } catch  {
        // A probe that answers with something other than JSON still proves the
        // credentials work, which is the only thing being asked.
        }
        return {
            ...before,
            status: "connected",
            reason: null,
            checkedAt: Date.now(),
            ms,
            keyPresent: true,
            models: spec.models?.(body) ?? before.models,
            quota: spec.quota?.(body, response.headers) ?? null
        };
    } catch (error) {
        const status = classifyThrow(error);
        const reason = reasonFor(provider, status);
        console.error(`[medosha-ai:health] ${provider} probe threw:`, error);
        return {
            ...before,
            status,
            reason,
            checkedAt: Date.now(),
            ms: Date.now() - startedAt,
            keyPresent: true,
            lastErrorAt: Date.now(),
            lastError: reason
        };
    }
}
async function validateProvider(provider, options = {}) {
    if (!options.force && isFresh(current(provider))) {
        return current(provider);
    }
    const existing = inFlight.get(provider);
    if (existing) return existing;
    const running = probe(provider).then((health)=>{
        registry.set(provider, health);
        return health;
    }).finally(()=>{
        inFlight.delete(provider);
    });
    inFlight.set(provider, running);
    return running;
}
async function validateAll(options = {}) {
    return Promise.all(ALL.map((provider)=>validateProvider(provider, options)));
}
function healthSnapshot() {
    return ALL.map(current);
}
async function usableProviders() {
    const health = await validateAll();
    const connected = health.filter((entry)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$provider$2d$status$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isUsable"])(entry.status)).map((entry)=>entry.provider);
    if (connected.length > 0) return connected;
    // Nothing passed. Before refusing outright, reconsider the providers whose
    // failure was transient — a probe hitting a status endpoint that is blocked,
    // rate limited or briefly down is not proof the generation endpoint will
    // fail, and refusing on that evidence would strand a deployment whose keys
    // are perfectly good. A rejected key or an empty account is different: those
    // are answers about the account, and no amount of trying changes them.
    const worthTrying = health.filter((entry)=>entry.keyPresent && (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$provider$2d$status$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isTransient"])(entry.status)).map((entry)=>entry.provider);
    if (worthTrying.length > 0) {
        console.warn(`[medosha-ai:health] no provider passed validation; trying ${worthTrying.join(", ")} anyway (transient failures).`);
    }
    return worthTrying;
}
function blockedProviders() {
    const rank = {
        missing_key: 0,
        invalid_key: 1,
        no_access: 2,
        quota_exceeded: 3,
        rate_limited: 4,
        provider_down: 5,
        network_error: 6,
        model_unavailable: 7
    };
    return healthSnapshot().filter((entry)=>!(0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$provider$2d$status$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["isUsable"])(entry.status) && entry.status !== "unchecked").sort((a, b)=>(rank[a.status] ?? 9) - (rank[b.status] ?? 9));
}
function recordSuccess(provider, model) {
    const health = current(provider);
    registry.set(provider, {
        ...health,
        // A working generation is stronger evidence than any probe.
        status: "connected",
        reason: null,
        checkedAt: Date.now(),
        lastSuccessAt: Date.now(),
        lastSuccessModel: model
    });
}
function recordFailure(provider, status, reason) {
    const health = current(provider);
    registry.set(provider, {
        ...health,
        // A real request failing supersedes a probe that passed: the probe only
        // ever proved the credentials, not the entitlement to generate.
        status,
        reason,
        checkedAt: Date.now(),
        lastErrorAt: Date.now(),
        lastError: reason
    });
}
function configurationHelp() {
    const blocked = blockedProviders();
    const free = [
        "fal",
        "together",
        "cloudflare",
        "huggingface"
    ].filter((provider)=>{
        const health = current(provider);
        return health.status === "missing_key" || health.status === "unchecked";
    });
    if (blocked.length === 0) {
        return "No image provider is configured. Set FAL_KEY, TOGETHER_API_KEY or HUGGINGFACE_API_KEY in .env.local and restart — all three have a free tier.";
    }
    const worst = blocked[0];
    if (!worst) return "No image provider is working, and none reported why.";
    const lead = `${__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["IMAGE_PROVIDERS"][worst.provider].label}: ${worst.reason ?? reasonFor(worst.provider, worst.status)}`;
    if (free.length > 0) {
        const names = free.map((provider)=>__TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["IMAGE_PROVIDERS"][provider].keyVar).join(" or ");
        return `${lead} You can also set ${names} in .env.local — those have a free tier.`;
    }
    return lead;
}
function catalogueModels(provider) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$supabase$2f$migrations$2f$src$2f$lib$2f$ai$2f$image$2d$models$2e$ts__$5b$instrumentation$5d$__$28$ecmascript$29$__["modelsByProvider"])(provider).map((model)=>model.label);
}
}),
];

//# sourceMappingURL=supabase_migrations_src_lib_ai_1l4m1y1._.js.map