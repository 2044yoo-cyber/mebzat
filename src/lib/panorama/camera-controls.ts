/**
 * Camera controls that are safe to request without guessing sensor values.
 *
 * Android cameras may advertise manual exposure and white balance while not
 * exposing a usable ISO, exposure time or colour temperature to the browser.
 * Switching only the mode to `manual` can therefore select a dark default and
 * make mains-powered lights flicker. `single-shot` asks the camera to meter
 * once and hold its own result. If that mode is absent, leaving the property
 * alone is safer than inventing a value.
 */

export const CAMERA_METERING_SETTLE_MS = 1200;

export type CameraControlCapabilities = {
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  focusMode?: string[];
};

export type CameraControlPlan = {
  exposureMode?: "single-shot";
  whiteBalanceMode?: "single-shot";
  focusMode?: "continuous";
};

export function safeCameraControlPlan(
  capabilities: CameraControlCapabilities,
): CameraControlPlan {
  const plan: CameraControlPlan = {};

  if (capabilities.exposureMode?.includes("single-shot")) {
    plan.exposureMode = "single-shot";
  }
  if (capabilities.whiteBalanceMode?.includes("single-shot")) {
    plan.whiteBalanceMode = "single-shot";
  }
  if (capabilities.focusMode?.includes("continuous")) {
    plan.focusMode = "continuous";
  }

  return plan;
}
