import type { ImageCapability, ImageIntent } from "@/lib/ai/image-models";
import type { AiAgentName } from "@/types/database.types";

/**
 * The AI Studio's tool list.
 *
 * Client-safe. One array drives the left rail, the workspace router and the
 * keyboard shortcuts.
 *
 * A tool is one of two things, and the distinction matters because it is what
 * stops this from duplicating the assistant that already exists:
 *
 *   kind: "chat"   — the existing AiChat, pinned to an existing agent. Cost
 *                    Estimator, BOQ, Material Advisor and Supplier Finder are
 *                    these. No new chat implementation, no new prompts.
 *   kind: "image"  — the image workspace, configured by intent and capability.
 *
 * Adding a tool is one entry here.
 */

export type StudioToolKind = "chat" | "image";

export type StudioTool = {
  id: string;
  label: string;
  emoji: string;
  kind: StudioToolKind;
  blurb: string;
  /** For chat tools: which existing agent answers. */
  agent?: AiAgentName;
  /** For image tools: what the Auto router should prefer. */
  intent?: ImageIntent;
  /** For image tools: what the model must be able to do. */
  capability?: ImageCapability;
  /** Whether the workspace asks for a source image before it can run. */
  needsImage?: boolean;
  /** Placeholder shown in the prompt box. */
  placeholder?: string;
  /** Style presets offered for this tool, by id from STYLE_PRESETS. */
  styles?: string[];
};

export const STUDIO_TOOLS: StudioTool[] = [
  {
    id: "chat",
    label: "AI Chat",
    emoji: "💬",
    kind: "chat",
    blurb: "Ask anything about your build.",
  },
  {
    id: "redesign",
    label: "Redesign My Space",
    emoji: "🏠",
    kind: "image",
    intent: "edit",
    capability: "image-to-image",
    needsImage: true,
    blurb: "Upload your actual photo and redesign that room.",
  },
  {
    id: "image",
    label: "AI Image Generator",
    emoji: "🖼",
    kind: "image",
    intent: "general",
    capability: "text-to-image",
    blurb: "Describe it and generate.",
    placeholder: "A modern kitchen with walnut cabinets and a marble island…",
    styles: ["photoreal", "architectural", "magazine", "luxury"],
  },
  {
    id: "interior",
    label: "Interior Designer",
    emoji: "🏠",
    kind: "image",
    intent: "interior",
    capability: "text-to-image",
    blurb: "Restyle a room, or design one from nothing.",
    placeholder: "A living room in Ethiopian contemporary style, warm timber…",
    styles: ["modern", "luxury", "scandinavian", "japandi", "industrial", "ethiopian"],
  },
  {
    id: "facade",
    label: "Facade Designer",
    emoji: "🏗",
    kind: "image",
    intent: "exterior",
    capability: "text-to-image",
    blurb: "Elevations and exterior treatments.",
    placeholder: "A six-storey mixed-use facade in stone and glass, Addis Ababa…",
    styles: ["photoreal", "architectural", "modern", "luxury"],
  },
  {
    id: "furniture",
    label: "Furniture Designer",
    emoji: "🛋",
    kind: "image",
    intent: "product",
    capability: "text-to-image",
    blurb: "Pieces, in context or on white.",
    placeholder: "A four-door wardrobe in oak veneer with brushed brass handles…",
    styles: ["product", "photoreal", "luxury"],
  },
  {
    id: "editor",
    label: "AI Image Editor",
    emoji: "📷",
    kind: "image",
    intent: "edit",
    capability: "image-to-image",
    needsImage: true,
    blurb: "Change a photo by describing the change.",
    placeholder: "Remove the clutter from the worktop and add a pendant light…",
  },
  {
    id: "materials",
    label: "Material Replacer",
    emoji: "🎨",
    kind: "image",
    intent: "edit",
    capability: "inpaint",
    needsImage: true,
    blurb: "Swap one surface and leave the rest alone.",
    placeholder: "Replace with polished travertine…",
  },
  {
    id: "sketch",
    label: "Sketch → Render",
    emoji: "📐",
    kind: "image",
    intent: "sketch",
    capability: "image-to-image",
    needsImage: true,
    blurb: "A hand sketch or CAD screenshot, rendered.",
    placeholder: "Render this sketch photorealistically, late afternoon light…",
    styles: ["photoreal", "architectural", "magazine"],
  },
  {
    id: "floorplan",
    label: "Floor Plan AI",
    emoji: "🏢",
    kind: "image",
    intent: "sketch",
    capability: "text-to-image",
    blurb: "Plan layouts and furnished arrangements.",
    placeholder: "A 120m² three-bedroom apartment plan, open kitchen…",
    styles: ["architectural"],
  },
  {
    id: "landscape",
    label: "Landscape Designer",
    emoji: "🌳",
    kind: "image",
    intent: "exterior",
    capability: "text-to-image",
    blurb: "Gardens, courtyards and site treatment.",
    placeholder: "A walled courtyard garden with indigenous planting…",
    styles: ["photoreal", "magazine", "modern"],
  },
  {
    id: "lighting",
    label: "Lighting Designer",
    emoji: "💡",
    kind: "image",
    intent: "interior",
    capability: "text-to-image",
    blurb: "The same room, lit differently.",
    placeholder: "Warm layered lighting, cove and pendant, evening…",
    styles: ["night", "sunset", "photoreal", "luxury"],
  },
  {
    id: "product",
    label: "Product Renderer",
    emoji: "📦",
    kind: "image",
    intent: "product",
    capability: "text-to-image",
    blurb: "Catalogue shots for the marketplace.",
    placeholder: "A ceramic basin on a plain background, studio lighting…",
    styles: ["product", "photoreal"],
  },
  {
    id: "background",
    label: "Background Remover",
    emoji: "📸",
    kind: "image",
    intent: "background-removal",
    capability: "background-removal",
    needsImage: true,
    blurb: "Cut the subject out.",
  },
  {
    id: "upscale",
    label: "Image Upscaler",
    emoji: "🔍",
    kind: "image",
    intent: "upscale",
    capability: "upscale",
    needsImage: true,
    blurb: "Enlarge without softening.",
  },

  // ---- These are the assistant that already exists, not a second one ------
  {
    id: "cost",
    label: "Cost Estimator",
    emoji: "💰",
    kind: "chat",
    agent: "cost",
    blurb: "Budget a build with stated assumptions.",
  },
  {
    id: "boq",
    label: "BOQ Generator",
    emoji: "📋",
    kind: "chat",
    agent: "boq",
    blurb: "Draft a bill of quantities.",
  },
  {
    id: "advisor",
    label: "Material Advisor",
    emoji: "📦",
    kind: "chat",
    agent: "materials",
    blurb: "Compare materials and specifications.",
  },
  {
    id: "suppliers",
    label: "Supplier Finder",
    emoji: "🏢",
    kind: "chat",
    agent: "marketplace",
    blurb: "Find products and suppliers on Medosha.",
  },
  {
    id: "documents",
    label: "AI Document Reader",
    emoji: "📄",
    kind: "chat",
    agent: "drawings",
    blurb: "Drawing sets, specs and what they should contain.",
  },
];

