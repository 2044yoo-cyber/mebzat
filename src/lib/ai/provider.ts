import "server-only";

import { looksLikeVision } from "./vision-models";
import {
  XAI_PATHS,
  classifyXaiStatus,
  logXaiCall,
  logXaiFailure,
  xaiEndpoint,
  xaiTextModel,
} from "./xai-config";

/**
 * Provider abstraction for Medosha AI.
 *
 * Every provider here speaks a chat-completions dialect, so the differences
 * are reduced to a base URL, an auth header and a model name. Adding a new
 * provider means adding one entry to PROVIDERS — nothing above this file
 * changes. See docs/AI.md.
 *
 * Selection is driven by AI_PROVIDER; if that provider is unconfigured or
 * fails, the next configured one is tried in order, so a free-tier rate limit
 * degrades to another free tier instead of an outage.
 *
 * Keys are read from the environment at call time and never leave the server:
 * this module is server-only, so importing it from a client component is a
 * build error rather than a leaked key.
 */

export type AiProviderName =
  | "xai"
  | "openai"
  | "groq"
  | "gemini"
  | "openrouter"
  | "ollama";

/**
 * One piece of a message.
 *
 * Text-only messages stay strings, which is what every existing caller sends
 * and what every provider accepts. A message carrying an image becomes a list
 * of parts — the OpenAI-compatible shape, which Gemini and OpenRouter also
 * speak, so adding pictures needed no second request format.
 *
 * `image` is a data URL. Passing a link instead would mean the provider
 * fetching it, which means the image must be publicly reachable — and a
 * customer's photograph of their kitchen is not something to publish so that a
 * model can look at it.
 */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
};

