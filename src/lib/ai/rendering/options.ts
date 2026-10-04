/**
 * What the client sees.
 *
 * Ids, labels and categories — nothing else. The technical rendering
 * instructions behind each of these live in `knowledge.ts`, which is
 * `server-only`, and the separation is the whole point rather than tidiness.
 *
 * This file is imported by a React component, and Next bundles what a client
 * component imports. Put "physically believable rainy environment, realistic
 * wet surfaces, subtle puddles…" in here and it ships to the browser in a
 * readable JavaScript chunk — which is the one thing the brief asks for by
 * name: the client must not see the hidden instructions.
 *
 * So the rule is mechanical rather than a matter of care: **no sentence in this
 * file describes how to render anything.** A label is a word somebody picks
 * from a list. If a label needs explaining, the explanation is a `hint`, and a
 * hint is written for the person choosing, not for the model.
 */

export type OptionCategory =
  | "scene"
  | "time"
  | "weather"
  | "lighting"
  | "sky"
  | "style"
  | "materials"
  | "landscape"
  | "activity"
  | "camera"
  | "quality";

export type RenderOption = {
  id: string;
  label: string;
  category: OptionCategory;
  /** One short line for the person choosing. Never an instruction to a model. */
  hint?: string;
};

/** Whether a category takes one answer or several. */
export const MULTI_SELECT: OptionCategory[] = ["materials"];

