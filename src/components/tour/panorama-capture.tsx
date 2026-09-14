"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { I18nText } from "@/components/i18n/i18n-text";
import { useLanguage } from "@/components/i18n/language-provider";
import { CaptureRules } from "@/components/tour/capture-rules";
import { PanoramaViewer } from "@/components/tour/panorama-viewer";
import {
  calibrationForSize,
  cameraCalibration,
  intrinsicsFromFov,
  type CameraCalibration,
  type CameraIntrinsics,
} from "@/lib/panorama/camera";
import {
  CAMERA_METERING_SETTLE_MS,
  safeCameraControlPlan,
  type CameraControlCapabilities,
} from "@/lib/panorama/camera-controls";
import {
  CAPTURE_COOLDOWN_MS,
  EMPTY_HOLD,
  STEADY_MS,
  captureManually,
  decide,
  nextInOrder,
  rollError,
  unrecord,
  frameName,
  frameWidthFor,
  guidance,
  heldFor,
  progress,
  startCapture,
  takenSet,
  updateHold,
  type CaptureState,
  type Target,
} from "@/lib/panorama/capture";
import {
  forwardOf,
  rollOf,
  cameraRotationMatrix,
  unsteadiness,
  verticalFov,
  withLocalZero,
  yawPitchOf,
  type Matrix3,
  type Vector3,
} from "@/lib/panorama/orientation";
import { ASSUMED_HFOV } from "@/lib/panorama/sphere";
import {
  accumulateDrift,
  focusScore,
  hasDrifted,
  shouldRetake,
} from "@/lib/panorama/sharpness";
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

type RetryMode = "upload" | "stitch" | "retake" | null;

type CapturedFrame = {
  blob: Blob;
  targetId: string;
  imageNumber: number;
  captureOrder: number;
  yaw: number;
  pitch: number;
  roll: number;
  rotation: Matrix3;
  screenOrientation: number;
  exifOrientation: 1;
  focalLength: number | null;
  intrinsics: CameraIntrinsics;
  hfov: number;
  vfov: number;
  calibrationSource: CameraCalibration["source"];
  cameraLabel: string | null;
  width: number;
  height: number;
  at: number;
};

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

