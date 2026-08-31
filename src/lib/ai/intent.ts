import type { ImageCapability, ImageIntent } from "@/lib/ai/image-models";

/**
 * What Medosha AI does with what you just said.
 *
 * This is the layer that replaces asking people to pick a tool. Somebody
 * typing "make the front wall stone" with a photograph attached does not want
 * to be told to open Material Replacer first — they have already said what
 * they want, twice, in the only two ways available to them: the words and the
 * attachment.
 *
 * ## Why this is a function and not a model call
 *
 * A model could classify these, and the temptation is strong. It is the wrong
 * trade here for three reasons: it adds a round trip before anything visible
 * happens, it costs credits on a step the member did not ask for, and it makes
 * the routing non-deterministic — "why did it do that?" becomes unanswerable.
 *
 * The words people use for these jobs are not subtle. "Render this sketch",
 * "how much will this cost", "remove the background" — the vocabulary is
 * small, domain-specific and stable, which is exactly the case where scoring
 * beats a classifier. Where the words genuinely are ambiguous, the attachment
 * decides, and where that is ambiguous too it falls through to conversation,
 * which is the safe direction: an answer in words costs a fraction of a credit
 * and can be followed up, where a wrongly-generated image costs a whole one.
 *
 * No `server-only` guard. The chat needs to know which endpoint to call before
 * it calls it, and there is nothing secret in a list of words. The server does
 * not trust the client's routing either — both call this, and the server's
 * answer is the one that decides what is charged.
 */

// ---------------------------------------------------------------------------
// What can be asked for
// ---------------------------------------------------------------------------

/** The families a request can land in. */
export type AiTask =
  /** Answered in words, by one of the existing agents. */
  | "chat"
  /** Answered with a picture. */
  | "image";

/**
 * The specific thing being asked for, under the task.
 *
 * These are internal. Nothing in the UI ever asks a member to choose one, and
 * nothing in the UI is named after one — they exist so the request reaches the
 * right model with the right prompt.
 */
export type AiCapability =
  // Image
  | "facade"
  | "interior"
  | "furniture"
  | "materials"
  | "lighting"
  | "landscape"
  | "render"
  | "sketch"
  | "floorplan"
  | "edit"
  | "generate"
  | "background-removal"
  | "upscale"
  // Words
  | "cost"
  | "boq"
  | "material-advice"
  | "suppliers"
  | "documents"
  | "property"
  | "general";

export type RoutedRequest = {
  task: AiTask;
  capability: AiCapability;
  /** For the image route. */
  intent: ImageIntent;
  /** What the model must be able to do. */
  imageCapability: ImageCapability;
  /**
   * Whether the building in the attached photograph must survive the edit.
   *
   * The single most damaging failure in architectural work: somebody asks for
   * new materials and gets a different building. Only ever true when there is
   * an image to preserve.
   */
  preserveGeometry: boolean;
  /**
   * Roughly how sure this is, 0–1.
   *
   * Used for one thing: deciding whether to say out loud what was understood.
   * A confident route acts silently; a marginal one says "I've read this as a
   * facade redesign" so a wrong guess is correctable in one sentence rather
   * than by starting again.
   */
  confidence: number;
  /** One line, in the member's language, for when the route is announced. */
  reading: string;
};

export type RouteInput = {
  text: string;
  /** True when the member attached, or is carrying forward, an image. */
  hasImage: boolean;
  /**
   * True when the image came from Medosha AI's own previous answer.
   *
   * It changes the reading of a bare follow-up. "Make it darker" after a
   * generated image is another edit of that image; the same words with no
   * image at all are a question.
   */
  imageFromPreviousAnswer?: boolean;
};

// ---------------------------------------------------------------------------
// Vocabulary
//
// Multi-word phrases score 3, single words 1, for the reason the agent router
// already uses: "bill of quantities" is evidence and a stray "quantities" is
// not. Every phrase here is one somebody actually types.
// ---------------------------------------------------------------------------

