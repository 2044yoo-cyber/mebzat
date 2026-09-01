import "server-only";

import {
  IMAGE_PROVIDERS,
  modelsByProvider,
  type ImageProviderName,
} from "@/lib/ai/image-models";
import {
  isTransient,
  isUsable,
  type ProviderHealth,
  type ProviderStatus,
} from "@/lib/ai/provider-status";

/**
 * Which providers actually work, established by asking them.
 *
 * The studio used to treat "the environment variable is set" as "the provider
 * works". Those are different facts, and the gap between them is exactly the
 * failure the user hit: a chain built from present-but-rejected keys spends
 * the user's wait discovering, one request at a time, that none of them can
 * answer — and then reports it as if the prompt were at fault.
 *
 * So keys are validated once at startup and cached with a TTL, generation is
 * built only from providers that passed, and every outcome — success or
 * failure — is written back here. That last part is what makes the diagnostics
 * page worth opening: it reports what happened, not what was configured.
 *
 * Nothing in this module returns, logs, or derives anything from the content
 * of a key. Presence is the only fact about a key that ever leaves it.
 */

/** How long a good result stands before it is worth asking again. */
const OK_TTL_MS = 10 * 60 * 1000;
/** Bad results expire sooner: a rate limit or an outage is usually brief. */
const BAD_TTL_MS = 60 * 1000;
/** A missing or rejected key will not fix itself; do not hammer the provider. */
const OPERATOR_TTL_MS = 5 * 60 * 1000;

const PROBE_TIMEOUT_MS = 12_000;

const ALL: ImageProviderName[] = Object.keys(
  IMAGE_PROVIDERS,
) as ImageProviderName[];

// ---------------------------------------------------------------------------
// Key presence
// ---------------------------------------------------------------------------

/**
 * Every environment variable a provider needs.
 *
 * Cloudflare needs two, and ComfyUI needs a URL rather than a secret. Treating
 * that as a list rather than a single name is what lets the UI say "set
 * CLOUDFLARE_ACCOUNT_ID" instead of reporting the token as broken.
 */
export function keyVarsFor(provider: ImageProviderName): string[] {
  if (provider === "cloudflare") {
    return ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
  }
  return [IMAGE_PROVIDERS[provider].keyVar];
}

function missingVars(provider: ImageProviderName): string[] {
  return keyVarsFor(provider).filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });
}