export const RENDER_OPTIONS: RenderOption[] = [
  // ---- Scene --------------------------------------------------------------
  { id: "exterior", label: "Exterior", category: "scene" },
  { id: "interior", label: "Interior", category: "scene" },
  { id: "street-view", label: "Street View", category: "scene" },
  { id: "aerial", label: "Aerial", category: "scene" },
  { id: "landscape-scene", label: "Landscape", category: "scene" },
  {
    id: "presentation",
    label: "Architectural Presentation",
    category: "scene",
    hint: "For a board or a client pack.",
  },

  // ---- Time ---------------------------------------------------------------
  { id: "morning", label: "Morning", category: "time" },
  { id: "midday", label: "Midday", category: "time" },
  { id: "afternoon", label: "Afternoon", category: "time" },
  { id: "golden-hour", label: "Golden Hour", category: "time" },
  { id: "sunset", label: "Sunset", category: "time" },
  { id: "blue-hour", label: "Blue Hour", category: "time" },
  { id: "night", label: "Night", category: "time" },

  // ---- Weather ------------------------------------------------------------
  { id: "clear", label: "Clear", category: "weather" },
  { id: "partly-cloudy", label: "Partly Cloudy", category: "weather" },
  { id: "overcast", label: "Overcast", category: "weather" },
  { id: "rain", label: "Rain", category: "weather" },
  { id: "after-rain", label: "After Rain", category: "weather" },
  { id: "fog", label: "Fog", category: "weather" },

  // ---- Lighting -----------------------------------------------------------
  { id: "natural", label: "Natural", category: "lighting" },
  { id: "soft", label: "Soft", category: "lighting" },
  { id: "dramatic", label: "Dramatic", category: "lighting" },
  { id: "warm", label: "Warm", category: "lighting" },
  { id: "cool", label: "Cool", category: "lighting" },
  { id: "interior-warm", label: "Interior Warm", category: "lighting" },
  {
    id: "daylight-artificial",
    label: "Daylight + Artificial",
    category: "lighting",
  },

  // ---- Sky ----------------------------------------------------------------
  { id: "clear-blue", label: "Clear Blue", category: "sky" },
  { id: "soft-clouds", label: "Soft Clouds", category: "sky" },
  { id: "dramatic-clouds", label: "Dramatic Clouds", category: "sky" },
  { id: "sunset-sky", label: "Sunset", category: "sky" },
  { id: "blue-hour-sky", label: "Blue Hour", category: "sky" },
  { id: "night-sky", label: "Night", category: "sky" },

  // ---- Style --------------------------------------------------------------
  {
    id: "preserve-style",
    label: "Preserve Original",
    category: "style",
    hint: "Keep the architecture as drawn.",
  },
  { id: "modern", label: "Modern", category: "style" },
  { id: "contemporary", label: "Contemporary", category: "style" },
  { id: "minimalist", label: "Minimalist", category: "style" },
  { id: "luxury", label: "Luxury", category: "style" },
  { id: "industrial", label: "Industrial", category: "style" },
  { id: "tropical", label: "Tropical", category: "style" },
  { id: "traditional", label: "Traditional", category: "style" },

  // ---- Materials ----------------------------------------------------------
  {
    id: "preserve-materials",
    label: "Preserve Original",
    category: "materials",
    hint: "Keep every material as it is.",
  },
  { id: "white-stucco", label: "White Stucco", category: "materials" },
  { id: "concrete", label: "Concrete", category: "materials" },
  { id: "natural-stone", label: "Natural Stone", category: "materials" },
  { id: "brick", label: "Brick", category: "materials" },
  { id: "wood", label: "Wood", category: "materials" },
  { id: "glass", label: "Glass", category: "materials" },
  { id: "metal", label: "Metal", category: "materials" },
  { id: "mixed-materials", label: "Mixed Materials", category: "materials" },

  // ---- Landscape ----------------------------------------------------------
  {
    id: "preserve-landscape",
    label: "Preserve Original",
    category: "landscape",
  },
  { id: "minimal-landscape", label: "Minimal", category: "landscape" },
  { id: "modern-landscape", label: "Modern", category: "landscape" },
  { id: "tropical-landscape", label: "Tropical", category: "landscape" },
  { id: "grass-trees", label: "Grass + Trees", category: "landscape" },
  { id: "urban-landscape", label: "Urban", category: "landscape" },
  {
    id: "dry-ethiopian",
    label: "Dry / Ethiopian",
    category: "landscape",
    hint: "Highland and lowland planting.",
  },
  { id: "luxury-landscape", label: "Luxury Landscape", category: "landscape" },

  // ---- Activity -----------------------------------------------------------
  { id: "no-people", label: "None", category: "activity" },
  { id: "few-people", label: "Few People", category: "activity" },
  { id: "people-cars", label: "People + Cars", category: "activity" },
  { id: "active-street", label: "Active Street", category: "activity" },
  { id: "luxury-lifestyle", label: "Luxury Lifestyle", category: "activity" },

  // ---- Camera -------------------------------------------------------------
  { id: "eye-level", label: "Eye Level", category: "camera" },
  { id: "street-camera", label: "Street View", category: "camera" },
  { id: "low-angle", label: "Low Angle", category: "camera" },
  { id: "high-angle", label: "High Angle", category: "camera" },
  { id: "aerial-camera", label: "Aerial", category: "camera" },
  { id: "wide-angle", label: "Wide Angle", category: "camera" },
  { id: "close-up", label: "Architectural Close-up", category: "camera" },

  // ---- Quality ------------------------------------------------------------
  {
    id: "fast",
    label: "Fast Preview",
    category: "quality",
    hint: "Quickest, cheapest.",
  },
  { id: "standard", label: "Standard", category: "quality" },
  { id: "high", label: "High Quality", category: "quality" },
];

export const CATEGORY_LABELS: Record<OptionCategory, string> = {
  scene: "Scene",
  time: "Time",
  weather: "Weather",
  lighting: "Lighting",
  sky: "Sky",
  style: "Architectural Style",
  materials: "Materials",
  landscape: "Landscape",
  activity: "Activity",
  camera: "Camera",
  quality: "Quality",
};

/** The order the panel shows them in — the order somebody decides them in. */
export const CATEGORY_ORDER: OptionCategory[] = [
  "scene",
  "time",
  "weather",
  "lighting",
  "sky",
  "style",
  "materials",
  "landscape",
  "activity",
  "camera",
  "quality",
];

export function optionsIn(category: OptionCategory): RenderOption[] {
  return RENDER_OPTIONS.filter((option) => option.category === category);
}

