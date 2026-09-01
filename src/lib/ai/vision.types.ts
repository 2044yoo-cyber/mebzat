/**
 * The shape of an image survey.
 *
 * Split out from `vision.ts` because that module is `server-only` — it holds
 * the provider keys — and the redesign workspace is a client component that
 * needs to render this. Types cost nothing at runtime; the code that produces
 * them stays on the server.
 */

export type DetectedSurface = {
  /** floor, wall, ceiling, countertop… */
  element: string;
  /** The material as seen: ceramic, marble, timber, painted plaster… */
  material: string;
  condition?: string;
};

export type DetectedFurniture = {
  item: string;
  /** Roughly where it is, in words, so the editor can name it in a prompt. */
  position?: string;
};

export type SpaceAnalysis = {
  /** "Living room", "Kitchen", "Building facade"… */
  spaceType: string;
  /** Free text — "approximately 4 × 5 m" — always hedged. */
  estimatedDimensions: string | null;
  lighting: string;
  walls: string;
  windows: string;
  doors: string;
  ceiling: string;
  floor: string;
  surfaces: DetectedSurface[];
  furniture: DetectedFurniture[];
  emptyAreas: string[];
  currentStyle: string;
  /** Things worth fixing. Observations, not instructions. */
  problems: string[];
  /** A paragraph a person would actually read. */
  summary: string;
  /** Style ids from DESIGN_STYLES the model thinks would suit the space. */
  suggestedStyles: string[];
};
