import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Every button on a feed card, behind one endpoint.
 *
 * Like, save, follow, share, hide, report and the view batch are all "one
 * short write, tell me the new state" — nine routes would mean nine copies of
 * the same auth check and the same error shape. The action name is validated
 * against a closed list, so this is a switch, not a dispatcher that will
 * execute whatever it is handed.
 *
 * Share and view recording are deliberately fire-and-forget for the client:
 * it does not wait on them and a failure never blocks the interaction the
 * reader actually asked for.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = [
  "like",
  "save",
  "follow",
  "share",
  "hide",
  "unhide",
  "report",
  "view",
  "download",
  "comment-like",
] as const;

type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REPORT_REASONS = [
  "spam",
  "misleading",
  "offensive",
  "wrong_price",
  "not_available",
  "stolen_content",
  "other",
] as const;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const action = body.action;
  if (!isAction(action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Share is the one thing a signed-out visitor may do: copying a link needs
  // no account, and the count is what tells an author their post travelled.
  if (!user && action !== "share") {
    return NextResponse.json(
      { error: "Sign in to do that.", needsAuth: true },
      { status: 401 },
    );
  }

  const postId = typeof body.postId === "string" ? body.postId : null;
  if (action !== "follow" && action !== "comment-like" && !UUID.test(postId ?? "")) {
    return NextResponse.json({ error: "Unknown post." }, { status: 400 });
  }

  switch (action) {
    case "like": {
      const { data, error } = await supabase.rpc("feed_toggle_like", {
        p_post: postId!,
      });
      if (error) return failed(error.message);
      const row = data?.[0];
      return NextResponse.json({
        liked: row?.liked ?? false,
        count: row?.like_count ?? 0,
      });
    }

    case "save": {
      const { data, error } = await supabase.rpc("feed_toggle_save", {
        p_post: postId!,
      });
      if (error) return failed(error.message);
      const row = data?.[0];
      return NextResponse.json({
        saved: row?.saved ?? false,
        count: row?.save_count ?? 0,
      });
    }

    case "follow": {
      const authorKey =
        typeof body.authorKey === "string" ? body.authorKey.slice(0, 200) : "";
      if (!authorKey) {
        return NextResponse.json({ error: "Unknown author." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("feed_toggle_follow", {
        p_author_key: authorKey,
      });
      if (error) return failed(error.message);
      const row = data?.[0];
      return NextResponse.json({
        following: row?.following ?? false,
        count: row?.follower_count ?? 0,
      });
    }

    case "share": {
      const { data, error } = await supabase.rpc("feed_record_share", {
        p_post: postId!,
      });
      if (error) return failed(error.message);
      return NextResponse.json({ count: data ?? 0 });
    }

    case "download": {
      const fileId = typeof body.fileId === "string" ? body.fileId : "";
      if (!UUID.test(fileId)) {
        return NextResponse.json({ error: "Unknown file." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("feed_record_download", {
        p_file: fileId,
      });
      if (error) return failed(error.message);
      return NextResponse.json({ count: data ?? 0 });
    }

    case "hide": {
      const { error } = await supabase
        .from("feed_hidden")
        .upsert({ post_id: postId!, user_id: user!.id });
      if (error) return failed(error.message);
      return NextResponse.json({ hidden: true });
    }

    case "unhide": {
      const { error } = await supabase
        .from("feed_hidden")
        .delete()
        .eq("post_id", postId!)
        .eq("user_id", user!.id);
      if (error) return failed(error.message);
      return NextResponse.json({ hidden: false });
    }

    case "report": {
      const reason =
        typeof body.reason === "string" &&
        (REPORT_REASONS as readonly string[]).includes(body.reason)
          ? body.reason
          : "other";
      const detail =
        typeof body.detail === "string" ? body.detail.slice(0, 2000) : null;

      const { error } = await supabase.from("feed_reports").upsert({
        post_id: postId!,
        reporter_id: user!.id,
        reason,
        detail,
      });
      if (error) return failed(error.message);

      // Reporting also hides it. Someone who has just told us a post is spam
      // should not have to scroll past it again.
      await supabase
        .from("feed_hidden")
        .upsert({ post_id: postId!, user_id: user!.id });

      return NextResponse.json({ reported: true });
    }

    case "view": {
      const ids = Array.isArray(body.postIds)
        ? body.postIds.filter(
            (value): value is string =>
              typeof value === "string" && UUID.test(value),
          )
        : [];
      if (ids.length === 0) return NextResponse.json({ recorded: 0 });

      const { error } = await supabase.rpc("feed_record_views", {
        p_posts: ids.slice(0, 40),
      });
      if (error) return failed(error.message);
      return NextResponse.json({ recorded: ids.length });
    }

    case "comment-like": {
      const commentId =
        typeof body.commentId === "string" ? body.commentId : "";
      if (!UUID.test(commentId)) {
        return NextResponse.json({ error: "Unknown comment." }, { status: 400 });
      }

      // No RPC for this one: a comment like is a single row and the toggle
      // reads cleanly here.
      const { data: existing } = await supabase
        .from("feed_comment_likes")
        .select("comment_id")
        .eq("comment_id", commentId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("feed_comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user!.id);
      } else {
        await supabase
          .from("feed_comment_likes")
          .insert({ comment_id: commentId, user_id: user!.id });
      }

      const { data: comment } = await supabase
        .from("feed_comments")
        .select("like_count")
        .eq("id", commentId)
        .maybeSingle();

      return NextResponse.json({
        liked: !existing,
        count: comment?.like_count ?? 0,
      });
    }
  }
}

/**
 * One shape for every database failure.
 *
 * The reason goes to the server log; the reader gets a sentence. A Postgres
 * error string can name a table, a constraint or a policy, and none of that
 * belongs in a browser.
 */
function failed(reason: string) {
  console.error(`[medosha:feed] interaction failed: ${reason}`);
  return NextResponse.json(
    { error: "That did not go through. Try again in a moment." },
    { status: 502 },
  );
}
