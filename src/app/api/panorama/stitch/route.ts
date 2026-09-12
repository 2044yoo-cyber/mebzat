import { NextResponse } from "next/server";

import { composePanorama, type FrameInput } from "@/lib/panorama/compose";
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

/**
 * Record which part of the stitch is happening, for the progress screen.
 *
 * Deliberately not awaited at the callsites and deliberately unable to fail
 * the request: this is the difference between a screen that says "Optimizing"
 * and one that says "Stitching panorama" for a second longer. A stitch that
 * worked must not be reported as failed because a progress note did not land.
 */
function stage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  name: "aligning" | "stitching" | "optimizing",
) {
  void supabase
    .from("panorama_jobs")
    .update({ stage: name })
    .eq("id", jobId)
    .then(undefined, () => undefined);
}

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
    .select("id, owner_id, frames_prefix, expected_frames, status, frames")
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

  // The poses the phone recorded, which are the stitcher's starting estimate.
  // Without them there is nothing to stitch from: forty photographs of a room
  // with no idea which way any of them was facing is a jigsaw with the picture
  // on the box thrown away.
  const poses = readPoses(job.frames);
  if (poses.size < MIN_SPHERE_FRAMES) {
    return fail(supabase, jobId, "too_few_frames");
  }

  await supabase
    .from("panorama_jobs")
    .update({ status: "processing", stage: "aligning" })
    .eq("id", jobId);

  // ---- gather the frames ------------------------------------------------
  const { data: listing, error: listError } = await supabase.storage
    .from("panorama-frames")
    .list(prefix, { limit: 80 });

  if (listError || !listing) {
    return fail(supabase, jobId, "frames_missing");
  }

  const wanted = listing
    .map((entry) => ({ name: entry.name, pose: poses.get(entry.name) }))
    .filter(
      (entry): entry is { name: string; pose: Pose } => entry.pose !== undefined,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (wanted.length < MIN_SPHERE_FRAMES) {
    return fail(supabase, jobId, "too_few_frames");
  }

  const frames: FrameInput[] = [];
  for (const entry of wanted.slice(0, MAX_SPHERE_FRAMES)) {
    const { data, error } = await supabase.storage
      .from("panorama-frames")
      .download(`${prefix}/${entry.name}`);
    if (error || !data) {
      return fail(supabase, jobId, "frames_missing");
    }
    frames.push({
      yaw: entry.pose.yaw,
      pitch: entry.pose.pitch,
      roll: entry.pose.roll,
      hfov: entry.pose.fov,
      bytes: new Uint8Array(await data.arrayBuffer()),
    });
  }

  // ---- stitch ------------------------------------------------------------
  stage(supabase, jobId, "stitching");
  const outcome = await composePanorama(frames);
  if (!outcome.ok) {
    return fail(supabase, jobId, outcome.code);
  }

  // ---- publish it the way every other image is published ------------------
  stage(supabase, jobId, "optimizing");
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
      stage: null,
    })
    .eq("id", jobId);

  return NextResponse.json({
    status: "ready",
    panoramaUrl: publicUrl,
    width: outcome.width,
    height: outcome.height,
    weakSeams: outcome.weakSeams,
    covered: outcome.covered,
  });
}

/** Fewest frames that can cover a sphere well enough to be worth stitching. */
const MIN_SPHERE_FRAMES = 20;
const MAX_SPHERE_FRAMES = 60;

type Pose = { yaw: number; pitch: number; roll: number; fov: number };

/**
 * The recorded poses, by frame name, with anything malformed left out.
 *
 * This column is written by a browser, so every number in it is a number a
 * client chose. None of them can do any harm — a wrong pose makes a worse
 * panorama for the person who sent it and nobody else — but a string where a
 * number should be would crash the compositor, and a pitch of 4000 would send
 * it looking outside its own canvas. So each one is checked and the frame is
 * dropped rather than the request failed.
 */
function readPoses(value: unknown): Map<string, Pose> {
  const poses = new Map<string, Pose>();
  if (!Array.isArray(value)) return poses;

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : null;
    if (!name) continue;

    const yaw = finite(row.yaw);
    const pitch = finite(row.pitch);
    const roll = finite(row.roll);
    if (yaw === null || pitch === null || roll === null) continue;
    if (pitch < -90 || pitch > 90) continue;

    const fov = finite(row.fov);
    poses.set(name, {
      yaw: ((yaw % 360) + 360) % 360,
      pitch,
      roll,
      fov: fov !== null && fov >= 20 && fov <= 120 ? fov : 60,
    });
  }

  return poses;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
      stage: null,
      frames_expire_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", jobId);

  // 200, not 500: the request did what it was asked to do, and the answer is
  // that the stitch did not work. A 500 would be retried by a proxy, and
  // retrying a stitch that failed for want of overlap produces the same
  // failure at the same cost.
  return NextResponse.json({ status: "failed", code });
}
