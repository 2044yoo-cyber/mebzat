import "server-only";

import {
  IMAGE_PROVIDERS,
  type ImageModel,
  type ImageProviderName,
} from "@/lib/ai/image-models";
import {
  classifyResponse,
  classifyThrow,
  reasonFor,
  recordFailure,
  recordSuccess,
  validateProvider,
} from "@/lib/ai/provider-health";
import {
  isUsable,
  memberMessageFor,
  needsOperator,
  type ProviderStatus,
} from "@/lib/ai/provider-status";
import {
  ImageProviderError,
  generateImages,
  type GeneratedImage,
  type ImageRequest,
} from "@/lib/ai/image-provider";

/**
 * Walking the fallback chain.
 *
 * A provider failing is normal — free tiers rate-limit, hosted models sleep,
 * and every one of them has bad minutes. The user's prompt is the expensive
 * thing here, not the request, so a failure moves to the next model rather
 * than coming back empty and asking them to try again.
 *
 * Two things decide whether the walk continues. Some failures follow the
 * *request*: a safety refusal or a malformed prompt will be refused by every
 * provider, so trying five more wastes the user's time and, on a paid
 * provider, their money. Others follow the *provider*: a rejected key or an
 * exhausted quota means skip it and keep going, and — because the chain now
 * knows the difference — mark it so the next job does not try it at all.
 */

export type AttemptRecord = {
  model: string;
  provider: ImageProviderName;
  ok: boolean;
  ms: number;
  /** The reason, already made fit to read. Absent when it succeeded. */
  reason?: string;
  /** The diagnosis behind the reason. Absent when it succeeded. */
  status?: ProviderStatus;
};

export type ChainResult = {
  images: GeneratedImage[];
  model: ImageModel;
  attempts: AttemptRecord[];
  totalMs: number;
};

export class ChainExhaustedError extends Error {
  constructor(
    readonly attempts: AttemptRecord[],
    message: string,
    /** True when the prompt itself was refused, so retrying is pointless. */
    readonly terminal = false,
  ) {
    super(message);
    this.name = "ChainExhaustedError";
  }
}

/**
 * Failures that mean "this will not work anywhere else either".
 *
 * A safety refusal or a malformed prompt belongs to the request, not the
 * provider, so walking on would fail the same way five more times.
 */
function isTerminal(error: unknown): boolean {
  if (!(error instanceof ImageProviderError)) return false;
  const message = error.message.toLowerCase();
  const refused =
    message.includes("safety") ||
    message.includes("content policy") ||
    message.includes("nsfw") ||
    message.includes("flagged") ||
    message.includes("moderation");

  if (refused) return true;

  // 400 and 422 usually mean the request was malformed for that provider —
  // but only counts as terminal when the provider says it was about the
  // prompt. A model-specific parameter complaint is not the user's fault and
  // the next provider may well accept it.
  if (error.status === 400 || error.status === 422) {
    return (
      message.includes("prompt") ||
      message.includes("invalid_request") ||
      message.includes("input")
    );
  }

  return false;
}

/** What kind of failure this was, in the shared vocabulary. */
export function diagnose(error: unknown): ProviderStatus {
  if (!(error instanceof ImageProviderError)) return classifyThrow(error);
  return classifyResponse(error.status, error.message);
}

/**
 * A provider's raw error, rewritten for a person.
 *
 * The brief asked never to show a raw API error, and this is where that is
 * enforced: the original goes to the server log, and the caller only ever
 * sees a sentence written here.
 */
export function humanReason(error: unknown): string {
  if (!(error instanceof ImageProviderError)) {
    if ((error as { name?: string })?.name === "TimeoutError") {
      return "The provider took too long to answer.";
    }
    return "Something went wrong on the way to the provider.";
  }

  if (isTerminal(error)) {
    return "The prompt was refused. Try describing it differently.";
  }

  return reasonFor(error.provider, diagnose(error));
}

/** What the chain is about to do, so a caller can narrate it live. */
export type ChainEvent =
  | { type: "check"; provider: ImageProviderName; label: string }
  | {
      type: "checked";
      provider: ImageProviderName;
      label: string;
      status: ProviderStatus;
      reason?: string;
    }
  | {
      type: "attempt";
      provider: ImageProviderName;
      label: string;
      model: ImageModel;
      index: number;
    }
  | {
      type: "failed";
      provider: ImageProviderName;
      label: string;
      reason: string;
      status: ProviderStatus;
    }
  | { type: "switch"; provider: ImageProviderName; label: string };

/**
 * Tries each model in turn and returns the first that produces an image.
 *
 * Before each provider's first use it confirms the provider is actually
 * healthy, which is the difference between "tried two providers and none
 * could answer" and never having spent a request on a key that was already
 * known to be rejected. Cached health makes that check free in the common
 * case; only a stale entry costs a round trip.
 *
 * `onEvent` fires as the walk happens rather than at the end, so the queue can
 * show the check, the attempt and the switch while the user waits.
 */
