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
 * Every part of it is validated here anyway, because "opaque" is a convention
 * and the query string is user input.
 *
 * ## Why there is a POST as well
 *
 * A signed-out reader has no history in the database, so their browser sends
 * back the ids it has already been shown. Four hundred uuids is fourteen
 * kilobytes, which is past what a URL can carry and well past what a proxy
 * will log without truncating. So the same request exists twice: GET for the
 * ordinary case, POST when there is a seen list to send. Both funnel into one
 * function, because two copies of the parameter parsing is how the two drift.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A ranking score: a plain decimal, optionally negative. */
const SCORE = /^-?\d{1,12}(\.\d{1,6})?$/;

async function page(params: URLSearchParams, seenIds: string[] | null) {
  const limit = Math.min(
    Math.max(Number(params.get("limit")) || FEED_PAGE_SIZE, 1),
    24,
  );

  const cursorScore = params.get("score");
  const cursorId = params.get("after");
  const cursorNow = params.get("now");
  const cursorSeed = Number(params.get("seed"));

  // All four or none. A half-formed cursor would silently restart the feed
  // from the top, which reads as the scroll jumping.
  const cursor =
    cursorScore && cursorId && cursorNow &&
    SCORE.test(cursorScore) &&
    UUID.test(cursorId) &&
    Number.isInteger(cursorSeed) &&
    cursorSeed >= 0 &&
    !Number.isNaN(Date.parse(cursorNow))
      ? { score: cursorScore, id: cursorId, now: cursorNow, seed: cursorSeed }
      : null;

  // An explicit kind list wins; otherwise the named filter chip decides.
  const explicitKinds = params
    .getAll("kind")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(isFeedKind);

  const chip = filterById(params.get("filter"));

  const kinds: FeedKind[] | null =
    explicitKinds.length > 0 ? explicitKinds : (chip.kinds ?? null);

  const explicitTopics: FeedTopic[] = params
    .getAll("topic")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(isFeedTopic);

  return getFeedPage({
    limit,
    cursor,
    kinds,
    topics: explicitTopics.length > 0 ? explicitTopics : (chip.topics ?? null),
    authorKey: params.get("author"),
    savedOnly: params.get("saved") === "1",
    followingOnly: params.get("following") === "1",
    search: params.get("q"),
    seenIds,
  });
}

// Personalised: the ranking depends on who is asking, so a shared cache would
// hand one reader another reader's feed.
const HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await page(searchParams, null), { headers: HEADERS });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  // Filtered to well-formed uuids rather than trusted. getFeedPage caps the
  // length and ignores the list entirely for a signed-in reader, so the worst
  // this can do is ask the database to ignore posts the sender has already
  // been shown — which is the request.
  const seenIds = Array.isArray(body.seen)
    ? body.seen.filter(
        (value): value is string => typeof value === "string" && UUID.test(value),
      )
    : [];

  return NextResponse.json(await page(searchParams, seenIds), {
    headers: HEADERS,
  });
}
