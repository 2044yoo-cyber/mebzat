import "server-only";

import {
  ProviderError,
  providerChain,
  streamCompletion,
  type AiMessage,
  type AiProviderName,
} from "@/lib/ai/provider";

import { currentSpecBlock, systemPrompt } from "./prompt";
import { extractJson, hydrateSpec } from "./hydrate";
import type { DesignSpec, SpecIssue } from "../types/spec";

/**
 * One design turn.
 *
 * Berchuma AI reuses Medosha's provider chain wholesale — the same keys, the
 * same fallback order, the same "never in the browser" guarantee. What it does
 * not reuse is the streaming: the product of this call is a JSON object, and
 * half a JSON object is not half a design. Tokens are accumulated here and the
 * caller gets an answer or an error, never a partial spec.
 *
 * The retry is the part worth explaining. A model that returns malformed JSON
 * on the first attempt very often returns valid JSON when shown the parser's
 * complaint, because the complaint names the field. One retry catches almost
 * all of it; a second is throwing money at a model that has misunderstood the
 * task, so there isn't one.
 */

export type DesignTurn = {
  reply: string;
  spec: DesignSpec | null;
  issues: SpecIssue[];
  provider: AiProviderName;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** True when the first attempt came back unparseable and was retried. */
  retried: boolean;
};

export type DesignTurnError = {
  error: string;
  /** Set when a provider answered but the answer was unusable. */
  provider?: AiProviderName;
};

export type DesignRequest = {
  brief: string;
  history: { role: "user" | "assistant"; content: string }[];
  current: DesignSpec | null;
  signal?: AbortSignal;
};

export async function designTurn(
  request: DesignRequest,
): Promise<DesignTurn | DesignTurnError> {
  const providers = providerChain();
  if (providers.length === 0) {
    return { error: "No AI provider is configured." };
  }

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt() },
    ...request.history,
  ];

  if (request.current) {
    messages.push({ role: "user", content: currentSpecBlock(request.current) });
  }
  messages.push({ role: "user", content: request.brief });

  let lastError = "";

  for (const provider of providers) {
    let promptTokens = 0;
    let completionTokens = 0;
    let text = "";

    try {
      for await (const chunk of streamCompletion(provider, {
        messages,
        // Low, because this is a structured response. Temperature buys variety
        // in prose and typos in JSON.
        temperature: 0.2,
        maxTokens: 3000,
        signal: request.signal,
      })) {
        if (chunk.type === "text") text += chunk.value;
        else {
          promptTokens = chunk.promptTokens;
          completionTokens = chunk.completionTokens;
        }
      }
    } catch (error) {
      lastError =
        error instanceof ProviderError
          ? `${error.provider} ${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "unknown error";
      continue;
    }

    const first = interpret(text, request.brief);
    if (first.ok) {
      return {
        ...first.turn,
        provider: provider.name,
        model: provider.defaultModel,
        promptTokens,
        completionTokens,
        retried: false,
      };
    }

    // Second attempt, same provider, with the parser's own words appended. The
    // failed reply goes back too — without it the model is being corrected on
    // something it cannot see.
    let retryText = "";
    try {
      for await (const chunk of streamCompletion(provider, {
        messages: [
          ...messages,
          { role: "assistant", content: text.slice(0, 4000) },
          {
            role: "user",
            content:
              `That reply could not be read: ${first.error}\n\n` +
              "Send the same design again as one JSON object with the keys " +
              '"reply" and "spec", no markdown fence and no text around it.',
          },
        ],
        temperature: 0.1,
        maxTokens: 3000,
        signal: request.signal,
      })) {
        if (chunk.type === "text") retryText += chunk.value;
        else {
          promptTokens += chunk.promptTokens;
          completionTokens += chunk.completionTokens;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      continue;
    }

    const second = interpret(retryText, request.brief);
    if (second.ok) {
      return {
        ...second.turn,
        provider: provider.name,
        model: provider.defaultModel,
        promptTokens,
        completionTokens,
        retried: true,
      };
    }

    lastError = second.error;
  }

  return {
    error: lastError || "Every AI provider failed.",
  };
}

type Interpreted =
  | { ok: true; turn: Pick<DesignTurn, "reply" | "spec" | "issues"> }
  | { ok: false; error: string };

/** Reads one model reply into a turn, or explains precisely what was wrong. */
function interpret(text: string, brief: string): Interpreted {
  const parsed = extractJson(text);
  if (!isRecord(parsed)) {
    return { ok: false, error: "no JSON object was found in the reply" };
  }

  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : null;

  // A null spec is a legitimate answer — a question was asked, not a design
  // instruction — so it needs a reply to stand on, and without one there is
  // nothing to show the user at all.
  if (parsed.spec === null || parsed.spec === undefined) {
    if (!reply) return { ok: false, error: 'neither "reply" nor "spec" was present' };
    return { ok: true, turn: { reply, spec: null, issues: [] } };
  }

  const hydrated = hydrateSpec(parsed.spec, brief);
  if (!hydrated.ok) return { ok: false, error: hydrated.error };

  return {
    ok: true,
    turn: {
      reply: reply ?? `Here is ${hydrated.spec.title}.`,
      spec: hydrated.spec,
      issues: hydrated.issues,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
