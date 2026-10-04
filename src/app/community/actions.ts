"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { PostKind } from "@/types/database.types";

export type CommunityResult = { error?: string; id?: string };

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

/**
 * Likes or unlikes a post.
 *
 * A toggle rather than separate actions: the button has one meaning to the
 * person pressing it, and the count is recomputed by trigger either way.
 */
export async function toggleLike(postId: string): Promise<CommunityResult> {
  const { supabase, user } = await requireUser(`/community/${postId}`);

  const { data: existing } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id)
    : await supabase
        .from("post_likes")
        .insert({ post_id: postId, user_id: user.id });

  if (error) return { error: "Could not update that like." };

  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
  return {};
}

export async function createPost(input: {
  kind: PostKind;
  title?: string;
  body: string;
}): Promise<CommunityResult> {
  const { supabase, user } = await requireUser("/community");

  const body = input.body.trim();
  if (body.length < 2) return { error: "Write something first." };
  if (body.length > 20_000) return { error: "That post is too long." };

  const title = input.title?.trim().slice(0, 200) || null;

  const { data, error } = await supabase
    .from("posts")
    .insert({
      author_id: user.id,
      kind: input.kind,
      title,
      body,
    })
    .select("id")
    .single();

  // Hashtags are extracted by trigger from the title and body, so nothing
  // here has to parse them or keep them in step.
  if (error || !data) return { error: "Could not publish that post." };

  revalidatePath("/community");
  return { id: data.id };
}

export async function addComment(
  postId: string,
  body: string,
  parentId?: string,
): Promise<CommunityResult> {
  const { supabase, user } = await requireUser(`/community/${postId}`);

  const text = body.trim();
  if (text.length < 1) return { error: "Write a comment first." };
  if (text.length > 5000) return { error: "That comment is too long." };

  const { error } = await supabase.from("post_comments").insert({
    post_id: postId,
    author_id: user.id,
    parent_id: parentId ?? null,
    body: text,
  });

  if (error) return { error: "Could not post that comment." };

  revalidatePath(`/community/${postId}`);
  return {};
}

export async function deletePost(postId: string): Promise<CommunityResult> {
  const { supabase, user } = await requireUser("/community");

  // RLS already restricts this to the author; the filter makes the intent
  // explicit and turns a policy violation into a plain no-op.
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id);

  if (error) return { error: "Could not delete that post." };

  revalidatePath("/community");
  return {};
}

/** Follows or unfollows a profile, company or hashtag. */
export async function toggleFollow(
  targetType: "profile" | "company" | "hashtag",
  targetId: string,
): Promise<CommunityResult> {
  const { supabase, user } = await requireUser("/community");

  const { data: existing } = await supabase
    .from("follows")
    .select("target_id")
    .eq("follower_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("target_type", targetType)
        .eq("target_id", targetId)
    : await supabase.from("follows").insert({
        follower_id: user.id,
        target_type: targetType,
        target_id: targetId,
      });

  if (error) return { error: "Could not update that follow." };

  revalidatePath("/community");
  return {};
}
