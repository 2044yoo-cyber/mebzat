import "server-only";

/**
 * Input guards for Medosha AI.
 *
 * These run before any provider call. They are deliberately conservative:
 * the aim is to stop the cheap, obvious attempts to rewrite the assistant's
 * instructions or extract its prompt, not to claim that prompt injection is
 * solved. The stronger protection is structural — retrieved catalogue rows are
 * fenced and labelled as data, and the assistant has no tools that mutate
 * anything.
 */

/** Longest question accepted. */
export const MAX_QUESTION_LENGTH = 4000;

/** Turns of history replayed to the model. */
export const MAX_HISTORY_MESSAGES = 20;

/** Requests allowed per user inside the window. */
export const RATE_LIMIT_REQUESTS = 30;
export const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions|prompts?|rules)/i,
  /forget\s+(everything|all)\s+(you|above|before)/i,
  /(reveal|show|print|repeat|output)\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions)/i,
  /you\s+are\s+no\s+longer\s+(medosha|an?\s+construction)/i,
  /\bact\s+as\s+(if\s+you\s+are\s+)?(dan|an?\s+unrestricted|a\s+jailbroken)/i,
  /<\/?(system|assistant)>/i,
];

export type Verdict =
  | { ok: true; question: string }
  | { ok: false; reason: string };

/**
 * Validates a question and normalises it.
 *
 * Suspicious input is rejected rather than sanitised: silently editing what
 * someone asked produces confusing answers, and a clear refusal is easier to
 * reason about than a half-stripped prompt.
 */
export function validateQuestion(raw: unknown): Verdict {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Ask a question to get started." };
  }

  const question = raw.trim();

  if (question.length === 0) {
    return { ok: false, reason: "Ask a question to get started." };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      reason: `Questions are limited to ${MAX_QUESTION_LENGTH} characters. Try splitting this into smaller questions.`,
    };
  }
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      ok: false,
      reason:
        "That looks like an attempt to change how Medosha AI works. Ask a construction question instead.",
    };
  }

  return { ok: true, question };
}

/** Trims history to the most recent turns and drops anything malformed. */
export function sanitizeHistory(
  raw: unknown,
): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (entry): entry is { role: string; content: string } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { content?: unknown }).content === "string" &&
        typeof (entry as { role?: unknown }).role === "string",
    )
    // A client-supplied "system" turn would be a way to inject instructions,
    // so only the two conversational roles survive.
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .map((entry) => ({
      role: entry.role as "user" | "assistant",
      content: entry.content.slice(0, MAX_QUESTION_LENGTH),
    }))
    .slice(-MAX_HISTORY_MESSAGES);
}
