import { NextResponse } from "next/server";

import {
  ProviderError,
  providerChain,
  streamCompletion,
} from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";

/**
 * A suggested description of where a property is.
 *
 * The seller fills in Bole, a sub city and a landmark; this turns that into
 * the paragraph they would have written if they had the patience. It is a
 * suggestion, not a commitment — the form drops it into an editable field, so
 * a seller who disagrees just types over it.
 *
 * It is given only what the seller has already typed. No coordinates, no
 * nearby-place lookup, no inference about the neighbourhood's reputation — a
 * model asked to describe "Bole" from memory will confidently invent
 * amenities, and a listing that promises a school which is not there is worse
 * than one that says nothing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RATE_LIMIT = 40;
const WINDOW_SECONDS = 60 * 60;

const SYSTEM = `You write one short paragraph describing where a property is, for an Ethiopian property listing.

Rules:
- Two or three sentences. No more.
- Use only the places the seller named. Never add a school, mall, road or hospital they did not mention.
- Never describe the property itself — only its setting.
- Never claim a distance or a travel time in minutes.
- No sales language: no "prime", "luxurious", "sought-after", "nestled", "boasts".
- Plain English a buyer would actually read.
- Reply with the paragraph alone. No preamble, no quotation marks.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: {
    city?: string;
    subCity?: string;
    woreda?: string;
    neighbourhood?: string;
    landmark?: string;
    street?: string;
    propertyType?: string;
    listingKind?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const named = [
    body.neighbourhood && `neighbourhood: ${body.neighbourhood}`,
    body.subCity && `sub city: ${body.subCity}`,
    body.woreda && `woreda: ${body.woreda}`,
    body.street && `street: ${body.street}`,
    body.landmark && `near: ${body.landmark}`,
    body.city && `city: ${body.city}`,
  ].filter(Boolean);

  if (named.length === 0) {
    return NextResponse.json(
      { error: "Choose a location first and this will have something to describe." },
      { status: 400 },
    );
  }

  const { data: recent } = await supabase.rpc("ai_feature_requests_in_window", {
    feature_name: "listing",
    window_seconds: WINDOW_SECONDS,
  });
  if (typeof recent === "number" && recent >= RATE_LIMIT) {
    return NextResponse.json(
      { error: "You've asked for a lot of these this hour. The limit resets shortly." },
      { status: 429 },
    );
  }

  const providers = providerChain();
  if (providers.length === 0) {
    return NextResponse.json(
      { error: "No AI provider is configured. Write the description yourself — the listing works either way." },
      { status: 503 },
    );
  }

  const prompt = `A ${body.listingKind ?? "sale"} listing for a ${body.propertyType ?? "property"}.

The seller has given these locations, and only these:
${named.join("\n")}

Write the location paragraph.`;

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastError: string | null = null;
      let wrote = false;

      for (const provider of providers) {
        try {
          for await (const chunk of streamCompletion(provider, {
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: prompt },
            ],
            temperature: 0.5,
            maxTokens: 220,
            signal: request.signal,
          })) {
            if (chunk.type === "text") {
              wrote = true;
              controller.enqueue(encoder.encode(chunk.value));
            }
          }

          await supabase.from("ai_usage_logs").insert({
            user_id: user.id,
            feature: "listing",
            provider: provider.name,
            model: provider.defaultModel,
            latency_ms: Date.now() - startedAt,
            ok: true,
          });

          controller.close();
          return;
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
            return;
          }
          lastError =
            error instanceof ProviderError
              ? `${error.provider} ${error.status}`
              : error instanceof Error
                ? error.message
                : "unknown";
          console.error(`[medosha:listing] ${provider.name} failed:`, error);
          if (wrote) break;
        }
      }

      await supabase.from("ai_usage_logs").insert({
        user_id: user.id,
        feature: "listing",
        provider: "none",
        model: "none",
        latency_ms: Date.now() - startedAt,
        ok: false,
        error: lastError,
      });

      if (!wrote) {
        controller.enqueue(
          encoder.encode(
            "The assistant is unavailable. Write the description yourself — it is usually better anyway.",
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
