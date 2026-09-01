import type { AiContentStatus } from "@/types/database.types";

/**
 * What can happen to a post, and when.
 *
 * Client-safe, and shared by the review screen, the calendar and the server
 * actions. That sharing is the point: a button the UI offers and the server
 * refuses is a bug report, and a transition the server allows but the UI never
 * shows is a feature nobody finds.
 *
 * ## The one rule that matters
 *
 * Nothing reaches a platform without a person approving it. The brief said so
 * twice and it is the difference between a tool and a liability — an AI that
 * publishes to somebody's business Page unasked will eventually publish
 * something that costs them a customer.
 *
 * That rule is enforced in three places, deliberately: here for the UI, in the
 * server action for the API, and in `claim_scheduled_post` for the scheduler.
 * The database one is the one that counts; the other two exist so a user is
 * never *offered* something that will be refused.
 */

export const STATUS_LABEL: Record<AiContentStatus, string> = {
  draft: "Draft",
  generating: "Writing…",
  generated: "AI generated",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * The dot beside a status.
 *
 * Tailwind classes rather than hex, so the calendar inherits the theme. Amber
 * for anything waiting on a person, blue for anything waiting on a machine,
 * green for done, red for broken — the same vocabulary the rest of Medosha
 * uses for job and payment states.
 */
export const STATUS_TONE: Record<AiContentStatus, string> = {
  draft: "bg-muted-foreground",
  generating: "bg-blue-500",
  generated: "bg-amber-500",
  awaiting_approval: "bg-amber-500",
  approved: "bg-emerald-500",
  scheduled: "bg-blue-500",
  publishing: "bg-blue-500",
  published: "bg-emerald-600",
  failed: "bg-destructive",
  cancelled: "bg-muted-foreground",
};

/** Statuses that mean a person still has to look at it. */
export const NEEDS_REVIEW: AiContentStatus[] = [
  "generated",
  "awaiting_approval",
];

/**
 * Whether a post may be edited.
 *
 * Not once it is published: the text on Facebook is the text on Facebook, and
 * letting somebody edit the record afterwards makes the history a work of
 * fiction. `failed` is editable, because fixing the caption is often the fix.
 */
export function canEdit(status: AiContentStatus): boolean {
  return (
    status !== "published" &&
    status !== "publishing" &&
    status !== "generating"
  );
}

/** Whether approving is the next useful thing. */
export function canApprove(status: AiContentStatus): boolean {
  return status === "generated" || status === "awaiting_approval";
}

/**
 * Whether a post can be scheduled.
 *
 * Approved first, always. Scheduling an unapproved post would be a way of
 * arranging for it to be published without anybody having read it — which is
 * the exact thing the approval step exists to prevent, arrived at by a
 * different route.
 */
export function canSchedule(status: AiContentStatus): boolean {
  return status === "approved" || status === "scheduled";
}

/** Whether Publish Now is available. */
export function canPublishNow(status: AiContentStatus): boolean {
  return (
    status === "approved" || status === "scheduled" || status === "failed"
  );
}

export function canCancel(status: AiContentStatus): boolean {
  return status !== "published" && status !== "cancelled";
}

/**
 * Whether regenerating is safe without asking first.
 *
 * False once a human has edited a version: regenerating throws their words
 * away, and doing that silently to somebody who spent five minutes rewriting
 * an Instagram caption is how a tool loses trust. The UI asks; this says
 * whether it needs to.
 */
export function regenerateNeedsConfirmation(
  versions: { edited: boolean }[],
): boolean {
  return versions.some((version) => version.edited);
}

/**
 * The transitions a member may drive.
 *
 * `publishing` and `published` are absent on purpose — those are the
 * scheduler's and the publisher's to set, and a member who could write
 * `published` could mark a post as done that never left Medosha.
 */
const MEMBER_TRANSITIONS: Record<AiContentStatus, AiContentStatus[]> = {
  draft: ["awaiting_approval", "cancelled"],
  generating: ["cancelled"],
  generated: ["awaiting_approval", "approved", "cancelled"],
  awaiting_approval: ["approved", "cancelled"],
  approved: ["scheduled", "awaiting_approval", "cancelled"],
  scheduled: ["approved", "awaiting_approval", "cancelled"],
  publishing: [],
  published: [],
  failed: ["approved", "scheduled", "cancelled"],
  cancelled: ["draft"],
};

export function memberMayMove(
  from: AiContentStatus,
  to: AiContentStatus,
): boolean {
  return MEMBER_TRANSITIONS[from].includes(to);
}

/**
 * What the review screen should say the next step is.
 *
 * One sentence, in the second person, naming the action rather than the state.
 * "Awaiting approval" tells somebody where the post is; "Read the versions
 * below, then approve" tells them what to do about it.
 */
export function nextStep(status: AiContentStatus): string {
  switch (status) {
    case "draft":
      return "This post has not been written yet.";
    case "generating":
      return "Medosha AI is writing it now.";
    case "generated":
    case "awaiting_approval":
      return "Read each version below and edit anything you would say differently. Nothing is published until you approve.";
    case "approved":
      return "Approved. Schedule it, or publish now.";
    case "scheduled":
      return "Scheduled. It will publish automatically at the time below.";
    case "publishing":
      return "Publishing now.";
    case "published":
      return "Published. The result for each platform is below.";
    case "failed":
      return "Something went wrong. The reason is below — fix it and try again.";
    case "cancelled":
      return "Cancelled. Nothing was published.";
  }
}
