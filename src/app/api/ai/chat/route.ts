import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { buildContext } from "@/lib/ai/context";
import { friendlyProviderMessage, worthFallingBack } from "@/lib/ai/failure";
import {
  ProviderError,
  configurationError,
  providerChain,
  streamCompletion,
  type AiMessage,
} from "@/lib/ai/provider";
import { BASE_SYSTEM_PROMPT, catalogueContextBlock } from "@/lib/ai/prompts";
import { getAgent, routeAgent } from "@/lib/ai/router";
import { sanitizeHistory, validateQuestion } from "@/lib/ai/security";
import { holdCredits } from "@/lib/billing/gate";
import { meterChat } from "@/lib/billing/metering";
import { AI_OPERATIONS } from "@/lib/billing/operations";
import { createClient } from "@/lib/supabase/server";
import type { AiAgentName } from "@/types/database.types";

/** Streaming needs the Node runtime; the edge runtime cannot reach Supabase here. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  question?: unknown;
  history?: unknown;
  conversationId?: unknown;
  agent?: unknown;
  /** Which capability the router read this as. Recorded, never trusted. */
  capability?: unknown;
  /**
   * The listing whose page the question was asked from.
   *
   * Sent by the property page so "does this house have parking" has a subject.
   * It is a lookup key, not an authorisation: the row is fetched through the
   * ordinary reader, so row-level security and the location redaction both
   * still apply and a member cannot read a listing here that the page would
   * not have shown them.
   */
  propertyId?: unknown;
};

/** A UUID, or nothing. Anything else is not looked up. */
function propertyIdFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

