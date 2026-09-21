import "server-only";

/**
 * Everything about xAI that is a setting rather than a request.
 *
 * ## Why this file exists
 *
 * The base URL was written out in `xai-images.ts`, the endpoint again in
 * `provider.ts`, the text model name in both and in `vision.ts`, and the key
 * was read from the environment in four places. That is not a style problem:
 * when the text model was changed in one of them the others kept calling the
 * old one, and the symptom was "Medosha could not reach Grok" with nothing in
 * it to say which model, which endpoint or which key.
 *
 * So: one base URL, one key reader, one name per model, one place that decides
 * what an HTTP status means, and one line of diagnostics. Routes import from
 * here and configure nothing themselves.
 *
 * ## The key never leaves the server
 *
 * `import "server-only"` is what enforces that. Importing this module from a
 * client component is a build error rather than a key in a bundle, and no
 * value here is prefixed `NEXT_PUBLIC_`.
 */

/** Every xAI call goes through here. */
export const XAI_API_BASE = "https://api.x.ai/v1";

/**
 * The reasoning and chat model.
 *
 * One constant rather than a string in each route. `XAI_MODEL` overrides it,
 * because model names move and an operator following a rename should not have
 * to wait for a deploy.
 */
const TEXT_MODEL = "grok-4.6";

/**
 * The model that edits a supplied image.
 *
 * Distinct from the generation model, which cannot take a source image at all.
 * That distinction is the whole of the second bug this file was written for.
 */
const EDIT_MODEL = "grok-imagine-image-2.0";

/**
 * The text-to-image model used when the account's own list cannot be read.
 *
 * `xaiImageModel()` in `xai-images.ts` asks the account first; this is the
 * answer when that lookup fails, so a published name is the floor rather than
 * the assumption.
 */
const FALLBACK_IMAGE_MODEL = "grok-2-image-1212";

export function xaiTextModel(): string {
  return process.env.XAI_MODEL?.trim() || TEXT_MODEL;
}

export function xaiEditModel(): string {
  return process.env.XAI_EDIT_MODEL?.trim() || EDIT_MODEL;
}

export function xaiFallbackImageModel(): string {
  return FALLBACK_IMAGE_MODEL;
}

/** The key, or null. Never logged, never returned to a browser. */
export function xaiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key ? key : null;
}

/** Whether a key is configured at all. Safe to log, safe to show. */
export function hasXaiKey(): boolean {
  return xaiKey() !== null;
}

/**
 * The setup problem, in the words of the thing that needs setting — or null.
 *
 * Checked before a request rather than after a 401, so a deployment that has
 * simply not been configured says so instead of reporting an outage at xAI.
 */
export function xaiConfigurationError(): string | null {
  if (hasXaiKey()) return null;
  return (
    "XAI_API_KEY is not set on the server. Add it to the environment and " +
    "restart, then Medosha AI will reach Grok."
  );
}

/** Absolute URL for an xAI path, so no caller writes the host out again. */
export function xaiEndpoint(path: string): string {
  return `${XAI_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export const XAI_PATHS = {
  /** Text and reasoning. The Responses API, not chat completions. */
  responses: "/responses",
  /** Text to image. Takes no source image. */
  generations: "/images/generations",
  /** Editing a supplied image. Takes one, as JSON. */
  edits: "/images/edits",
  models: "/models",
} as const;

// ---------------------------------------------------------------------------
// What went wrong, told apart
// ---------------------------------------------------------------------------

/**
 * The kinds of failure that need different answers.
 *
 * Told apart because the fix differs and nothing else can tell them apart
 * afterwards: 401 is a key, 403 is an account, 404 is usually a model name
 * that has moved, 429 is quota, 5xx is theirs and a thrown fetch never
 * arrived.
 */
export type XaiFailureKind =
  | "not_configured"
  | "invalid_key"
  | "forbidden"
  | "model_unavailable"
  | "rate_limited"
  | "no_credit"
  | "server_error"
  | "unreachable"
  | "bad_request";

export function classifyXaiStatus(status: number, body = ""): XaiFailureKind {
  const text = body.toLowerCase();

  if (status === 401) return "invalid_key";
  if (status === 403) return "forbidden";
  if (status === 404) return "model_unavailable";
  if (status === 402) return "no_credit";
  if (status === 429) {
    // xAI answers both "too fast" and "out of money" with 429, and the two
    // need opposite actions from whoever reads the log.
    return /credit|balance|quota|billing/.test(text) ? "no_credit" : "rate_limited";
  }
  if (status >= 500) return "server_error";
  return "bad_request";
}

/** One sentence per failure, written here rather than forwarded from xAI. */
export function xaiFailureMessage(kind: XaiFailureKind): string {
  switch (kind) {
    case "not_configured":
      return "Medosha AI is not configured on this server yet.";
    case "invalid_key":
      return "Medosha AI's key was refused. It needs renewing.";
    case "forbidden":
      return "Medosha AI's account does not have access to this model.";
    case "model_unavailable":
      return "That Grok model is not available on this account.";
    case "rate_limited":
      return "Grok is busy. Try again in a moment.";
    case "no_credit":
      return "Medosha AI has run out of provider credit.";
    case "server_error":
      return "Grok is having trouble. Try again shortly.";
    case "unreachable":
      return "Medosha could not reach Grok. Check the connection.";
    case "bad_request":
      return "Grok refused that request.";
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * What a failed call was, in one line, with nothing secret in it.
 *
 * "Medosha could not reach Grok" is what a member should read and is useless
 * to whoever has to fix it. This is the other half: the endpoint, the model,
 * the status, xAI's own code and message, and whether a key exists at all —
 * which is the single most common answer and the one the old message hid.
 *
 * The key itself is never a field here and never will be. `keyPresent` is a
 * boolean on purpose: a length or a prefix is still information about a
 * secret, and a log line is not a place to put any of it.
 */
export function logXaiFailure(detail: {
  endpoint: string;
  model: string;
  operation: string;
  status?: number;
  kind: XaiFailureKind;
  body?: string;
}): void {
  console.error("[medosha-ai:xai] request failed", {
    endpoint: detail.endpoint,
    model: detail.model,
    operation: detail.operation,
    status: detail.status ?? "none (request did not complete)",
    kind: detail.kind,
    keyPresent: hasXaiKey(),
    // Trimmed: xAI error bodies can carry request identifiers and account
    // detail, and a log is not the place for an unbounded copy of them.
    xaiError: (detail.body ?? "").slice(0, 300),
  });
}

/** The same line for a call that worked, behind a flag so it is opt-in. */
export function logXaiCall(detail: {
  endpoint: string;
  model: string;
  operation: string;
}): void {
  if (process.env.MEDOSHA_AI_DEBUG !== "1") return;
  console.info("[medosha-ai:xai] calling", {
    endpoint: detail.endpoint,
    model: detail.model,
    operation: detail.operation,
    keyPresent: hasXaiKey(),
  });
}