type Rule = {
  capability: AiCapability;
  task: AiTask;
  triggers: string[];
  /**
   * Phrases that name the *input* rather than the output, scoring 6.
   *
   * "Turn this sketch into a realistic architectural render" contains a strong
   * signal and a weak one, and the weak one used to win: "architectural render"
   * outscored "turn this sketch", and the request went to a general renderer
   * instead of the sketch pipeline. Naming the input is worth more than naming
   * the output, because the input decides which model can do the job at all —
   * the output is a description of the result either way.
   */
  strong?: string[];
  /** Only considered when an image is present. */
  needsImage?: boolean;
  /**
   * Fallback rules, consulted only when nothing specific matched.
   *
   * `edit` and `generate` are catch-alls whose vocabulary — "make it", "add a",
   * "change this" — appears inside almost every specific request too. Scored as
   * peers they beat the rules that actually say what the job is: "redesign this
   * facade and make it modern" landed on `edit` because "make it modern" scores
   * higher than the single word "facade". They are a tier below instead.
   */
  fallback?: boolean;
  /** Extra evidence that a substring cannot express. */
  bonus?: (text: string) => number;
};

/**
 * Materials somebody names when they want a surface changed.
 *
 * Used with a verb rather than alone, because "stone" on its own appears in
 * "a stone villa" — a description of what to build, not an instruction to swap
 * a surface on something that already exists.
 */
const MATERIAL_NOUNS = [
  "stone",
  "marble",
  "granite",
  "travertine",
  "terrazzo",
  "timber",
  "wood",
  "walnut",
  "oak",
  "concrete",
  "brick",
  "tile",
  "tiles",
  "plaster",
  "render",
  "cladding",
  "aluminium",
  "aluminum",
  "glass",
  "paint",
  "colour",
  "color",
  "gray",
  "grey",
];

const SWAP_VERBS = [
  "change the",
  "change this",
  "replace the",
  "swap the",
  "swap",
  "make the",
  "turn the",
];

