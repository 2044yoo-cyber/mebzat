import { NextResponse } from "next/server";

import {
  notifyPublishResult,
  runPublish,
  statusAfter,
} from "@/lib/social/run-publish";
import { postingAllowance } from "@/lib/social/settings";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Publishing an approved post, now.
 *
 * The same code path the scheduler uses — `runPublish` — called by a person
 * instead of a clock. That sharing is not tidiness: a "publish now" with its
 * own copy of the claim-then-call loop would be a second implementation of the
 * rule that stops double posting, and the second implementation is the one
 * that gets it wrong.
 *
 * What this route owns is the part that is specific to a person asking:
 * authentication, the approval gate read from the database, and the posting
 * limit. The scheduler checks the same three things differently and for good
 * reasons — see `api/cron/social`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to publish." }, { status: 401 });
  }

  let postId: string;
  try {
    const body = (await request.json()) as { postId?: unknown };
    if (typeof body.postId !== "string") throw new Error("no id");
    postId = body.postId;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // RLS decides whether this row exists for this member, so a post belonging
  // to somebody else is indistinguishable from one that was deleted.
  const { data: post } = await supabase
    .from("ai_content_posts")
    .select("id, status, owner_id, company_id, image_url, source_type, source_id")
    .eq("id", postId)
    .maybeSingle();

  if (!post) {
    return NextResponse.json(
      { error: "That post no longer exists." },
      { status: 404 },
    );
  }

  // The approval gate. Read from the database rather than trusted from the
  // request — this is the rule the whole feature rests on, and the button that
  // triggered this lives in a browser.
  if (
    post.status !== "approved" &&
    post.status !== "scheduled" &&
    post.status !== "failed"
  ) {
    return NextResponse.json(
      {
        error:
          "This post has not been approved yet. Read the versions and approve it first.",
      },
      { status: 409 },
    );
  }

  // Checked again here, not only at generation: a member can generate ten
  // posts on Monday and publish them all on Friday.
  const allowance = await postingAllowance(user.id);
  if (!allowance.ok) {
    return NextResponse.json({ error: allowance.reason }, { status: 429 });
  }

  await supabase
    .from("ai_content_posts")
    .update({ status: "publishing" })
    .eq("id", postId);

  const outcomes = await runPublish({
    postId,
    ownerId: user.id,
    companyId: post.company_id,
    imageUrl: post.image_url,
    sourceType: post.source_type,
    sourceId: post.source_id,
    client: supabase,
    // The log is service-role only. See `run-publish.ts`.
    logger: createServiceClient(),
    // The minute, so a double-click on a slow connection collides with itself
    // rather than posting twice.
    slot: new Date().toISOString().slice(0, 16),
  });

  if (outcomes.length === 0) {
    // Put the status back — nothing was attempted, so "publishing" would be a
    // state it never leaves.
    await supabase
      .from("ai_content_posts")
      .update({ status: "approved" })
      .eq("id", postId);

    return NextResponse.json(
      { error: "No platforms are included in this post." },
      { status: 400 },
    );
  }

  const status = statusAfter(outcomes);
  if (status) {
    await supabase
      .from("ai_content_posts")
      .update({
        status,
        published_at:
          status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", postId);
  }

  await notifyPublishResult(supabase, user.id, postId, outcomes);

  return NextResponse.json({
    results: outcomes,
    published: status === "published",
  });
}
