import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

import {
  notifyPublishResult,
  runPublish,
  statusAfter,
} from "@/lib/social/run-publish";
import { autoPublishAvailable } from "@/lib/social/settings";
import { createServiceClient } from "@/lib/supabase/service";
import type { AccountPlan } from "@/lib/billing/operations";

/**
 * The scheduler.
 *
 * Called by whatever cron the deployment has — Vercel Cron, a Supabase
 * scheduled function, or `curl` from a machine that is awake. Server-side by
 * construction: nothing here depends on a browser tab being open, which was
 * the brief's requirement and is also the only arrangement that survives
 * somebody closing their laptop on Friday evening.
 *
 * ## Why this is not a page or an action
 *
 * It runs as nobody. There is no `auth.getUser()` below because there is no
 * user — the caller is a clock. That means RLS cannot be the access control,
 * so the control is the shared secret, and every query uses the service role
 * with an explicit owner filter written by hand.
 *
 * That hand-written filter is the thing to be careful about. Everywhere else
 * in Medosha the rule is "do not re-implement ownership, RLS already applies
 * it"; here RLS applies nothing, so the opposite rule holds and every query
 * says which member it is for.
 *
 * ## What it will not do
 *
 * Publish anything a person has not approved. The status ladder is ordered so
 * that `claim_scheduled_post` can require `status = 'scheduled'`, and a post
 * only reaches `scheduled` from `approved`. A generated post that nobody has
 * looked at is invisible to this route.
 *
 * Publish when the site has automatic publishing switched off. Checked once at
 * the top rather than per post: if it is off, there is nothing to do at all.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Posts handled per run. A cap, so one busy minute cannot run for an hour. */
const BATCH = 25;

/**
 * Whether the caller is the cron.
 *
 * Constant-time comparison of SHA-256 digests rather than of the strings.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, so comparing
 * the raw secrets means an early return whose *timing* discloses the secret's
 * length — and a length is the first thing you want when guessing one. Hashing
 * first makes both sides exactly 32 bytes whatever was sent, so every request
 * takes the same path and the same time.
 */
