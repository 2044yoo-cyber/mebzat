import type { FeedFileKind, FeedKind, FeedTopic } from "@/lib/feed/constants";

/**
 * The shape a feed card receives.
 *
 * Deliberately flat and already camel-cased: the ranking function returns
 * snake_case columns and a jsonb blob for media, and every card would
 * otherwise carry the translation. `normalizeFeedPost` in
 * `@/lib/data/feed` is the single place that conversion happens.
 */

export type FeedMedia = {
  id: string;
  kind: "image" | "video";
  url: string;
  posterUrl: string | null;
  alt: string | null;
  /** "Before" / "After" on a comparison card; null everywhere else. */
  label: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

export type FeedFile = {
  id: string;
  fileKind: FeedFileKind;
  name: string;
  url: string;
  sizeBytes: number | null;
  downloadCount: number;
};

export type FeedPost = {
  id: string;
  kind: FeedKind;
  topic: FeedTopic;
  title: string;
  body: string | null;

  authorId: string | null;
  authorKey: string;
  authorName: string;
  /** Set for a real member; null for seeded content, which has no profile. */
  authorUsername: string | null;
  authorRole: string | null;
  authorAvatarUrl: string | null;
  authorLocation: string | null;
  authorVerified: boolean;
  companyId: string | null;

  linkHref: string | null;
  linkLabel: string | null;
  entityType: string | null;
  entityId: string | null;

  priceAmount: number | null;
  priceCurrency: string;
  priceUnit: string | null;
  /** Percent movement on a price card. Negative is a fall. */
  priceChange: number | null;

  city: string | null;
  region: string | null;
  tags: string[];

  likeCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  viewCount: number;
  downloadCount: number;

  isDemo: boolean;
  publishedAt: string;

  media: FeedMedia[];
  files: FeedFile[];

  viewerLiked: boolean;
  viewerSaved: boolean;
  viewerFollows: boolean;

  /** The ranking score. Carried back as the pagination cursor. */
  score: string;
};

/**
 * One page of the feed.
 *
 * `cursor` is null when there is nothing after this page — the client stops
 * asking rather than requesting an empty page to discover the end.
 */
export type FeedPage = {
  posts: FeedPost[];
  cursor: FeedCursor | null;
  /** False when the feed tables are not installed, so the page can say so. */
  available: boolean;
};

export type FeedCursor = {
  score: string;
  id: string;
  /** The clock the first page was ranked against, threaded through the rest
   *  so age decay does not shift under the reader mid-scroll. */
  now: string;
};

export type FeedComment = {
  id: string;
  parentId: string | null;
  depth: number;
  body: string;
  imageUrl: string | null;
  likeCount: number;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  isDemo: boolean;
  viewerLiked: boolean;
};

export type FeedAuthorSummary = {
  authorKey: string;
  authorId: string | null;
  name: string;
  role: string | null;
  avatarUrl: string | null;
  location: string | null;
  verified: boolean;
  postCount: number;
  followerCount: number;
  contributionScore: number;
};

export type TrendingTag = {
  tag: string;
  postCount: number;
  engagement: number;
};