export function findTool(id: string): StudioTool | undefined {
  return STUDIO_TOOLS.find((tool) => tool.id === id);
}

export const DEFAULT_TOOL = "chat";

// ---------------------------------------------------------------------------
// Styles and rendering conditions
//
// Appended to the prompt rather than replacing it, so the user's own words
// always survive. Each is a phrase a model responds to, not a label.
// ---------------------------------------------------------------------------

export type StylePreset = {
  id: string;
  label: string;
  phrase: string;
  group: "style" | "render" | "light";
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: "modern", label: "Modern", group: "style", phrase: "modern interior design, clean lines, uncluttered" },
  { id: "luxury", label: "Luxury", group: "style", phrase: "luxury finish, rich materials, considered detailing" },
  { id: "scandinavian", label: "Scandinavian", group: "style", phrase: "scandinavian design, pale timber, soft daylight, restrained" },
  { id: "japandi", label: "Japandi", group: "style", phrase: "japandi style, low furniture, natural textures, calm palette" },
  { id: "industrial", label: "Industrial", group: "style", phrase: "industrial style, exposed concrete and steel, dark metal" },
  {
    id: "ethiopian",
    label: "Ethiopian Contemporary",
    group: "style",
    // Named materials rather than a vague nod, because "Ethiopian style"
    // alone gets a model reaching for tourist imagery.
    phrase:
      "contemporary Ethiopian design, warm earth tones, local hardwood, woven textiles, hand-finished plaster, filtered daylight",
  },
  { id: "product", label: "Product shot", group: "style", phrase: "studio product photography, seamless background, soft box lighting" },

  { id: "photoreal", label: "Photorealistic", group: "render", phrase: "photorealistic, 35mm, natural depth of field, high detail" },
  { id: "architectural", label: "Architectural", group: "render", phrase: "architectural visualisation, corrected verticals, wide angle" },
  { id: "magazine", label: "Magazine quality", group: "render", phrase: "interiors magazine photography, styled, editorial composition" },

  { id: "day", label: "Day", group: "light", phrase: "bright midday daylight" },
  { id: "sunset", label: "Sunset", group: "light", phrase: "golden hour, low warm sun, long shadows" },
  { id: "night", label: "Night", group: "light", phrase: "night, warm interior lighting against a dark exterior" },
  { id: "cloudy", label: "Cloudy", group: "light", phrase: "overcast, soft even light, no hard shadows" },
  { id: "rain", label: "Rain", group: "light", phrase: "after rain, wet reflective surfaces, moody" },
];

