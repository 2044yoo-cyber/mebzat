import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { moderate } from "./service";
import type { ModerationOutcome } from "./types";

/**
 * Video, handled honestly.
 *
 * The brief asks for representative frames to be extracted and checked as
 * images. That needs a decoder — ffmpeg in a worker, or a transcoding service —
 * and Medosha has neither today. So this does not pretend to.
 *
 * What it does instead is the safe half: a video is recorded, quarantined, and
 * sent to `review`. It is never published automatically, which is exactly what
 * the brief asks for when the check is uncertain — and "we cannot check this at
 * all" is the most uncertain a check can be.
 *
 * `extractFrames` is where the real implementation goes. It is a named,
 * documented gap rather than a silent one: a video that quietly published
 * because nobody wired up ffmpeg is the failure this file exists to prevent.
 */

export type FrameExtractor = (
  video: { path: string; bucket: string },
  count: number,
) => Promise<string[]>;

/**
 * Swapped in when frame extraction exists.
 *
 * Left null deliberately. A stub returning an empty array would make
 * `moderateVideo` look as though it had checked something and found nothing
 * wrong, which is the difference between an honest gap and a dangerous one.
 */
let extractFrames: FrameExtractor | null = null;

export function registerFrameExtractor(extractor: FrameExtractor): void {
  extractFrames = extractor;
}

export function hasFrameExtraction(): boolean {
  return extractFrames !== null;
}

export async function moderateVideo(input: {
  client: SupabaseClient;
  userId: string;
  contentId?: string;
  quarantinePath: string;
  /** Title, description, caption — checked even when the frames cannot be. */
  text?: string;
  signal?: AbortSignal;
}): Promise<ModerationOutcome> {
  const frames = extractFrames
    ? await extractFrames(
        { path: input.quarantinePath, bucket: "moderation-quarantine" },
        Number(process.env.MODERATION_VIDEO_FRAMES ?? 5),
      ).catch(() => [])
    : [];

  // Metadata is checked whatever happens to the frames. A video whose title is
  // a solicitation does not need decoding to be refused.
  const base = await moderate({
    client: input.client,
    userId: input.userId,
    contentType: "video",
    contentId: input.contentId,
    text: input.text,
    // The first frame, when there is one. The rest are checked below.
    image: frames[0],
    quarantinePath: input.quarantinePath,
    signal: input.signal,
  });

  // No extractor, or extraction failed: a person looks. Never published on the
  // strength of a title alone.
  if (frames.length === 0) {
    return { ...base, status: base.status === "blocked" ? "blocked" : "review" };
  }

  for (const frame of frames.slice(1)) {
    const outcome = await moderate({
      client: input.client,
      userId: input.userId,
      contentType: "video",
      contentId: input.contentId,
      image: frame,
      quarantinePath: input.quarantinePath,
      signal: input.signal,
    });
    // One bad frame is a bad video.
    if (outcome.status === "blocked") return outcome;
    if (outcome.status === "review") return outcome;
  }

  return base;
}
