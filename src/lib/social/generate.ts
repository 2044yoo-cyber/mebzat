import "server-only";

import { ProviderError, providerChain, streamCompletion } from "@/lib/ai/provider";
import { propertyPageContext } from "@/lib/ai/property-tools";
import { createClient } from "@/lib/supabase/server";
import {
  PLATFORM_SPECS,
  categoryLabel,
  type SocialPlatform,
} from "./platforms";

/**
 * Writing one post, in several voices, from one model call.
 *
 * ## Why one call and not four
 *
 * The obvious implementation asks the model once per platform. It is also the
 * one that charges somebody four times for one post — the brief called that
 * out — and it produces four posts that disagree with each other, because
 * nothing forces the Facebook version and the Instagram version to be about
 * the same offer at the same price.
 *
 * So the model is asked once and answers with every version at once. The
 * charge is on the master record and the versions carry none, which is not
 * bookkeeping: it is the structure that makes double-charging impossible
 * rather than merely avoided.
 *
 * ## Grounding
 *
 * A post about a real property is written from the property's row. The rule is
 * the same one the assistant follows and for a stronger reason: an invented
 * price in a chat answer is a wrong answer, and an invented price in a
 * published advertisement is a wrong answer with the user's name on it, on
 * their Facebook Page, in front of their customers.
 *
 * Missing fields are omitted rather than filled. A listing with no parking
 * count produces a post that does not mention parking.
 */

export type GenerateRequest = {
  brief: string;
  platforms: SocialPlatform[];
  category?: string;
  sourceType?: "property" | "product" | "project" | "company" | "service" | "profile" | "freeform";
  sourceId?: string | null;
  /** The language the user wrote in. Passed through, never translated away. */
  locale?: string;
};

export type PlatformDraft = {
  platform: SocialPlatform;
  body: string;
  hashtags: string[];
};

export type GeneratedContent = {
  headline: string;
  body: string;
  callToAction: string;
  hashtags: string[];
  versions: PlatformDraft[];
  /** A prompt for the image model, when a picture has to be made. */
  imagePrompt: string | null;
  /** What the generator was given. Shown in the preview as "written from". */
  grounding: string;
  /** Facts the post could have used but the record does not carry. */
  missing: string[];
};

export class GenerationError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GenerationError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Grounding                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The real record the post is about, as text the model must not contradict.
 *
 * Returns an empty block for a freeform post, which is the case where the
 * model is allowed to write from the brief alone — "the benefits of reinforced
 * concrete" needs no database row and inventing one would be worse.
 */