export function hasKeys(provider: ImageProviderName): boolean {
  return missingVars(provider).length === 0;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * An HTTP status and a response body, turned into a diagnosis.
 *
 * The status code alone is not enough. Providers overload 403 for "bad key"
 * and "your account cannot use this model", and overload 429 for "slow down"
 * and "you are out of credit for the month" — which need opposite responses,
 * one being worth retrying and the other not. The body is where they say
 * which, so it is read, matched, and then discarded.
 */
export function classifyResponse(
  status: number,
  body: string,
): ProviderStatus {
  const text = body.toLowerCase();

  const mentionsQuota =
    text.includes("quota") ||
    text.includes("insufficient") ||
    text.includes("billing") ||
    text.includes("credit") ||
    text.includes("payment required") ||
    text.includes("exceeded your current") ||
    text.includes("out of funds") ||
    text.includes("spending limit");

  const mentionsAccess =
    text.includes("not authorized") ||
    text.includes("unauthorized for") ||
    text.includes("does not have access") ||
    text.includes("no access") ||
    text.includes("not entitled") ||
    text.includes("must be verified") ||
    text.includes("permission");

  if (status === 401) return "invalid_key";

  if (status === 403) {
    // A working key without entitlement is a different fix from a bad key.
    if (mentionsQuota) return "quota_exceeded";
    if (mentionsAccess) return "no_access";
    return "invalid_key";
  }

  if (status === 402) return "quota_exceeded";

  if (status === 429) {
    return mentionsQuota ? "quota_exceeded" : "rate_limited";
  }

  if (status === 404) return "model_unavailable";

  if (status === 408 || status === 504) return "network_error";

  if (status >= 500) return "provider_down";

  if (status >= 400) {
    if (mentionsQuota) return "quota_exceeded";
    if (mentionsAccess) return "no_access";
    return "provider_down";
  }

  return "connected";
}

/** A thrown fetch error, turned into a diagnosis. */
export function classifyThrow(error: unknown): ProviderStatus {
  const name = (error as { name?: string })?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError") return "network_error";
  return "network_error";
}

/**
 * The sentence shown for a status.
 *
 * Written per provider so it names the thing the reader has to go and change.
 * The provider's own words never appear: they leak endpoint paths, account
 * ids, and occasionally the key itself.
 */
export function reasonFor(
  provider: ImageProviderName,
  status: ProviderStatus,
): string {
  const label = IMAGE_PROVIDERS[provider].label;
  const missing = missingVars(provider);

  switch (status) {
    case "connected":
      return `${label} is connected.`;
    case "missing_key":
      return missing.length > 1
        ? `${label} needs ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}.`
        : `${missing[0] ?? IMAGE_PROVIDERS[provider].keyVar} is not set.`;
    case "invalid_key":
      return `${label} did not accept its API key.`;
    case "no_access":
      return `${label} accepted the key but the account cannot use this model.`;
    case "quota_exceeded":
      return `${label} reports the account is out of credit or past its quota.`;
    case "rate_limited":
      return `${label} is rate limited right now.`;
    case "model_unavailable":
      return `${label} does not recognise that model.`;
    case "network_error":
      return provider === "comfyui"
        ? "Could not reach the ComfyUI URL. Is the instance running?"
        : `${label} could not be reached.`;
    case "provider_down":
      return `${label} is temporarily unavailable.`;
    case "unchecked":
      return `${label} has not been checked yet.`;
  }
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

type Probe = {
  url: () => string;
  headers?: () => Record<string, string>;
  /** Statuses that mean "authenticated", even though they are not 2xx. */
  okStatuses?: number[];
  /** Pulls the model list out of a successful body, when there is one. */
  models?: (body: unknown) => string[] | null;
  /** Pulls whatever the provider says about remaining allowance. */
  quota?: (
    body: unknown,
    headers: Headers,
  ) => { label: string; value: string } | null;
};

function bearer(name: string): () => Record<string, string> {
  return () => ({ authorization: `Bearer ${process.env[name] ?? ""}` });
}

/** Reads a rate-limit budget out of response headers, when one is published. */
function headerQuota(headers: Headers): { label: string; value: string } | null {
  const remaining =
    headers.get("x-ratelimit-remaining-requests") ??
    headers.get("x-ratelimit-remaining") ??
    headers.get("ratelimit-remaining");
  if (!remaining) return null;
  const limit =
    headers.get("x-ratelimit-limit-requests") ??
    headers.get("x-ratelimit-limit") ??
    headers.get("ratelimit-limit");
  return {
    label: "Requests remaining",
    value: limit ? `${remaining} of ${limit}` : remaining,
  };
}

const PROBES: Record<ImageProviderName, Probe> = {
  xai: {
    url: () => "https://api.x.ai/v1/models",
    headers: bearer("XAI_API_KEY"),
    models: (body) => {
      const data = (body as { data?: { id?: string }[] })?.data;
      if (!Array.isArray(data)) return null;
      return data
        .map((entry) => entry.id ?? "")
        .filter((id) => id.includes("image"))
        .slice(0, 12);
    },
    quota: (_body, headers) => headerQuota(headers),
  },

  openai: {
    url: () => "https://api.openai.com/v1/models",
    headers: bearer("OPENAI_API_KEY"),
    models: (body) => {
      const data = (body as { data?: { id?: string }[] })?.data;
      if (!Array.isArray(data)) return null;
      return data
        .map((entry) => entry.id ?? "")
        .filter((id) => id.includes("image") || id.startsWith("dall-e"))
        .slice(0, 12);
    },
    quota: (_body, headers) => headerQuota(headers),
  },

  replicate: {
    url: () => "https://api.replicate.com/v1/account",
    headers: bearer("REPLICATE_API_TOKEN"),
    quota: (_body, headers) => headerQuota(headers),
  },

  huggingface: {
    url: () => "https://huggingface.co/api/whoami-v2",
    headers: bearer("HUGGINGFACE_API_KEY"),
    quota: (body) => {
      // Hugging Face reports the monthly inference allowance on the account.
      const auth = (
        body as {
          auth?: { accessToken?: { role?: string } };
          periodEnd?: string;
        }
      )?.auth;
      const role = auth?.accessToken?.role;
      return role ? { label: "Token scope", value: role } : null;
    },
  },

  together: {
    url: () => "https://api.together.xyz/v1/models",
    headers: bearer("TOGETHER_API_KEY"),
    models: (body) => {
      if (!Array.isArray(body)) return null;
      return (body as { id?: string; type?: string }[])
        .filter((entry) => entry.type === "image")
        .map((entry) => entry.id ?? "")
        .filter(Boolean)
        .slice(0, 12);
    },
    quota: (_body, headers) => headerQuota(headers),
  },

  stability: {
    url: () => "https://api.stability.ai/v1/user/account",
    headers: bearer("STABILITY_API_KEY"),
  },

  gemini: {
    url: () =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY ?? ""}`,
    models: (body) => {
      const models = (body as { models?: { name?: string }[] })?.models;
      if (!Array.isArray(models)) return null;
      return models
        .map((entry) => (entry.name ?? "").replace(/^models\//, ""))
        .filter((name) => name.includes("imagen") || name.includes("image"))
        .slice(0, 12);
    },
  },

  cloudflare: {
    url: () =>
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID ?? ""}/ai/models/search?per_page=50&task=Text-to-Image`,
    headers: bearer("CLOUDFLARE_API_TOKEN"),
    models: (body) => {
      const result = (body as { result?: { name?: string }[] })?.result;
      if (!Array.isArray(result)) return null;
      return result
        .map((entry) => entry.name ?? "")
        .filter(Boolean)
        .slice(0, 12);
    },
  },

  comfyui: {
    url: () =>
      `${(process.env.COMFYUI_URL ?? "").replace(/\/$/, "")}/system_stats`,
    quota: (body) => {
      const devices = (
        body as { devices?: { vram_free?: number; vram_total?: number }[] }
      )?.devices;
      const device = devices?.[0];
      if (!device?.vram_total) return null;
      const free = Math.round((device.vram_free ?? 0) / 1024 / 1024 / 1024);
      const total = Math.round(device.vram_total / 1024 / 1024 / 1024);
      return { label: "VRAM free", value: `${free} of ${total} GB` };
    },
  },

  fal: {
    // fal.ai publishes no account endpoint, so this asks the queue about a
    // request id that cannot exist. 401/403 means the key was rejected;
    // anything else means it was accepted and the id simply is not there.
    url: () =>
      "https://queue.fal.run/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status",
    headers: () => ({ authorization: `Key ${process.env.FAL_KEY ?? ""}` }),
    okStatuses: [400, 404, 422],
    quota: (_body, headers) => headerQuota(headers),
  },
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

function blank(provider: ImageProviderName): ProviderHealth {
  return {
    provider,
    status: "unchecked",
    reason: null,
    checkedAt: null,
    ms: null,
    models: null,
    quota: null,
    lastSuccessAt: null,
    lastSuccessModel: null,
    lastErrorAt: null,
    lastError: null,
    keyVars: keyVarsFor(provider),
    keyPresent: hasKeys(provider),
  };
}

const registry = new Map<ImageProviderName, ProviderHealth>();

/** Probes in flight, so ten concurrent callers make one request each. */
const inFlight = new Map<ImageProviderName, Promise<ProviderHealth>>();

function current(provider: ImageProviderName): ProviderHealth {
  const existing = registry.get(provider);
  if (existing) return { ...existing, keyPresent: hasKeys(provider) };
  const fresh = blank(provider);
  registry.set(provider, fresh);
  return fresh;
}

function ttlFor(status: ProviderStatus): number {
  if (isUsable(status)) return OK_TTL_MS;
  if (
    status === "missing_key" ||
    status === "invalid_key" ||
    status === "quota_exceeded" ||
    status === "no_access"
  ) {
    return OPERATOR_TTL_MS;
  }
  return BAD_TTL_MS;
}

function isFresh(health: ProviderHealth): boolean {
  if (health.status === "unchecked" || health.checkedAt === null) return false;
  return Date.now() - health.checkedAt < ttlFor(health.status);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

async function probe(provider: ImageProviderName): Promise<ProviderHealth> {
  const before = current(provider);
  const startedAt = Date.now();

  const missing = missingVars(provider);
  if (missing.length > 0) {
    return {
      ...before,
      status: "missing_key",
      reason: reasonFor(provider, "missing_key"),
      checkedAt: Date.now(),
      ms: 0,
      keyPresent: false,
    };
  }

  const spec = PROBES[provider];

  try {
    const response = await fetch(spec.url(), {
      headers: spec.headers?.() ?? {},
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });

    const ms = Date.now() - startedAt;
    const accepted =
      response.ok || (spec.okStatuses?.includes(response.status) ?? false);

    if (!accepted) {
      // Read the body only to classify it. It is never returned or logged
      // verbatim towards the browser.
      const body = await response.text().catch(() => "");
      const status = classifyResponse(response.status, body);
      const reason = reasonFor(provider, status);

      console.error(
        `[medosha-ai:health] ${provider} probe ${response.status} -> ${status}`,
      );

      return {
        ...before,
        status,
        reason,
        checkedAt: Date.now(),
        ms,
        keyPresent: true,
        lastErrorAt: Date.now(),
        lastError: reason,
      };
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A probe that answers with something other than JSON still proves the
      // credentials work, which is the only thing being asked.
    }

    return {
      ...before,
      status: "connected",
      reason: null,
      checkedAt: Date.now(),
      ms,
      keyPresent: true,
      models: spec.models?.(body) ?? before.models,
      quota: spec.quota?.(body, response.headers) ?? null,
    };
  } catch (error) {
    const status = classifyThrow(error);
    const reason = reasonFor(provider, status);
    console.error(`[medosha-ai:health] ${provider} probe threw:`, error);
    return {
      ...before,
      status,
      reason,
      checkedAt: Date.now(),
      ms: Date.now() - startedAt,
      keyPresent: true,
      lastErrorAt: Date.now(),
      lastError: reason,
    };
  }
}

/**
 * The current health of one provider, probing only if the cache is stale.
 *
 * Concurrent callers share one probe: four queued jobs starting together must
 * not each ask fal.ai whether its key works.
 */
export async function validateProvider(
  provider: ImageProviderName,
  options: { force?: boolean } = {},
): Promise<ProviderHealth> {
  if (!options.force && isFresh(current(provider))) {
    return current(provider);
  }

  const existing = inFlight.get(provider);
  if (existing) return existing;

  const running = probe(provider)
    .then((health) => {
      registry.set(provider, health);
      return health;
    })
    .finally(() => {
      inFlight.delete(provider);
    });

  inFlight.set(provider, running);
  return running;
}

/** Every provider's health, probed in parallel. */
export async function validateAll(
  options: { force?: boolean } = {},
): Promise<ProviderHealth[]> {
  return Promise.all(
    ALL.map((provider) => validateProvider(provider, options)),
  );
}

/** The registry as it stands, without probing anything. */
export function healthSnapshot(): ProviderHealth[] {
  return ALL.map(current);
}

/**
 * Providers a generation may actually use.
 *
 * The whole point of the change: the chain is built from providers that have
 * answered a probe, not from providers whose environment variable happens to
 * be set.
 */
export async function usableProviders(): Promise<ImageProviderName[]> {
  const health = await validateAll();
  const connected = health
    .filter((entry) => isUsable(entry.status))
    .map((entry) => entry.provider);

  if (connected.length > 0) return connected;

  // Nothing passed. Before refusing outright, reconsider the providers whose
  // failure was transient — a probe hitting a status endpoint that is blocked,
  // rate limited or briefly down is not proof the generation endpoint will
  // fail, and refusing on that evidence would strand a deployment whose keys
  // are perfectly good. A rejected key or an empty account is different: those
  // are answers about the account, and no amount of trying changes them.
  const worthTrying = health
    .filter((entry) => entry.keyPresent && isTransient(entry.status))
    .map((entry) => entry.provider);

  if (worthTrying.length > 0) {
    console.warn(
      `[medosha-ai:health] no provider passed validation; trying ${worthTrying.join(", ")} anyway (transient failures).`,
    );
  }

  return worthTrying;
}

/**
 * Providers that are configured but not working — the "what to fix" list.
 *
 * Ordered so the cheapest fix comes first: a key that was never set is a
 * smaller job than an account that needs a payment method.
 */
export function blockedProviders(): ProviderHealth[] {
  const rank: Record<string, number> = {
    missing_key: 0,
    invalid_key: 1,
    no_access: 2,
    quota_exceeded: 3,
    rate_limited: 4,
    provider_down: 5,
    network_error: 6,
    model_unavailable: 7,
  };
  return healthSnapshot()
    .filter((entry) => !isUsable(entry.status) && entry.status !== "unchecked")
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
}

// ---------------------------------------------------------------------------
// Outcomes
//
// Written by the generation path. A probe says a key is accepted; only a real
// request says the provider can actually produce an image, which is why the
// diagnostics page reports both.
// ---------------------------------------------------------------------------

export function recordSuccess(
  provider: ImageProviderName,
  model: string,
): void {
  const health = current(provider);
  registry.set(provider, {
    ...health,
    // A working generation is stronger evidence than any probe.
    status: "connected",
    reason: null,
    checkedAt: Date.now(),
    lastSuccessAt: Date.now(),
    lastSuccessModel: model,
  });
}

export function recordFailure(
  provider: ImageProviderName,
  status: ProviderStatus,
  reason: string,
): void {
  const health = current(provider);
  registry.set(provider, {
    ...health,
    // A real request failing supersedes a probe that passed: the probe only
    // ever proved the credentials, not the entitlement to generate.
    status,
    reason,
    checkedAt: Date.now(),
    lastErrorAt: Date.now(),
    lastError: reason,
  });
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

/**
 * What to tell someone when nothing can generate.
 *
 * Names the variables and says which providers are free, because "no provider
 * is available" sends a person to the logs and this sends them to the fix.
 */
export function configurationHelp(): string {
  const blocked = blockedProviders();

  const free = (["fal", "together", "cloudflare", "huggingface"] as const).filter(
    (provider) => {
      const health = current(provider);
      return health.status === "missing_key" || health.status === "unchecked";
    },
  );

  if (blocked.length === 0) {
    return "No image provider is configured. Set FAL_KEY, TOGETHER_API_KEY or HUGGINGFACE_API_KEY in .env.local and restart — all three have a free tier.";
  }

  const worst = blocked[0];
  if (!worst) return "No image provider is working, and none reported why.";
  const lead = `${IMAGE_PROVIDERS[worst.provider].label}: ${worst.reason ?? reasonFor(worst.provider, worst.status)}`;

  if (free.length > 0) {
    const names = free
      .map((provider) => IMAGE_PROVIDERS[provider].keyVar)
      .join(" or ");
    return `${lead} You can also set ${names} in .env.local — those have a free tier.`;
  }

  return lead;
}

/** Models the catalogue believes a provider offers, for diagnostics. */
export function catalogueModels(provider: ImageProviderName): string[] {
  return modelsByProvider(provider).map((model) => model.label);
}