const RULES: Rule[] = [
  // ---- Utilities. Unmistakable, and they take an image ---------------------
  {
    capability: "background-removal",
    task: "image",
    needsImage: true,
    strong: ["remove the background", "cut out the background", "remove background"],
    triggers: [
      "transparent background",
      "no background",
      "cut out",
      "isolate the subject",
    ],
  },
  {
    capability: "upscale",
    task: "image",
    needsImage: true,
    triggers: [
      "upscale",
      "higher resolution",
      "increase the resolution",
      "enhance the quality",
      "sharpen",
      "make it bigger without",
      "enlarge",
    ],
  },

  // ---- Design ------------------------------------------------------------
  {
    capability: "sketch",
    task: "image",
    needsImage: true,
    strong: [
      "turn this sketch",
      "render this sketch",
      "from this sketch",
      "make this sketch",
      "sketch to render",
      "turn this drawing into",
    ],
    triggers: ["my sketch", "hand drawing", "hand-drawn", "cad screenshot"],
  },
  {
    capability: "floorplan",
    task: "image",
    strong: ["floor plan", "floorplan", "this plan"],
    triggers: [
      "furnished plan",
      "layout of the apartment",
      "room layout",
      "plan view",
      "as a furnished 3d",
      "3d view of this plan",
    ],
  },
  {
    capability: "facade",
    task: "image",
    strong: ["facade", "façade"],
    triggers: [
      "elevation",
      "exterior of the building",
      "the exterior",
      "front of the house",
      "front wall",
      "outside of the building",
      "street view of",
      "building exterior",
      "villa",
      "the building look",
    ],
  },
  {
    capability: "interior",
    task: "image",
    // Room names are as decisive as "facade", and for the same reason: they
    // name the thing being worked on. Without this, "make the kitchen modern
    // with walnut cabinets" scored as a material swap — a verb and a material
    // noun appear in it, but they are not about each other, and the word that
    // says what is being redesigned is "kitchen".
    strong: ["living room", "sitting room", "bedroom", "kitchen", "bathroom", "dining room"],
    triggers: [
      "the room",
      "this room",
      "my room",
      "interior",
      "redesign my space",
      "restyle",
      "office space",
      "reception area",
    ],
  },
  {
    capability: "furniture",
    task: "image",
    triggers: [
      "wardrobe",
      "cabinet",
      "cupboard",
      "sofa",
      "the furniture",
      "a chair",
      "a table",
      "shelving unit",
      "tv unit",
      "vanity unit",
      "design a piece",
    ],
  },
  {
    capability: "lighting",
    task: "image",
    triggers: [
      "lighting",
      "lights",
      "lit",
      "warm light",
      "add lamps",
      "brighter",
      "golden hour",
      "at night",
      "evening light",
      "daylight",
    ],
  },
  {
    capability: "landscape",
    task: "image",
    triggers: [
      "landscaping",
      "landscape",
      "garden",
      "courtyard",
      "planting",
      "trees around",
      "outdoor space",
      "terrace",
      "paving",
    ],
  },
  {
    capability: "materials",
    task: "image",
    needsImage: true,
    triggers: [
      "change the material",
      "change the materials",
      "replace the material",
      "change the floor to",
      "change the wall to",
      "change the ceiling to",
      "make the walls",
      "make the floor",
      "change the cladding",
      "change the worktop",
      "change the countertop",
    ],
    // A verb plus a named material. Worth two — enough to win a follow-up like
    // "change the stone to darker gray", which names no surface and no room and
    // would otherwise fall through to a generic edit, but not enough to
    // outrank a rule that says which part of the building is being worked on.
    bonus: (text) =>
      SWAP_VERBS.some((verb) => text.includes(verb)) &&
      MATERIAL_NOUNS.some((noun) => text.includes(noun))
        ? 2
        : 0,
  },
  {
    capability: "render",
    task: "image",
    triggers: [
      "render",
      "photorealistic",
      "photoreal",
      "realistic image",
      "visualisation",
      "visualization",
      "make it realistic",
      "architectural render",
    ],
  },
  {
    capability: "edit",
    task: "image",
    needsImage: true,
    fallback: true,
    triggers: [
      "edit this",
      "change this",
      "remove the",
      "add a",
      "take out the",
      "clean up",
      "declutter",
      "make this",
      "make it",
      "redesign",
      "modernise",
      "modernize",
      "make it modern",
      "make it luxury",
      "make it luxurious",
    ],
  },
  {
    capability: "generate",
    task: "image",
    fallback: true,
    triggers: [
      "generate an image",
      "create an image",
      "draw me",
      "show me a picture",
      "make a picture",
      "an image of",
      "picture of",
      "design a",
      "concept image",
    ],
  },

  // ---- Words -------------------------------------------------------------
  {
    capability: "cost",
    task: "chat",
    triggers: [
      "how much does",
      "how much will",
      "how much to build",
      "cost to build",
      "estimate the cost",
      "cost estimate",
      "construction cost",
      "budget for",
      "how much to build",
      "what would it cost",
      "price to build",
      "estimate the construction",
    ],
  },
  {
    capability: "boq",
    task: "chat",
    triggers: [
      "bill of quantities",
      "boq",
      "quantity takeoff",
      "take off",
      "takeoff",
      "schedule of rates",
      "quantities for",
    ],
  },
  {
    capability: "material-advice",
    task: "chat",
    triggers: [
      "price of cement",
      "price of steel",
      "current price",
      "which material",
      "what material should",
      "compare materials",
      "specification for",
      "best material for",
      "cement",
      "rebar",
      "hcb",
      "aggregate",
    ],
  },
  {
    capability: "suppliers",
    task: "chat",
    triggers: [
      "find suppliers",
      "find a supplier",
      "who sells",
      "where can i buy",
      "supplier for",
      "stockist",
      "vendors for",
    ],
  },
  {
    capability: "documents",
    task: "chat",
    triggers: [
      "drawing set",
      "the specification",
      "read this document",
      "this pdf",
      "the contract",
      "tender document",
      "what should the drawings",
    ],
  },
  {
    capability: "property",
    task: "chat",
    triggers: [
      "value of this property",
      "estimate the value",
      "property valuation",
      "land value",
      "how much is this land",
      "market value",
      "worth of the property",
      "rental yield",
      "sqm property",
    ],
  },
];

/**
 * Words that mean "and change the building itself".
 *
 * Everything else is treated as a surface change, and the geometry is held.
 * Being wrong in that direction is recoverable — the member says "actually add
 * a floor" and gets it. Being wrong the other way silently returns a different
 * building, which people do not always notice until they have shown it to a
 * client.
 */
const GEOMETRY_CHANGE = [
  "add a floor",
  "add another floor",
  "extra storey",
  "extra story",
  "add a storey",
  "more storeys",
  "change the shape",
  "change the form",
  "change the layout",
  "different building",
  "taller",
  "wider",
  "bigger building",
  "extend the",
  "add an extension",
  "add a balcony",
  "remove the balcony",
  "move the windows",
  "add windows",
  "add a window",
  "remove the roof",
  "change the roof shape",
  "new roof form",
  "redesign the whole building",
  "completely different",
  "from scratch",
];

