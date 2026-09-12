/**
 * What to tell somebody when a stitch does not work.
 *
 * This file used to hold the cylindrical single-row stitcher: a capture plan
 * of nine evenly spaced angles, one-dimensional column profiles, and a solver
 * that laid the frames out in a line. That approach is gone. A cylinder has no
 * top and no bottom, so everything above and below the one photographed band
 * had to be invented, and at the pole "invented" meant the nearest pixels
 * stretched in every direction at once — the funnel that collapsed to a point.
 *
 * The sphere is planned in `sphere.ts`, aimed at in `capture.ts` and warped in
 * `compose.ts`. What is left here is the messages, because section 17 asks for
 * sentences somebody can act on rather than an error code.
 */

export const STITCH_ERRORS = {
  too_few_frames:
    "There were not enough photos to build the room. Try again and keep going until every circle is filled in.",
  incomplete_sphere:
    "Part of the room was never photographed, so there would be a hole in it. Try again and fill in the circles above and below you as well as around.",
  no_overlap:
    "We couldn't join these photos because they did not overlap enough. Please try again and move more slowly between the circles.",
  frames_missing:
    "Some photos did not finish uploading. Check your connection and try again.",
  unreadable:
    "One of the photos could not be read. Please capture the room again.",
  decode_failed:
    "One of the photos could not be read. Please capture the room again.",
  too_large:
    "Those photos were too large to process. Try again — the app will use a smaller size.",
  blocked:
    "That 360 photo could not be published. If you think this is a mistake, please get in touch.",
  unknown:
    "Something went wrong making your 360 photo. Your photos are saved, so you can try again.",
} as const;

export type StitchError = keyof typeof STITCH_ERRORS;

export function stitchErrorMessage(code: string | null | undefined): string {
  if (code && code in STITCH_ERRORS) {
    return STITCH_ERRORS[code as StitchError];
  }
  return STITCH_ERRORS.unknown;
}
