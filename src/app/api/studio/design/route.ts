import { NextResponse } from "next/server";

import { designTurn } from "@/features/berchuma-studio/services/ai";
import { upgradeSpec, designSpecSchema } from "@/features/berchuma-studio/types/spec";
import type { DesignResponse } from "@/features/berchuma-studio/types/api";
import { configurationError } from "@/lib/ai/provider";
import { sanitizeHistory, validateQuestion } from "@/lib/ai/security";
import { withCredits } from "@/lib/billing/gate";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { createClient } from "@/lib/supabase/server";

/**
 * One turn of Berchuma AI.
 *
 * Not a streaming route, unlike `/api/ai/chat`. The product is a JSON object
 * that has to be complete before it means anything, so this answers once.
 *
 * The `current` spec arrives from the browser and is therefore untrusted — a
 * client could post a spec with a negative depth or twelve thousand bays and
 * hand the geometry engine something it will loop on. It is re-parsed through
 * the same schema the model's output goes through before it is used.
 *
 * ## What replaced the hourly cap
 *
 * This used to allow thirty requests an hour to everybody and count nothing.
 * That was the wrong shape twice over: it charged a paying member the same as
 * a stranger, and it let the thirtieth request cost as much as a photograph
 * while the first cost a sentence. Credits are now reserved before the model is
 * called and returned if it fails, so the limit is what somebody has bought and
 * a failure costs them nothing.
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

  const verdict = validateQuestion(body.brief);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  // A missing key is a setup problem, not a model failure. Say which variable.
  // Checked before the credits are reserved: a deployment with no key would
  // otherwise take credits and hand them straight back, which works but shows
  // up in somebody's history as a string of failures they did not cause.
  const misconfigured = configurationError();
  if (misconfigured) {
    console.error(`[berchuma] ${misconfigured}`);
    return NextResponse.json({ error: misconfigured }, { status: 503 });
  }

  // A spec the browser could not have produced is dropped rather than
  // rejected: the worst case is that the model designs from scratch instead of
  // editing, which is recoverable, whereas a 400 loses the user's message.
  const parsedCurrent = designSpecSchema.safeParse(upgradeSpec(body.current));
  const current = parsedCurrent.success ? parsedCurrent.data : null;

  const gated = await withCredits<NextResponse>(
    AI_OPERATIONS.designChat,
    {
      client: supabase,
      designId: typeof body.designId === "string" ? body.designId : null,
      description: verdict.question.slice(0, 120),
    },
    async () => {
      const startedAt = Date.now();
      const result = await designTurn({
        brief: verdict.question,
        history: sanitizeHistory(body.history),
        current,
        signal: request.signal,
      });

      if ("error" in result) {
        await recordUsage(supabase, {
          userId: user.id,
          provider: result.provider ?? "unknown",
          model: "unknown",
          promptTokens: 0,
          completionTokens: 0,
          latency: Date.now() - startedAt,
          ok: false,
          error: result.error,
        });

        // The provider's own words never reach the browser — they carry model
        // names, quota details and occasionally a fragment of the request.
        console.error(`[berchuma] ${result.error}`);
        return {
          charge: false as const,
          reason: "Berchuma could not produce a design",
          value: NextResponse.json(
            {
              error:
                "Berchuma could not draw that design. Try describing it again, or start with something simpler.",
            },
            { status: 502 },
          ),
        };
      }

      await recordUsage(supabase, {
        userId: user.id,
        provider: result.provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latency: Date.now() - startedAt,
        ok: true,
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

type UsageRecord = {
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latency: number;
  ok: boolean;
  error: string | null;
};

/** Accounting must never break a working answer, so failures are swallowed. */
async function recordUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  record: UsageRecord,
): Promise<void> {
  try {
    await supabase.from("ai_usage_logs").insert({
      user_id: record.userId,
      conversation_id: null,
      // Berchuma is a design agent, not a chat agent, but it draws from the
      // same quota and belongs in the same ledger. "render" is the existing
      // agent closest to what this is.
      agent: "render",
      provider: record.provider,
      model: record.model,
      prompt_tokens: record.promptTokens,
      completion_tokens: record.completionTokens,
      latency_ms: record.latency,
      ok: record.ok,
      error: record.error,
      fell_back: false,
    });
  } catch {
    // Deliberately silent.
  }
}