async function groundingFor(
  request: GenerateRequest,
): Promise<{ text: string; missing: string[]; images: string[] }> {
  if (!request.sourceId || request.sourceType === "freeform" || !request.sourceType) {
    return { text: "", missing: [], images: [] };
  }

  if (request.sourceType === "property") {
    const context = await propertyPageContext(request.sourceId);
    if (!context.text) {
      throw new GenerationError(
        "That property could not be found, so there is nothing to write from.",
        404,
      );
    }

    // The reader already writes "not stated" for absent fields. Collecting them
    // lets the preview tell the user what to add rather than leaving them to
    // notice the post is thin.
    const missing = [...context.text.matchAll(/^- ([^:]+): not stated$/gm)].map(
      (match) => match[1]!.trim(),
    );

    const images = await propertyImages(request.sourceId);
    return { text: context.text, missing, images };
  }

  const supabase = await createClient();

  if (request.sourceType === "product") {
    const { data } = await supabase
      .from("products")
      .select("id, title, price, currency, unit, brand, stock_status, description, location_city")
      .eq("id", request.sourceId)
      .maybeSingle();

    if (!data) throw new GenerationError("That product could not be found.", 404);

    return {
      text: [
        "THE PRODUCT THIS POST IS ABOUT",
        `- Title: ${data.title}`,
        `- Price: ${data.price !== null ? `${data.currency} ${data.price.toLocaleString("en-US")}${data.unit ? ` per ${data.unit}` : ""}` : "not stated"}`,
        `- Brand: ${data.brand ?? "not stated"}`,
        `- Stock: ${data.stock_status}`,
        `- City: ${data.location_city ?? "not stated"}`,
        `- Path: /marketplace/${data.id}`,
        data.description ? `- Description: ${data.description.slice(0, 600)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      missing: data.price === null ? ["Price"] : [],
      images: [],
    };
  }

  if (request.sourceType === "company") {
    const { data } = await supabase
      .from("companies")
      .select("id, name, slug, category, city, description, verified")
      .eq("id", request.sourceId)
      .maybeSingle();

    if (!data) throw new GenerationError("That company could not be found.", 404);

    return {
      text: [
        "THE COMPANY THIS POST IS ABOUT",
        `- Name: ${data.name}`,
        `- Trade: ${data.category ?? "not stated"}`,
        `- City: ${data.city ?? "not stated"}`,
        `- Verified on Medosha: ${data.verified ? "yes" : "no"}`,
        `- Path: /companies/${data.slug}`,
        data.description ? `- About: ${data.description.slice(0, 600)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      missing: [],
      images: [],
    };
  }

  if (request.sourceType === "project") {
    const { data } = await supabase
      .from("projects")
      .select("id, title, building_type, style, location_city, description, budget, budget_currency")
      .eq("id", request.sourceId)
      .maybeSingle();

    if (!data) throw new GenerationError("That project could not be found.", 404);

    return {
      text: [
        "THE PROJECT THIS POST IS ABOUT",
        `- Title: ${data.title}`,
        `- Type: ${data.building_type}`,
        `- Style: ${data.style ?? "not stated"}`,
        `- City: ${data.location_city ?? "not stated"}`,
        `- Path: /projects/${data.id}`,
        data.description ? `- About: ${data.description.slice(0, 600)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      // Budget is deliberately not passed to the generator. A client's budget
      // is not marketing copy, and a post that publishes it has published a
      // confidence.
      missing: [],
      images: [],
    };
  }

  return { text: "", missing: [], images: [] };
}

/** A listing's own photographs, best first. */
async function propertyImages(propertyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .select("url, position")
    .eq("property_id", propertyId)
    .order("position", { ascending: true })
    .limit(6);

  return (data ?? []).map((row) => row.url).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* The prompt                                                                 */
/* -------------------------------------------------------------------------- */

function systemPrompt(request: GenerateRequest, grounding: string): string {
  const specs = request.platforms.map((platform) => PLATFORM_SPECS[platform]);

  return [
    "You are Medosha's content writer. You write social posts for Ethiopian property, construction, architecture and trade businesses.",
    "",
    "Write for each platform separately. The versions are for the same offer, but they are not the same text:",
    "",
    ...specs.map(
      (spec) =>
        `- ${spec.label}: ${spec.voice} Aim for about ${spec.targetLength} characters; never exceed ${spec.maxLength}. About ${spec.hashtagCount} hashtags.`,
    ),
    "",
    "RULES YOU MAY NOT BREAK:",
    "1. Every fact in the post must come from the record below. Never invent a price, a size, a bedroom count, an address, an amenity, a phone number or an availability date.",
    "2. Where the record says a field is not stated, leave it out. Do not estimate it, do not describe it vaguely, and do not write around it in a way that implies it.",
    "3. Do not promise anything the record does not support — no 'best price in Addis', no 'limited time' unless the record says so.",
    "4. Prices are in ETB and are written exactly as the record has them. A rental price is per month; say so.",
    "5. Write in the language of the user's brief. If they wrote in Amharic, write the posts in Amharic. If they mixed Amharic and English, match that.",
    "",
    grounding
      ? "The record follows. It is the only source of fact for this post."
      : "There is no database record for this post — it is a general post written from the brief. Do not name a specific property, price or address, because there is none.",
    "",
    grounding,
    "",
    "Answer with JSON only, no prose around it, in exactly this shape:",
    "{",
    '  "headline": "short title, under 80 characters",',
    '  "body": "the core message, platform-neutral",',
    '  "callToAction": "one sentence",',
    '  "hashtags": ["without", "the", "hash", "symbol"],',
    '  "imagePrompt": "a description for an image generator, or null if a photograph of the real thing should be used instead",',
    '  "versions": [',
    '    { "platform": "facebook", "body": "...", "hashtags": ["..."] }',
    "  ]",
    "}",
    "",
    `Include exactly these platforms in "versions": ${request.platforms.join(", ")}.`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Asks the model, once, for every version.
 *
 * Walks the same provider chain the assistant uses, so a Grok outage degrades
 * to whatever else is configured instead of failing the feature.
 */
export async function generateContent(
  request: GenerateRequest,
): Promise<{ content: GeneratedContent; listingImages: string[]; usage: { promptTokens: number; completionTokens: number } }> {
  if (request.platforms.length === 0) {
    throw new GenerationError("Choose at least one platform.", 400);
  }

  const grounding = await groundingFor(request);
  const providers = providerChain();

  if (providers.length === 0) {
    throw new GenerationError(
      "No AI provider is configured. The site owner needs to set XAI_API_KEY.",
      503,
    );
  }

  const messages = [
    { role: "system" as const, content: systemPrompt(request, grounding.text) },
    {
      role: "user" as const,
      content: request.category
        ? `${request.brief}\n\n(Category: ${categoryLabel(request.category)})`
        : request.brief,
    },
  ];

  let lastError: string | null = null;

  for (const provider of providers) {
    try {
      let raw = "";
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of streamCompletion(provider, {
        messages,
        // Low, but not zero. A post needs some life in it; a post that reads
        // like a database row is not worth ten credits.
        temperature: 0.6,
        maxTokens: 3000,
      })) {
        if (chunk.type === "text") raw += chunk.value;
        else {
          promptTokens = chunk.promptTokens;
          completionTokens = chunk.completionTokens;
        }
      }

      const content = parseGenerated(raw, request);
      return {
        content: { ...content, grounding: describeGrounding(request), missing: grounding.missing },
        listingImages: grounding.images,
        usage: { promptTokens, completionTokens },
      };
    } catch (error) {
      lastError =
        error instanceof ProviderError
          ? `${error.provider} ${error.status}`
          : error instanceof Error
            ? error.message
            : "unknown";
      // The raw provider body never leaves the server.
      console.error(`[medosha-social] generation failed on ${provider.name}: ${lastError}`);
    }
  }

  throw new GenerationError(
    "Medosha AI could not write the post. Try again — you have not been charged.",
  );
}

function describeGrounding(request: GenerateRequest): string {
  switch (request.sourceType) {
    case "property":
      return "Written from the property's own listing record.";
    case "product":
      return "Written from the product's marketplace record.";
    case "company":
      return "Written from the company profile.";
    case "project":
      return "Written from the project record.";
    default:
      return "Written from your brief. No Medosha record was used, so it names no specific listing.";
  }
}

/**
 * Reads the model's JSON.
 *
 * Models wrap JSON in code fences however firmly they are told not to, so the
 * fence is stripped before parsing rather than the whole generation being
 * thrown away over three backticks.
 */
function parseGenerated(raw: string, request: GenerateRequest): GeneratedContent {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const text = (fenced?.[1] ?? raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GenerationError("Medosha AI returned something unreadable. Try again.");
  }

  const object = parsed as Record<string, unknown>;
  const versions = Array.isArray(object.versions) ? object.versions : [];

  const drafts: PlatformDraft[] = [];
  for (const platform of request.platforms) {
    const match = versions.find(
      (entry) => (entry as Record<string, unknown>)?.platform === platform,
    ) as Record<string, unknown> | undefined;

    const body =
      typeof match?.body === "string" && match.body.trim().length > 0
        ? match.body.trim()
        : typeof object.body === "string"
          ? object.body
          : "";

    if (!body) {
      throw new GenerationError(
        `Medosha AI produced no text for ${PLATFORM_SPECS[platform].label}. Try again.`,
      );
    }

    // Truncating here rather than at publish time: a caption the platform
    // rejects is a failed post, and a caption the user reviewed and approved
    // should be the caption that goes out.
    const spec = PLATFORM_SPECS[platform];
    drafts.push({
      platform,
      body: body.length > spec.maxLength ? `${body.slice(0, spec.maxLength - 1)}…` : body,
      hashtags: cleanHashtags(match?.hashtags ?? object.hashtags, spec.hashtagCount),
    });
  }

  return {
    headline: typeof object.headline === "string" ? object.headline.slice(0, 200) : "",
    body: typeof object.body === "string" ? object.body : drafts[0]?.body ?? "",
    callToAction:
      typeof object.callToAction === "string" ? object.callToAction.slice(0, 300) : "",
    hashtags: cleanHashtags(object.hashtags, 12),
    versions: drafts,
    imagePrompt:
      typeof object.imagePrompt === "string" && object.imagePrompt.trim().length > 0
        ? object.imagePrompt.trim()
        : null,
    grounding: "",
    missing: [],
  };
}

/**
 * Hashtags, normalised.
 *
 * Models return "#Bole", "Bole", "# bole" and "#bole #addis" in one array,
 * sometimes in the same response. Publishing "##Bole" is the kind of detail
 * that makes a business look like it is using a bot.
 */
function cleanHashtags(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    for (const piece of entry.split(/[\s#]+/)) {
      const tag = piece.replace(/[^\p{L}\p{N}_]/gu, "");
      if (tag.length < 2) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
      if (out.length >= limit) return out;
    }
  }

  return out;
}
