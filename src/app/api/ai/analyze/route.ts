import { NextResponse } from "next/server";

import {
  VisionUnavailableError,
  analyzeImage,
  checkImage,
  type VisionEvent,
} from "@/lib/ai/vision";
import { createClient } from "@/lib/supabase/server";

/**
 * Surveying an uploaded image.
 *
 * The first step of the redesign workflow: before anything is generated, the
 * assistant looks at what the user actually uploaded and reports what it sees.
 * Everything downstream — the suggested styles, the material links, the
 * element menu — is built from this.
 *
 * It streams. The walk can cross several providers and several models, which
 * takes long enough that a silent spinner reads as a hang; sending each step
 * as it happens lets the panel say "Using OpenAI Vision" and then "Retrying
 * with Gemini Vision" rather than nothing at all.
 *
 * No key, model list or provider URL is ever in the response. The events carry
 * a display label and nothing else.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_LIMIT = 80;
const WINDOW_SECONDS = 60 * 60;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type Wire =
  | VisionEvent
  | { type: "result"; analysis: unknown; provider: string; model: string; cached: boolean; latencyMs: number }
  | { type: "error"; error: string; needsConfiguration?: boolean };

export async function POST(request: Request) {
  const wantsStream = (request.headers.get("accept") ?? "").includes(
    "text/event-stream",
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fail = (error: string, status: number, extra: object = {}) =>
    wantsStream
      ? single({ type: "error", error, ...extra })
      : NextResponse.json({ error, ...extra }, { status });

  if (!user) return fail("Sign in to use the design assistant.", 401);

  let image: string | null = null;
  try {
    const body = (await request.json()) as { image?: unknown };
    if (typeof body.image === "string") image = body.image;
  } catch {
    // Falls through to the 400 below.
  }

  if (!image) return fail("No image supplied.", 400);

  // MIME type, size and the HEIC problem, all decided here rather than
  // discovered by six providers in turn.
  const check = checkImage(image, MAX_IMAGE_BYTES);
  if (!check.ok) return fail(check.reason, 400);

  const { data: recent } = await supabase.rpc("ai_feature_requests_in_window", {
    feature_name: "vision",
    window_seconds: WINDOW_SECONDS,
  });
  if (typeof recent === "number" && recent >= RATE_LIMIT) {
    return fail(
      `You've analysed ${RATE_LIMIT} images this hour. The limit resets shortly.`,
      429,
    );
  }

  const startedAt = Date.now();

  /** Records the outcome. A cached hit is not a provider call and is not billed. */
  const log = async (
    provider: string,
    model: string,
    ok: boolean,
    error?: string,
  ) => {
    await supabase.from("ai_usage_logs").insert({
      user_id: user.id,
      feature: "vision",
      provider,
      model,
      latency_ms: Date.now() - startedAt,
      ok,
      error: error ?? null,
    });
  };

  // ---- Streaming ---------------------------------------------------------
  if (wantsStream) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Wire) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            // The client went away. The request signal abandons the walk.
          }
        };

        try {
          const result = await analyzeImage(image, request.signal, send);

          if (!result.cached) {
            await log(result.provider, result.model, true);
          }

          send({
            type: "result",
            analysis: result.analysis,
            provider: result.provider,
            model: result.model,
            cached: result.cached,
            latencyMs: Date.now() - startedAt,
          });
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
            return;
          }

          const configuration =
            error instanceof VisionUnavailableError &&
            error.attempts.length === 0;

          await log(
            "none",
            "none",
            false,
            error instanceof Error ? error.message : "unknown",
          );

          send({
            type: "error",
            error:
              error instanceof VisionUnavailableError
                ? error.message
                : "The image could not be analysed. You can still choose a style and redesign it.",
            needsConfiguration: configuration,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  // ---- Plain JSON --------------------------------------------------------
  try {
    const result = await analyzeImage(image, request.signal);
    if (!result.cached) await log(result.provider, result.model, true);

    return NextResponse.json({
      analysis: result.analysis,
      provider: result.provider,
      cached: result.cached,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Cancelled." }, { status: 499 });
    }

    const configuration =
      error instanceof VisionUnavailableError && error.attempts.length === 0;

    await log(
      "none",
      "none",
      false,
      error instanceof Error ? error.message : "unknown",
    );

    // Vision failing must not block the workflow: the user can still choose a
    // style and redesign, they just do it without the survey.
    return NextResponse.json(
      {
        error:
          error instanceof VisionUnavailableError
            ? error.message
            : "The image could not be analysed. You can still choose a style and redesign it.",
        needsConfiguration: configuration,
      },
      { status: configuration ? 503 : 502 },
    );
  }
}

/** A one-event stream, for failures before the walk starts. */
function single(event: Wire): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    },
  );
}
