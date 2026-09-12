"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CaptureRules } from "@/components/tour/capture-rules";
import { PanoramaViewer } from "@/components/tour/panorama-viewer";
import {
  advance,
  captureManually,
  frameName,
  frameWidthFor,
  captureStep,
  guidance,
  headingFrom,
  isComplete,
  isLevel,
  relativeHeading,
  startCapture,
  targetAngle,
  targetOffset,
  tiltOff,
  type CaptureState,
} from "@/lib/panorama/capture";
import { DEFAULT_FRAMES, stitchErrorMessage } from "@/lib/panorama/stitch";
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
  const headingRef = useRef<number | null>(null);
  /**
   * Where the phone was pointing, and how it was held, at the first reading.
   *
   * Everything after is measured from here, which is what makes the plan a
   * series of turns from where somebody is standing rather than a set of
   * compass bearings they have to go and find.
   */
  const originRef = useRef<{ heading: number; beta: number | null } | null>(null);
  const tiltRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const framesRef = useRef<{ blob: Blob; angle: number }[]>([]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<CaptureState>(() => startCapture(DEFAULT_FRAMES));
  const [hint, setHint] = useState("Turn slowly to the right");
  /**
   * Where to draw the target, and whether the phone is on it.
   *
   * `offset` is -1 at the left edge of the view and +1 at the right; null
   * means the next frame is somewhere behind the person and the screen should
   * be showing an arrow rather than a box.
   */
  const [aim, setAim] = useState<{
    offset: number | null;
    turnBy: number;
    level: boolean;
    onTarget: boolean;
  }>({ offset: null, turnBy: 0, level: true, onTarget: false });
  const [hasSensor, setHasSensor] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null);
  const [sent, setSent] = useState(0);
  /** The job whose frames are in storage, once they all are. Null before that. */
  const [uploadedJob, setUploadedJob] = useState<string | null>(null);
  /** Where the server says it has got to. Null until it says. */
  const [stage, setStage] = useState<Step | null>(null);

  /**
   * The capture state, mirrored where the sensor loop can read it.
   *
   * The loop ticks eight times a second and has to ask `advance` about the
   * *current* state, but it is not a render — reading `state` out of its
   * closure would hand it whatever was true when the effect last ran. Keeping
   * a ref alongside means every decision is made against the real state, and
   * it is why `advance` is never called inside a `setState` updater: deciding
   * to take a photograph is a side effect, and updaters are not the place for
   * one.
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

  const onOrientation = useCallback((event: DeviceOrientationEvent) => {
    // iOS puts the real compass bearing on a property of its own and leaves
    // `alpha` measured from wherever the page loaded, so the source has to be
    // chosen rather than assumed. `headingFrom` does the choosing.
    const compass = (event as DeviceOrientationEvent & {
      webkitCompassHeading?: number;
    }).webkitCompassHeading;

    const heading = headingFrom({ alpha: event.alpha, compass });
    if (heading === null) return;

    if (!originRef.current) {
      originRef.current = { heading, beta: event.beta ?? null };
    }

    headingRef.current = relativeHeading(heading, originRef.current.heading);
    tiltRef.current = tiltOff(event.beta ?? null, originRef.current.beta);
    setHasSensor(true);
  }, []);

  const teardown = useCallback(() => {
    window.removeEventListener("deviceorientationabsolute", onOrientation, true);
    window.removeEventListener("deviceorientation", onOrientation, true);
    stopCamera();
  }, [onOrientation, stopCamera]);

  /** Pull one frame off the video element, downscaled, as a JPEG. */
  const grab = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const width = frameWidthFor(state.plan.length);
    const scale = Math.min(1, width / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.86),
    );
  }, [state.plan.length]);

  const take = useCallback(
    async (angle: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const blob = await grab();
      if (blob) framesRef.current.push({ blob, angle });
      busyRef.current = false;
    },
    [grab],
  );

  /**
   * Ask the server to stitch a job that already has its frames in storage.
   *
   * Separate from `upload` because it is the part worth repeating. 0081 keeps
   * the frames for a day after a stitch fails, so a second attempt costs one
   * request — not another turn around the room, which is what "Try again"
   * used to mean and what the screen already promises it does not.
   */
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

    for (const [index, frame] of frames.entries()) {
      const path = `${prefix}/${frameName(index, frame.angle)}`;
      const put = await supabase.storage
        .from("panorama-frames")
        .upload(path, frame.blob, { contentType: "image/jpeg" });

      if (put.error) {
        setProblem(stitchErrorMessage("frames_missing"));
        setPhase("failed");
        return;
      }
      setSent(index + 1);
    }

    await supabase
      .from("panorama_jobs")
      .update({
        frames_prefix: prefix,
        uploaded_frames: frames.length,
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
  const finish = useCallback(
    (next: CaptureState, stop?: () => void) => {
      if (!isComplete(next)) return;
      stop?.();
      void upload();
    },
    [upload],
  );

  /**
   * Put the camera on the screen, once there is a screen to put it on.
   *
   * `start()` cannot do this. It runs from the intro, where the <video> has
   * not been rendered yet, so `videoRef.current` is null and the assignment
   * goes nowhere — which is not a black preview and nothing else, but a
   * capture that quietly produces no photographs at all: `grab()` returns null
   * for a video with no dimensions, the ring fills on the sensor readings
   * regardless, and a full turn around the room ends in "That didn't work".
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
   * Three or four requests over a couple of seconds. The alternative was to
   * animate through the step names on a timer, which would have been
   * indistinguishable on a fast stitch and a lie on a slow one — the screen
   * would have reached "Optimizing" and sat there while the server was still
   * downloading frames.
   *
   * RLS scopes the read to the caller's own job, so this cannot be pointed at
   * anybody else's capture.
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

  // The sensor loop. Reads the compass, asks `advance` what to do, and does it.
  useEffect(() => {
    if (phase !== "capturing" || !hasSensor) return;

    let cancelled = false;
    let tick = 0;
    const stop = () => {
      cancelled = true;
      window.clearInterval(tick);
    };

    tick = window.setInterval(() => {
      if (cancelled) return;
      // A frame is still being read off the video element. Deciding now would
      // advance the plan past an angle whose photograph `take` then drops,
      // leaving a hole in the ring that nothing downstream can fill.
      if (busyRef.current) return;
      // And the camera has to be delivering pixels. `videoWidth` is 0 between
      // the element mounting and the first frame arriving; capturing in that
      // window advances the plan and photographs nothing, which is how a ring
      // reaches 9 of 9 with an empty frame list.
      if (!videoRef.current?.videoWidth) return;
      const heading = headingRef.current;
      if (heading === null) return;

      const decision = advance(stateRef.current, {
        heading,
        tilt: tiltRef.current,
      });
      applyState(decision.state);
      setHint(guidance(decision));
      setAim({
        offset: decision.action === "wait" ? targetOffset(decision.turnBy) : 0,
        turnBy: decision.action === "wait" ? decision.turnBy : 0,
        level: isLevel(tiltRef.current),
        onTarget: decision.action === "capture",
      });

      if (decision.action === "capture") {
        void take(decision.angle).then(() => finish(decision.state, stop));
      }
    }, 120);

    return stop;
  }, [phase, hasSensor, take, applyState, finish]);

  async function start() {
    setProblem(null);

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

    // Held, not attached. The <video> does not exist yet — this screen is
    // still showing the intro, and the camera is only mounted once the phase
    // changes below. The effect that watches for it does the attaching.
    streamRef.current = stream;

    // iOS requires the permission to be asked for from a gesture, which this
    // is. Everywhere else the listener simply starts producing readings.
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
    }

    framesRef.current = [];
    // A new capture starts wherever the person is standing now, not where
    // they were standing for the one they abandoned.
    originRef.current = null;
    headingRef.current = null;
    tiltRef.current = null;
    applyState(startCapture(DEFAULT_FRAMES));
    setPhase("capturing");
  }

  function restart() {
    // Restart is reached from mid-capture as well as from the two end screens,
    // and from mid-capture the camera is still running. Without this, going
    // round again asks for a second stream and leaves the first one live —
    // which on a phone is a camera light that stays on.
    teardown();
    framesRef.current = [];
    setUploadedJob(null);
    setStage(null);
    setResult(null);
    setProblem(null);
    applyState(startCapture(DEFAULT_FRAMES));
    setPhase("intro");
  }

  const target = targetAngle(state);

  // ---- intro ---------------------------------------------------------------
  if (phase === "intro") {
    return (
      <div className="space-y-4 rounded-2xl border p-4 text-center">
        <Camera className="mx-auto size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Stand in one place and slowly turn around.</p>
          <p className="text-sm text-muted-foreground">
            Keep the phone at the same height while rotating.
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
              for, the person has read what it is for and what they are about
              to do with it. A prompt that arrives before that is a prompt
              people deny, and a denied camera permission is sticky. */}
          <Button
            onClick={() => setPhase("rules")}
            className="min-h-12 w-full text-base"
          >
            Start 360 Capture
          </Button>

          {/* Somebody whose camera is refused has not stopped wanting a 360
              photo, and a locked-down browser or a denied permission is
              sticky — telling them to try again is telling them to do the
              thing that just failed. If they own a 360 camera, or took one on
              another phone, that route is still open, so it is offered here
              rather than left for them to find. */}
          {problem ? (
            <Button
              variant="outline"
              onClick={onCancel}
              className="min-h-11 w-full"
            >
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
      // at z-50 it wins the tie and sits on top of the capture controls — which
      // is what hides Pause and Restart behind Home/Market/Property. z-[60] is
      // what the city explorer's full-screen sheet already uses to get over it.
      <div className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        {/* Nothing over the camera but what is needed to turn around. */}
        <div className="relative flex flex-1 flex-col justify-between p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-start justify-between gap-2">
            <span className="rounded-full bg-black/60 px-3 py-1.5 text-sm text-white">
              {state.next} of {state.plan.length}
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

          {/* ---- The thing to aim at --------------------------------------
              A degree reading tells somebody holding a phone nothing. A box
              sitting in the room, and a ring to put over it, tells them
              exactly where to point and when they have got there — and the
              shutter fires itself, so nobody is pressing a button with the
              hand that is supposed to be holding the phone still. */}
          {hasSensor && phase === "capturing" && (
            <Aim offset={aim.offset} turnBy={aim.turnBy} onTarget={aim.onTarget} />
          )}

          <div className="flex flex-col items-center gap-4">
            <Ring total={state.plan.length} done={state.next} />
            <p className="text-lg font-medium text-white drop-shadow">
              {hasSensor
                ? hint
                : `Turn about ${Math.round(captureStep(state.plan.length))}°, then tap`}
            </p>
            {hasSensor && !aim.level && (
              <p className="rounded-full bg-amber-500/90 px-3 py-1 text-sm font-medium text-black">
                Keep the phone at the same height
              </p>
            )}
            {hasSensor && target !== null && (
              <p className="text-sm text-white/70">{Math.round(target)}°</p>
            )}

            <div className="flex w-full items-center justify-center gap-3">
              {!hasSensor && (
                <Button
                  onClick={() => {
                    if (busyRef.current) return;
                    if (!videoRef.current?.videoWidth) return;
                    const decision = captureManually(stateRef.current);
                    applyState(decision.state);
                    if (decision.action === "capture") {
                      void take(decision.angle).then(() =>
                        finish(decision.state),
                      );
                    }
                  }}
                  className="min-h-14 flex-1 text-base"
                >
                  Take photo
                </Button>
              )}
              {hasSensor && (
                <Button
                  variant="outline"
                  onClick={() => setPhase(phase === "paused" ? "capturing" : "paused")}
                  className="min-h-12 bg-black/50 text-white"
                >
                  {phase === "paused" ? (
                    <>
                      <Play className="size-4" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="size-4" /> Pause
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={restart}
                className="min-h-12 bg-black/50 text-white"
              >
                <RotateCcw className="size-4" /> Restart
              </Button>
            </div>
          </div>
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
 * The target, and the ring you put over it.
 *
 * The ring never moves: it is the middle of the camera, which is the middle of
 * the frame that will be taken. The box moves, because it is a place in the
 * room. Turning the phone moves the room past the ring, and when the box is
 * under it the frame is taken — which is the same mechanic every 360 app uses
 * and is the reason people can follow them without reading anything.
 *
 * When the next frame is somewhere behind the person there is no box to draw,
 * only a direction, so the screen shows an arrow at the edge they should be
 * turning towards.
 */
function Aim({
  offset,
  turnBy,
  onTarget,
}: {
  offset: number | null;
  turnBy: number;
  onTarget: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      {/* The box, placed across the view by how far there is left to turn. */}
      {offset !== null && (
        <span
          className={cn(
            "absolute h-36 w-24 rounded-2xl border-4 transition-colors duration-150",
            onTarget
              ? "border-emerald-400 bg-emerald-400/30"
              : "border-white/80 bg-white/10",
          )}
          style={{ transform: `translateX(${offset * 42}vw)` }}
        />
      )}

      {/* The ring, which is simply where the camera is pointing. */}
      <span
        className={cn(
          "absolute size-16 rounded-full border-4 transition-colors duration-150",
          onTarget ? "border-emerald-400 bg-emerald-400/40" : "border-white/90",
        )}
      />

      {/* Nothing to aim at yet — just which way to keep going. */}
      {offset === null && (
        <span
          className={cn(
            "absolute flex size-14 items-center justify-center rounded-full bg-black/60 text-white",
            turnBy > 0 ? "right-6" : "left-6",
          )}
        >
          {turnBy > 0 ? (
            <ChevronRight className="size-8" />
          ) : (
            <ChevronLeft className="size-8" />
          )}
        </span>
      )}
    </div>
  );
}

/** Eight to twelve dots around a circle: captured green, remaining grey. */
function Ring({ total, done }: { total: number; done: number }) {
  return (
    <div
      className="relative size-32"
      role="progressbar"
      aria-label="Photos taken"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      {Array.from({ length: total }, (_, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const r = 56;
        return (
          <span
            key={i}
            className={cn(
              "absolute size-3 rounded-full transition-colors",
              i < done ? "bg-emerald-400" : "bg-white/35",
            )}
            style={{
              left: `calc(50% + ${Math.cos(angle) * r}px - 0.375rem)`,
              top: `calc(50% + ${Math.sin(angle) * r}px - 0.375rem)`,
            }}
          />
        );
      })}
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white">
        {done}/{total}
      </span>
    </div>
  );
}