/** Phrases that ask, explicitly, for the building to be left alone. */
const GEOMETRY_HOLD = [
  "keep the exact geometry",
  "keep the geometry",
  "same geometry",
  "keep the shape",
  "keep the same shape",
  "exact same building",
  "keep the structure",
  "same structure",
  "keep the layout",
  "don't change the shape",
  "do not change the shape",
  "preserve the",
  "keep the building",
  "same camera",
  "same angle",
];

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

export function routeRequest(input: RouteInput): RoutedRequest {
  const text = input.text.toLowerCase().trim();
  const hasImage = input.hasImage;

  const score = (rule: Rule): number => {
    if (rule.needsImage && !hasImage) return 0;

    let total = 0;
    for (const trigger of rule.strong ?? []) {
      if (text.includes(trigger)) total += 6;
    }
    for (const trigger of rule.triggers) {
      if (!text.includes(trigger)) continue;
      total += trigger.includes(" ") ? 3 : 1;
    }
    total += rule.bonus?.(text) ?? 0;
    return total;
  };

  // Two passes, not one. A specific rule that scored at all beats a catch-all
  // that scored higher, because the catch-all's vocabulary lives inside the
  // specific requests too — every facade redesign also contains "make it".
  let best: Rule | null = null;
  let bestScore = 0;
  let runnerUp = 0;

  for (const tier of [false, true]) {
    for (const rule of RULES) {
      if ((rule.fallback ?? false) !== tier) continue;

      const value = score(rule);
      if (value === 0) continue;

      if (value > bestScore) {
        runnerUp = bestScore;
        bestScore = value;
        best = rule;
      } else if (value > runnerUp) {
        runnerUp = value;
      }
    }
    if (best) break;
  }

  // An attached image with words that matched nothing is still almost
  // certainly an edit — nobody uploads a photograph of their kitchen to ask an
  // abstract question about it. This is the case that used to force somebody
  // into the tool rail.
  if (!best && hasImage && text.length > 0) {
    best = RULES.find((rule) => rule.capability === "edit") ?? null;
    bestScore = 2;
  }

  if (!best) {
    return {
      task: "chat",
      capability: "general",
      intent: "general",
      imageCapability: "text-to-image",
      preserveGeometry: false,
      confidence: 0.4,
      reading: "Answering in words",
    };
  }

  // A rule that wants an image and has one is more certain than the same words
  // with nothing attached.
  const margin = bestScore - runnerUp;
  const confidence = clamp(
    0.4 + bestScore * 0.08 + margin * 0.06 + (hasImage && best.task === "image" ? 0.15 : 0),
  );

  const task = best.task;
  const capability = best.capability;

  return {
    task,
    capability,
    intent: intentFor(capability, hasImage),
    imageCapability: imageCapabilityFor(capability, hasImage),
    preserveGeometry: shouldPreserveGeometry(text, capability, hasImage),
    confidence,
    reading: readingFor(capability, hasImage),
  };
}

/**
 * Whether the building has to survive.
 *
 * True by default whenever there is an image and the job is an architectural
 * one — that is the whole point. An explicit request to change the form turns
 * it off, and an explicit request to hold it turns it back on, because
 * somebody who writes "keep the exact geometry, make it taller" has said the
 * quiet part and should be believed over a keyword.
 */
export function shouldPreserveGeometry(
  text: string,
  capability: AiCapability,
  hasImage: boolean,
): boolean {
  if (!hasImage) return false;

  const lower = text.toLowerCase();

  // An explicit hold wins outright, including over an explicit change.
  if (GEOMETRY_HOLD.some((phrase) => lower.includes(phrase))) return true;
  if (GEOMETRY_CHANGE.some((phrase) => lower.includes(phrase))) return false;

  // Utilities do not touch the subject at all, so there is nothing to hold and
  // saying so would only clutter the prompt.
  if (capability === "background-removal" || capability === "upscale") {
    return false;
  }

  return true;
}

/**
 * The clause that makes a model leave the building alone.
 *
 * Written as a list of nouns rather than "keep the geometry", because image
 * models respond to concrete things they can see. "Keep the geometry" is an
 * abstraction; "the same number of floors, the same window positions" is an
 * instruction.
 */