function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET;

  // No secret configured means the endpoint is closed, not open. An
  // unprotected publishing endpoint is worse than a scheduler that does not
  // run: anybody who found the URL could push every approved post live.
  if (!expected || expected.trim().length === 0) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : header;

  const a = createHash("sha256").update(offered).digest();
  const b = createHash("sha256").update(expected).digest();

  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    // Deliberately terse. An endpoint that explains why it refused is an
    // endpoint that helps somebody guess.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = createServiceClient();

  if (!(await autoPublishAvailable())) {
    return NextResponse.json({
      ran: false,
      reason:
        "Automatic publishing is switched off for this site (platform_settings.auto_publish_available).",
    });
  }

  // Due, scheduled, and not already being handled. `claim_scheduled_post`
  // re-checks all of this atomically — this query only decides what to try.
  const { data: due, error } = await supabase
    .from("ai_content_posts")
    .select(
      "id, owner_id, company_id, image_url, source_type, source_id, scheduled_for, schedule_id",
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error(`[medosha-cron] could not read the queue: ${error.message}`);
    return NextResponse.json(
      { error: "The queue could not be read." },
      { status: 500 },
    );
  }

  const report: {
    postId: string;
    published: boolean;
    skipped: string | null;
    platforms: number;
  }[] = [];

  for (const post of due ?? []) {
    // The claim. Two workers running the same minute both issue this; Postgres
    // serialises them and the second finds no row in 'scheduled'. The loser
    // publishes nothing rather than publishing a duplicate.
    const { data: claimed } = await supabase.rpc("claim_scheduled_post", {
      post: post.id,
    });

    if (claimed !== true) {
      report.push({
        postId: post.id,
        published: false,
        skipped: "claimed by another worker",
        platforms: 0,
      });
      continue;
    }

    // Everything below is per-member and re-checked at publish time, because a
    // post approved three weeks ago belongs to somebody whose plan may have
    // lapsed and whose allowance may be spent since.
    const gate = await checkMember(supabase, post.owner_id);

    if (!gate.ok) {
      await supabase
        .from("ai_content_posts")
        .update({ status: "approved", scheduled_for: null })
        .eq("id", post.id);

      await supabase.from("notifications").insert({
        user_id: post.owner_id,
        kind: "ai_alert",
        title: "A scheduled post was not published",
        body: gate.reason,
        href: `/studio/content/${post.id}`,
      });

      report.push({
        postId: post.id,
        published: false,
        skipped: gate.reason,
        platforms: 0,
      });
      continue;
    }

    // The schedule's own auto_publish flag. A member can have automatic
    // publishing available site-wide and still not have asked for it.
    if (post.schedule_id) {
      const { data: schedule } = await supabase
        .from("ai_content_schedules")
        .select("auto_publish, active")
        .eq("id", post.schedule_id)
        .maybeSingle();

      if (!schedule?.auto_publish || !schedule.active) {
        await supabase
          .from("ai_content_posts")
          .update({ status: "approved" })
          .eq("id", post.id);

        await supabase.from("notifications").insert({
          user_id: post.owner_id,
          kind: "ai_alert",
          title: "Your scheduled post is ready to publish",
          body: "Automatic publishing is off for this schedule, so it is waiting for you.",
          href: `/studio/content/${post.id}`,
        });

        report.push({
          postId: post.id,
          published: false,
          skipped: "automatic publishing not enabled for this schedule",
          platforms: 0,
        });
        continue;
      }
    }

    const outcomes = await runPublish({
      postId: post.id,
      ownerId: post.owner_id,
      companyId: post.company_id,
      imageUrl: post.image_url,
      sourceType: post.source_type,
      sourceId: post.source_id,
      // No member client exists here. The service role does both, and the
      // owner filters above are what stand in for RLS.
      client: supabase,
      logger: supabase,
      // The scheduled time, not the clock. A cron that runs twice for the
      // same slot — a retry, an overlapping schedule, a redeploy mid-run —
      // produces the same key and collides instead of double-posting.
      slot: post.scheduled_for ?? new Date().toISOString().slice(0, 16),
    });

    const status = statusAfter(outcomes);

    await supabase
      .from("ai_content_posts")
      .update({
        // Null means every attempt was a duplicate, so the post was already
        // handled and its status should not be disturbed.
        status: status ?? "scheduled",
        published_at:
          status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", post.id);

    await notifyPublishResult(supabase, post.owner_id, post.id, outcomes);

    if (post.schedule_id && status === "published") {
      await supabase
        .from("ai_content_schedules")
        .update({ last_published_at: new Date().toISOString() })
        .eq("id", post.schedule_id);
    }

    report.push({
      postId: post.id,
      published: status === "published",
      skipped: null,
      platforms: outcomes.length,
    });
  }

  return NextResponse.json({
    ran: true,
    considered: due?.length ?? 0,
    published: report.filter((entry) => entry.published).length,
    report,
  });
}

/**
 * Whether this member may still publish.
 *
 * Re-checked at publish time, not trusted from approval time. A post approved
 * three weeks ago belongs to somebody who may since have downgraded, run out
 * of allowance, or had their plan lapse — and publishing on a plan they no
 * longer hold is giving away the paid feature to anybody patient enough to
 * schedule far ahead.
 *
 * This duplicates what `postingAllowance` does, and deliberately does not call
 * it: that function builds a request-scoped client through `createClient`,
 * which needs cookies. There are no cookies here. Rather than making the
 * shared function take a client — and risk somebody passing the member's one
 * from a context where RLS would silently empty the result — the cron does its
 * own reads against the service role with explicit owner filters.
 */
async function checkMember(
  supabase: ReturnType<typeof createServiceClient>,
  ownerId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, is_admin")
    .eq("id", ownerId)
    .maybeSingle();

  if (!profile) {
    return { ok: false, reason: "The account no longer exists." };
  }

  if (profile.is_admin) return { ok: true };

  const plan = (profile.plan ?? "free") as AccountPlan;

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["weekly_post_limit", "monthly_post_limit"]);

  const byKey = new Map((settings ?? []).map((row) => [row.key, row.value]));

  const weekLimit = planNumber(byKey.get("weekly_post_limit"), plan);
  const monthLimit = planNumber(byKey.get("monthly_post_limit"), plan);

  if (weekLimit <= 0) {
    return {
      ok: false,
      reason:
        "AI posting is not included in your current plan, so this post was not published.",
    };
  }

  const [week, month] = await Promise.all([
    countPublished(supabase, ownerId, 7),
    countPublished(supabase, ownerId, 30),
  ]);

  if (week === null || month === null) {
    // Unreadable counts fail closed. Publishing on an unknown allowance is how
    // an outage becomes an unlimited plan.
    return {
      ok: false,
      reason: "Your posting allowance could not be checked. Try publishing manually.",
    };
  }

  if (week >= weekLimit) {
    return {
      ok: false,
      reason: `You have reached your weekly limit of ${weekLimit} posts.`,
    };
  }

  if (monthLimit > 0 && month >= monthLimit) {
    return {
      ok: false,
      reason: `You have reached your monthly limit of ${monthLimit} posts.`,
    };
  }

  return { ok: true };
}

function planNumber(value: unknown, plan: AccountPlan): number {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entry = (value as Record<string, unknown>)[plan];
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
  }
  // Absent means not permitted. A missing settings row must not read as
  // unlimited.
  return 0;
}

async function countPublished(
  supabase: ReturnType<typeof createServiceClient>,
  ownerId: string,
  days: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("ai_posts_published_in_window", {
    member: ownerId,
    window_days: days,
  });

  if (error) {
    console.error(`[medosha-cron] allowance query failed: ${error.message}`);
    return null;
  }

  return typeof data === "number" ? data : 0;
}

/**
 * GET is the same run.
 *
 * Vercel Cron issues GET; most other schedulers issue POST. Supporting both
 * means the deployment's scheduler does not have to be the one this was
 * written against.
 */
export async function GET(request: Request) {
  return POST(request);
}