const STEP_KEY: Record<Step, string> = {
  uploading: "tours.uploading",
  aligning: "tours.aligning",
  stitching: "tours.stitching",
  optimizing: "tours.optimizing",
  ready: "tours.ready",
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
  const { language, phrase, t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The live rotation, in the capture's own frame. Read every animation frame. */
  const poseRef = useRef<Matrix3 | null>(null);
  /** Screen angle used to turn device axes into the camera axes in poseRef. */
  const screenAngleRef = useRef(0);
  /** Lens geometry for the exact rear-camera track selected by the browser. */
  const calibrationRef = useRef<CameraCalibration | null>(null);
  /** The yaw the capture began at, which becomes this capture's zero. */
  const zeroRef = useRef<number | null>(null);
  /** The last few forward vectors, for deciding whether the phone is still. */
  const recentRef = useRef<Vector3[]>([]);
  /** When the phone first became both aligned and steady on the current target. */
  /** A single noisy gyro event gets a grace period instead of resetting the ring. */
  const holdStateRef = useRef({ ...EMPTY_HOLD });
  const busyRef = useRef(false);
  /**
   * The photographs taken so far, each with the pose it was taken at.
   *
   * Section 6: the pose travels with the image, because by the time the
   * stitcher sees it there is nothing in the pixels that says which way the
   * camera was facing.
   */
  const framesRef = useRef<CapturedFrame[]>([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<CaptureState>(() => startCapture());
  const [hint, setHint] = useState("Find the first circle");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; width: number; height: number } | null>(null);
  const [sent, setSent] = useState(0);
  /** The job whose frames are in storage, once they all are. Null before that. */
  const [uploadedJob, setUploadedJob] = useState<string | null>(null);
  /** Which completed work can safely be repeated without clearing the photos. */
  const [retryMode, setRetryMode] = useState<RetryMode>(null);
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
  /** True while the phone has been moving about rather than turning on a spot. */
  const [drifting, setDrifting] = useState(false);
  /** Set when a frame was thrown away for being blurred, so the screen can say. */
  const [refused, setRefused] = useState(0);

  /**
   * Everything the overlay draws, refreshed on every animation frame.
   *
   * Held in one piece of state rather than several because it is all one
   * reading: the targets are where they are *because* the camera is pointing
   * where it is, and updating them separately would draw a frame in which the
   * two disagree.
   */
  /**
   * The overlay's moving parts, written to directly.
   *
   * Every one of these used to be React state set on each animation frame,
   * which re-rendered the whole screen sixty times a second — the buttons, the
   * counter, the instructions, all of it — and on a phone that is the flicker.
   * `panorama-viewer.tsx` already makes this point about its hotspots: putting
   * coordinates in state means a render per frame, which costs more than the
   * thing being rendered. The markers are ordinary DOM, laid out once, and the
   * loop moves them.
   */
  const markerRefs = useRef(new Map<string, HTMLSpanElement>());
  const markerTaken = useRef(new Map<string, string>());
  /** The captured ids, rebuilt when one is captured rather than per frame. */
  const takenRef = useRef<Set<string>>(new Set());
  /** How many goes each target has had, and the best frame it produced. */
  const attemptsRef = useRef(new Map<string, number>());
  const bestShotRef = useRef(
    new Map<string, { blob: Blob; score: number; width: number; height: number }>(),
  );
  /** Nothing fires before this, so one target cannot become two. */
  const cooldownRef = useRef(0);
  /** Accumulated movement that turning does not account for. */
  const driftRef = useRef(0);
  const driftAtRef = useRef(0);
  /** The canvas frames are drawn on, kept rather than made forty times. */
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const aimRef = useRef<HTMLSpanElement>(null);
  const holdRef = useRef<HTMLSpanElement>(null);
  const holdRingRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const crookedRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  /** The overlay's size, read on resize rather than on every frame. */
  const sizeRef = useRef({ w: 0, h: 0 });

  const registerMarker = useCallback((id: string, element: HTMLSpanElement | null) => {
    if (element) markerRefs.current.set(id, element);
    else markerRefs.current.delete(id);
  }, []);

  /** The hint, which changes a few times per target rather than per frame. */
  const hintRef = useRef(hint);
  const sayHint = useCallback((next: string) => {
    if (next === hintRef.current) return;
    hintRef.current = next;
    setHint(next);
  }, []);

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

    const screenAngle = currentScreenAngle();
    const world = cameraRotationMatrix(
      event.alpha,
      event.beta,
      event.gamma,
      screenAngle,
    );
    if (zeroRef.current === null) {
      zeroRef.current = yawPitchOf(forwardOf(world)).yaw;
    }

    screenAngleRef.current = screenAngle;
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
  /**
   * Pull one frame off the video element as a JPEG, if it is sharp enough.
   *
   * Section 6: this is the camera's own image at the resolution the stream is
   * running at, scaled once to the upload width — not a screenshot of the
   * preview, which would carry the overlay with it and be the size of the
   * phone's screen rather than the size of its sensor.
   *
   * The focus measurement comes back with the frame rather than deciding its
   * fate here: whether it is worth keeping depends on which go this is and on
   * what the previous go scored, and neither is this function's business.
   */
  const grab = useCallback(
    async (
      frameCount: number,
    ): Promise<{ blob: Blob; score: number; width: number; height: number } | null> => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return null;

      const width = frameWidthFor(frameCount);
      const scale = Math.min(1, width / video.videoWidth);

      const canvas = scratchRef.current ?? document.createElement("canvas");
      scratchRef.current = canvas;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Measured on a small greyscale copy: the question is whether the edges
      // in the room survived, and that is answerable at a fraction of the size
      // for a fraction of the time.
      const probeW = 160;
      const probeH = Math.max(1, Math.round((canvas.height / canvas.width) * probeW));
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const grey = new Uint8Array(probeW * probeH);
      for (let y = 0; y < probeH; y += 1) {
        const sy = Math.floor((y * canvas.height) / probeH);
        for (let x = 0; x < probeW; x += 1) {
          const sx = Math.floor((x * canvas.width) / probeW);
          const i = (sy * canvas.width + sx) * 4;
          grey[y * probeW + x] =
            (pixels.data[i] * 77 + pixels.data[i + 1] * 150 + pixels.data[i + 2] * 29) >> 8;
        }
      }

      const score = focusScore(grey, probeW, probeH);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((made) => resolve(made), "image/jpeg", 0.9),
      );
      return blob ? { blob, score, width: canvas.width, height: canvas.height } : null;
    },
    [],
  );

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
      const shot = await grab(planned);
      const video = videoRef.current;

      if (!shot || !pose || !video) {
        // No frame at all — the camera is not delivering. The target goes back
        // on the list, because one marked done with no photograph behind it is
        // a hole in the sphere that the coverage gate cannot see: the gate
        // counts intentions.
        applyState(unrecord(stateRef.current, target.id));
        busyRef.current = false;
        return;
      }

      const attempt = (attemptsRef.current.get(target.id) ?? 0) + 1;
      attemptsRef.current.set(target.id, attempt);

      // The best go at *this* target, which is the only fair comparison: a
      // score means nothing against a frame of somewhere else.
      const previous = bestShotRef.current.get(target.id);
      const best = !previous || shot.score > previous.score ? shot : previous;
      bestShotRef.current.set(target.id, best);

      if (shouldRetake(shot.score, attempt)) {
        // One more go, and only one. The target goes back on the list and the
        // cooldown keeps the shutter shut long enough for a hand to settle.
        applyState(unrecord(stateRef.current, target.id));
        setRefused((n) => n + 1);
        cooldownRef.current = Date.now() + CAPTURE_COOLDOWN_MS;
        recentRef.current = [];
        holdStateRef.current = { ...EMPTY_HOLD };
        busyRef.current = false;
        return;
      }

      const facing = yawPitchOf(forwardOf(pose));
      const baseCalibration = calibrationRef.current;
      const calibration = baseCalibration
        ? calibrationForSize(baseCalibration, best.width, best.height)
        : {
            hfov: ASSUMED_HFOV,
            vfov: verticalFov(ASSUMED_HFOV, best.width, best.height),
            intrinsics: intrinsicsFromFov(best.width, best.height, ASSUMED_HFOV),
            focalLength: null,
            source: "estimated" as const,
            cameraLabel: null,
          };
      framesRef.current.push({
        blob: best.blob,
        targetId: target.id,
        imageNumber: target.index,
        captureOrder: framesRef.current.length + 1,
        yaw: facing.yaw,
        pitch: facing.pitch,
        roll: rollOf(pose),
        rotation: pose,
        screenOrientation: screenAngleRef.current,
        exifOrientation: 1,
        focalLength: calibration.focalLength,
        intrinsics: calibration.intrinsics,
        hfov: calibration.hfov,
        vfov: calibration.vfov,
        calibrationSource: calibration.source,
        cameraLabel: calibration.cameraLabel,
        width: best.width,
        height: best.height,
        at: Date.now(),
      });

      // Taken, and done with. Nothing fires again until the phone has had time
      // to leave this direction.
      bestShotRef.current.delete(target.id);
      cooldownRef.current = Date.now() + CAPTURE_COOLDOWN_MS;
      recentRef.current = [];
      holdStateRef.current = { ...EMPTY_HOLD };
      busyRef.current = false;
    },
    [grab, applyState],
  );

  const stitch = useCallback(async (jobId: string) => {
    setProblem(null);
    setStage(null);
    setRetryMode(null);
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
        rejectedTargetIds?: string[];
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

      if (
        body.code === "retake_required" &&
        Array.isArray(body.rejectedTargetIds) &&
        body.rejectedTargetIds.length > 0
      ) {
        const rejected = new Set(body.rejectedTargetIds);
        framesRef.current = framesRef.current.filter(
          (frame) => !rejected.has(frame.targetId),
        );
        const next = {
          ...stateRef.current,
          taken: stateRef.current.taken.filter((id) => !rejected.has(id)),
        };
        takenRef.current = new Set(next.taken);
        for (const id of rejected) markerTaken.current.delete(id);
        applyState(next);
        setProblem(
          `${phrase(stitchErrorMessage(body.code))} ${t("tours.photosNeedRetaking").replace("{count}", String(rejected.size))}`,
        );
        setRetryMode("retake");
      } else {
        setProblem(stitchErrorMessage(body.code));
        setRetryMode(body.code === "unknown" ? "stitch" : null);
      }
      setPhase("failed");
    } catch {
      // The request did not come back — a tab closed, a connection dropped.
      // The job row carries the outcome either way, so this is not the end of
      // the upload, only of this screen's knowledge of it.
      setProblem(
        t("tours.connectionLost"),
      );
      setRetryMode("stitch");
      setPhase("failed");
    }
  }, [applyState, phrase, t]);

  const upload = useCallback(async () => {
    teardown();
    setPhase("uploading");
    setSent(0);
    setUploadedJob(null);
    setRetryMode(null);

    const supabase = createClient();
    const frames = framesRef.current;

    let owner = userId ?? null;
    if (!owner) {
      const { data } = await supabase.auth.getUser();
      owner = data.user?.id ?? null;
    }
    if (!owner) {
      setProblem(t("tours.signInAgain"));
      setRetryMode("upload");
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
      setRetryMode("upload");
      setPhase("failed");
      return;
    }

    const prefix = `${owner}/${job.id}`;

    const poses: {
      name: string;
      targetId: string;
      imageNumber: number;
      captureOrder: number;
      yaw: number;
      pitch: number;
      roll: number;
      rotation: number[];
      screenOrientation: number;
      exifOrientation: number;
      focalLength: number | null;
      intrinsics: CameraIntrinsics;
      fov: number;
      vfov: number;
      calibrationSource: CameraCalibration["source"];
      cameraLabel: string | null;
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
        setRetryMode("upload");
        setPhase("failed");
        return;
      }

      poses.push({
        name,
        targetId: frame.targetId,
        imageNumber: frame.imageNumber,
        captureOrder: frame.captureOrder,
        // Rounded to a hundredth of a degree: further than that is below what
        // any phone's sensors resolve, and the column has a size limit.
        yaw: round2(frame.yaw),
        pitch: round2(frame.pitch),
        roll: round2(frame.roll),
        rotation: frame.rotation.map(round4),
        screenOrientation: frame.screenOrientation,
        exifOrientation: frame.exifOrientation,
        focalLength: frame.focalLength,
        intrinsics: {
          fx: round2(frame.intrinsics.fx),
          fy: round2(frame.intrinsics.fy),
          cx: round2(frame.intrinsics.cx),
          cy: round2(frame.intrinsics.cy),
          width: frame.intrinsics.width,
          height: frame.intrinsics.height,
        },
        fov: round2(frame.hfov),
        vfov: round2(frame.vfov),
        calibrationSource: frame.calibrationSource,
        cameraLabel: frame.cameraLabel,
        width: frame.width,
        height: frame.height,
        at: frame.at,
      });
      setSent(index + 1);
    }

    // The poses go up with the last frame rather than one at a time: a row
    // that lists frames which are not in storage yet is a row the stitcher
    // would act on and then fail to find anything for.
    const { error: finalizeError } = await supabase
      .from("panorama_jobs")
      .update({
        frames_prefix: prefix,
        uploaded_frames: frames.length,
        frames: poses,
        status: "processing",
      })
      .eq("id", job.id);

    if (finalizeError) {
      setProblem(stitchErrorMessage("unknown"));
      setRetryMode("upload");
      setPhase("failed");
      return;
    }

    setUploadedJob(job.id);
    await stitch(job.id);
  }, [stitch, t, teardown, userId]);

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

      // A frame is being read, or one was just taken. Deciding now is how one
      // target becomes two photographs, or forty.
      if (busyRef.current || Date.now() < cooldownRef.current) return;

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
      const roll = rollError(rollOf(pose));
      const now = Date.now();
      const reading = {
        facing,
        roll,
        unsteady: unsteadiness(recent),
        heldMs: 0,
      };
      const firstDecision = decide(stateRef.current, reading);
      const valid =
        firstDecision.action === "aim" &&
        firstDecision.aligned &&
        firstDecision.steady &&
        firstDecision.level;
      const candidateId = firstDecision.action === "aim" ? firstDecision.nearest.id : null;
      holdStateRef.current = updateHold(holdStateRef.current, candidateId, valid, now);
      const heldMs = heldFor(holdStateRef.current, now);
      const decision = decide(stateRef.current, { ...reading, heldMs });

      // ---- move the markers -------------------------------------------
      //
      // This is the whole of the gyroscope interaction: a projection of a
      // fixed direction through the live rotation. Nothing is animated — a
      // marker moves because the phone moved, and if the phone is still so is
      // the marker.
      const { w: halfW, h: halfH } = sizeRef.current;

      // Rebuilt when a photograph is taken, not sixty times a second. A Set of
      // forty strings per frame is forty allocations for an answer that
      // changes about forty times in a capture.
      if (takenRef.current.size !== stateRef.current.taken.length) {
        takenRef.current = takenSet(stateRef.current);
      }
      const taken = takenRef.current;
      const nextId = nextInOrder(stateRef.current)?.id ?? null;

      // The camera's axes, pulled out of the matrix once rather than per
      // target, and the projection written out flat. `project` allocates a
      // vector and an object for every call; at forty targets a frame that is
      // most of the work on this loop and all of the rubbish it leaves behind.
      const fx = -pose[2];
      const fy = -pose[5];
      const fz = -pose[8];
      const rx = pose[0];
      const ry = pose[3];
      const rz = pose[6];
      const ux = pose[1];
      const uy = pose[4];
      const uz = pose[7];
      const tanH = Math.tan(((hfov / 2) * Math.PI) / 180);
      const tanV = Math.tan(((vfov / 2) * Math.PI) / 180);
      const lean = -roll;

      for (const target of stateRef.current.plan) {
        const element = markerRefs.current.get(target.id);
        if (!element) continue;

        const d = target.direction;
        const depth = d[0] * fx + d[1] * fy + d[2] * fz;

        // Behind the camera, or so far to the side that nothing need be drawn.
        // One multiply-add decides it for most of the sphere on most frames.
        let sx = 0;
        let sy = 0;
        const visible =
          depth > 1e-6 &&
          Math.abs((sx = (d[0] * rx + d[1] * ry + d[2] * rz) / depth / tanH)) <= 1.6 &&
          Math.abs((sy = (d[0] * ux + d[1] * uy + d[2] * uz) / depth / tanV)) <= 1.6;

        if (!visible) {
          if (element.style.visibility !== "hidden") {
            element.style.visibility = "hidden";
          }
          continue;
        }

        if (element.style.visibility === "hidden") element.style.visibility = "";
        element.style.transform =
          `translate3d(${(sx * halfW).toFixed(1)}px, ${(-sy * halfH).toFixed(1)}px, 0)` +
          ` translate(-50%, -50%) rotate(${lean.toFixed(1)}deg)`;

        // Colour changes when a target is captured, or when it becomes the
        // next one wanted — twice in a capture, not sixty times a second.
        const done = taken.has(target.id);
        const look = done ? "done" : target.id === nextId ? "next" : "waiting";
        if (markerTaken.current.get(target.id) !== look) {
          markerTaken.current.set(target.id, look);
          element.style.borderColor =
            look === "done"
              ? "rgba(52, 211, 153, 0.6)"
              : look === "next"
                ? "rgb(250, 204, 21)"
                : "rgba(255, 255, 255, 0.85)";
          element.style.backgroundColor =
            look === "done"
              ? "rgba(52, 211, 153, 0.22)"
              : look === "next"
                ? "rgba(250, 204, 21, 0.25)"
                : "rgba(255, 255, 255, 0.14)";
          element.style.opacity = look === "done" ? "0.45" : "1";
        }
      }

      if (decision.action === "done") {
        running = false;
        window.cancelAnimationFrame(frameId);
        stopCamera();
        void upload();
        return;
      }

      const aligned = decision.action === "aim" ? decision.aligned : true;
      const level = decision.action === "aim" ? decision.level : true;

      // ---- the aim, the hold ring and the arrow ------------------------
      if (aimRef.current) {
        aimRef.current.style.borderColor =
          aligned && level ? "rgb(52, 211, 153)" : level ? "white" : "rgb(252, 211, 77)";
      }
      if (crookedRef.current) {
        crookedRef.current.style.display = level ? "none" : "block";
      }

      const settled =
        decision.action === "aim" && decision.aligned && decision.steady && decision.level;

      if (holdRef.current) holdRef.current.style.display = settled ? "flex" : "none";
      if (settled && holdRingRef.current) {
        const done = Math.min(1, heldMs / STEADY_MS) * 360;
        holdRingRef.current.style.background =
          `conic-gradient(rgb(52 211 153) ${done.toFixed(0)}deg, transparent 0deg)`;
      }

      if (arrowRef.current) {
        const bearing =
          decision.action === "aim" && !decision.aligned
            ? steerBearing(decision.target, yawPitchOf(facing), roll)
            : null;
        if (bearing === null) {
          arrowRef.current.style.display = "none";
        } else {
          arrowRef.current.style.display = "block";
          arrowRef.current.style.transform =
            `translate(-50%, -50%) rotate(${bearing.toFixed(1)}deg)`;
        }
      }

      if (decision.action === "aim") {
        sayHint(guidance(decision, facing));
        return;
      }

      // Captured. Recording it first is what stops the same target firing
      // twice: `decision.state` already has it, and the next tick reads that.
      holdStateRef.current = { ...EMPTY_HOLD };
      applyState(decision.state);
      sayHint("Captured");
      void take(decision.target, stateRef.current.plan.length);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
    };
  }, [phase, hasSensor, take, applyState, upload, stopCamera, sayHint]);

  /** The overlay's half-size, which the loop needs and must not measure itself. */
  useEffect(() => {
    if (phase !== "capturing") return;
    const measure = () => {
      const box = overlayRef.current;
      if (box) sizeRef.current = { w: box.clientWidth / 2, h: box.clientHeight / 2 };
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [phase]);

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

  async function start(preserveCaptured = false) {
    setProblem(null);
    setSensorMissing(false);
    setHasSensor(false);

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
      setProblem(t("tours.cameraRequired"));
      // Back to the intro, because that is the screen the message is on — and
      // the one carrying the upload fallback, which is the only route still
      // open to somebody whose browser will not give up the camera.
      setPhase("intro");
      return;
    }

    // Held, not attached: the <video> does not exist until the phase changes.
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    calibrationRef.current = track ? cameraCalibration(track) : null;

    // Let the camera meter, then safely hold what the camera chose where the
    // browser supports single-shot metering.
    //
    // Left to itself a phone re-meters between a window and a dark corner, so
    // two frames of the same wall come back a stop apart and the same wall two
    // different colours. The stitcher can level brightness across a seam; it
    // cannot un-shift a white balance that moved halfway round the room. Not
    // every browser offers this — it is newer than the camera API itself — so
    // Android cameras can advertise manual modes without exposing the sensor
    // values required to use them. Requesting just `manual` made Samsung
    // previews dark and unstable, so lockCamera never guesses those values.
    await lockCamera(stream);

    if (!preserveCaptured) {
      framesRef.current = [];
      // A new capture starts wherever the person is standing now, not where
      // they were standing for the one they abandoned.
      zeroRef.current = null;
    }
    poseRef.current = null;
    if (!preserveCaptured) {
      attemptsRef.current = new Map();
      bestShotRef.current = new Map();
    }
    cooldownRef.current = 0;
    driftRef.current = 0;
    driftAtRef.current = 0;
    setDrifting(false);
    setRefused(0);
    recentRef.current = [];
    holdStateRef.current = { ...EMPTY_HOLD };
    if (!preserveCaptured) {
      takenRef.current = new Set();
      markerTaken.current = new Map();
      applyState(startCapture(calibrationRef.current?.hfov ?? ASSUMED_HFOV));
    }
    setPhase("capturing");
  }

  /**
   * Watch for the phone being carried rather than turned.
   *
   * Nothing on a phone measures position, and integrating acceleration twice
   * to find it turns a small constant error into a large growing one — a phone
   * on a table would "walk" metres in a minute. So this does not track where
   * the phone is. It accumulates movement that turning does not account for,
   * which stays near zero for somebody rotating on the spot and climbs for
   * somebody walking, and it decays so that standing still clears it.
   */
  useEffect(() => {
    if (phase !== "capturing") return;

    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.acceleration;
      if (!a || (a.x === null && a.y === null && a.z === null)) return;

      const now = Date.now();
      const seconds = driftAtRef.current === 0 ? 0 : (now - driftAtRef.current) / 1000;
      driftAtRef.current = now;
      if (seconds <= 0 || seconds > 0.5) return;

      const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      driftRef.current = accumulateDrift(driftRef.current, magnitude, seconds);
      setDrifting(hasDrifted(driftRef.current));
    };

    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [phase]);

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
    setRetryMode(null);
    setStage(null);
    setSensorMissing(false);
    setResult(null);
    setProblem(null);
    applyState(startCapture());
    setPhase("intro");
  }

  const covered = progress(state);
  // Which number the yellow marker is showing, so the instruction and the
  // thing on the screen name the same target.
  const nextNumber = nextInOrder(state)?.index ?? null;

  // ---- intro ---------------------------------------------------------------
  if (phase === "intro") {
    return (
      <div className="space-y-4 rounded-2xl border p-4 text-center">
        <Camera className="mx-auto size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium"><I18nText textKey="tours.standStill" secondary /></p>
          <p className="text-sm text-muted-foreground">
            {t("tours.introGuide")}
          </p>
        </div>

        {problem && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {phrase(problem)}
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
            <I18nText textKey="tours.startCapture" secondary />
          </Button>

          {problem ? (
            <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
              <I18nText textKey="tours.uploadExisting" secondary />
            </Button>
          ) : (
            <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
              {cancelLabel === "Cancel" ? t("common.cancel") : phrase(cancelLabel)}
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
          <Sphere
            plan={state.plan}
            register={registerMarker}
            overlayRef={overlayRef}
            aimRef={aimRef}
            holdRef={holdRef}
            holdRingRef={holdRingRef}
            arrowRef={arrowRef}
            crookedRef={crookedRef}
          />
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
              aria-label={t("tours.cancelCapture")}
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
                {t("tours.sensorMissing")}
              </p>
              <p className="text-sm text-white/80">
                {t("tours.sensorExplain")}
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
                  {t("tours.uploadFallback")}
                </Button>
                <Button onClick={restart} className="min-h-12">
                  <RotateCcw className="size-4" /> {t("common.retry")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-medium text-white drop-shadow">
                {hasSensor ? localizeHint(hint, language, phrase) : t("tours.upright")}
              </p>

              {/* Section 8: this cannot be pressed into existence. Until every
                  required direction has been photographed there is a hole in
                  the sphere, and the only thing that fills it is pointing the
                  camera at it. */}
              {drifting && (
                <p className="rounded-full bg-amber-400/95 px-3 py-1 text-sm font-medium text-black">
                  {t("tours.turnOnSpot")}
                </p>
              )}

              {refused > 0 && !drifting && (
                <p className="text-sm text-white/70">
                  {refused === 1
                    ? t("tours.oneRetaken")
                    : t("tours.photosRetaken").replace("{count}", String(refused))}
                </p>
              )}

              {!covered.complete && (
                <p className="text-sm text-white/70">
                  {nextNumber === null
                    ? t("tours.left").replace("{count}", String(covered.missing.length))
                    : t("tours.nextLeft")
                        .replace("{next}", String(nextNumber))
                        .replace("{count}", String(covered.missing.length))}
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
                      const decision = decide(stateRef.current, {
                        facing: forwardOf(pose),
                        roll: 0,
                        unsteady: 0,
                        heldMs: STEADY_MS,
                      });
                      if (decision.action !== "aim") return;
                      const manual = captureManually(stateRef.current, decision.nearest);
                      if (manual.action !== "capture") return;
                      applyState(manual.state);
                      void take(manual.target, stateRef.current.plan.length);
                    }}
                    className="min-h-12 bg-black/50 text-white"
                  >
                    <Camera className="size-4" /> {t("tours.takeNow")}
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
                  <Check className="size-4" /> <I18nText textKey="tours.create360" secondary />
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
        <p className="font-medium"><I18nText textKey="tours.creating" secondary /></p>

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
              {t(STEP_KEY[step])}
              {step === "uploading" && phase === "uploading" && (
                <span className="text-muted-foreground">
                  {t("tours.of")
                    .replace("{current}", String(sent))
                    .replace("{total}", String(state.plan.length))}
                </span>
              )}
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">
          {t("tours.savedPhotos")}
        </p>
      </div>
    );
  }

  // ---- failed --------------------------------------------------------------
  if (phase === "failed") {
    return (
      <div className="space-y-4 rounded-2xl border p-6 text-center">
        <p className="font-medium">{t("tours.failed")}</p>
        <p className="text-sm text-muted-foreground">{problem ? phrase(problem) : null}</p>
        <div className="flex flex-col gap-2">
          {retryMode === "stitch" && uploadedJob && (
            <Button
              onClick={() => void stitch(uploadedJob)}
              className="min-h-12 w-full"
            >
              <RotateCcw className="size-4" /> {t("tours.trySaving")}
            </Button>
          )}
          {retryMode === "upload" && (
            <Button onClick={() => void upload()} className="min-h-12 w-full">
              <RotateCcw className="size-4" /> {t("tours.trySaving")}
            </Button>
          )}
          {retryMode === "retake" && (
            <Button onClick={() => void start(true)} className="min-h-12 w-full">
              <Camera className="size-4" /> {t("tours.retakeHighlighted")}
            </Button>
          )}
          <Button variant="outline" onClick={restart} className="min-h-11 w-full">
            {t("tours.shootAgain")}
          </Button>
          <Button variant="outline" onClick={onCancel} className="min-h-11 w-full">
            {t("common.cancel")}
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
      <p className="text-sm font-medium"><I18nText textKey="tours.ready" secondary /></p>
      {result && (
        <PanoramaViewer
          src={result.url}
          width={result.width}
          height={result.height}
          className="aspect-[4/3] w-full overflow-hidden rounded-xl border"
        />
      )}
      <p className="text-xs text-muted-foreground">
        <I18nText textKey="tours.drag" secondary />
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={restart} className="min-h-11">
          <I18nText textKey="tours.retake" secondary />
        </Button>
        <Button
          onClick={() => result && onSaved(result)}
          className="min-h-11"
          disabled={!result}
        >
          <I18nText textKey="tours.save360" secondary />
        </Button>
      </div>
    </div>
  );
}

function localizeHint(
  hint: string,
  language: "en" | "am" | "om",
  phrase: (value: string) => string,
): string {
  if (language === "en") return hint;
  const numbered = hint.match(/^(.*) to (\d+)$/);
  return numbered ? `${phrase(numbered[1])} ${numbered[2]}` : phrase(hint);
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
/**
 * Which way to swing the phone to reach a target, in degrees clockwise from
 * straight up the screen.
 *
 * Not the direction the target lies on screen. That is what this used to be,
 * and for anything in front of you it is the same answer — but for a target
 * behind and above, the shortest line to it goes over the top of your head, so
 * the arrow pointed straight up when what you had to do was turn around. It
 * was pointing along a great circle nobody can walk.
 *
 * This is the turn instead: how much yaw and how much pitch, which is the same
 * decomposition the written instruction uses, so the arrow and the words can
 * no longer disagree. A target 170° behind gives a yaw error of 170 and an
 * arrow that says "that way, keep going".
 *
 * The roll is taken back off because the screen is what the arrow is drawn on,
 * and a rolled phone has rolled that with it.
 */
function steerBearing(
  target: { yaw: number; pitch: number },
  facing: { yaw: number; pitch: number },
  roll: number,
): number | null {
  const turn = ((target.yaw - facing.yaw + 540) % 360) - 180;
  const tilt = target.pitch - facing.pitch;
  if (Math.abs(turn) < 0.01 && Math.abs(tilt) < 0.01) return null;
  return (Math.atan2(turn, tilt) * 180) / Math.PI - roll;
}

/**
 * The targets, floating in the room, and the aim that does not move.
 *
 * Laid out once and never re-rendered: every position, colour and rotation
 * here is written by the capture loop through a ref. React renders this when
 * the plan changes — which is once per capture — and not when the phone moves,
 * which is sixty times a second.
 */
const Sphere = memo(function Sphere({
  plan,
  register,
  overlayRef,
  aimRef,
  holdRef,
  holdRingRef,
  arrowRef,
  crookedRef,
}: {
  plan: readonly Target[];
  register: (id: string, element: HTMLSpanElement | null) => void;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  aimRef: React.RefObject<HTMLSpanElement | null>;
  holdRef: React.RefObject<HTMLSpanElement | null>;
  holdRingRef: React.RefObject<HTMLSpanElement | null>;
  arrowRef: React.RefObject<HTMLSpanElement | null>;
  crookedRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {plan.map((target) => (
        <span
          key={target.id}
          ref={(element) => register(target.id, element)}
          className="absolute top-1/2 left-1/2 flex h-28 w-20 items-center justify-center rounded-lg border-[3px] text-2xl font-semibold text-white tabular-nums"
          style={{
            visibility: "hidden",
            borderColor: "rgba(255, 255, 255, 0.85)",
            backgroundColor: "rgba(255, 255, 255, 0.14)",
            textShadow: "0 1px 3px rgba(0,0,0,0.6)",
          }}
        >
          {target.index}
        </span>
      ))}

      {/* The frame to bring a marker into. Fixed, because it is the middle of
          the photograph that will be taken — it cannot be anywhere else. */}
      <span
        ref={aimRef}
        className="absolute top-1/2 left-1/2 h-36 w-24 -translate-x-1/2 -translate-y-1/2 rounded-xl border-4"
        style={{ borderColor: "white" }}
      />

      {/* Hold, and how much of it is left. A ring that visibly fills is the
          difference between somebody keeping still and somebody assuming it
          has jammed and moving on. */}
      <span
        ref={holdRef}
        className="absolute top-1/2 left-1/2 hidden size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45"
      >
        <span
          ref={holdRingRef}
          className="absolute inset-0 rounded-full"
          style={{
            mask: "radial-gradient(circle, transparent 58%, black 60%)",
            WebkitMask: "radial-gradient(circle, transparent 58%, black 60%)",
          }}
        />
        <span className="text-sm font-semibold tracking-wide text-white uppercase">
          <I18nText textKey="tours.holdSteady" />
        </span>
      </span>

      {/* Which way the next one is. */}
      <span
        ref={arrowRef}
        className="absolute top-1/2 left-1/2 size-40"
        style={{ display: "none" }}
      >
        <svg viewBox="0 0 40 40" className="size-full">
          <path
            d="M20 2 L26 14 L20 11 L14 14 Z"
            fill="white"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1"
          />
        </svg>
      </span>

      <span
        ref={crookedRef}
        className="absolute top-[58%] left-1/2 -translate-x-1/2 rounded-full bg-amber-400/95 px-3 py-1 text-sm font-medium text-black"
        style={{ display: "none" }}
      >
        Hold the phone square
      </span>
    </div>
  );
});

/**
 * Let the camera meter the room, then request only controls that are safe
 * without guessing ISO, exposure time or colour temperature.
 *
 * One complete constraint update is used because each `applyConstraints`
 * call replaces the previous constraint set. Three separate calls made the
 * Samsung camera jump between exposure modes. Unsupported controls are left
 * alone and the phone keeps its automatic metering.
 */
async function lockCamera(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  let able: CameraControlCapabilities = {};
  try {
    able = (track.getCapabilities?.() ?? {}) as CameraControlCapabilities;
  } catch {
    return;
  }

  // The stream is already live even though the preview has not mounted yet.
  // Give Samsung's metering enough time to leave its dark startup exposure.
  await new Promise((resolve) => setTimeout(resolve, CAMERA_METERING_SETTLE_MS));

  const plan = safeCameraControlPlan(able);
  if (Object.keys(plan).length === 0) return;

  try {
    await track.applyConstraints({ advanced: [plan] } as MediaTrackConstraints);
  } catch {
    // Keep the phone's automatic camera settings when a driver rejects this.
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function currentScreenAngle(): number {
  const modern = window.screen.orientation?.angle;
  if (typeof modern === "number") return modern;
  const legacy = (window as typeof window & { orientation?: number }).orientation;
  return typeof legacy === "number" ? legacy : 0;
}
