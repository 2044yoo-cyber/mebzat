import "server-only";
import { siteUrl } from "@/lib/site";

/**
 * Vision providers, as their own list.
 *
 * Vision used to borrow the chat provider list, which had two consequences
 * that together produced the reported failure.
 *
 * OpenAI and Hugging Face were not in it, so they could never be tried —
 * leaving Groq as the only configured provider, which is why the error said
 * "the configured vision provider" in the singular. There was nothing to fall
 * back to.
 *
 * And each provider had exactly one hardcoded model name. Groq retires and
 * renames its vision models regularly; a name that has been retired answers
 * 404, and one name means 404 forever. Providers here carry a *list* of
 * candidate models, tried in order, so a retired name costs one request rather
 * than the whole feature.
 *
 * Every provider below speaks the OpenAI chat-completions shape with an
 * `image_url` content part, which is why one request builder serves all of
 * them. Gemini is included through its OpenAI-compatible endpoint for exactly
 * that reason.
 */

export type VisionProviderName =
  | "xai"
  | "openai"
  | "gemini"
  | "huggingface"
  | "groq"
  | "openrouter"
  | "ollama";

export type VisionProvider = {
  name: VisionProviderName;
  label: string;
  endpoint: string;
  /** Environment variables that must all be present. */
  keyVars: string[];
  apiKey: () => string | null;
  headers: (key: string | null) => Record<string, string>;
  /**
   * Models to try, best first. A 404 or "model not found" moves to the next
   * one before the provider itself is abandoned.
   */
  models: string[];
  /** Overrides the whole list, for a deployment pinned to one model. */
  envModel: string | undefined;
};

function list(value: string | undefined, fallback: string[]): string[] {
  // Comma-separated so an operator can pin several without a code change.
  const custom = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return custom.length > 0 ? custom : fallback;
}

