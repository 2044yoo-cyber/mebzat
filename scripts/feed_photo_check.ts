import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { samplePostMedia } from "../src/lib/feed/sample-photos";
import type { FeedMedia } from "../src/lib/feed/types";

const seed = readFileSync("supabase/migrations/0027_feed_seed.sql", "utf8").split("with art (slug, position, image, alt, label) as (")[1]!.split(")\ninsert into")[0]!;
const entries = [...seed.matchAll(/\('([^']+)', (\d+), '([^']+)', '([^']+)', (null|'[^']+')\)/g)];
assert.equal(entries.length, 68);
for (const [, slug, position, category] of entries) {
  const hash = createHash("md5").update(`medosha:feed:media:${slug}:${position}`).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
  const original: FeedMedia = { id, kind: "image", url: `/images/feed/${category}.svg`, alt: "Original", posterUrl: null, label: null, durationSeconds: null, width: 1200, height: 900 };
  const replacement = samplePostMedia({ isDemo: true, media: [original] })[0]!;
  assert.equal(replacement.url, `/images/feed/photos/${slug!.replaceAll("-", "_")}_${position}.webp`);
  assert.ok(replacement.alt?.startsWith("AI-generated illustration:"));
  assert.ok(existsSync(`public${replacement.url}`), replacement.url);
  const bytes = readFileSync(`public${replacement.url}`);
  assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
  assert.equal(samplePostMedia({ isDemo: false, media: [original] })[0], original, "Real user post remains untouched");
  const uploaded = { ...original, url: "https://example.com/user-photo.jpg" };
  assert.equal(samplePostMedia({ isDemo: true, media: [uploaded] })[0], uploaded, "Updated user photo must win");
  const unknown = { ...original, id: "another-media-id" };
  assert.equal(samplePostMedia({ isDemo: true, media: [unknown] })[0], unknown, "Unrelated media must not change");
  const video = { ...original, kind: "video" as const };
  assert.equal(samplePostMedia({ isDemo: true, media: [video] })[0], video);
}
console.log("68 sample photos verified; real uploads and videos preserved.");
