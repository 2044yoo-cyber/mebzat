"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  advance,
  captureManually,
  frameName,
  frameWidthFor,
  guidance,
  isComplete,
  startCapture,
  targetAngle,
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
  | "capturing"
  | "paused"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

const STEP_LABEL: Record<string, string> = {
  uploading: "Uploading",
  processing: "Stitching panorama",
  ready: "Ready",
};

export function PanoramaCapture({
  userId,
  onSaved,
  onCancel,
}: {
  userId: string;
  /** Called with the finished panorama, for the builder to add as a scene. */
  onSaved: (panorama: { url: string; width: number; height: number }) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const headingRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const framesRef = useRef<{ blob: Blob; angle: number }[]>([]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<CaptureState>(() => startCapture(DEFAULT_FRAMES));
  const [hint, setHint] = useState("Turn slowly to the right");
  const [hasSensor, setHasSensor] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null);
  const [sent, setSent] = useState(0);
  /** The job whose frames are in storage, once they all are. Null before that. */
  const [uploadedJob, setUploadedJob] = useState<string | null>(null);

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
    if (event.alpha === null || event.alpha === undefined) return;
    // `alpha` counts anticlockwise from north; a person turning to their right
    // sees it decrease, and the capture plan counts up. Flipping it here keeps
    // every angle in the rest of the feature in one direction.
    headingRef.current = (360 - event.alpha) % 360;
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

    // The row exists before the first byte goes up, so leaving the screen
    // mid-upload leaves something to come back to rather than nothing.
    const { data: job, error } = await supabase
      .from("panorama_jobs")
      .insert({
        owner_id: userId,
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

    const prefix = `${userId}/${job.id}`;

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
      const heading = headingRef.current;
      if (heading === null) return;

      const decision = advance(stateRef.current, { heading });
      applyState(decision.state);
      setHint(guidance(decision));

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
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }

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
    applyState(startCapture(DEFAULT_FRAMES));
    setPhase("capturing");
  }

  function restart() {
    framesRef.current = [];
    setUploadedJob(null);
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
          <Button onClick={start} className="min-h-12 w-full text-base">
            Start 360 Capture
          </Button>
          <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ---- capture -------------------------------------------------------------
  if (phase === "capturing" || phase === "paused") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <video
          ref={videoRef}
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

          <div className="flex flex-col items-center gap-4">
            <Ring total={state.plan.length} done={state.next} />
            <p className="text-lg font-medium text-white drop-shadow">
              {hasSensor ? hint : "Tap to take each photo"}
            </p>
            {hasSensor && target !== null && (
              <p className="text-sm text-white/70">{Math.round(target)}°</p>
            )}

            <div className="flex w-full items-center justify-center gap-3">
              {!hasSensor && (
                <Button
                  onClick={() => {
                    if (busyRef.current) return;
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
    return (
      <div className="space-y-4 rounded-2xl border p-6 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        <p className="font-medium">Creating your 360 photo…</p>

        {/* Steps, not a percentage. The server cannot say how far through a
            stitch it is, and a bar that sits at 70% is worse than a word. */}
        <ol className="mx-auto max-w-xs space-y-1 text-sm">
          {(["uploading", "processing", "ready"] as const).map((step) => {
            const order = ["uploading", "processing", "ready"];
            const at = order.indexOf(phase);
            const here = order.indexOf(step);
            return (
              <li
                key={step}
                className={cn(
                  "flex items-center justify-center gap-2",
                  here < at && "text-muted-foreground",
                  here === at && "font-medium",
                  here > at && "text-muted-foreground/50",
                )}
              >
                {here < at ? (
                  <Check className="size-3.5" />
                ) : here === at ? (
                  <Loader2 className="size-3.5 animate-spin" />
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
            );
          })}
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
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Your 360 photo is ready</p>
      {result && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.url}
          alt="The panorama that was just captured"
          className="w-full rounded-xl border"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Drag it around after saving to check the whole room is there.
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
