import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  MAX_IMAGES,
  IMAGE_PROVIDERS,
  chainFor,
  findModel,
  isAspectRatio,
  isQuality,
  isQualityMode,
  type ImageIntent,
} from "@/lib/ai/image-models";
import {
  ChainExhaustedError,
  generateWithFallback,
  type AttemptRecord,
  type ChainEvent,
} from "@/lib/ai/image-fallback";
import {
  blockedProviders,
  configurationHelp,
  hasKeys,
  usableProviders,
  validateAll,
} from "@/lib/ai/provider-health";
import { needsOperator, type ProgressEvent } from "@/lib/ai/provider-status";
import { holdCredits } from "@/lib/billing/gate";
import { estimateImages, meterImages } from "@/lib/billing/metering";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { storeImages } from "@/lib/ai/image-storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Image generation for the AI Studio.
 *
 * One endpoint for every tool. The tool decides the intent, the model and
 * whether an image or a mask comes with the request; this route validates,
 * meters, calls the adapter and returns URLs.
 *
 * It answers in one of two shapes. A plain POST gets JSON, as before. A POST
 * asking for `text/event-stream` gets the same outcome preceded by the walk
 * that produced it — which provider was checked, what it said, which one was
 * tried, and why the chain moved on. The queue asks for the stream, so a
 * fallback is something the user watches rather than something they infer
 * afterwards from a model name they did not choose.
 *
 * The chain is built only from providers that have passed validation. A key
 * that is present but rejected is not a provider; treating it as one is what
 * produced "tried 2 providers and none could answer".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Some models take a minute; the platform default would cut them off. */
export const maxDuration = 180;

const MAX_PROMPT = 2000;
/** Largest inline upload accepted, before base64 expansion. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type Body = {
  prompt?: unknown;
  negativePrompt?: unknown;
  modelId?: unknown;
  intent?: unknown;
  aspect?: unknown;
  quality?: unknown;
  count?: unknown;
  image?: unknown;
  mask?: unknown;
  seed?: unknown;
  mode?: unknown;
  freeMode?: unknown;
  /** Which capability the router read this as. Recorded, never trusted. */
  capability?: unknown;
};

function tooBig(dataUrl: string): boolean {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // 4 base64 characters carry 3 bytes.
  return (base64.length * 3) / 4 > MAX_IMAGE_BYTES;
}

function validImageInput(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.startsWith("https://")) return true;
  return value.startsWith("data:image/") && !tooBig(value);
}

/** Providers the operator has to deal with, shaped for the browser. */
function blockedForClient() {
  return blockedProviders()
    .filter((entry) => needsOperator(entry.status))
    .map((entry) => ({
      provider: entry.provider,
      label: IMAGE_PROVIDERS[entry.provider].label,
      status: entry.status,
      keyVars: entry.keyVars,
    }));
}

