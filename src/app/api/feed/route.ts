import { NextResponse } from "next/server";

import { getFeedPage } from "@/lib/data/feed";
import {
  FEED_PAGE_SIZE,
  filterById,
  isFeedKind,
  isFeedTopic,
  type FeedKind,
  type FeedTopic,
} from "@/lib/feed/constants";

/**
 * The next page of the feed.
 *
 * A route handler rather than a server action because infinite scroll fires
 * on a scroll position, not on a user gesture: actions queue behind the
 * router and cannot be abandoned, so a reader who scrolls fast would build a
 * backlog of requests nobody is waiting for. A fetch can be aborted.
 *
 * The cursor is opaque to the client — it hands back whatever it was given.
 * Both halves are validated here anyway, because "opaque" is a convention and
 * the query string is user input.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A ranking score: a plain decimal, optionally negative. */
const SCORE = /^-?\d{1,12}(\.\d{1,6})?$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = Math.min(
    Math.max(Number(searchParams.get("limit")) || FEED_PAGE_SIZE, 1),
    24,
  );

  const cursorScore = searchParams.get("score");
  const cursorId = searchParams.get("after");
  const cursorNow = searchParams.get("now");

  // All three or none. A half-formed cursor would silently restart the feed
  // from the top, which reads as the scroll jumping.
  const cursor =
    cursorScore && cursorId && cursorNow &&
    SCORE.test(cursorScore) &&
    UUID.test(cursorId) &&
    !Number.isNaN(Date.parse(cursorNow))
      ? { score: cursorScore, id: cursorId, now: cursorNow }
      : null;

  // An explicit kind list wins; otherwise the named filter chip decides.
  const explicitKinds = searchParams
    .getAll("kind")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(isFeedKind);

  const chip = filterById(searchParams.get("filter"));

  const kinds: FeedKind[] | null =
    explicitKinds.length > 0 ? explicitKinds : (chip.kinds ?? null);

  const explicitTopics: FeedTopic[] = searchParams
    .getAll("topic")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(isFeedTopic);

  const page = await getFeedPage({
    limit,
    cursor,
    kinds,
    topics: explicitTopics.length > 0 ? explicitTopics : (chip.topics ?? null),
    authorKey: searchParams.get("author"),
    savedOnly: searchParams.get("saved") === "1",
    followingOnly: searchParams.get("following") === "1",
    search: searchParams.get("q"),
  });

  return NextResponse.json(page, {
    // Personalised: the ranking depends on who is asking, so a shared cache
    // would hand one reader another reader's feed.
    headers: { "Cache-Control": "private, no-store" },
  });
}
