import type { ImageProviderName } from "@/lib/ai/image-models";

/**
 * What is wrong with a provider, in words that name the fix.
 *
 * "Failed" is not a diagnosis. A missing key, a rejected key and an exhausted
 * quota are three different problems with three different remedies, and the
 * person reading the screen is usually the person who can fix it — so the
 * status they see has to be specific enough to act on.
 *
 * Client-safe on purpose: the studio, the provider manager and the diagnostics
 * page all render these, and none of them may import the server-only module
 * that produces them.
 */

export type ProviderStatus =
  /** Key present, endpoint answered, credentials accepted. */
  | "connected"
  /** The environment variable is not set at all. */
  | "missing_key"
  /** A key is set and the provider rejected it. */
  | "invalid_key"
  /** Authenticated, but not entitled to this model or endpoint. */
  | "no_access"
  /** Out of credit, or past a hard monthly allowance. */
  | "quota_exceeded"
  /** Too many requests for now. Recovers on its own. */
  | "rate_limited"
  /** The model is gone, renamed, or not deployed. */
  | "model_unavailable"
  /** DNS, TLS, timeout, or the host never answered. */
  | "network_error"
  /** Reached, authenticated, and broken at their end. */
  | "provider_down"
  /** Not probed yet. */
  | "unchecked";

export const PROVIDER_STATUS: Record<
  ProviderStatus,
  {
    label: string;
    /** ✓ or ✗, as the brief asks for. */
    mark: "ok" | "fail" | "warn" | "idle";
    /** What to do about it, when there is something to do. */
    fix: string | null;
  }
> = {
  connected: { label: "Connected", mark: "ok", fix: null },
  missing_key: {
    label: "Missing API Key",
    mark: "fail",
    fix: "Set the environment variable in .env.local and restart.",
  },
  invalid_key: {
    label: "Invalid API Key",
    mark: "fail",
    fix: "The key was rejected. Copy it again from the provider's dashboard — keys are often truncated on paste.",
  },
  no_access: {
    label: "No Access",
    mark: "fail",
    fix: "The key works but the account is not entitled to this model. Some providers gate image models behind a verified or paid account.",
  },
  quota_exceeded: {
    label: "Quota Exceeded",
    mark: "fail",
    fix: "The account is out of credit or past its allowance. Top it up, or use a provider with a free tier.",
  },
  rate_limited: {
    label: "Rate Limited",
    mark: "warn",
    fix: "Too many requests just now. This clears by itself — the chain will use it again once it does.",
  },
  model_unavailable: {
    label: "Model Unavailable",
    mark: "warn",
    fix: "The provider does not recognise that model. It may have been renamed or retired.",
  },
  network_error: {
    label: "Network Error",
    mark: "fail",
    fix: "The host could not be reached. Check the server's outbound network, or the URL if this is a self-hosted provider.",
  },
  provider_down: {
    label: "Provider Unavailable",
    mark: "warn",
    fix: "The provider is having problems at their end. Nothing to fix here; the chain will route around it.",
  },
  unchecked: { label: "Not checked yet", mark: "idle", fix: null },
};

/**
 * Whether the chain may try this provider.
 *
 * Rate limits and outages are deliberately *not* usable: a provider that just
 * said "too many requests" will say it again, and spending the user's wait on
 * a known-no is worse than starting at the next one. They recover on the next
 * validation pass, which is why this is a status and not a permanent verdict.
 */
export function isUsable(status: ProviderStatus): boolean {
  return status === "connected";
}

/** Whether a fresh probe could plausibly change the answer. */
export function isTransient(status: ProviderStatus): boolean {
  return (
    status === "rate_limited" ||
    status === "provider_down" ||
    status === "network_error"
  );
}

/** Problems the operator has to fix; nothing retries its way out of these. */
/**
 * What a member reads when a generation fails.
 *
 * Separate from `reasonFor`, which is written for whoever administers the
 * deployment and names environment variables and providers. A member cannot
 * set XAI_API_KEY, has never heard of xAI, and reading "xAI did not accept its
 * API key" learns only that something they cannot fix is broken — which was the
 * reported complaint, and it was a fair one.
 *
 * So these sentences say what it means for *them*: whether to wait, whether to
 * try a different picture, or whether to tell somebody. The provider is never
 * named, because naming it invites them to go and debug it.
 */
export function memberMessageFor(status: ProviderStatus): string {
  switch (status) {
    case "missing_key":
    case "invalid_key":
    case "no_access":
      return "Medosha AI is not configured. Please contact the administrator.";
    case "quota_exceeded":
      return "Medosha AI is temporarily unavailable because the AI credit balance is insufficient.";
    case "rate_limited":
      return "Medosha AI is busy right now. Please try again in a moment.";
    case "network_error":
    case "provider_down":
    case "model_unavailable":
    case "unchecked":
    case "connected":
      return "Medosha AI could not generate the image. Please try again.";
  }
}

export function needsOperator(status: ProviderStatus): boolean {
  return (
    status === "missing_key" ||
    status === "invalid_key" ||
    status === "no_access" ||
    status === "quota_exceeded"
  );
}

export type ProviderHealth = {
  provider: ImageProviderName;
  status: ProviderStatus;
  /** One sentence, already fit to show a user. Never a raw API error. */
  reason: string | null;
  /** When this status was established. */
  checkedAt: number | null;
  /** How long the probe took. */
  ms: number | null;
  /** Models the provider itself says it has, when it will tell us. */
  models: string[] | null;
  /** Whatever the provider discloses about remaining allowance. */
  quota: { label: string; value: string } | null;
  lastSuccessAt: number | null;
  lastSuccessModel: string | null;
  lastErrorAt: number | null;
  lastError: string | null;
  /** Which environment variables this provider reads. */
  keyVars: string[];
  /** Whether every one of them is present. Never says what they contain. */
  keyPresent: boolean;
};

// ---------------------------------------------------------------------------
// The progress log
// ---------------------------------------------------------------------------

/**
 * One line of the generation log.
 *
 * The queue shows these as they arrive, so a fallback is something the user
 * watches happen rather than something they deduce afterwards from a changed
 * model name.
 */
export type ProgressLine = {
  kind: "check" | "ok" | "info" | "warn" | "fail" | "success";
  text: string;
  at: number;
};

export type ProgressEvent =
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
      model: string;
      index: number;
    }
  | {
      type: "failed";
      provider: ImageProviderName;
      label: string;
      reason: string;
    }
  | { type: "switch"; provider: ImageProviderName; label: string }
  | {
      type: "result";
      images: { url: string; width?: number; height?: number }[];
      model: { id: string; label: string; provider: string };
      attempts: { provider: string; ok: boolean; reason?: string }[];
      costEstimate: number;
      totalMs: number;
      /** Credits actually charged, and the balance left, for the header. */
      credits?: number;
      balance?: number | null;
    }
  | {
      type: "error";
      error: string;
      needsConfiguration?: boolean;
      /** Providers the operator has to deal with, for the "what to fix" list. */
      blocked?: { provider: ImageProviderName; label: string; status: ProviderStatus; keyVars: string[] }[];
      attempts?: { provider: string; ok: boolean; reason?: string }[];
    };