const PROVIDERS: VisionProvider[] = [
  {
    name: "xai",
    label: "Grok Vision",
    endpoint: "https://api.x.ai/v1/chat/completions",
    keyVars: ["XAI_API_KEY"],
    apiKey: () => process.env.XAI_API_KEY ?? null,
    headers: (key) => ({ authorization: `Bearer ${key ?? ""}` }),
    // XAI_VISION_MODEL first, then the chat model. Somebody who set XAI_MODEL
    // to a multimodal Grok has already said which model to look with, and
    // asking for a second variable to repeat it is how a photograph ends up
    // being read by a different model than the conversation it belongs to.
    envModel: process.env.XAI_VISION_MODEL ?? process.env.XAI_MODEL,
    models: list(process.env.XAI_VISION_MODEL ?? process.env.XAI_MODEL, [
      "grok-4.5",
      "grok-4",
    ]),
  },
  {
    name: "openai",
    label: "OpenAI Vision",
    endpoint: "https://api.openai.com/v1/chat/completions",
    keyVars: ["OPENAI_API_KEY"],
    apiKey: () => process.env.OPENAI_API_KEY ?? null,
    headers: (key) => ({ authorization: `Bearer ${key ?? ""}` }),
    envModel: process.env.OPENAI_VISION_MODEL,
    models: list(process.env.OPENAI_VISION_MODEL, [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
    ]),
  },
  {
    name: "gemini",
    label: "Gemini Vision",
    // The OpenAI-compatible surface, so this file needs one request shape
    // rather than a second body format for one provider.
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyVars: ["GEMINI_API_KEY"],
    apiKey: () => process.env.GEMINI_API_KEY ?? null,
    headers: (key) => ({ authorization: `Bearer ${key ?? ""}` }),
    envModel: process.env.GEMINI_VISION_MODEL,
    models: list(process.env.GEMINI_VISION_MODEL, [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-flash",
    ]),
  },
  {
    name: "huggingface",
    label: "Hugging Face Vision",
    endpoint: "https://router.huggingface.co/v1/chat/completions",
    keyVars: ["HUGGINGFACE_API_KEY"],
    apiKey: () => process.env.HUGGINGFACE_API_KEY ?? null,
    headers: (key) => ({ authorization: `Bearer ${key ?? ""}` }),
    envModel: process.env.HUGGINGFACE_VISION_MODEL,
    models: list(process.env.HUGGINGFACE_VISION_MODEL, [
      "meta-llama/Llama-3.2-11B-Vision-Instruct",
      "Qwen/Qwen2.5-VL-7B-Instruct",
    ]),
  },
  {
    name: "groq",
    label: "Groq Vision",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyVars: ["GROQ_API_KEY"],
    apiKey: () => process.env.GROQ_API_KEY ?? null,
    headers: (key) => ({ authorization: `Bearer ${key ?? ""}` }),
    envModel: process.env.GROQ_VISION_MODEL,
    // Four candidates because this is the provider that produced the 404:
    // Groq renames vision models often, and the first name here has already
    // been the wrong one once.
    models: list(process.env.GROQ_VISION_MODEL, [
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "meta-llama/llama-4-maverick-17b-128e-instruct",
      "llama-3.2-90b-vision-preview",
      "llama-3.2-11b-vision-preview",
    ]),
  },
  {
    name: "openrouter",
    label: "OpenRouter Vision",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyVars: ["OPENROUTER_API_KEY"],
    apiKey: () => process.env.OPENROUTER_API_KEY ?? null,
    headers: (key) => ({
      authorization: `Bearer ${key ?? ""}`,
      "http-referer": siteUrl(),
      "x-title": "Medosha",
    }),
    envModel: process.env.OPENROUTER_VISION_MODEL,
    models: list(process.env.OPENROUTER_VISION_MODEL, [
      "meta-llama/llama-3.2-11b-vision-instruct:free",
      "qwen/qwen2.5-vl-72b-instruct:free",
    ]),
  },
  {
    name: "ollama",
    label: "Local vision model",
    endpoint: `${(process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "")}/v1/chat/completions`,
    keyVars: ["OLLAMA_URL"],
    // Ollama needs no key; presence of the URL is what makes it available.
    apiKey: () => process.env.OLLAMA_URL ?? null,
    headers: () => ({}),
    envModel: process.env.OLLAMA_VISION_MODEL,
    models: list(process.env.OLLAMA_VISION_MODEL, ["llava", "llama3.2-vision"]),
  },
];

/**
 * The order they are tried in.
 *
 * Grok first, because it is what this deployment is configured with and a
 * photograph should be read by the same model that is holding the
 * conversation. OpenAI next because it is the most reliable at returning the
 * JSON this pipeline parses; Gemini after it because it is nearly as good and
 * usually free; Hugging Face as the free fallback; Groq after those because it
 * is the one whose model names move. Local last — if it is there at all it
 * costs nothing, but it is also the slowest and the weakest.
 */
const ORDER: VisionProviderName[] = [
  "xai",
  "openai",
  "gemini",
  "huggingface",
  "groq",
  "openrouter",
  "ollama",
];

export function allVisionProviders(): VisionProvider[] {
  return ORDER.map(
    (name) => PROVIDERS.find((provider) => provider.name === name)!,
  ).filter(Boolean);
}

export function isConfigured(provider: VisionProvider): boolean {
  const key = provider.apiKey();
  return typeof key === "string" && key.trim().length > 0;
}

/** Providers this deployment can actually call, in priority order. */
export function configuredVisionProviders(): VisionProvider[] {
  return allVisionProviders().filter(isConfigured);
}

/** What to tell an operator when nothing is set up. */
export function visionSetupHelp(): string {
  const names = allVisionProviders()
    .filter((provider) => provider.name !== "ollama")
    .map((provider) => provider.keyVars.join("+"))
    .join(", ");
  return `No vision provider is configured. Set one of ${names} in .env.local and restart. GEMINI_API_KEY and HUGGINGFACE_API_KEY both have free tiers.`;
}