export async function POST(request: Request) {
  const wantsStream = (request.headers.get("accept") ?? "").includes(
    "text/event-stream",
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /** Every early exit goes through here so both response shapes agree. */
  const fail = (
    error: string,
    status: number,
    extra: Record<string, unknown> = {},
  ) =>
    wantsStream
      ? streamOne({ type: "error", error, ...extra } as ProgressEvent)
      : NextResponse.json({ error, ...extra }, { status });

  if (!user) return fail("Sign in to generate images.", 401);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return fail("Invalid request.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const intent: ImageIntent =
    typeof body.intent === "string" ? (body.intent as ImageIntent) : "general";

  // Utilities work on an image and need no words; everything else needs a
  // prompt or there is nothing to make.
  const utility = intent === "upscale" || intent === "background-removal";
  if (!prompt && !utility) return fail("Describe what you want to see.", 400);
  if (prompt.length > MAX_PROMPT) {
    return fail(`Prompts are limited to ${MAX_PROMPT} characters.`, 400);
  }

  // Only providers that answered a probe. This is the change: a key being set
  // is not evidence it works, and the chain must not be built from guesses.
  const usable = await usableProviders();

  if (usable.length === 0) {
    const anyConfigured = (
      Object.keys(IMAGE_PROVIDERS) as (keyof typeof IMAGE_PROVIDERS)[]
    ).some(hasKeys);

    // Two audiences, one response. The member reads `error`; the studio's
    // provider panel reads `operatorHelp` and names the variables. Sending only
    // the operator sentence is what produced "xAI did not accept its API key"
    // in a chat window belonging to somebody who cannot set it.
    return fail("Medosha AI is not configured. Please contact the administrator.", 503, {
      operatorHelp: configurationHelp(),
      needsConfiguration: true,
      blocked: blockedForClient(),
      // Distinguishes "you have not set anything up" from "what you set up is
      // broken" — different sentences, different fixes.
      configuredButFailing: anyConfigured,
    });
  }

  const mode = isQualityMode(body.mode) ? body.mode : "balanced";
  const freeMode = body.freeMode === true;

  // A chosen model heads the chain; Auto builds the whole thing. Either way
  // what comes back is an ordered list, because a manual choice is a
  // preference rather than an instruction to fail when that provider is down.
  const chosen =
    typeof body.modelId === "string" && body.modelId !== "auto"
      ? (findModel(body.modelId) ?? null)
      : null;

  const chain = chainFor(chosen, intent, usable, { mode, freeMode });

  if (chain.length === 0) {
    return fail("Medosha AI is not configured. Please contact the administrator.", 503, {
      operatorHelp:
        "No working provider offers a model for that yet. Add a provider key in Settings → AI Providers.",
      needsConfiguration: true,
      blocked: blockedForClient(),
    });
  }

  const aspect = isAspectRatio(body.aspect) ? body.aspect : "1:1";
  const quality = isQuality(body.quality) ? body.quality : "standard";
  const count = Math.min(
    MAX_IMAGES,
    Math.max(1, Number.isFinite(body.count) ? Number(body.count) : 1),
  );

  const image = validImageInput(body.image) ? body.image : undefined;
  const mask = validImageInput(body.mask) ? body.mask : undefined;

  if (body.image !== undefined && !image) {
    return fail("Please upload a supported image.", 400, {
      operatorHelp: `JPEG, PNG or WebP, under ${MAX_IMAGE_BYTES / 1024 / 1024}MB, as a data URL or an https link.`,
    });
  }

  // One wallet for text and images, which is what the brief asked for and what
  // the flat sixty-an-hour cap this replaces could never express: four images
  // is four times the work and now costs four times as much, and a request that
  // produces nothing costs nothing at all.
  //
  // The hold is for everything asked for. Whatever the provider does not
  // actually return comes back at the commit.
  const requestId = randomUUID();
  const capability =
    typeof body.capability === "string" ? body.capability.slice(0, 40) : null;

  const hold = await holdCredits(AI_OPERATIONS.aiImage, {
    client: supabase,
    description: prompt ? prompt.slice(0, 120) : `Image (${intent})`,
    estimate: estimateImages(count, quality === "high" ? "high" : "standard"),
  });

  if (!hold.ok) {
    return fail(hold.error, hold.status, {
      reason: hold.reason,
      balance: hold.balance,
    });
  }

  const generation = {
    prompt,
    negativePrompt:
      typeof body.negativePrompt === "string" && body.negativePrompt.trim()
        ? body.negativePrompt.trim().slice(0, MAX_PROMPT)
        : undefined,
    aspect,
    quality,
    count,
    image,
    mask,
    seed: Number.isFinite(body.seed) ? Number(body.seed) : undefined,
    signal: request.signal,
  };

  /**
   * Records every attempt, not only the one that worked.
   *
   * `charged` lands on the successful attempt and nowhere else, so summing the
   * column gives what the member paid rather than what the providers were asked
   * for. A chain that failed twice before succeeding cost one image.
   */
  const record = async (attempts: AttemptRecord[], charged = 0) => {
    for (const attempt of attempts) {
      await log(supabase, {
        userId: user.id,
        provider: attempt.provider,
        model: attempt.model,
        latency: attempt.ms,
        ok: attempt.ok,
        error: attempt.reason ?? null,
        requestId,
        credits: attempt.ok ? charged : 0,
        images: attempt.ok ? count : 0,
        quality,
        capability,
      });
    }
  };

  // ---- Streaming ---------------------------------------------------------
  if (wantsStream) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ProgressEvent) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            // The client went away mid-walk. The generation is abandoned by
            // the request signal; there is nothing to clean up here.
          }
        };

        try {
          const result = await generateWithFallback(
            chain,
            generation,
            (event) => send(toProgress(event)),
          );

          // Charged for what came back, not for what was asked for. A request
          // for four that produced two is two.
          const charge = meterImages(
            result.images.length,
            quality === "high" ? "high" : "standard",
          );
          await hold.commit(charge);
          await record(result.attempts, charge);

          // Kept before it is announced, so the browser is never handed a
          // picture it cannot get back tomorrow. Storage failing does not fail
          // the generation — `storeImages` returns the original URL and the
          // member still has their image for this session.
          const stored = await storeImages(
            supabase,
            user.id,
            result.images,
            requestId,
          );

          send({
            type: "result",
            images: stored,
            model: {
              id: result.model.id,
              label: result.model.label,
              provider: result.model.provider,
            },
            attempts: result.attempts.map((attempt) => ({
              provider: attempt.provider,
              ok: attempt.ok,
              reason: attempt.reason,
            })),
            costEstimate: result.model.costPerImage * count,
            totalMs: result.totalMs,
            credits: charge,
            balance: await currentBalance(supabase),
          });
        } catch (error) {
          if (request.signal.aborted) {
            await hold.refund("The request was cancelled");
            controller.close();
            return;
          }

          if (error instanceof ChainExhaustedError) {
            // Nothing was produced, so nothing is owed. This is the case the
            // brief named: an AI operation that fails must refund.
            await hold.refund("Every image provider failed");
            await record(error.attempts);
            send({
              type: "error",
              error: error.message,
              needsConfiguration: error.attempts.some(
                (attempt) => attempt.status && needsOperator(attempt.status),
              ),
              blocked: blockedForClient(),
              attempts: error.attempts.map((attempt) => ({
                provider: attempt.provider,
                ok: attempt.ok,
                reason: attempt.reason,
              })),
            });
          } else {
            await hold.refund("The image could not be generated");
            console.error("[medosha-ai:image] unexpected:", error);
            send({
              type: "error",
              error: "Something went wrong. Your prompt is unchanged.",
            });
          }
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
        // Nginx and friends buffer streams into uselessness without this.
        "x-accel-buffering": "no",
      },
    });
  }

  // ---- Plain JSON --------------------------------------------------------
  try {
    const result = await generateWithFallback(chain, generation);
    const charge = meterImages(
      result.images.length,
      quality === "high" ? "high" : "standard",
    );
    await hold.commit(charge);
    await record(result.attempts, charge);

    const stored = await storeImages(supabase, user.id, result.images, requestId);

    return NextResponse.json({
      images: stored,
      model: {
        id: result.model.id,
        label: result.model.label,
        provider: result.model.provider,
      },
      latencyMs: result.totalMs,
      /** What was tried before this worked, for the "switched provider" note. */
      attempts: result.attempts,
      costEstimate: result.model.costPerImage * count,
      credits: charge,
      balance: await currentBalance(supabase),
    });
  } catch (error) {
    if (request.signal.aborted) {
      await hold.refund("The request was cancelled");
      return NextResponse.json({ error: "Cancelled." }, { status: 499 });
    }

    if (error instanceof ChainExhaustedError) {
      await hold.refund("Every image provider failed");
      await record(error.attempts);

      // Everything the browser sees has already been through humanReason();
      // no provider's raw text reaches this response.
      const operator = error.attempts.some(
        (attempt) => attempt.status && needsOperator(attempt.status),
      );

      return NextResponse.json(
        {
          error: error.message,
          attempts: error.attempts,
          needsConfiguration: operator,
          blocked: blockedForClient(),
        },
        { status: operator ? 503 : 502 },
      );
    }

    await hold.refund("The image could not be generated");
    console.error("[medosha-ai:image] unexpected:", error);
    return NextResponse.json(
      { error: "Something went wrong. Your prompt is unchanged." },
      { status: 500 },
    );
  }
}

