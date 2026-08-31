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
];

//# sourceMappingURL=supabase_migrations_src_lib_ai_image-models_ts_05io9a5._.js.map