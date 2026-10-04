import { NextResponse } from "next/server";

import { designFromImage } from "@/features/berchuma-studio/services/vision";
import type { DesignResponse } from "@/features/berchuma-studio/types/api";
import { withCredits } from "@/lib/billing/gate";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { createClient } from "@/lib/supabase/server";

/**
 * A photograph, in. A design, out.
 *
 * The image arrives as a data URL in the request body and is passed straight to
 * the model. It is never written to storage, never given a URL, and never
 * leaves this process for anywhere but the provider — somebody's photograph of
 * their own kitchen is not something to publish so that a model can look at it.
 *
 * The body limit matters here in a way it does not on the chat route. Next's
 * default is generous and a phone photograph is several megabytes, so the check
 * is in the service, before a single token is spent on a payload that was never
 * going to work.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use Berchuma Studio." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.image !== "string" || body.image.length === 0) {
    return NextResponse.json({ error: "No image was sent." }, { status: 400 });
  }

  // Six times the price of a design turn, because a vision call is six times
  // the cost — which is exactly why this operation is gated on the plan as well
  // as the balance. `design.image` needs Pro; the refusal comes back with a
  // reason the panel can turn into an upgrade link.
  const gated = await withCredits<NextResponse>(
    AI_OPERATIONS.designImage,
    { client: supabase, description: "Image to 3D" },
    async () => {
      const startedAt = Date.now();
      const result = await designFromImage({
        image: body.image as string,
        brief:
          typeof body.brief === "string" ? body.brief.slice(0, 2000) : undefined,
        dimensions: readDimensions(body.dimensions),
        signal: request.signal,
      });

      if ("error" in result) {
        // A configuration problem is the one error worth showing verbatim: it
        // names the variable to set, and hiding it behind "something went
        // wrong" leaves somebody guessing at their own server.
        const status = result.configuration ? 503 : 502;
        if (result.configuration) {
          console.error(`[berchuma:image] ${result.error}`);
        }

        return {
          charge: false as const,
          reason: result.configuration
            ? "No vision model is configured"
            : "The vision model could not read the photograph",
          value: NextResponse.json({ error: result.error }, { status }),
        };
      }

      await recordUsage(supabase, {
        userId: user.id,
        provider: result.provider,
        model: result.model,
        latency: Date.now() - startedAt,
        error: result.retried ? "recovered after one malformed reply" : null,
      });

      const response: DesignResponse = {
        reply: result.reply,
        spec: result.spec,
        issues: result.issues,
      };
      return { charge: true as const, value: NextResponse.json(response) };
    },
  );

  if (!gated.ok) {
    return NextResponse.json(
      { error: gated.error, reason: gated.reason },
      { status: gated.status },
    );
  }

  return gated.value;
}

function readDimensions(
  value: unknown,
): { width?: number; height?: number; depth?: number } | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const read = (key: string): number | undefined => {
    const entry = record[key];
    // Anything outside what a person could build is treated as not given: a
    // typo of 24000 for 2400 should fall back to an estimate rather than
    // produce a wardrobe the length of a football pitch.
    if (typeof entry !== "number" || !Number.isFinite(entry)) return undefined;
    if (entry < 100 || entry > 12_000) return undefined;
    return Math.round(entry);
  };

  const dimensions = {
    width: read("width"),
    height: read("height"),
    depth: read("depth"),
  };

  return dimensions.width || dimensions.height || dimensions.depth
    ? dimensions
    : undefined;
}

/** Accounting must never break a working answer, so failures are swallowed. */
async function recordUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  record: {
    userId: string;
    provider: string;
    model: string;
    latency: number;
    error: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("ai_usage_logs").insert({
      user_id: record.userId,
      conversation_id: null,
      agent: "render",
      provider: record.provider,
      model: record.model,
      prompt_tokens: 0,
      completion_tokens: 0,
      latency_ms: record.latency,
      ok: true,
      error: record.error,
      fell_back: false,
    });
  } catch {
    // Deliberately silent.
  }
}
