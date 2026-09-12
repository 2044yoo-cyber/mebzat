"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CaptureRules } from "@/components/tour/capture-rules";
import { PanoramaViewer } from "@/components/tour/panorama-viewer";
import {
  STEADY_MS,
  captureManually,
  decide,
  frameName,
  frameWidthFor,
  guidance,
  progress,
  startCapture,
  type CaptureState,
  type Target,
} from "@/lib/panorama/capture";
import {
  forwardOf,
  project,
  rollOf,
  rotationMatrix,
  unsteadiness,
  verticalFov,
  withLocalZero,
  yawPitchOf,
  type Matrix3,
  type Vector3,
} from "@/lib/panorama/orientation";
import { ASSUMED_HFOV } from "@/lib/panorama/sphere";
import { stitchErrorMessage } from "@/lib/panorama/stitch";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Stand in one place and turn around.
 *
 * ## What runs here and what does not
 *
 * The phone does the four things a phone is good at: point the camera, read
 * the compass, shrink the frames, and upload them. The stitching happens on
 * the server. That split is the brief's and it is the right one — a phone
 * doing feature matching on nine full-size frames is the experience this is
 * replacing, where one panorama took an hour.
 *
 * ## Permission is asked for once, when it is needed
 *
 * `getUserMedia` is not called on mount. A camera prompt that appears because
 * somebody opened a page is a prompt they deny, and a denied camera permission
 * is sticky. It is called when they press Start, by which point they have read
 * what it is for.
 *
 * ## The compass is help, not a requirement
 *
 * `deviceorientation` gives `alpha`, which is a heading. Where it exists, the
 * screen fires each frame as the phone reaches the next angle and nobody has
 * to press anything. Where it does not — a desktop, a locked-down browser, iOS
 * without the permission gesture — the same ring is captured by tapping, and
 * the frames are recorded at their *planned* angles rather than measured ones.
 * The stitcher refines the angle from the pixels either way, so a manual
 * capture is a slightly worse starting guess and not a broken panorama.
 */

type Phase =
  | "intro"
  | "rules"
  | "capturing"
  | "paused"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

/**
 * The five steps of section 10, in order.
 *
 * The first is the phone's and the last is the answer; the three in the middle
 * happen on the server, which writes down which one it is on. Nothing here is
 * a percentage, because the server has no honest percentage to give: `sharp`
 * does not report how far through a composite it is, and a bar sitting at 70%
 * is worse than a word.
 */