export function findOption(id: string): RenderOption | undefined {
  return RENDER_OPTIONS.find((option) => option.id === id);
}

/**
 * How much licence the model has.
 *
 * Three words rather than a slider, because the difference people care about
 * is categorical: change only what I said, tidy it up, or show me something.
 */
export const CREATIVE_LEVELS = ["strict", "balanced", "creative"] as const;
export type CreativeLevel = (typeof CREATIVE_LEVELS)[number];

export const CREATIVE_LABELS: Record<CreativeLevel, { label: string; hint: string }> = {
  strict: { label: "Strict", hint: "Only what you asked for." },
  balanced: { label: "Balanced", hint: "Tasteful improvements, same building." },
  creative: { label: "Creative", hint: "More freedom, same concept." },
};

/** What the workspace sends to the server. */
export type RenderSettings = {
  /** One id per single-choice category; several for materials. */
  selections: Partial<Record<OptionCategory, string[]>>;
  preserveDesign: boolean;
  creative: CreativeLevel;
  instruction: string;
};

export const DEFAULT_SETTINGS: RenderSettings = {
  selections: {
    scene: ["exterior"],
    time: ["midday"],
    weather: ["clear"],
    lighting: ["natural"],
    sky: ["clear-blue"],
    style: ["preserve-style"],
    materials: ["preserve-materials"],
    landscape: ["preserve-landscape"],
    activity: ["no-people"],
    camera: ["eye-level"],
    quality: ["standard"],
  },
  // On by default, and the brief is emphatic about it: somebody uploading their
  // own building wants *their* building back.
  preserveDesign: true,
  creative: "strict",
  instruction: "",
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export type RenderPreset = {
  id: string;
  label: string;
  blurb: string;
  selections: Partial<Record<OptionCategory, string[]>>;
};

/**
 * Presets only move the controls.
 *
 * Nothing here is a hidden shortcut with settings the panel cannot show. After
 * applying one, every control reads back exactly what the preset chose, and
 * every one of them can be changed — which is what makes a preset a starting
 * point rather than a mode.
 */
export const RENDER_PRESETS: RenderPreset[] = [
  {
    id: "modern-day",
    label: "Modern Day",
    blurb: "Clear midday light, modern treatment.",
    selections: {
      weather: ["clear"],
      time: ["midday"],
      lighting: ["natural"],
      style: ["modern"],
      sky: ["clear-blue"],
    },
  },
  {
    id: "luxury-golden-hour",
    label: "Luxury Golden Hour",
    blurb: "Warm low sun, premium materials, planted.",
    selections: {
      time: ["golden-hour"],
      weather: ["clear"],
      lighting: ["warm"],
      style: ["luxury"],
      landscape: ["modern-landscape"],
      sky: ["sunset-sky"],
    },
  },
  {
    id: "night-luxury",
    label: "Night Luxury",
    blurb: "Dark sky, lit interiors, dramatic.",
    selections: {
      time: ["night"],
      lighting: ["interior-warm"],
      style: ["luxury"],
      sky: ["night-sky"],
      weather: ["clear"],
    },
  },
  {
    id: "minimal-white",
    label: "Minimal White",
    blurb: "Flat light on white render.",
    selections: {
      time: ["midday"],
      weather: ["clear"],
      lighting: ["soft"],
      materials: ["white-stucco"],
      style: ["minimalist"],
      sky: ["clear-blue"],
    },
  },
  {
    id: "real-estate",
    label: "Real Estate Marketing",
    blurb: "The one that sells a listing.",
    selections: {
      time: ["golden-hour"],
      weather: ["clear"],
      lighting: ["warm"],
      style: ["modern"],
      landscape: ["grass-trees"],
      activity: ["people-cars"],
      sky: ["sunset-sky"],
    },
  },
];

export function applyPreset(
  settings: RenderSettings,
  preset: RenderPreset,
): RenderSettings {
  return {
    ...settings,
    selections: { ...settings.selections, ...preset.selections },
  };
}
