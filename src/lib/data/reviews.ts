import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Review, ReviewSubject } from "@/types/database.types";

/** Reads for reviews, across every kind of subject. */

export type ReviewRow = Review & {
  author: {
    id: string;
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type ReviewSummary = {
  average: number;
  total: number;
  /** Count per star, index 0 = one star … index 4 = five stars. */
  histogram: [number, number, number, number, number];
};

export const EMPTY_SUMMARY: ReviewSummary = {
  average: 0,
  total: 0,
  histogram: [0, 0, 0, 0, 0],
};

export async function getReviews(
  subjectType: ReviewSubject,
  subjectId: string,
  limit = 20,
): Promise<ReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(
      "*, author:profiles!author_id(id, username, full_name, company_name, avatar_url)",
    )
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    // Verified reviews first: they are the ones backed by a transaction.
    .order("verified", { ascending: false })
    .order("helpful_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as ReviewRow[];
}

export async function getReviewSummary(
  subjectType: ReviewSubject,
  subjectId: string,
): Promise<ReviewSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_summary", {
    subject: subjectType,
    subject_uuid: subjectId,
  });

  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return EMPTY_SUMMARY;

  return {
    average: Number(row.average ?? 0),
    total: Number(row.total ?? 0),
    histogram: [
      Number(row.one ?? 0),
      Number(row.two ?? 0),
      Number(row.three ?? 0),
      Number(row.four ?? 0),
      Number(row.five ?? 0),
    ],
  };
}

/** The viewer's own review of a subject, so the form can edit rather than add. */
export async function getMyReview(
  subjectType: ReviewSubject,
  subjectId: string,
  userId: string | null,
): Promise<Review | null> {
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .eq("author_id", userId)
    .maybeSingle();

  return data;
}

/**
 * Recent reviews across the whole platform, for the homepage.
 *
 * Only four and five star ones: the homepage band is social proof, and a
 * mixed sample there would be a strange thing to put on a shop window while
 * every subject's own page shows the full picture.
 */
export async function getFeaturedReviews(limit = 6): Promise<ReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(
      "*, author:profiles!author_id(id, username, full_name, company_name, avatar_url)",
    )
    .gte("rating", 4)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as ReviewRow[];
}
