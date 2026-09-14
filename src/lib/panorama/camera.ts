import { verticalFov } from "./orientation";
import { fieldsOfView } from "./sphere";

export type CameraIntrinsics = {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

export type CameraCalibration = {
  hfov: number;
  vfov: number;
  intrinsics: CameraIntrinsics;
  focalLength: number | null;
  source: "device" | "intrinsics" | "estimated";
  cameraLabel: string | null;
};

function plausible(value: unknown, low: number, high: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high
    ? value
    : null;
}

export function intrinsicsFromFov(
  width: number,
  height: number,
  hfov: number,
  vfov = verticalFov(hfov, width, height),
): CameraIntrinsics {
  return {
    fx: width / (2 * Math.tan((hfov * Math.PI) / 360)),
    fy: height / (2 * Math.tan((vfov * Math.PI) / 360)),
    cx: (width - 1) / 2,
    cy: (height - 1) / 2,
    width,
    height,
  };
}

export function horizontalFovFromFx(width: number, fx: number): number {
  return (2 * Math.atan(width / (2 * fx)) * 180) / Math.PI;
}

/**
 * Read non-standard camera geometry only when the browser actually supplies
 * it. The Media Capture standard does not require focal length or FOV, but a
 * few native webviews expose them on the settings object. Unknown values are
 * never treated as real measurements.
 */
export function cameraCalibration(
  track: MediaStreamTrack,
  fallbackWidth = 1920,
  fallbackHeight = 1080,
): CameraCalibration {
  type Extended = MediaTrackSettings & {
    horizontalFieldOfView?: number;
    fieldOfView?: number;
    focalLengthX?: number;
    focalLengthY?: number;
    principalPointX?: number;
    principalPointY?: number;
    focalLength?: number;
  };

  let settings: Extended = {};
  try {
    settings = (track.getSettings?.() ?? {}) as Extended;
  } catch {
    // A detached track can throw. The conservative estimate below remains.
  }

  const width = plausible(settings.width, 1, 20_000) ?? fallbackWidth;
  const height = plausible(settings.height, 1, 20_000) ?? fallbackHeight;
  const reportedFov =
    plausible(settings.horizontalFieldOfView, 20, 120) ??
    plausible(settings.fieldOfView, 20, 120);
  const reportedFx = plausible(settings.focalLengthX, width * 0.2, width * 10);

  // The estimate is resolved against the frame's own shape. A camera that says
  // nothing about its optics used to be told its frame was 70° across
  // whichever way round it came, which is right for a landscape frame and
  // overstates a tall one by about 1.6x — and a frame that claims to be wider
  // than it is gets stretched across the sphere by exactly that factor.
  const hfov = reportedFx
    ? horizontalFovFromFx(width, reportedFx)
    : reportedFov ?? fieldsOfView(width, height).hfov;
  let vfov = verticalFov(hfov, width, height);
  const intrinsics = intrinsicsFromFov(width, height, hfov, vfov);

  if (reportedFx) {
    intrinsics.fx = reportedFx;
    intrinsics.fy =
      plausible(settings.focalLengthY, height * 0.2, height * 10) ?? reportedFx;
    intrinsics.cx =
      plausible(settings.principalPointX, 0, width) ?? (width - 1) / 2;
    intrinsics.cy =
      plausible(settings.principalPointY, 0, height) ?? (height - 1) / 2;
    vfov = (2 * Math.atan(height / (2 * intrinsics.fy)) * 180) / Math.PI;
  }

  return {
    hfov,
    vfov,
    intrinsics,
    focalLength: plausible(settings.focalLength, 0.1, 100),
    source: reportedFx ? "intrinsics" : reportedFov ? "device" : "estimated",
    cameraLabel: track.label ? track.label.slice(0, 80) : null,
  };
}

/** Scale one calibration to the exact pixels written into a captured JPEG. */
export function calibrationForSize(
  calibration: CameraCalibration,
  width: number,
  height: number,
): CameraCalibration {
  const sx = width / calibration.intrinsics.width;
  const sy = height / calibration.intrinsics.height;
  return {
    ...calibration,
    vfov: verticalFov(calibration.hfov, width, height),
    intrinsics: {
      fx: calibration.intrinsics.fx * sx,
      fy: calibration.intrinsics.fy * sy,
      cx: calibration.intrinsics.cx * sx,
      cy: calibration.intrinsics.cy * sy,
      width,
      height,
    },
  };
}
