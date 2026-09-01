import "server-only";

import {
  ProviderError,
  streamCompletion,
  visionChain,
  visionConfigurationError,
  type AiMessage,
  type AiProviderName,
} from "@/lib/ai/provider";

import { imagePrompt } from "./prompt";
import { extractJson, hydrateSpec } from "./hydrate";
import type { DesignSpec, SpecIssue } from "../types/spec";

/**
 * A photograph, turned into something somebody can edit.
 *
 * The important word is *edit*. It would be easier to send the picture to an
 * image model and send back a prettier picture, and it would be worthless: the
 * result of that is another image, and nobody can build from an image, price
 * one, or change the third cupboard along. So the model here is asked for the
 * same `DesignSpec` everything else in Berchuma produces, and what comes back
 * is a design like any other — draggable, costed, cuttable.
 *
 * The model is told to copy, not to improve. Somebody who uploads a wardrobe
 * they saw in a showroom wants that wardrobe. A model left to its own taste
 * returns a nicer wardrobe, which is the wrong answer to the question asked.
 */

export type VisionRequest = {
  /** A data URL. The bytes never leave the server for anywhere but the model. */
  image: string;
  /** What the customer said, if anything. Dimensions here beat the picture. */
  brief?: string;
  /** Overrides whatever the model estimates from the photograph. */
  dimensions?: { width?: number; height?: number; depth?: number };
  signal?: AbortSignal;
};

export type VisionTurn = {
  reply: string;
  spec: DesignSpec;
  issues: SpecIssue[];
  provider: AiProviderName;
  model: string;
  /** True when the first attempt came back unreadable and was retried. */
  retried: boolean;
};

export type VisionError = {
  error: string;
  /** Set when the problem is configuration rather than the model or the image. */
  configuration?: boolean;
};

/** Roughly 8 MB of base64, which is about a 6 MB photograph. */
const MAX_DATA_URL = 8_500_000;

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function designFromImage(
  request: VisionRequest,
): Promise<VisionTurn | VisionError> {
  const configuration = visionConfigurationError();
  if (configuration) return { error: configuration, configuration: true };

  const problem = checkImage(request.image);
  if (problem) return { error: problem };

  const providers = visionChain();
  const messages: AiMessage[] = [
    { role: "system", content: imagePrompt(request.dimensions) },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: userInstruction(request.brief, request.dimensions),
        },
        { type: "image_url", image_url: { url: request.image } },
      ],
    },
  ];

  let lastError = "";

  for (const provider of providers) {
    let text = "";

    try {
      for await (const chunk of streamCompletion(provider, {
        messages,
        // Lower than the chat turn's 0.2. This is a transcription task, not a
        // design task, and every degree of temperature is a chance the model
        // improves on what it was asked to copy.
        temperature: 0.1,
        maxTokens: 4000,
        signal: request.signal,
      })) {
        if (chunk.type === "text") text += chunk.value;
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

    const first = interpret(text, request.brief ?? "From a photograph");
    if (first.ok) {
      return { ...first.turn, provider: provider.name, model: provider.defaultModel, retried: false };
    }

    // One retry, with the parser's complaint and the reply it complained
    // about. Same reasoning as the chat turn: a model shown the exact field it
    // got wrong usually fixes it, and a second retry is money spent on a model
    // that has misunderstood the task.
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
        temperature: 0.05,
        maxTokens: 4000,
        signal: request.signal,
      })) {
        if (chunk.type === "text") retryText += chunk.value;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown error";
      continue;
    }

    const second = interpret(retryText, request.brief ?? "From a photograph");
    if (second.ok) {
      return { ...second.turn, provider: provider.name, model: provider.defaultModel, retried: true };
    }

    lastError = second.error;
  }

  return {
    error:
      lastError ||
      "The picture could not be read as a piece of furniture. Try a straighter, better-lit photograph of the whole unit.",
  };
}

/**
 * What is wrong with the upload, before a single token is spent on it.
 *
 * Size and type are checked here rather than only in the browser, because the
 * browser is not where the rule lives — a request can arrive from anywhere and
 * a 40 MB payload should be refused, not forwarded to a paid API.
 */
function checkImage(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) {
    return "That is not an image.";
  }
  if (dataUrl.length > MAX_DATA_URL) {
    return "That photograph is too large. About 6 MB is the limit — most phones can send a smaller copy.";
  }

  const type = dataUrl.slice(5, dataUrl.indexOf(";")).toLowerCase();
  if (!ALLOWED.includes(type)) {
    return "Send a JPEG, PNG or WebP photograph.";
  }
  return null;
}

function userInstruction(
  brief: string | undefined,
  dimensions: VisionRequest["dimensions"],
): string {
  const lines = [
    "Recreate the furniture in this photograph as a DesignSpec.",
    "Copy what is there. Do not improve it, do not tidy it, do not add anything it does not have.",
  ];

  const stated = [
    dimensions?.width ? `${dimensions.width} mm wide` : null,
    dimensions?.height ? `${dimensions.height} mm high` : null,
    dimensions?.depth ? `${dimensions.depth} mm deep` : null,
  ].filter(Boolean);

  if (stated.length > 0) {
    lines.push(
      "",
      `The customer has measured it: ${stated.join(", ")}.`,
      "Use those numbers exactly. They beat anything you estimate from the picture.",
    );
  }

  if (brief?.trim()) {
    lines.push("", `The customer also said: ${brief.trim()}`);
  }

  return lines.join("\n");
}

type Interpreted =
  | { ok: true; turn: Pick<VisionTurn, "reply" | "spec" | "issues"> }
  | { ok: false; error: string };

function interpret(text: string, brief: string): Interpreted {
  const parsed = extractJson(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "no JSON object was found in the reply" };
  }

  const record = parsed as Record<string, unknown>;

  // Unlike a chat turn, a null spec is not a legitimate answer here. Somebody
  // uploaded a photograph; "I have a question about it" is not what they asked
  // for, and returning it as a success would show them an empty studio.
  if (record.spec === null || record.spec === undefined) {
    return {
      ok: false,
      error: "the reply contained no design",
    };
  }

  const hydrated = hydrateSpec(record.spec, brief);
  if (!hydrated.ok) return { ok: false, error: hydrated.error };

  const reply =
    typeof record.reply === "string" && record.reply.trim().length > 0
      ? record.reply.trim()
      : `Recreated from your photograph: ${hydrated.spec.title}.`;

  return { ok: true, turn: { reply, spec: hydrated.spec, issues: hydrated.issues } };
}