export type AiProvider = {
  name: AiProviderName;
  /** OpenAI-compatible chat completions endpoint. */
  endpoint: string;
  defaultModel: string;
  /** Reads the key from the environment; null when the provider is unusable. */
  apiKey: () => string | null;
  /** Ollama runs locally and needs no key. */
  requiresKey: boolean;
  /**
   * Whether this provider's default model can look at a picture.
   *
   * Not a property of the provider so much as of the model, which is why it is
   * read from the model name where it can be: somebody who sets GROQ_MODEL to a
   * vision model should get vision, and somebody who sets OPENAI_MODEL to a
   * text-only one should not be told their upload failed for a mysterious
   * reason.
   */
  seesImages: () => boolean;
  headers: (key: string | null) => Record<string, string>;
  /**
   * Which request and response shape this provider speaks.
   *
   * `"chat"` is the OpenAI chat-completions dialect every other entry uses and
   * the default, so adding this field changed none of them. `"responses"` is
   * xAI's current surface.
   */
  dialect?: "chat" | "responses";
};

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  xai: {
    name: "xai",
    // The Responses API, not chat completions.
    //
    // This is the fix for "Medosha could not reach Grok". Every other provider
    // here speaks chat completions and xAI's current text surface is
    // `/v1/responses`, which takes `input` rather than `messages` and streams
    // typed events rather than `choices[].delta`. Pointing the old body at the
    // new endpoint fails the request, and pointing the new endpoint's reply at
    // the old parser yields an empty answer — so the dialect is a property of
    // the provider and both halves switch together.
    endpoint: xaiEndpoint(XAI_PATHS.responses),
    dialect: "responses",
    defaultModel: xaiTextModel(),
    apiKey: () => process.env.XAI_API_KEY ?? null,
    requiresKey: true,
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    seesImages: () => looksLikeVision(xaiTextModel()),
  },
  openai: {
    name: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    apiKey: () => process.env.OPENAI_API_KEY ?? null,
    requiresKey: true,
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    seesImages: () => looksLikeVision(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
  },
  groq: {
    name: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    apiKey: () => process.env.GROQ_API_KEY ?? null,
    requiresKey: true,
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    // llama-3.3-70b, the default, is text only.
    seesImages: () =>
      looksLikeVision(process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"),
  },
  gemini: {
    // Gemini exposes an OpenAI-compatible surface, which keeps this file free
    // of a second request/response shape.
    name: "gemini",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    apiKey: () => process.env.GEMINI_API_KEY ?? null,
    requiresKey: true,
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    seesImages: () => looksLikeVision(process.env.GEMINI_MODEL ?? "gemini-2.0-flash"),
  },
  openrouter: {
    name: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel:
      process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
    apiKey: () => process.env.OPENROUTER_API_KEY ?? null,
    requiresKey: true,
    headers: (key) => ({
      authorization: `Bearer ${key}`,
      // OpenRouter attributes traffic with these.
      "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      "x-title": "Medosha AI",
    }),
    seesImages: () =>
      looksLikeVision(
        process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
      ),
  },
  ollama: {
    name: "ollama",
    endpoint: `${process.env.OLLAMA_URL ?? "http://localhost:11434"}/v1/chat/completions`,
    defaultModel: process.env.OLLAMA_MODEL ?? "llama3.1",
    apiKey: () => null,
    requiresKey: false,
    headers: () => ({}),
    seesImages: () => looksLikeVision(process.env.OLLAMA_MODEL ?? "llama3.1"),
  },
};

/**
 * Order tried when the preferred provider is unavailable.
 *
 * Groq is not in it, and that absence is deliberate. Groq and Grok are
 * different companies with names one letter apart, and a chain that fell
 * through to `api.groq.com` meant a deployment with a broken xAI key answered
 * from Llama while every screen said Grok — a wrong answer that looks exactly
 * like a right one. It is still a provider and still works when somebody sets
 * `AI_PROVIDER=groq` and means it; nothing reaches it by accident.
 */
const FALLBACK_ORDER: AiProviderName[] = [
  "xai",
  "openai",
  "gemini",
  "openrouter",
  "ollama",
];

/**
 * Whether a provider can be attempted.
 *
 * Ollama needs no key, so it would otherwise join every chain and quietly
 * absorb a missing GROQ_API_KEY — turning a clear configuration error into a
 * confusing connection refusal against localhost. It therefore counts as
 * configured only when explicitly opted into.
 */
function isConfigured(provider: AiProvider): boolean {
  if (provider.name === "ollama") {
    return (
      preferredProvider() === "ollama" || process.env.OLLAMA_URL !== undefined
    );
  }
  return !provider.requiresKey || provider.apiKey() !== null;
}

/** Environment variable naming the active provider. */
const PROVIDER_VAR = "AI_PROVIDER";

/** The environment variable each provider's key is read from. */
const KEY_VAR: Record<AiProviderName, string | null> = {
  xai: "XAI_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: null,
};

/**
 * The provider named by the environment.
 *
 * MEDOSHA_AI_PROVIDER is still honoured so an existing deployment does not
 * break, but AI_PROVIDER wins where both are set.
 *
 * With neither set, xAI is the answer. Medosha AI is a Grok integration and
 * the environment names one key; defaulting to anything else meant a missing
 * or expired XAI_API_KEY silently selected a different company's model rather
 * than reporting a configuration problem, and `configurationError()` below
 * then named the wrong variable.
 */
export function preferredProvider(): AiProviderName {
  const configured = (process.env[PROVIDER_VAR] ??
    process.env.MEDOSHA_AI_PROVIDER) as AiProviderName | undefined;
  if (configured && configured in PROVIDERS) return configured;
  return "xai";
}

/**
 * Explains why no provider can be used, naming the exact variable to set.
 *
 * Returns null when at least one provider is usable. A configuration mistake
 * should read as a setup instruction, not as a model failure.
 */
export function configurationError(): string | null {
  if (providerChain().length > 0) return null;

  const preferred = preferredProvider();
  const keyVar = KEY_VAR[preferred];

  if (keyVar) {
    return (
      `${PROVIDER_VAR} is set to "${preferred}", but ${keyVar} is missing. ` +
      `Add ${keyVar} to .env.local and restart the server.`
    );
  }

  // Ollama needs no key, so reaching here means it is not running.
  return (
    `${PROVIDER_VAR} is set to "ollama", but no Ollama server was found at ` +
    `${process.env.OLLAMA_URL ?? "http://localhost:11434"}. Start Ollama, or unset ` +
    `${PROVIDER_VAR} and add XAI_API_KEY.`
  );
}

/**
 * Providers to attempt, in order: the preferred one first, then every other
 * configured provider. Empty when nothing is configured, which the route
 * reports as a setup problem rather than a model failure.
 */
export function providerChain(): AiProvider[] {
  const preferred = preferredProvider();
  const ordered = [preferred, ...FALLBACK_ORDER.filter((n) => n !== preferred)];
  return ordered.map((name) => PROVIDERS[name]).filter(isConfigured);
}

export function getProvider(name: AiProviderName): AiProvider {
  return PROVIDERS[name];
}

/**
 * Configured providers whose model can read a picture.
 *
 * A separate chain rather than a filter at the call site, because the ordinary
 * chain must not be narrowed: a studio with a text-only model configured still
 * designs perfectly well from a description, and only the upload is
 * unavailable. Narrowing everything would turn one missing key into a broken
 * feature.
 */
export function visionChain(): AiProvider[] {
  return providerChain().filter((provider) => provider.seesImages());
}

/**
 * Why an image cannot be read, in the words of the thing that needs setting.
 *
 * Returns null when at least one configured provider can see. The distinction
 * that matters is between "no AI at all" and "AI, but a model that cannot look
 * at pictures" — the second is the common case, because the default model is
 * text only, and telling somebody their upload failed without saying that is
 * telling them nothing.
 */
export function visionConfigurationError(): string | null {
  if (visionChain().length > 0) return null;

  const general = configurationError();
  if (general) return general;

  const configured = providerChain()
    .map((provider) => `${provider.name} (${provider.defaultModel})`)
    .join(", ");

  return (
    `Reading a photograph needs a model that can see images. ` +
    `Configured right now: ${configured}. ` +
    `If you have XAI_API_KEY set, leave XAI_MODEL unset so the multimodal ` +
    `default is used — an older grok-3 is text only. Otherwise add ` +
    `OPENAI_API_KEY (gpt-4o-mini reads images) or GEMINI_API_KEY to ` +
    `.env.local, then restart the server.`
  );
}

export type CompletionChunk =
  | { type: "text"; value: string }
  | { type: "done"; promptTokens: number; completionTokens: number };

export type StreamOptions = {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

/**
 * Thrown when a provider responds with an error status.
 *
 * Fields are assigned in the body rather than declared as constructor
 * parameter properties, which Node's type-stripping cannot compile — that
 * keeps this module importable from plain `node` as well as from Next.js.
 */
export class ProviderError extends Error {
  readonly provider: AiProviderName;
  readonly status: number;

  constructor(provider: AiProviderName, status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

/**
 * Streams a completion from one provider as an async iterable of chunks.
 *
 * Server-sent events are parsed here rather than in the route so callers deal
 * in text, not transport. Token counts arrive on the final payload for
 * providers that report them, and default to zero for those that do not.
 */
/**
 * A streamed frame, in either dialect.
 *
 * One type covering both rather than a cast at the read: the fields are
 * optional because which ones arrive depends on the dialect, and naming them
 * here is what stops a rename in one branch going unnoticed in the other.
 */
type StreamUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
};

type StreamFrame = {
  choices?: { delta?: { content?: string } }[];
  usage?: StreamUsage;
  /** Responses API: the event name. */
  type?: string;
  /** Responses API: the text of an `output_text.delta` event. */
  delta?: string;
  /** Responses API: the completed response, which carries the usage block. */
  response?: { usage?: StreamUsage };
};

function chatBody(provider: AiProvider, options: StreamOptions) {
  return {
    model: provider.defaultModel,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2048,
    stream: true,
    stream_options: { include_usage: true },
  };
}

/**
 * The Responses API body.
 *
 * `input` rather than `messages`, and `max_output_tokens` rather than
 * `max_tokens`. The roles and the content parts are the same, which is why the
 * callers above this file did not have to change: a message carrying a picture
 * is still `{ type: "image_url", image_url: { url } }`.
 */
function responsesBody(provider: AiProvider, options: StreamOptions) {
  return {
    model: provider.defaultModel,
    input: options.messages,
    temperature: options.temperature ?? 0.4,
    max_output_tokens: options.maxTokens ?? 2048,
    stream: true,
  };
}

/**
 * The text of a non-streamed Responses reply.
 *
 * Exported for the doctor and the checks: the shape has three plausible
 * readings — `output_text`, `output[].content[].text`, and the chat-completions
 * one somebody will eventually paste in by mistake — and a parser that silently
 * returns "" for two of them is a blank answer with no error anywhere.
 */
export function textFromResponses(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as {
    output_text?: unknown;
    output?: { content?: { type?: string; text?: unknown }[] }[];
  };

  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  const parts: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("");
}

export async function* streamCompletion(
  provider: AiProvider,
  options: StreamOptions,
): AsyncGenerator<CompletionChunk> {
  const key = provider.apiKey();
  const responses = provider.dialect === "responses";
  const endpoint = provider.endpoint;

  logXaiCall({
    endpoint,
    model: provider.defaultModel,
    operation: responses ? "responses" : "chat-completions",
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: options.signal,
      headers: {
        "content-type": "application/json",
        ...provider.headers(key),
      },
      body: JSON.stringify(
        responses
          ? responsesBody(provider, options)
          : chatBody(provider, options),
      ),
    });
  } catch (error) {
    // A thrown fetch never arrived, so there is no status to classify and no
    // body to read. Reported as 0 rather than invented as 500: the difference
    // between "xAI said no" and "we never reached xAI" is the difference
    // between a key problem and a network one.
    if (provider.name === "xai") {
      logXaiFailure({
        endpoint,
        model: provider.defaultModel,
        operation: "responses",
        kind: "unreachable",
        body: error instanceof Error ? error.message : String(error),
      });
    }
    throw new ProviderError(
      provider.name,
      0,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    if (provider.name === "xai") {
      logXaiFailure({
        endpoint,
        model: provider.defaultModel,
        operation: "responses",
        status: response.status,
        kind: classifyXaiStatus(response.status, detail),
        body: detail,
      });
    }
    throw new ProviderError(
      provider.name,
      response.status,
      detail.slice(0, 300) || response.statusText,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // SSE frames are newline-delimited; keep the trailing partial line.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload) as StreamFrame;

        // Two shapes, one loop. Chat completions put the text under
        // `choices[0].delta.content`; the Responses API emits typed events and
        // the text arrives on `response.output_text.delta`. Reading only the
        // first from an xAI stream is an answer that streams nothing and ends
        // blank, which is what "could not reach Grok" looked like from a
        // screen where the request had in fact succeeded.
        const text = responses
          ? parsed.type === "response.output_text.delta"
            ? parsed.delta
            : undefined
          : parsed.choices?.[0]?.delta?.content;
        if (text) yield { type: "text", value: text };

        const usage = parsed.usage ?? parsed.response?.usage;
        if (usage) {
          promptTokens =
            usage.prompt_tokens ?? usage.input_tokens ?? promptTokens;
          completionTokens =
            usage.completion_tokens ?? usage.output_tokens ?? completionTokens;
        }
      } catch {
        // A frame split across reads is not an error; the remainder arrives
        // in the next chunk and parses then.
      }
    }
  }

  yield { type: "done", promptTokens, completionTokens };
}
