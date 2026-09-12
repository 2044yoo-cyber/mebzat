import { NextResponse } from "next/server";

import { composePanorama, type FrameInput } from "@/lib/panorama/compose";
import { MAX_FRAMES, MIN_FRAMES } from "@/lib/panorama/stitch";
import { moderate, publishApproved } from "@/lib/moderation/service";
import { createClient } from "@/lib/supabase/server";

/**
 * Stitch one capture into one panorama.
 *
 * ## Why this is a route and not a queue
 *
 * The brief asks for asynchronous processing so that leaving the screen does
 * not lose the upload, and that is what this is — just without a broker. The
 * frames are already in storage and the outcome is already a row in
 * `panorama_jobs`, so the client is free to navigate away the instant it has
 * fired this off: the work finishes on the server and the row records what
 * happened. Coming back and reading the row is the whole of "resuming".
 *
 * A queue would buy retries across a deploy and nothing else here. Nine frames
 * take around a second of `sharp`; `maxDuration` gives three minutes, which is
 * two orders of magnitude of headroom, and the app already runs routes at this
 * limit for image generation.
 *
 * ## The stitched image is moderated like any other upload
 *
 * It goes to `moderation-quarantine` first and reaches the public `panoramas`
 * bucket only through `publishApproved`, exactly as a hand-uploaded panorama
 * does. It is a photograph of the inside of a room taken on a phone; that it
 * passed through a compositor on the way does not make it different.
 */

export const runtime = "nodejs";
// Nine frames is about a second. This is the ceiling for a slow upload of
// twelve large frames on a cold start, not the expected time.
export const maxDuration = 180;

type Body = { jobId?: unknown };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : null;
  if (!jobId) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // RLS restricts this to the caller's own jobs, so a job id belonging to
  // somebody else simply is not found rather than being refused with a
  // message that confirms it exists.
  const { data: job } = await supabase
    .from("panorama_jobs")
    .select("id, owner_id, frames_prefix, expected_frames, status")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (job.status === "ready") {
    return NextResponse.json({ status: "ready" });
  }

  const prefix = job.frames_prefix as string | null;
  if (!prefix) {
    return fail(supabase, jobId, "frames_missing");
  }

  await supabase
    .from("panorama_jobs")
    .update({ status: "processing" })
    .eq("id", jobId);

  // ---- gather the frames ------------------------------------------------
  const { data: listing, error: listError } = await supabase.storage
    .from("panorama-frames")
    .list(prefix, { limit: 64 });

  if (listError || !listing) {
    return fail(supabase, jobId, "frames_missing");
  }

  const wanted = listing
    .map((entry) => ({ name: entry.name, yaw: yawFromName(entry.name) }))
    .filter((entry): entry is { name: string; yaw: number } => entry.yaw !== null)
    .sort((a, b) => a.yaw - b.yaw);

  if (wanted.length < MIN_FRAMES) {
    return fail(supabase, jobId, "too_few_frames");
  }

  const frames: FrameInput[] = [];
  for (const entry of wanted.slice(0, MAX_FRAMES)) {
    const { data, error } = await supabase.storage
      .from("panorama-frames")
      .download(`${prefix}/${entry.name}`);
    if (error || !data) {
      return fail(supabase, jobId, "frames_missing");
    }
    frames.push({
      yaw: entry.yaw,
      bytes: new Uint8Array(await data.arrayBuffer()),
    });
  }

  // ---- stitch ------------------------------------------------------------
  const outcome = await composePanorama(frames);
  if (!outcome.ok) {
    return fail(supabase, jobId, outcome.code);
  }

  // ---- publish it the way every other image is published ------------------
  const quarantinePath = `${user.id}/${crypto.randomUUID()}.jpg`;
  const stored = await supabase.storage
    .from("moderation-quarantine")
    .upload(quarantinePath, outcome.jpeg, { contentType: "image/jpeg" });

  if (stored.error) {
    return fail(supabase, jobId, "unknown");
  }

  const verdict = await moderate({
    client: supabase,
    userId: user.id,
    contentType: "panorama",
    quarantinePath,
  });

  if (verdict.status === "blocked") {
    return fail(supabase, jobId, "blocked");
  }

  const publicUrl = await publishApproved(
    supabase,
    verdict.itemId ?? null,
    quarantinePath,
    "panoramas",
    "image/jpeg",
    { userId: user.id, contentType: "panorama" },
  );

  if (!publicUrl) {
    return fail(supabase, jobId, "unknown");
  }

  // The frames have done their job. Section 16: they are kept briefly in case
  // the person wants to try again with different settings, and not longer.
  const keepUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  // `panorama_url` and `ready` are refused to a browser session by 0081's
  // trigger, which is the point: this route is the only thing that can say a
  // panorama exists. It reaches the row as the caller, so the update runs
  // under the same policy — but the values it writes are ones it computed,
  // not ones the client sent.
  await supabase
    .from("panorama_jobs")
    .update({
      status: "ready",
      panorama_url: publicUrl,
      width: outcome.width,
      height: outcome.height,
      frames_expire_at: keepUntil,
      error_code: null,
    })
    .eq("id", jobId);

  return NextResponse.json({
    status: "ready",
    panoramaUrl: publicUrl,
    width: outcome.width,
    height: outcome.height,
    weakSeams: outcome.weakSeams,
  });
}

/**
 * The frame's angle, from its name.
 *
 * The capture screen writes `003_120.jpg` — the third frame, taken at 120°.
 * Reading the angle off the name rather than out of a second table means the
 * stitcher needs exactly one thing from storage, and a frame that failed to
 * upload is simply a frame that is not in the listing.
 */
function yawFromName(name: string): number | null {
  const match = /^\d+_(\d{1,3})\./.exec(name);
  if (!match) return null;
  const yaw = Number(match[1]);
  return Number.isFinite(yaw) && yaw >= 0 && yaw < 360 ? yaw : null;
}

async function fail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  code: string,
) {
  // The frames are kept for a day when a stitch fails, so the person can retry
  // without turning around the room again.
  await supabase
    .from("panorama_jobs")
    .update({
      status: "failed",
      error_code: code,
      frames_expire_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", jobId);

  // 200, not 500: the request did what it was asked to do, and the answer is
  // that the stitch did not work. A 500 would be retried by a proxy, and
  // retrying a stitch that failed for want of overlap produces the same
  // failure at the same cost.
  return NextResponse.json({ status: "failed", code });
}
