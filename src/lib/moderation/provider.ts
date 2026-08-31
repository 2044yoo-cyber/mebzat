import "server-only";

import type { ModerationCategory, ModerationStatus } from "./types";

/**
 * How Medosha asks "is this safe?", without caring who answers.
 *
 * ## Why an interface rather than a call
 *
 * There is no moderation provider configured on Medosha today, and the honest
 * consequence of that is stated rather than hidden: with nothing configured,
 * `moderate()` returns `review`, and content waits for a person. Not `safe` —
 * a system that publishes everything when its checker is missing is worse than
 * no system, because it looks like protection and is not.
 *
 * When a provider is added it becomes an entry in `PROVIDERS` and every calling
 * surface gains real checking without changing a line.
 *
 * ## The one rule about which model
 *
 * A generative image model must never be the safety decision-maker. Grok draws
 * pictures for the render workspace; asking the same class of model whether a
 * picture is acceptable is asking a thing optimised to produce plausible output
 * to make a judgement it was never calibrated for. Purpose-built classifiers —
 * OpenAI's moderation endpoint, AWS Rekognition, Google Cloud Vision SafeSearch,
 * Hive — publish thresholds and false-positive rates. A chat model does not.
 *
 * ## Keys
 *
 * Read from the environment at call time, in a `server-only` module, so a
 * component importing this is a build error rather than a leaked key. No
 * moderation key may ever be `NEXT_PUBLIC_`.
 */

export type ProviderVerdict = {
  status: ModerationStatus;
  category?: ModerationCategory;
  /** The provider's own words, already truncated. Never shown to a member. */
  reason?: string;
  /** 0..1 where the provider gives one. */
  confidence?: number;
  provider: string;
  model?: string;
};

export type ModerationProvider = {
  name: string;
  /** All must be present for the provider to be considered configured. */
  keyVars: string[];
  isConfigured: () => boolean;
  moderateText?: (text: string, signal?: AbortSignal) => Promise<ProviderVerdict>;
  /** Takes a data URL or an https URL. */
  moderateImage?: (image: string, signal?: AbortSignal) => Promise<ProviderVerdict>;
};

/**
 * The threshold between blocking and asking a person.
 *
 * The brief is explicit and correct: when confidence is uncertain, review
 * rather than block. A false block silences somebody who did nothing wrong and
 * gives them no recourse until an appeal is read; a false review costs a delay.
 * Those are not symmetric harms and the threshold is set accordingly high.
 *
 * Overridable, because the right number depends on the provider and on how much
 * moderator time exists to spend.
 */