export const GEOMETRY_CLAUSE =
  "Keep the existing building exactly as it is: the same shape and massing, " +
  "the same number of floors, the same window and door positions and sizes, " +
  "the same balconies, the same roof form and pitch, the same proportions, " +
  "and the same camera position and angle. Change only what was asked for.";

/**
 * The prompt actually sent, with the geometry clause when it applies.
 *
 * The member's own words come first and are never rewritten. Everything added
 * is appended, so a prompt that already says "keep the geometry" simply says
 * it twice, which costs nothing and is safer than trying to detect and skip.
 */
export function composeAiPrompt(text: string, route: RoutedRequest): string {
  const prompt = text.trim();
  if (!route.preserveGeometry) return prompt;
  return `${prompt}\n\n${GEOMETRY_CLAUSE}`;
}

/** Which agent answers, for the routes that are answered in words. */
export function agentFor(capability: AiCapability): string | undefined {
  switch (capability) {
    case "cost":
      return "cost";
    case "boq":
      return "boq";
    case "material-advice":
      return "materials";
    case "suppliers":
      return "marketplace";
    case "documents":
      return "drawings";
    case "property":
      // No property agent exists; construction is the closest and it has the
      // catalogue context. Naming it here rather than inventing an agent keeps
      // this honest about what is actually implemented.
      return "construction";
    default:
      return undefined;
  }
}

function intentFor(capability: AiCapability, hasImage: boolean): ImageIntent {
  switch (capability) {
    case "background-removal":
      return "background-removal";
    case "upscale":
      return "upscale";
    case "sketch":
    case "floorplan":
      return "sketch";
    case "facade":
    case "landscape":
      return hasImage ? "edit" : "exterior";
    case "interior":
    case "lighting":
      return hasImage ? "edit" : "interior";
    case "furniture":
      return "product";
    case "materials":
    case "edit":
      return "edit";
    default:
      return "general";
  }
}

function imageCapabilityFor(
  capability: AiCapability,
  hasImage: boolean,
): ImageCapability {
  if (capability === "background-removal") return "background-removal";
  if (capability === "upscale") return "upscale";
  // A surface swap is the one job worth asking for inpainting: it is the only
  // capability that can change one thing and provably leave the rest of the
  // pixels alone.
  if (capability === "materials" && hasImage) return "inpaint";
  return hasImage ? "image-to-image" : "text-to-image";
}

function readingFor(capability: AiCapability, hasImage: boolean): string {
  switch (capability) {
    case "facade":
      return hasImage ? "Redesigning the facade" : "Designing a facade";
    case "interior":
      return hasImage ? "Redesigning this room" : "Designing an interior";
    case "furniture":
      return "Designing furniture";
    case "materials":
      return "Replacing materials";
    case "lighting":
      return "Changing the lighting";
    case "landscape":
      return "Designing the landscaping";
    case "render":
      return "Rendering";
    case "sketch":
      return "Rendering from your sketch";
    case "floorplan":
      return "Working from the plan";
    case "edit":
      return "Editing the image";
    case "generate":
      return "Generating an image";
    case "background-removal":
      return "Removing the background";
    case "upscale":
      return "Enlarging the image";
    case "cost":
      return "Estimating cost";
    case "boq":
      return "Working on the bill of quantities";
    case "material-advice":
      return "Checking materials";
    case "suppliers":
      return "Finding suppliers";
    case "documents":
      return "Reading the documents";
    case "property":
      return "Valuing the property";
    default:
      return "Answering in words";
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

/**
 * The optional shortcut chips.
 *
 * Shortcuts, not modes. Each one drops a phrase into the composer that the
 * router would have understood anyway, so pressing one is the same as typing —
 * and nothing is unreachable without them.
 */
export const QUICK_ACTIONS: { id: string; label: string; phrase: string; needsImage?: boolean }[] =
  [
    { id: "redesign", label: "Redesign", phrase: "Redesign this and make it modern. Keep the exact geometry.", needsImage: true },
    { id: "render", label: "Render", phrase: "Turn this into a photorealistic architectural render. Keep the exact geometry." },
    { id: "materials", label: "Change materials", phrase: "Change the facade materials to natural stone and timber. Keep the exact geometry.", needsImage: true },
    { id: "lighting", label: "Lighting", phrase: "Add warm architectural lighting, evening.", needsImage: true },
    { id: "cost", label: "Estimate cost", phrase: "Estimate the construction cost of " },
    { id: "boq", label: "BOQ", phrase: "Create a bill of quantities for " },
  ];
