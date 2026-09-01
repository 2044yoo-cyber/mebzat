import { NextResponse } from "next/server";

import { getFeedComments } from "@/lib/data/feed";
import { createClient } from "@/lib/supabase/server";

/**
 * The comment thread on a post: read it, and add to it.
 *
 * Comments are fetched on demand rather than shipped with the feed page —
 * twelve cards carrying their full threads would be most of the payload and
 * almost none of it would be read.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4000;
/** An inline data: URI for a photo comment. Roughly 1.5 MB of base64. */
const MAX_IMAGE_CHARS = 2_000_000;

export async function GET(request: Request) {
  const postId = new URL(request.url).searchParams.get("postId") ?? "";
  if (!UUID.test(postId)) {
    return NextResponse.json({ comments: [] });
  }

  const comments = await getFeedComments(postId);
  return NextResponse.json(
    { comments },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const postId = typeof body.postId === "string" ? body.postId : "";
  if (!UUID.test(postId)) {
    return NextResponse.json({ error: "Unknown post." }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Comments are limited to ${MAX_BODY} characters.` },
      { status: 400 },
    );
  }

  const parentId =
    typeof body.parentId === "string" && UUID.test(body.parentId)
      ? body.parentId
      : null;

  // A photo comment. Only data: URIs for real image types are accepted — an
  // arbitrary URL here would let a comment point the browser anywhere.
  let imageUrl: string | null = null;
  if (typeof body.imageUrl === "string" && body.imageUrl.length > 0) {
    const looksRight = /^data:image\/(jpeg|png|webp|gif);base64,/.test(
      body.imageUrl,
    );
    if (!looksRight) {
      return NextResponse.json(
        { error: "That image could not be attached." },
        { status: 400 },
      );
    }
    if (body.imageUrl.length > MAX_IMAGE_CHARS) {
      return NextResponse.json(
        { error: "That image is too large. Try a smaller one." },
        { status: 413 },
      );
    }
    imageUrl = body.imageUrl;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to comment.", needsAuth: true },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("feed_comments")
    .insert({
      post_id: postId,
      parent_id: parentId,
      author_id: user.id,
      body: text,
      image_url: imageUrl,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error(`[medosha:feed] comment insert failed: ${error?.message}`);
    return NextResponse.json(
      { error: "The comment did not post. Try again." },
      { status: 502 },
    );
  }

  // Return the whole thread rather than the one row: the reply has to land in
  // the right place in the tree, and re-reading is cheaper than teaching the
  // client to splice it in at the correct depth.
  const comments = await getFeedComments(postId);
  return NextResponse.json({ id: data.id, comments });
}