export function blockThreshold(): number {
  const raw = Number(process.env.MODERATION_BLOCK_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.9;
}

/** Below this, nothing is flagged at all. */
export function reviewThreshold(): number {
  const raw = Number(process.env.MODERATION_REVIEW_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.4;
}

/**
 * A score and a category, turned into a decision.
 *
 * The one asymmetry: anything suspected of involving minors is never resolved
 * automatically and never returns `safe`, at any confidence. It goes to review
 * with the category attached, where the database constraint then makes marking
 * it safe impossible even by hand.
 */
export function decide(
  category: ModerationCategory | undefined,
  confidence: number | undefined,
): ModerationStatus {
  if (category === "sexual_minors") return "review";

  if (category === undefined || confidence === undefined) return "safe";

  if (confidence >= blockThreshold()) return "blocked";
  if (confidence >= reviewThreshold()) return "review";
  return "safe";
}

/**
 * OpenAI's moderation endpoint.
 *
 * A purpose-built classifier rather than a chat model, which is the whole
 * reason it is the one wired up: it returns per-category scores against
 * published thresholds. Text only — the omnibus model also accepts images, and
 * that is the natural place to extend this when somebody wants it.
 */
const openAiModeration: ModerationProvider = {
  name: "openai",
  keyVars: ["OPENAI_MODERATION_KEY", "OPENAI_API_KEY"],
  isConfigured: () =>
    Boolean(
      process.env.OPENAI_MODERATION_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
    ),

  async moderateText(text, signal) {
    const key =
      process.env.OPENAI_MODERATION_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim();

    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      signal: signal ?? AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: process.env.MODERATION_TEXT_MODEL?.trim() || "omni-moderation-latest",
        input: text.slice(0, 20_000),
      }),
    });

    if (!response.ok) {
      // A provider that cannot answer must not be read as "safe". The caller
      // sends this to review.
      throw new Error(`moderation HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      results?: {
        flagged?: boolean;
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }[];
    };

    const result = payload.results?.[0];
    const scores = result?.category_scores ?? {};

    // Their taxonomy, mapped to ours. Ordered by severity so the worst match
    // wins when several fire at once.
    const mapping: [string, ModerationCategory][] = [
      ["sexual/minors", "sexual_minors"],
      ["sexual", "sexual_explicit"],
      ["hate/threatening", "hate"],
      ["harassment/threatening", "threats"],
      ["violence/graphic", "violence"],
      ["violence", "violence"],
      ["hate", "hate"],
      ["harassment", "harassment"],
      ["self-harm", "other"],
      ["illicit", "illegal"],
    ];

    let category: ModerationCategory | undefined;
    let confidence: number | undefined;

    for (const [theirs, ours] of mapping) {
      const score = scores[theirs];
      if (score !== undefined && score >= reviewThreshold()) {
        category = ours;
        confidence = score;
        break;
      }
    }

    return {
      status: decide(category, confidence),
      category,
      confidence,
      reason: category ? `flagged: ${category}` : undefined,
      provider: "openai",
      model: process.env.MODERATION_TEXT_MODEL?.trim() || "omni-moderation-latest",
    };
  },

  async moderateImage(image, signal) {
    const key =
      process.env.OPENAI_MODERATION_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim();

    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      signal: signal ?? AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: process.env.MODERATION_IMAGE_MODEL?.trim() || "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: image } }],
      }),
    });

    if (!response.ok) throw new Error(`moderation HTTP ${response.status}`);

    const payload = (await response.json()) as {
      results?: { category_scores?: Record<string, number> }[];
    };
    const scores = payload.results?.[0]?.category_scores ?? {};

    const minors = scores["sexual/minors"] ?? 0;
    const sexual = scores["sexual"] ?? 0;
    const violence = scores["violence/graphic"] ?? 0;

    // Minors first and at a far lower bar than anything else. A false review
    // here costs somebody a wait; the other error does not bear thinking about.
    if (minors >= 0.15) {
      return {
        status: "review",
        category: "sexual_minors",
        confidence: minors,
        reason: "critical: suspected sexual content involving minors",
        provider: "openai",
      };
    }

    const [category, confidence]: [ModerationCategory | undefined, number] =
      sexual >= violence ? ["sexual_explicit", sexual] : ["violence", violence];

    const flagged = confidence >= reviewThreshold() ? category : undefined;

    return {
      status: decide(flagged, flagged ? confidence : undefined),
      category: flagged,
      confidence: flagged ? confidence : undefined,
      reason: flagged ? `flagged: ${flagged}` : undefined,
      provider: "openai",
      model: process.env.MODERATION_IMAGE_MODEL?.trim() || "omni-moderation-latest",
    };
  },
};

const PROVIDERS: ModerationProvider[] = [openAiModeration];

/** The first configured provider, or null when none is. */
export function activeProvider(): ModerationProvider | null {
  const pinned = process.env.MODERATION_PROVIDER?.trim();
  if (pinned) {
    const found = PROVIDERS.find((entry) => entry.name === pinned);
    return found?.isConfigured() ? found : null;
  }
  return PROVIDERS.find((entry) => entry.isConfigured()) ?? null;
}

export function isModerationConfigured(): boolean {
  return activeProvider() !== null;
}

/** Names the variables an operator has to set. Never their values. */
export function moderationSetupHelp(): string {
  const names = PROVIDERS.flatMap((entry) => entry.keyVars).join(" or ");
  return `No moderation provider is configured. Set ${names} in .env.local. Until then every upload goes to review rather than being published.`;
}
