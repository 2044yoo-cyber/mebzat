export type RankablePost = {
  id: string;
  kind: string | null;
  topic: string | null;
  author_id: string | null;
  company_id: string | null;
  like_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  share_count: number | null;
  view_count: number | null;
  boost: number | null;
  published_at: string | null;
};

export type FeedSignals = {
  liked: Set<string>;
  saved: Set<string>;
  viewed: Map<string, number>;
  followedProfiles: Set<string>;
  followedCompanies: Set<string>;
  role?: string | null;
};

const ROLE_TOPIC_HINTS: Record<string, string[]> = {
  real_estate_agent: ['property', 'finance'],
  architect: ['design', 'construction'],
  interior_designer: ['design', 'materials'],
  contractor: ['construction', 'materials', 'equipment'],
  engineer: ['construction', 'equipment', 'learning'],
  supplier: ['materials', 'equipment'],
};

export function rankFeed<T extends RankablePost>(posts: T[], signals: FeedSignals): T[] {
  const kindAffinity = new Map<string, number>();
  const topicAffinity = new Map<string, number>();
  const byId = new Map(posts.map((p) => [p.id, p]));
  const addAffinity = (postId: string, weight: number) => {
    const post = byId.get(postId);
    if (!post) return;
    if (post.kind) kindAffinity.set(post.kind, (kindAffinity.get(post.kind) ?? 0) + weight);
    if (post.topic) topicAffinity.set(post.topic, (topicAffinity.get(post.topic) ?? 0) + weight);
  };
  signals.liked.forEach((id) => addAffinity(id, 5));
  signals.saved.forEach((id) => addAffinity(id, 8));
  signals.viewed.forEach((count, id) => addAffinity(id, Math.min(3, count) * 0.7));
  const roleKey = (signals.role ?? '').toLowerCase().replace(/\s+/g, '_');
  for (const topic of ROLE_TOPIC_HINTS[roleKey] ?? []) topicAffinity.set(topic, (topicAffinity.get(topic) ?? 0) + 2.5);
  const now = Date.now();
  const scored = posts.map((post) => {
    const ageHours = post.published_at ? Math.max(0, (now - new Date(post.published_at).getTime()) / 3_600_000) : 9999;
    const freshness = Math.max(0, 16 - Math.log2(ageHours + 2) * 2.3);
    const engagement = Math.log1p((post.like_count ?? 0) * 2 + (post.comment_count ?? 0) * 3 + (post.save_count ?? 0) * 4 + (post.share_count ?? 0) * 2 + (post.view_count ?? 0) * 0.15);
    const affinity = (post.kind ? kindAffinity.get(post.kind) ?? 0 : 0) + (post.topic ? topicAffinity.get(post.topic) ?? 0 : 0);
    const following = (post.author_id && signals.followedProfiles.has(post.author_id) ? 18 : 0) + (post.company_id && signals.followedCompanies.has(post.company_id) ? 18 : 0);
    const seenPenalty = Math.min(18, (signals.viewed.get(post.id) ?? 0) * 4.5);
    const explicitBoost = Number(post.boost ?? 0) * 4;
    return { post, score: freshness + engagement + affinity + following + explicitBoost - seenPenalty };
  }).sort((a, b) => b.score - a.score);
  const output: T[] = [];
  const pool = [...scored];
  while (pool.length && output.length < posts.length) {
    const recent = output.slice(-2);
    let pick = 0;
    for (let i = 0; i < Math.min(pool.length, 10); i++) {
      const candidate = pool[i].post;
      const repeatsKind = Boolean(candidate.kind && recent.length === 2 && recent.every((p) => p.kind === candidate.kind));
      const repeatsTopic = Boolean(candidate.topic && recent.length === 2 && recent.every((p) => p.topic === candidate.topic));
      if (!repeatsKind && !repeatsTopic) { pick = i; break; }
    }
    output.push(pool.splice(pick, 1)[0].post);
  }
  return output;
}