export function findStyle(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.id === id);
}

/** Builds the final prompt: the user's words first, presets appended. */
export function composePrompt(prompt: string, styleIds: string[]): string {
  const phrases = styleIds
    .map((id) => findStyle(id)?.phrase)
    .filter((phrase): phrase is string => Boolean(phrase));
  if (phrases.length === 0) return prompt.trim();
  return `${prompt.trim()}. ${phrases.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Surfaces the Material Replacer can target
// ---------------------------------------------------------------------------

export const REPLACEABLE_ELEMENTS = [
  { id: "floor", label: "Floor" },
  { id: "wall", label: "Wall" },
  { id: "ceiling", label: "Ceiling" },
  { id: "cabinet", label: "Cabinets" },
  { id: "countertop", label: "Countertop" },
  { id: "window", label: "Windows" },
  { id: "door", label: "Doors" },
] as const;

export type ReplaceableElement = (typeof REPLACEABLE_ELEMENTS)[number]["id"];

/**
 * The instruction for a surface swap.
 *
 * Says what to change *and* what to hold, because a model told only what to
 * change will happily redraw the room around it.
 */
export function materialPrompt(
  element: ReplaceableElement,
  material: string,
): string {
  const label =
    REPLACEABLE_ELEMENTS.find((entry) => entry.id === element)?.label ??
    element;
  return `Replace only the ${label.toLowerCase()} with ${material}. Keep the layout, furniture, camera angle, lighting and every other surface exactly as they are.`;
}

// ---------------------------------------------------------------------------
// Prompt library
// ---------------------------------------------------------------------------

export type PromptTemplate = {
  id: string;
  label: string;
  prompt: string;
  tool: string;
};

export const PROMPT_LIBRARY: PromptTemplate[] = [
  { id: "kitchen", label: "Modern Kitchen", tool: "interior", prompt: "A modern kitchen with handleless cabinets, a stone island with seating for three, integrated appliances and warm under-cabinet lighting" },
  { id: "villa", label: "Luxury Villa", tool: "facade", prompt: "A two-storey luxury villa, stone and render facade, deep eaves, mature landscaping and a lit driveway" },
  { id: "office", label: "Office Interior", tool: "interior", prompt: "An open-plan office for thirty people, acoustic ceiling baffles, planting, glazed meeting rooms along one wall" },
  { id: "wardrobe", label: "Wardrobe", tool: "furniture", prompt: "A built-in wardrobe wall in oak veneer, full height, with a mix of hanging, shelving and drawers, soft internal lighting" },
  { id: "restaurant", label: "Restaurant", tool: "interior", prompt: "A 60-cover restaurant interior, banquette seating along one side, open pass to the kitchen, warm low lighting" },
  { id: "hotel", label: "Hotel", tool: "interior", prompt: "A hotel lobby with a double-height ceiling, stone floor, timber reception desk and a seating lounge" },
  { id: "bathroom", label: "Bathroom", tool: "interior", prompt: "A family bathroom with large-format porcelain tiles, a walk-in shower, wall-hung vanity and concealed cistern" },
  { id: "facade", label: "Facade", tool: "facade", prompt: "A commercial building facade, six storeys, vertical fins for shading, ground-floor retail glazing" },
  { id: "landscape", label: "Landscape", tool: "landscape", prompt: "A residential courtyard with a paved terrace, raised planters, a small water feature and evening lighting" },
  { id: "living", label: "Living Room", tool: "interior", prompt: "A living room with a low sectional sofa, a large rug, built-in shelving and full-height windows" },
  { id: "bedroom", label: "Bedroom", tool: "interior", prompt: "A main bedroom with an upholstered headboard wall, bedside pendants, and a view through to an ensuite" },
  { id: "commercial", label: "Commercial Building", tool: "facade", prompt: "A mixed-use commercial building, eight storeys, glazed curtain wall with solid spandrel bands, corner site" },
];
