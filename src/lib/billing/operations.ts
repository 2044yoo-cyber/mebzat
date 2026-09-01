/**
 * The names of the things that cost credits.
 *
 * Only the *names* are here. What each one costs and which plan may run it are
 * rows in `ai_operation_costs`, read at request time — the brief was explicit
 * about not hardcoding credit costs through the frontend, and the reason is
 * worth restating: a price written into a component is a price that exists in
 * four places by the time three people have touched it, and changing it means a
 * deploy. A name written into a component is just a name, and if it is wrong the
 * server refuses with "unknown operation" instead of charging the wrong amount.
 *
 * No `server-only` guard, because the browser legitimately needs these strings
 * to ask what an operation costs before offering it. There is nothing secret in
 * a list of identifiers.
 */

export const AI_OPERATIONS = {
  /** Medosha AI, answering in words. Metered from tokens. */
  aiChat: "ai.chat",
  /** Medosha AI, answering with a picture. Metered per image produced. */
  aiImage: "ai.image",
  designChat: "design.chat",
  designImage: "design.image",
  designRender: "design.render",
  takeoffDrawing: "takeoff.drawing",
  takeoffModel: "takeoff.model",
  boqGenerate: "boq.generate",
  quoteGenerate: "quote.generate",
  /**
   * One AI social post and every platform version it produces.
   *
   * Charged once. Four platform versions come out of one model call, and
   * billing per version would charge four times for one generation.
   */
  socialPost: "social.post",
  /** Per image generated for a post. A post reusing a listing photo is free. */
  socialImage: "social.image",
  /** A post generated ahead of time by a weekly schedule. */
  socialSchedule: "social.schedule",
} as const;

export type AiOperation = (typeof AI_OPERATIONS)[keyof typeof AI_OPERATIONS];

/** Every operation id, for the check script and for the billing page. */
export const AI_OPERATION_IDS: readonly AiOperation[] =
  Object.values(AI_OPERATIONS);

export function isAiOperation(value: unknown): value is AiOperation {
  return (
    typeof value === "string" &&
    (AI_OPERATION_IDS as readonly string[]).includes(value)
  );
}

/**
 * Plans, in order.
 *
 * Duplicated from `plan_rank()` in the database, which is not ideal but is the
 * lesser problem: the alternative is a round trip to compare two enums. The
 * database remains the authority — this ordering is only ever used to *phrase*
 * a refusal ("Pro or above"), never to decide one.
 */
export const PLAN_ORDER = [
  "free",
  "pro",
  "business",
  "professional",
  "admin",
] as const;

export type AccountPlan = (typeof PLAN_ORDER)[number];

export function planRank(plan: AccountPlan): number {
  return PLAN_ORDER.indexOf(plan);
}

export function planLabel(plan: AccountPlan): string {
  switch (plan) {
    case "free":
      return "Free";
    case "pro":
      return "Pro";
    case "business":
      return "Business";
    case "professional":
      return "Professional";
    case "admin":
      return "Admin";
  }
}

export function isAccountPlan(value: unknown): value is AccountPlan {
  return (
    typeof value === "string" && (PLAN_ORDER as readonly string[]).includes(value)
  );
}