/** Emits one server-sent event frame. */
function frame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use Medosha AI." },
      { status: 401 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const verdict = validateQuestion(body.question);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }
  const { question } = verdict;

  // A missing key is a setup problem, not a model failure — say exactly which
  // variable to set rather than reporting a generic outage. Checked before the
  // credits are held so a broken deployment does not fill somebody's history
  // with charges and refunds they did not cause.
  const misconfigured = configurationError();
  if (misconfigured) {
    console.error(`[medosha-ai] ${misconfigured}`);
    return NextResponse.json({ error: misconfigured }, { status: 503 });
  }

  // What used to be a flat thirty-questions-an-hour cap, applied equally to
  // somebody paying and somebody who had just signed up. Credits replace it:
  // the limit is what a member has bought, a failed answer costs nothing, and
  // a long analysis costs more than "what is the price of cement".
  //
  // `holdCredits` rather than `withCredits` because the response returns while
  // the work is still going — the settle happens inside the stream, on every
  // path out of it.
  const hold = await holdCredits(AI_OPERATIONS.aiChat, {
    client: supabase,
    description: question.slice(0, 120),
  });

  if (!hold.ok) {
    return NextResponse.json(
      { error: hold.error, reason: hold.reason, balance: hold.balance },
      { status: hold.status },
    );
  }

  const providers = providerChain();

  const agent =
    typeof body.agent === "string"
      ? getAgent(body.agent as AiAgentName)
      : routeAgent(question);

  const context = await buildContext(question, agent.needs, {
    propertyId: propertyIdFrom(body.propertyId),
  });

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : null;

  // Ties every attempt in this request — including the ones that failed and
  // fell back — to one another and to the credit reservation.
  const requestId = randomUUID();
  const capability =
    typeof body.capability === "string" ? body.capability.slice(0, 40) : null;

  const messages: AiMessage[] = [
    {
      role: "system",
      content: `${BASE_SYSTEM_PROMPT}\n\n${agent.instructions}${catalogueContextBlock(context.text)}`,
    },
    ...sanitizeHistory(body.history),
    { role: "user", content: question },
  ];

  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        frame("meta", {
          agent: agent.name,
          agentLabel: agent.label,
          sources: context.sources,
          // The listings the search actually returned, so the map can
          // highlight the same rows the answer is about. Sent before the text
          // rather than after it: the map moves while the answer is still
          // being written, which is the whole reason it is worth doing.
          listings: context.pins,
        }),
      );

      let answer = "";
      let lastError: string | null = null;
      let lastStatus: number | null = null;
      let lastProvider: string | null = null;

      for (const [index, provider] of providers.entries()) {
        try {
          const completion = streamCompletion(provider, {
            messages,
            temperature: agent.temperature,
            signal: request.signal,
          });

          for await (const chunk of completion) {
            if (chunk.type === "text") {
              answer += chunk.value;
              controller.enqueue(frame("delta", { text: chunk.value }));
              continue;
            }

            const latency = Date.now() - startedAt;

            // The charge, from what was actually consumed rather than from the
            // estimate that was held. Usually well under it.
            const charge = meterChat({
              promptTokens: chunk.promptTokens,
              completionTokens: chunk.completionTokens,
            });
            await hold.commit(charge);

            await recordUsage(supabase, {
              userId: user.id,
              conversationId,
              agent: agent.name,
              provider: provider.name,
              model: provider.defaultModel,
              promptTokens: chunk.promptTokens,
              completionTokens: chunk.completionTokens,
              latency,
              ok: true,
              error: null,
              fellBack: index > 0,
              requestId,
              credits: charge,
              capability,
            });

            controller.enqueue(
              frame("done", {
                provider: provider.name,
                model: provider.defaultModel,
                promptTokens: chunk.promptTokens,
                completionTokens: chunk.completionTokens,
                latencyMs: latency,
                // So the balance in the header can move without a page reload.
                credits: charge,
                balance: await currentBalance(supabase),
              }),
            );
          }

          controller.close();
          return;
        } catch (error) {
          // The client going away is not a provider failure — stop quietly
          // rather than burning the rest of the chain on an abandoned request.
          if (request.signal.aborted) {
            // Nothing was delivered, so nothing is owed.
            await hold.refund("The request was cancelled");
            controller.close();
            return;
          }

          lastError =
            error instanceof ProviderError
              ? `${error.provider} ${error.status}: ${error.message}`
              : error instanceof Error
                ? error.message
                : "unknown error";

          lastProvider = provider.name;
          lastStatus =
            error instanceof ProviderError
              ? error.status
              : // A fetch that never got a status — DNS, TLS, or the timeout.
                0;

          await recordUsage(supabase, {
            userId: user.id,
            conversationId,
            agent: agent.name,
            provider: provider.name,
            model: provider.defaultModel,
            promptTokens: 0,
            completionTokens: 0,
            latency: Date.now() - startedAt,
            ok: false,
            error: lastError,
            fellBack: index > 0,
            requestId,
            credits: 0,
            capability,
          });

          // Anything already streamed came from a provider that then failed
          // mid-answer; restarting would duplicate text, so stop here.
          if (answer.length > 0) {
            // A truncated answer is not an answer. The member is told to
            // regenerate, and regenerating should not be the second thing they
            // pay for.
            await hold.refund("The answer was cut short");
            controller.enqueue(
              frame("error", {
                message: "The response was cut short. Try regenerating.",
              }),
            );
            controller.close();
            return;
          }

          // A request every provider will reject the same way is not worth
          // asking five of them. The member waits five timeouts for the same
          // answer, and the usage log fills with rows that all say 400.
          if (!worthFallingBack(lastStatus)) break;
        }
      }

      // Every provider failed, so nothing was produced and nothing is charged.
      await hold.refund("Every provider failed");

      // The technical detail goes to the server log, where the owner can read
      // it. What reaches the browser is a sentence about what to do next —
      // `lastError` is a provider's raw response body, and those have been
      // known to echo the request back, key header included.
      console.error(
        `[medosha-ai] every provider failed for request ${requestId}: ${lastError ?? "unknown"}`,
      );

      controller.enqueue(
        frame("error", { message: friendlyProviderMessage(lastStatus, lastProvider) }),
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

type UsageRecord = {
  userId: string;
  conversationId: string | null;
  agent: AiAgentName;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latency: number;
  ok: boolean;
  error: string | null;
  fellBack: boolean;
  /** Ties the attempts of one request together, and to the reservation. */
  requestId: string;
  /** What this attempt cost. Zero for a failure — those are refunded. */
  credits: number;
  /** Which capability the router read the request as, for finding it wrong. */
  capability: string | null;
};

/** Usage accounting must never break a working answer, so failures are swallowed. */
async function recordUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  record: UsageRecord,
): Promise<void> {
  await supabase.from("ai_usage_logs").insert({
    user_id: record.userId,
    conversation_id: record.conversationId,
    agent: record.agent,
    provider: record.provider,
    model: record.model,
    prompt_tokens: record.promptTokens,
    completion_tokens: record.completionTokens,
    latency_ms: record.latency,
    ok: record.ok,
    error: record.error,
    fell_back: record.fellBack,
    request_id: record.requestId,
    credits: record.credits,
    capability: record.capability,
  });
}
