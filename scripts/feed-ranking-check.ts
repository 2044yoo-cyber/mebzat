import assert from "node:assert/strict";

import { diversifyFeed } from "../src/lib/feed/ranking";
import type { FeedPost } from "../src/lib/feed/types";

const make = (id: string, kind: FeedPost["kind"], authorKey: string) =>
  ({ id, kind, authorKey, topic: kind === "property" || kind === "tour_360" ? "property" : "community" }) as FeedPost;

const input = [
  make("1", "discussion", "a"),
  make("2", "discussion", "a"),
  make("3", "discussion", "b"),
  make("4", "property", "c"),
  make("5", "tour_360", "d"),
  make("6", "ai_design", "e"),
];
const output = diversifyFeed(input);

assert.deepEqual(new Set(output.map((post) => post.id)), new Set(input.map((post) => post.id)));
for (let index = 1; index < output.length; index += 1) {
  assert.notEqual(output[index]?.authorKey, output[index - 1]?.authorKey);
}
for (let index = 2; index < output.length; index += 1) {
  assert.ok(new Set(output.slice(index - 2, index + 1).map((post) => post.kind)).size > 1);
  assert.ok(new Set(output.slice(index - 2, index + 1).map((post) => post.topic)).size > 1);
}
console.log("feed diversity checks passed");
