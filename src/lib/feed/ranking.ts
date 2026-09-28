import type { FeedPost } from "@/lib/feed/types";

/** Reorders one ranked page without changing membership or cursor semantics. */
export function diversifyFeed(posts: FeedPost[]): FeedPost[] {
  const remaining = [...posts];
  const result: FeedPost[] = [];

  while (remaining.length > 0) {
    const last = result.at(-1);
    const previous = result.at(-2);
    const pick = remaining.findIndex((candidate) => {
      const threeSameKind = last?.kind === candidate.kind && previous?.kind === candidate.kind;
      const threeSameTopic = last?.topic === candidate.topic && previous?.topic === candidate.topic;
      const sameCreator = last?.authorKey === candidate.authorKey;
      return !threeSameKind && !threeSameTopic && !sameCreator;
    });
    result.push(remaining.splice(pick < 0 ? 0 : pick, 1)[0]!);
  }

  return result;
}
