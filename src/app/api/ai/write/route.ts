import { NextResponse } from "next/server";

import {
  ProviderError,
  configurationError,
  providerChain,
  streamCompletion,
  type AiMessage,
} from "@/lib/ai/provider";
import {
  buildWriterPrompt,
  cleanWriterOutput,
  textBlock,
} from "@/lib/ai/writer-prompt";
import {
  MAX_WRITE_INPUT,
  isWriteAction,
  isWriteLanguage,
  isWriteSurface,
  isWriteTone,
  type WriteAction,
} from "@/lib/ai/writing";
import { createClient } from "@/lib/supabase/server";

/**
 * The writing assistant's endpoint.
 *
 * Streams, because the difference between text appearing after two seconds and
 * text appearing progressively from three hundred milliseconds is the
 * difference between a feature people use and one they wait out.
 *
 * Server-sent events in the same shape as /api/ai/chat, so the client-side
 * frame parsing is the same code path and there is one thing to keep right.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Writing fires far more often than chat, so it is metered separately. */
const RATE_LIMIT_REQUESTS = 120;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

type WriteRequest = {
  text?: unknown;
  action?: unknown;
  surface?: unknown;
  tone?: unknown;
  language?: unknown;
  context?: unknown;
};

function frame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

/** How adventurous each action is allowed to be. */
function temperatureFor(action: WriteAction): number {
  switch (action) {
    // Mechanical corrections have one right answer; sampling can only hurt.
    case "spelling":
    case "grammar":
    case "translate":
      return 0;
    case "tags":
      return 0.2;
    case "complete":
      return 0.6;
    default:
      return 0.35;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use the writing assistant." },
      { status: 401 },
    );
  }

  let body: WriteRequest;
  try {
    body = (await request.json()) as WriteRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Nothing to edit." }, { status: 400 });
  }
  if (text.length > MAX_WRITE_INPUT) {
    return NextResponse.json(
      {
        error: `That is ${text.length.toLocaleString()} characters. The assistant edits up to ${MAX_WRITE_INPUT.toLocaleString()} at a time — select a section instead.`,
      },
      { status: 400 },
    );
  }

  const action = isWriteAction(body.action) ? body.action : "improve";
  const surface = isWriteSurface(body.surface) ? body.surface : "generic";
  const tone = isWriteTone(body.tone) ? body.tone : undefined;
  const language = isWriteLanguage(body.language) ? body.language : undefined;
  const context = typeof body.context === "string" ? body.context : undefined;

  // Translating with no target language would silently return the input.
  if (action === "translate" && !language) {
    return NextResponse.json(
      { error: "Choose a language to translate into." },
      { status: 400 },
    );
  }

  const { data: recent } = await supabase.rpc("ai_feature_requests_in_window", {
    feature_name: "writer",
    window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (typeof recent === "number" && recent >= RATE_LIMIT_REQUESTS) {
    return NextResponse.json(
      {
        error: `You've used the writing assistant ${RATE_LIMIT_REQUESTS} times this hour. It will reset shortly — your text is untouched.`,
      },
      { status: 429 },
    );
  }

  const misconfigured = configurationError();
  if (misconfigured) {
    console.error(`[medosha-ai:write] ${misconfigured}`);
    return NextResponse.json({ error: misconfigured }, { status: 503 });
  }

  const prompt = buildWriterPrompt({ action, surface, tone, language, context });
  const messages: AiMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: `${prompt.user}\n\n${textBlock(text)}` },
  ];

  const providers = providerChain();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(frame("meta", { action, surface, tone, language }));

      let answer = "";
      let lastError: string | null = null;

      for (const [index, provider] of providers.entries()) {
        try {
          const completion = streamCompletion(provider, {
            messages,
            temperature: temperatureFor(action),
            signal: request.signal,
          });

          for await (const chunk of completion) {
            if (chunk.type === "text") {
              answer += chunk.value;
              controller.enqueue(frame("delta", { text: chunk.value }));
              continue;
            }

            const latency = Date.now() - startedAt;
            await record(supabase, {
              userId: user.id,
              provider: provider.name,
              model: provider.defaultModel,
              promptTokens: chunk.promptTokens,
              completionTokens: chunk.completionTokens,
              latency,
              ok: true,
              error: null,
              fellBack: index > 0,
            });

            // The cleaned text is sent as well as streamed: fences and stray
            // lead-ins can only be detected once the whole answer has arrived,
            // and the client replaces what it showed with this.
            controller.enqueue(
              frame("done", {
                text: cleanWriterOutput(answer),
                latencyMs: latency,
                provider: provider.name,
              }),
            );
          }

          controller.close();
          return;
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
            return;
          }

          lastError =
            error instanceof ProviderError
              ? `${error.provider} ${error.status}: ${error.message}`
              : error instanceof Error
                ? error.message
                : "unknown error";

          await record(supabase, {
            userId: user.id,
            provider: provider.name,
            model: provider.defaultModel,
            promptTokens: 0,
            completionTokens: 0,
            latency: Date.now() - startedAt,
            ok: false,
            error: lastError,
            fellBack: index > 0,
          });

          // Half a rewrite is worse than none — the user would have to work
          // out where it stopped. Fail cleanly and leave their text alone.
          if (answer.length > 0) {
            controller.enqueue(
              frame("error", {
                message:
                  "The suggestion was cut short, so it was discarded. Your text is unchanged.",
              }),
            );
            controller.close();
            return;
          }
        }
      }

      controller.enqueue(
        frame("error", {
          message: `The writing assistant is unavailable. Last error: ${lastError ?? "unknown"}. Your text is unchanged.`,
        }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

type WriteUsage = {
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latency: number;
  ok: boolean;
  error: string | null;
  fellBack: boolean;
};

async function record(
  supabase: Awaited<ReturnType<typeof createClient>>,
  usage: WriteUsage,
): Promise<void> {
  // `agent` stays null: the writer is not one of the chat agents, and the
  // feature column is what the metering and the admin view read.
  await supabase.from("ai_usage_logs").insert({
    user_id: usage.userId,
    feature: "writer",
    provider: usage.provider,
    model: usage.model,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    latency_ms: usage.latency,
    ok: usage.ok,
    error: usage.error,
    fell_back: usage.fellBack,
  });
}
