/**
 * The moderation vocabulary, shared by the server and the browser.
 *
 * Client-safe on purpose, and narrowly so. A component needs to know that an
 * upload is under review in order to say "Under review"; it does not need the
 * provider's reason, the confidence score, or which rule was tripped. Those
 * live server-side in `provider.ts` and never travel.
 *
 * The split is the same one the rest of Medosha uses for anything sensitive:
 * labels here, decisions and their justifications behind `server-only`.
 */

export const MODERATION_STATUSES = ["pending", "review", "safe", "blocked"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const MODERATION_CATEGORIES = [
  "sexual_explicit",
  "sexual_minors",
  "harassment",
  "hate",
  "threats",
  "violence",
  "scam",
  "spam",
  "illegal",
  "other",
] as const;
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export const CONTENT_KINDS = [
  "project",
  "project_image",
  "product",
  "product_image",
  "company",
  "profile_avatar",
  "profile_cover",
  "post",
  "comment",
  "listing",
  "video",
  "panorama",
  "floor_plan",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * What a person may choose when reporting something.
 *
 * `sexual_minors` is deliberately absent. A reporter who believes they have
 * found it should not be asked to categorise it from a dropdown — the report
 * form routes that case to a single prominent option that escalates
 * immediately, rather than filing it alongside spam.
 */
export const REPORT_CATEGORIES = [
  { id: "sexual_explicit", label: "Sexual or explicit content" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate speech" },
  { id: "scam", label: "Scam or fraud" },
  { id: "violence", label: "Violence or threats" },
  { id: "spam", label: "Spam" },
  { id: "illegal", label: "Illegal content" },
  { id: "other", label: "Something else" },
] as const satisfies readonly { id: ModerationCategory; label: string }[];

/**
 * What the uploader is told.
 *
 * Three sentences, and none of them explains *why* in any detail. A message
 * that names the rule is a message that teaches somebody how to get past it,
 * and a score shown to the person who tripped it is a dial they can tune
 * against. The wording is the brief's own.
 */
export function uploadMessage(status: ModerationStatus): string {
  switch (status) {
    case "pending":
      return "Checking your content…";
    case "safe":
      return "Published";
    case "review":
      return "Under review";
    case "blocked":
      return "This content cannot be published because it violates Medosha's content guidelines.";
  }
}

/** Whether something in this state may be rendered publicly. Ever. */
export function isPublishable(status: ModerationStatus): boolean {
  return status === "safe";
}

export type ModerationOutcome = {
  status: ModerationStatus;
  /** Present for a decision that went against the content. */
  category?: ModerationCategory;
  /** The moderation record, so a caller can attach an appeal or a report. */
  itemId?: string;
  /** Set once approved. The only URL a page may render. */
  publicUrl?: string;
};