const STEPS = ["uploading", "aligning", "stitching", "optimizing", "ready"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABEL: Record<Step, string> = {
  uploading: "Uploading",
  aligning: "Aligning photos",
  stitching: "Stitching panorama",
  optimizing: "Optimizing",
  ready: "Ready",
};

/** The stage names 0082 allows, mapped onto the steps shown. */
const STAGE_STEP: Record<string, Step> = {
  aligning: "aligning",
  stitching: "stitching",
  optimizing: "optimizing",
};

export function PanoramaCapture({
  userId,
  onSaved,
  onCancel,
  cancelLabel = "Cancel",
}: {
  /**
   * Whose capture this is. Optional, and resolved from the session when it is
   * not given: the tour builder already knows, the listing form does not, and
   * a component that can answer the question itself is one less prop to thread
   * through a form that has nothing else to do with authentication.
   */
  userId?: string | null;
  /** Called with the finished panorama, for the caller to attach. */
  onSaved: (panorama: { url: string; width: number; height: number }) => void;
  onCancel: () => void;
  /** What backing out of the intro is called, where it is not just "Cancel". */
  cancelLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The live rotation, in the capture's own frame. Read every animation frame. */
  const poseRef = useRef<Matrix3 | null>(null);
  /** The yaw the capture began at, which becomes this capture's zero. */
  const zeroRef = useRef<number | null>(null);
  /** The last few forward vectors, for deciding whether the phone is still. */
  const recentRef = useRef<Vector3[]>([]);
  /** When the phone first became both aligned and steady on the current target. */
  const heldSinceRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  /**
   * The photographs taken so far, each with the pose it was taken at.
   *
   * Section 6: the pose travels with the image, because by the time the
   * stitcher sees it there is nothing in the pixels that says which way the
   * camera was facing.
   */
  const framesRef = useRef<
    {
      blob: Blob;
      targetId: string;
      yaw: number;
      pitch: number;
      roll: number;
      fov: number;
      width: number;
      height: number;
      at: number;
    }[]
  >([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<CaptureState>(() => startCapture());
  const [hint, setHint] = useState("Find the first circle");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null);
  const [sent, setSent] = useState(0);
  /** The job whose frames are in storage, once they all are. Null before that. */
  const [uploadedJob, setUploadedJob] = useState<string | null>(null);
  /** Where the server says it has got to. Null until it says. */
  const [stage, setStage] = useState<Step | null>(null);
  const [hasSensor, setHasSensor] = useState(false);
  /**
   * True once it is clear no orientation readings are coming.
   *
   * A spherical capture cannot be done without them: every target is a
   * direction, and with nothing reporting which way the phone is pointing
   * there is no direction to compare them against. So this is not a degraded
   * mode to fall back into — it is a dead end, and the screen says so and
   * offers the way out rather than showing a camera that cannot photograph.
   */
  const [sensorMissing, setSensorMissing] = useState(false);

  /**
   * Everything the overlay draws, refreshed on every animation frame.
   *
   * Held in one piece of state rather than several because it is all one
   * reading: the targets are where they are *because* the camera is pointing
   * where it is, and updating them separately would draw a frame in which the
   * two disagree.
   */
  const [view, setView] = useState<{
    targets: { id: string; x: number; y: number; taken: boolean }[];
    aligned: boolean;
    flash: string | null;
  }>({ targets: [], aligned: false, flash: null });

  /**
   * The capture state, mirrored where the animation loop can read it.
   *
   * The loop runs sixty times a second and has to ask `decide` about the
   * *current* state; reading `state` out of its closure would hand it whatever
   * was true when the effect last ran.
   */
  const stateRef = useRef(state);
  const applyState = useCallback((next: CaptureState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  /**
   * One sensor reading, turned into a rotation in this capture's own frame.
   *
   * The first reading sets the zero: every yaw after it is measured from where
   * the phone was pointing when the capture began. Section 2 — indoors a
   * magnetometer is sitting inside a steel-framed building next to a fridge,
   * and its idea of north wanders, so the absolute bearing is never what any
   * of this depends on.
   */
  const onOrientation = useCallback((event: DeviceOrientationEvent) => {
    if (event.alpha === null || event.beta === null || event.gamma === null) {
      return;
    }

    const world = rotationMatrix(event.alpha, event.beta, event.gamma);
    if (zeroRef.current === null) {
      zeroRef.current = yawPitchOf(forwardOf(world)).yaw;
    }

    poseRef.current = withLocalZero(world, zeroRef.current);
    setHasSensor(true);
  }, []);

  const teardown = useCallback(() => {
    window.removeEventListener("deviceorientationabsolute", onOrientation, true);
    window.removeEventListener("deviceorientation", onOrientation, true);
    stopCamera();
  }, [onOrientation, stopCamera]);

  /**
   * Pull one frame off the video element as a JPEG.
   *
   * Section 6: this is the camera's own image at the resolution the stream is
   * running at, scaled once to the upload width — not a screenshot of the
   * preview, which would carry the overlay with it and be the size of the
   * phone's screen rather than the size of its sensor.
   */
  const grab = useCallback(async (frameCount: number): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const width = frameWidthFor(frameCount);
    const scale = Math.min(1, width / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.88),
    );
  }, []);

  /**
   * Photograph the target the camera is on, and record where it was pointing.
   *
   * The pose is read at the moment of the grab rather than from the decision
   * that led to it: a few tens of milliseconds pass between the two, and the
   * stitcher wants to know where the camera was when the shutter went, not
   * where it was when the screen decided to fire it.
   */
  const take = useCallback(
    async (target: Target, planned: number) => {
      if (busyRef.current) return;
      busyRef.current = true;

      const pose = poseRef.current;
      const blob = await grab(planned);
      const video = videoRef.current;

      if (blob && pose && video) {
        const facing = yawPitchOf(forwardOf(pose));
        framesRef.current.push({
          blob,
          targetId: target.id,
          yaw: facing.yaw,
          pitch: facing.pitch,
          roll: rollOf(pose),
          fov: ASSUMED_HFOV,
          width: video.videoWidth,
          height: video.videoHeight,
          at: Date.now(),
        });
      }

      busyRef.current = false;
    },
    [grab],
  );

  const stitch = useCallback(async (jobId: string) => {
    setProblem(null);
    setStage(null);
    setPhase("processing");

    try {
      const response = await fetch("/api/panorama/stitch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const body = (await response.json()) as {
        status?: string;
        code?: string;
        panoramaUrl?: string;
        width?: number;
        height?: number;
      };

      if (body.status === "ready" && body.panoramaUrl) {
        setResult({
          url: body.panoramaUrl,
          width: body.width ?? 0,
          height: body.height ?? 0,
        });
        setPhase("ready");
        return;
      }

      setProblem(stitchErrorMessage(body.code));
      setPhase("failed");
    } catch {
      // The request did not come back — a tab closed, a connection dropped.
      // The job row carries the outcome either way, so this is not the end of
      // the upload, only of this screen's knowledge of it.
      setProblem(
        "We lost the connection while making your 360 photo. Your photos are saved — try again in a moment.",
      );
      setPhase("failed");
    }
  }, []);

  const upload = useCallback(async () => {
    teardown();
    setPhase("uploading");
    setSent(0);

    const supabase = createClient();
    const frames = framesRef.current;

    let owner = userId ?? null;
    if (!owner) {
      const { data } = await supabase.auth.getUser();
      owner = data.user?.id ?? null;
    }
    if (!owner) {
      setProblem("Sign in again to save your 360 photo.");
      setPhase("failed");
      return;
    }

    // The row exists before the first byte goes up, so leaving the screen
    // mid-upload leaves something to come back to rather than nothing.
    const { data: job, error } = await supabase
      .from("panorama_jobs")
      .insert({
        owner_id: owner,
        status: "uploading",
        expected_frames: frames.length,
      })
      .select("id")
      .single();

    if (error || !job) {
      setProblem(stitchErrorMessage("unknown"));
      setPhase("failed");
      return;
    }

    const prefix = `${owner}/${job.id}`;

    const poses: {
      name: string;
      targetId: string;
      yaw: number;
      pitch: number;
      roll: number;
      fov: number;
      width: number;
      height: number;
      at: number;
    }[] = [];

    for (const [index, frame] of frames.entries()) {
      const name = frameName(index);
      const put = await supabase.storage
        .from("panorama-frames")
        .upload(`${prefix}/${name}`, frame.blob, { contentType: "image/jpeg" });

      if (put.error) {
        setProblem(stitchErrorMessage("frames_missing"));
        setPhase("failed");
        return;
      }

      poses.push({
        name,
        targetId: frame.targetId,
        // Rounded to a hundredth of a degree: further than that is below what
        // any phone's sensors resolve, and the column has a size limit.
        yaw: round2(frame.yaw),
        pitch: round2(frame.pitch),
        roll: round2(frame.roll),
        fov: frame.fov,
        width: frame.width,
        height: frame.height,
        at: frame.at,
      });
      setSent(index + 1);
    }

    // The poses go up with the last frame rather than one at a time: a row
    // that lists frames which are not in storage yet is a row the stitcher
    // would act on and then fail to find anything for.
    await supabase
      .from("panorama_jobs")
      .update({
        frames_prefix: prefix,
        uploaded_frames: frames.length,
        frames: poses,
        status: "processing",
      })
      .eq("id", job.id);

    setUploadedJob(job.id);
    await stitch(job.id);
  }, [stitch, teardown, userId]);

  /**
   * The ring closed, so stop and upload.
   *
   * This lives at the two callsites that can close it — the sensor tick and
   * the Take photo button — rather than in an effect watching `state.next`.
   * An effect would be reacting to its own render to start an upload, which is
   * both a cascading render and a race: two ticks can land before the render
   * happens and the upload starts twice.
   */
  /**
   * The capture loop.
   *
   * On every animation frame: read the rotation, work out which target is
   * nearest, project every target onto the screen, and fire the shutter when
   * the phone has been pointing at one and holding still for long enough.
   *
   * `requestAnimationFrame` rather than an interval, because this drives
   * something that has to look like it is attached to the room. At 8Hz the
   * targets visibly step; at the display's own rate they move with it.
   */
  useEffect(() => {
    if (phase !== "capturing" || !hasSensor) return;

    let running = true;
    let frameId = 0;

    const tick = () => {
      if (!running) return;
      frameId = window.requestAnimationFrame(tick);

      const pose = poseRef.current;
      const video = videoRef.current;
      if (!pose || !video?.videoWidth) return;

      const facing = forwardOf(pose);

      // A short history of where the camera has been pointing, which is how
      // "steady" is measured. Four frames is about 60ms — long enough to
      // notice a swing, short enough not to punish somebody who has just
      // stopped moving.
      const recent = recentRef.current;
      recent.push(facing);
      if (recent.length > 4) recent.shift();

      const hfov = ASSUMED_HFOV;
      const vfov = verticalFov(hfov, video.videoWidth, video.videoHeight);

      const decision = decide(
        stateRef.current,
        facing,
        unsteadiness(recent),
        heldSinceRef.current === null ? 0 : Date.now() - heldSinceRef.current,
      );

      // Where every target sits on the screen right now. This is the whole of
      // the gyroscope interaction: a projection of a fixed direction through
      // the live rotation. Nothing here is animated — a target moves because
      // the phone moved, and if the phone is still so is the target.
      const taken = new Set(stateRef.current.taken);
      const targets: { id: string; x: number; y: number; taken: boolean }[] = [];
      for (const target of stateRef.current.plan) {
        const at = project(target.direction, pose, hfov, vfov);
        if (at) {
          targets.push({ id: target.id, x: at.x, y: at.y, taken: taken.has(target.id) });
        }
      }

      if (decision.action === "done") {
        running = false;
        window.cancelAnimationFrame(frameId);
        stopCamera();
        void upload();
        return;
      }

      if (decision.action === "aim") {
        // Start the clock when the phone first settles on a target, and reset
        // it the moment it leaves. Without the reset, a phone swinging past a
        // target twice accumulates enough "held" time to fire while moving.
        heldSinceRef.current =
          decision.aligned && decision.steady
            ? (heldSinceRef.current ?? Date.now())
            : null;

        setHint(guidance(decision, facing));
        setView({ targets, aligned: decision.aligned, flash: null });
        return;
      }

      // Captured. Recording it first is what stops the same target firing
      // twice: `decision.state` already has it, and the next tick reads that.
      heldSinceRef.current = null;
      applyState(decision.state);
      setHint("Captured");
      setView({ targets, aligned: true, flash: decision.target.id });
      void take(decision.target, stateRef.current.plan.length);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [phase, hasSensor, take, applyState, upload, stopCamera]);

  /**
   * Put the camera on the screen, once there is a screen to put it on.
   *
   * `start()` cannot do this. It runs from the rules, where the <video> has
   * not been rendered yet, so `videoRef.current` is null and the assignment
   * goes nowhere — a black preview, and a capture that photographs nothing.
   */
  useEffect(() => {
    if (phase !== "capturing" && phase !== "paused") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject === stream) return;

    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [phase]);

  /**
   * While the server is stitching, ask it where it has got to.
   *
   * Three or four requests over a couple of seconds. A timer walking through
   * the step names would read identically on a fast stitch and lie on a slow
   * one. RLS scopes the read to the caller's own job.
   */
  useEffect(() => {
    if (phase !== "processing" || !uploadedJob) return;

    let cancelled = false;
    const supabase = createClient();

    const poll = window.setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from("panorama_jobs")
        .select("stage")
        .eq("id", uploadedJob)
        .maybeSingle();
      if (cancelled) return;
      const named = typeof data?.stage === "string" ? STAGE_STEP[data.stage] : null;
      if (named) setStage(named);
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [phase, uploadedJob]);

  async function start() {
    setProblem(null);
    setSensorMissing(false);

    // ---- orientation first, and that ordering is the whole of it ----------
    //
    // iOS will only grant `deviceorientation` from a user gesture, and a
    // gesture is spent by the first await. Asking for the camera first — which
    // is what this used to do, under a comment claiming the gesture was still
    // in hand — meant the orientation prompt arrived one await too late and
    // was refused without ever being shown. No readings, so no pose, so no
    // circles: a camera screen that could not photograph anything.
    type Requestable = { requestPermission?: () => Promise<string> };
    const orientation = window.DeviceOrientationEvent as unknown as Requestable | undefined;

    let allowed = typeof window.DeviceOrientationEvent !== "undefined";
    if (orientation?.requestPermission) {
      try {
        allowed = (await orientation.requestPermission()) === "granted";
      } catch {
        allowed = false;
      }
    }

    if (allowed) {
      window.addEventListener("deviceorientationabsolute", onOrientation, true);
      window.addEventListener("deviceorientation", onOrientation, true);
    } else {
      // Nothing below will work without it, so say so now rather than after a
      // minute of turning around in front of a camera that is not recording.
      setSensorMissing(true);
    }

    // ---- then the camera ---------------------------------------------------
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera. `ideal` rather than `exact` so a laptop with only a
        // front camera still works rather than throwing.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
    } catch {
      setProblem("Camera access is required to create a 360 photo.");
      // Back to the intro, because that is the screen the message is on — and
      // the one carrying the upload fallback, which is the only route still
      // open to somebody whose browser will not give up the camera.
      setPhase("intro");
      return;
    }

    // Held, not attached: the <video> does not exist until the phase changes.
    streamRef.current = stream;

    framesRef.current = [];
    // A new capture starts wherever the person is standing now, not where they
    // were standing for the one they abandoned.
    zeroRef.current = null;
    poseRef.current = null;
    recentRef.current = [];
    heldSinceRef.current = null;
    applyState(startCapture());
    setPhase("capturing");
  }

  /**
   * Give the sensor a moment, then stop waiting.
   *
   * Permission can be granted and readings still never arrive — a browser
   * without the hardware, a desktop, a locked-down webview. Three seconds is
   * long past the point where a working sensor would have fired; below that a
   * slow first event would be reported as a broken phone.
   */
  useEffect(() => {
    if (phase !== "capturing" || hasSensor || sensorMissing) return;
    const timer = window.setTimeout(() => setSensorMissing(true), 3000);
    return () => window.clearTimeout(timer);
  }, [phase, hasSensor, sensorMissing]);

  function restart() {
    // Restart is reached from mid-capture as well as from the two end screens,
    // and from mid-capture the camera is still running.
    teardown();
    framesRef.current = [];
    setUploadedJob(null);
    setStage(null);
    setSensorMissing(false);
    setResult(null);
    setProblem(null);
    applyState(startCapture());
    setPhase("intro");
  }

  const covered = progress(state);

  // ---- intro ---------------------------------------------------------------
  if (phase === "intro") {
    return (
      <div className="space-y-4 rounded-2xl border p-4 text-center">
        <Camera className="mx-auto size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Stand in one place and look around.</p>
          <p className="text-sm text-muted-foreground">
            Circles appear around you. Put the middle of the screen on each one
            and it takes the photo itself — above and below as well as around.
          </p>
        </div>

        {problem && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {problem}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {/* The rules come before `getUserMedia`, which is also the right
              order for the permission prompt: by the time the camera is asked
              for, the person has read what it is for. */}
          <Button
            onClick={() => setPhase("rules")}
            className="min-h-12 w-full text-base"
          >
            Start 360 Capture
          </Button>

          {problem ? (
            <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
              Upload Existing 360 Photo
            </Button>
          ) : (
            <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
              {cancelLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- how to shoot one ----------------------------------------------------
  if (phase === "rules") {
    return (
      <CaptureRules
        onDone={() => void start()}
        onCancel={() => setPhase("intro")}
      />
    );
  }

  // ---- capture -------------------------------------------------------------
  if (phase === "capturing" || phase === "paused") {
    return (
      // The bottom navigation is `fixed … z-50` and renders after the page, so
      // at z-50 it wins the tie and sits on top of the capture controls.
      <div className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        {hasSensor && phase === "capturing" && (
          <Sphere targets={view.targets} aligned={view.aligned} flash={view.flash} />
        )}

        {/* Nothing over the camera but what is needed to look around. */}
        <div className="relative flex flex-1 flex-col justify-between p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-start justify-between gap-2">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm tabular-nums text-white">
              {covered.taken} / {covered.total}
            </span>
            <button
              type="button"
              onClick={() => {
                teardown();
                onCancel();
              }}
              aria-label="Cancel capture"
              className="flex size-11 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* ---- No orientation, no capture ------------------------------
              Every target is a direction, so with nothing reporting which way
              the phone is pointing there is nothing to compare them against.
              This is a dead end rather than a degraded mode, and a camera
              screen with controls that quietly do nothing is worse than
              saying so. */}
          {sensorMissing && !hasSensor ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/80 p-4 text-center">
              <p className="text-base font-medium text-white">
                This browser won&apos;t say which way the phone is pointing.
              </p>
              <p className="text-sm text-white/80">
                A 360 photo needs that to know where each shot belongs. On
                iPhone, check Settings → Safari → Motion &amp; Orientation
                Access, then try again.
              </p>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    teardown();
                    onCancel();
                  }}
                  className="min-h-12 bg-black/50 text-white"
                >
                  Upload a 360 photo
                </Button>
                <Button onClick={restart} className="min-h-12">
                  <RotateCcw className="size-4" /> Try again
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-medium text-white drop-shadow">
                {hasSensor ? hint : "Hold the phone upright to begin"}
              </p>

              {/* Section 8: this cannot be pressed into existence. Until every
                  required direction has been photographed there is a hole in
                  the sphere, and the only thing that fills it is pointing the
                  camera at it. */}
              {!covered.complete && (
                <p className="text-sm text-white/70">
                  {covered.missing.length} left — look for the open circles
                </p>
              )}

              <div className="flex w-full items-center justify-center gap-3">
                {/* Only offered once there is a pose to record with it. A
                    shutter that files the photograph under "nowhere" is a
                    frame the stitcher has to throw away. */}
                {hasSensor && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (busyRef.current) return;
                      if (!videoRef.current?.videoWidth) return;
                      const pose = poseRef.current;
                      if (!pose) return;
                      const decision = decide(stateRef.current, forwardOf(pose), 0, STEADY_MS);
                      if (decision.action !== "aim") return;
                      const manual = captureManually(stateRef.current, decision.target);
                      if (manual.action !== "capture") return;
                      applyState(manual.state);
                      void take(manual.target, stateRef.current.plan.length);
                    }}
                    className="min-h-12 bg-black/50 text-white"
                  >
                    <Camera className="size-4" /> Take it now
                  </Button>
                )}

                <Button
                  onClick={() => {
                    stopCamera();
                    void upload();
                  }}
                  disabled={!covered.complete}
                  className="min-h-12"
                >
                  <Check className="size-4" /> Create 360°
                </Button>

                <Button
                  variant="outline"
                  onClick={restart}
                  className="min-h-12 bg-black/50 text-white"
                >
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- processing ----------------------------------------------------------
  if (phase === "uploading" || phase === "processing") {
    // Where the five steps have got to. The upload is the phone's own
    // business, so it is known first-hand; after that the screen believes the
    // server, and falls back to "Aligning photos" for the moment between the
    // last frame landing and the server's first note.
    const at =
      phase === "uploading" ? 0 : STEPS.indexOf(stage ?? "aligning");

    return (
      <div className="space-y-4 rounded-2xl border p-6 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        <p className="font-medium">Creating your 360 photo…</p>

        {/* Steps, not a percentage: the server cannot say how far through a
            composite it is, and a bar that sits at 70% is worse than a word. */}
        <ol className="mx-auto max-w-xs space-y-1 text-sm">
          {STEPS.map((step, here) => (
            <li
              key={step}
              className={cn(
                "flex items-center justify-center gap-2",
                here < at && "text-muted-foreground",
                here === at && "font-medium",
                here > at && "text-muted-foreground/50",
              )}
              aria-current={here === at ? "step" : undefined}
            >
              {here < at ? (
                <Check className="size-3.5" aria-hidden />
              ) : here === at ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <span className="size-3.5" />
              )}
              {STEP_LABEL[step]}
              {step === "uploading" && phase === "uploading" && (
                <span className="text-muted-foreground">
                  {sent} of {state.plan.length}
                </span>
              )}
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">
          You can leave this screen. Your photos are saved.
        </p>
      </div>
    );
  }

  // ---- failed --------------------------------------------------------------
  if (phase === "failed") {
    return (
      <div className="space-y-4 rounded-2xl border p-6 text-center">
        <p className="font-medium">That didn&apos;t work</p>
        <p className="text-sm text-muted-foreground">{problem}</p>
        <div className="flex flex-col gap-2">
          {uploadedJob ? (
            <>
              <Button
                onClick={() => void stitch(uploadedJob)}
                className="min-h-12 w-full"
              >
                <RotateCcw className="size-4" /> Try again
              </Button>
              <Button
                variant="outline"
                onClick={restart}
                className="min-h-11 w-full"
              >
                Shoot the room again
              </Button>
            </>
          ) : (
            <Button onClick={restart} className="min-h-12 w-full">
              <RotateCcw className="size-4" /> Try again
            </Button>
          )}
          <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ---- ready ---------------------------------------------------------------
  //
  // The finished panorama opens in the same viewer a visitor will see it in,
  // not as a flat photograph. A 2:1 equirectangular image shown flat looks
  // bent and wrong at the edges — exactly the places a stitch goes wrong — so
  // a flat preview both misrepresents a good panorama and hides a bad one.
  // Retake is only a real choice if you can see what you would be retaking.
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Your 360 photo is ready</p>
      {result && (
        <PanoramaViewer
          src={result.url}
          width={result.width}
          height={result.height}
          className="aspect-[4/3] w-full overflow-hidden rounded-xl border"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Drag to look around, pinch to zoom. Check the whole room is there
        before saving.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={restart} className="min-h-11">
          Retake
        </Button>
        <Button
          onClick={() => result && onSaved(result)}
          className="min-h-11"
          disabled={!result}
        >
          Save 360
        </Button>
      </div>
    </div>
  );
}
/**
 * The targets, floating in the room, and the aim that does not move.
 *
 * Every circle here is a direction with a rotation applied to it. The aim in
 * the middle is where the camera is pointing, by definition, so it is drawn at
 * the centre and stays there; a target drifts towards it as the phone turns
 * towards that part of the room, and away as it turns off. That is the whole
 * mechanic, and it is why none of this is a CSS animation: a transform that
 * ran on a timer would keep moving with the phone held still.
 */
function Sphere({
  targets,
  aligned,
  flash,
}: {
  targets: { id: string; x: number; y: number; taken: boolean }[];
  aligned: boolean;
  flash: string | null;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {targets.map((target) => (
        <span
          key={target.id}
          className={cn(
            "absolute size-14 rounded-full border-4",
            target.id === flash
              ? "border-emerald-300 bg-emerald-300/60"
              : target.taken
                ? "border-emerald-400/70 bg-emerald-400/20"
                : "border-white/80 bg-white/10",
          )}
          style={{
            // -1…+1 across the view becomes 0…100% of it, and the y axis
            // flips because a screen counts downwards and the sky is up.
            left: `calc(${((target.x + 1) / 2) * 100}% - 1.75rem)`,
            top: `calc(${((1 - target.y) / 2) * 100}% - 1.75rem)`,
          }}
        />
      ))}

      {/* The aim. Fixed, because it is the middle of the frame that will be
          taken — it cannot be anywhere else. */}
      <span
        className={cn(
          "absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]",
          aligned ? "border-emerald-400 bg-emerald-400/25" : "border-white",
        )}
      />
      <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
    </div>
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