export async function generateWithFallback(
  chain: ImageModel[],
  request: Omit<ImageRequest, "model">,
  onEvent?: (event: ChainEvent) => void,
): Promise<ChainResult> {
  if (chain.length === 0) {
    throw new ChainExhaustedError(
      [],
      "Medosha AI is not configured. Please contact the administrator.",
    );
  }

  const attempts: AttemptRecord[] = [];
  const startedAt = Date.now();
  /** Providers already validated on this walk. */
  const checked = new Set<ImageProviderName>();
  let attempted = 0;

  for (const [index, model] of chain.entries()) {
    if (request.signal?.aborted) break;

    const provider = model.provider;
    const label = IMAGE_PROVIDERS[provider].label;

    // ---- Validate before spending a request on it -----------------------
    if (!checked.has(provider)) {
      checked.add(provider);
      onEvent?.({ type: "check", provider, label });

      const health = await validateProvider(provider);
      onEvent?.({
        type: "checked",
        provider,
        label,
        status: health.status,
        reason: health.reason ?? undefined,
      });

      // Skipped only when the failure is an answer about the account —
      // a rejected key, an empty balance, an entitlement the account does not
      // have. Those do not change by being asked again, and spending the
      // user's wait on them is exactly the bug being fixed here.
      //
      // A transient failure is different: the probe hits a status endpoint,
      // the generation hits another, and one being briefly unreachable is not
      // evidence about the other. Those are tried, and the log says so.
      if (!isUsable(health.status) && needsOperator(health.status)) {
        const reason = health.reason ?? reasonFor(provider, health.status);
        attempts.push({
          model: model.id,
          provider,
          ok: false,
          ms: 0,
          reason,
          status: health.status,
        });
        onEvent?.({
          type: "failed",
          provider,
          label,
          reason,
          status: health.status,
        });
        continue;
      }
    } else if (
      // A provider that already failed on this walk is not asked twice, even
      // though it may own several models in the chain.
      attempts.some(
        (attempt) => attempt.provider === provider && !attempt.ok && attempt.status && needsOperator(attempt.status),
      )
    ) {
      continue;
    }

    if (attempted > 0) {
      onEvent?.({ type: "switch", provider, label });
    }

    onEvent?.({ type: "attempt", provider, label, model, index });
    attempted += 1;
    const attemptStarted = Date.now();

    try {
      const images = await generateImages({ ...request, model });

      attempts.push({
        model: model.id,
        provider,
        ok: true,
        ms: Date.now() - attemptStarted,
      });
      recordSuccess(provider, model.label);

      return { images, model, attempts, totalMs: Date.now() - startedAt };
    } catch (error) {
      // The user cancelled. Stop, and do not record it as a provider failure.
      if (request.signal?.aborted) break;

      const status = diagnose(error);
      const reason = humanReason(error);
      const terminal = isTerminal(error);

      attempts.push({
        model: model.id,
        provider,
        ok: false,
        ms: Date.now() - attemptStarted,
        reason,
        status,
      });

      // A real request failing is better evidence than a probe passing, so it
      // updates the registry — the next job skips this provider rather than
      // rediscovering the same rejected key.
      if (!terminal) recordFailure(provider, status, reason);

      // The raw text stays here, where an operator can read it, and goes no
      // further towards the browser.
      console.error(
        `[medosha-ai:image] ${provider}/${model.id} failed (${status}):`,
        error instanceof Error ? error.message : error,
      );

      onEvent?.({ type: "failed", provider, label, reason, status });

      if (terminal) throw new ChainExhaustedError(attempts, reason, true);
    }
  }

  throw new ChainExhaustedError(attempts, summarise(attempts));
}

/**
 * The sentence shown when every provider is exhausted.
 *
 * Leads with the reason rather than the count. "Tried 2 providers and none
 * could answer" tells the reader nothing they can act on; naming the rejected
 * key tells them exactly what to go and change.
 */
/**
 * The one sentence the member sees.
 *
 * Written from the *status*, not from the provider's reason. The reasons are
 * still on every attempt — the diagnostics panel and the logs read them, and
 * they name the provider and the variable — but the thing rendered in the chat
 * says what it means for the person who typed the prompt.
 *
 * "Failed: xAI did not accept its API key" was the old behaviour, and it told
 * a member about a variable only an administrator can set.
 */
function summarise(attempts: AttemptRecord[]): string {
  if (attempts.length === 0) {
    return "Medosha AI is not configured. Please contact the administrator.";
  }

  // An operator problem outranks a transient one: if a key is rejected, saying
  // "try again" sends somebody round a loop that cannot end.
  const operator = attempts.find(
    (attempt) => attempt.status && needsOperator(attempt.status),
  );
  if (operator?.status) return memberMessageFor(operator.status);

  const last = [...attempts].reverse().find((attempt) => attempt.status);
  return last?.status
    ? memberMessageFor(last.status)
    : "Medosha AI could not generate the image. Please try again.";
}

/**
 * A cheap round trip that proves a key works, for the provider manager.
 *
 * Deliberately not a generation: testing a connection should cost nothing and
 * take a moment. Delegates to the health registry so the manager, the chain
 * and the diagnostics page all agree about what is working.
 */
export async function testProvider(provider: ImageProviderName) {
  const health = await validateProvider(provider, { force: true });
  return {
    ok: isUsable(health.status),
    status: health.status,
    ms: health.ms ?? 0,
    reason: health.reason,
    models: health.models,
    quota: health.quota,
    testedAt: health.checkedAt ?? Date.now(),
  };
}