/** The balance after the charge, so the header can move without a reload. */
async function currentBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number | null> {
  const { data } = await supabase
    .from("credit_wallets")
    .select("balance")
    .maybeSingle();
  return data?.balance ?? null;
}

/** Re-validates every provider. Used by the "Test Providers" button. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  await validateAll({ force: true });
  return NextResponse.json({ ok: true });
}

/** The chain's own event vocabulary, narrowed to what the browser needs. */
function toProgress(event: ChainEvent): ProgressEvent {
  switch (event.type) {
    case "attempt":
      return {
        type: "attempt",
        provider: event.provider,
        label: event.label,
        model: event.model.label,
        index: event.index,
      };
    default:
      return event as ProgressEvent;
  }
}

/** A one-event stream, for failures that happen before the walk starts. */
function streamOne(event: ProgressEvent): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
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

type ImageUsage = {
  userId: string;
  provider: string;
  model: string;
  latency: number;
  ok: boolean;
  error: string | null;
  requestId: string;
  credits: number;
  images: number;
  quality: string;
  capability: string | null;
};

async function log(
  supabase: Awaited<ReturnType<typeof createClient>>,
  usage: ImageUsage,
): Promise<void> {
  // Same table as chat and the writing assistant, distinguished by `feature`.
  await supabase.from("ai_usage_logs").insert({
    user_id: usage.userId,
    feature: "image",
    provider: usage.provider,
    model: usage.model,
    latency_ms: usage.latency,
    ok: usage.ok,
    error: usage.error,
    request_id: usage.requestId,
    credits: usage.credits,
    images: usage.images,
    quality: usage.quality,
    capability: usage.capability,
  });
}
