/**
 * The redesign vocabulary.
 *
 * Client-safe: the style chips, the element menu, the material suggestions and
 * the prompt builders all read from here.
 *
 * The prompt builders are the important part of this file. Every one of them
 * says what to *hold* as well as what to change, because a model told only
 * what to change will cheerfully redraw the room around it — and the whole
 * premise here is that this is the user's actual space, not a picture of a
 * space like it.
 */

export type DesignStyle = {
  id: string;
  label: string;
  /** The phrase the model responds to. Not the label. */
  phrase: string;
  blurb: string;
};

export const DESIGN_STYLES: DesignStyle[] = [
  {
    id: "modern",
    label: "Modern",
    blurb: "Clean lines, uncluttered surfaces",
    phrase: "modern interior design, clean lines, uncluttered, neutral palette",
  },
  {
    id: "luxury",
    label: "Luxury",
    blurb: "Rich materials, careful detailing",
    phrase:
      "luxury interior, marble and brass, deep tones, considered detailing, layered lighting",
  },
  {
    id: "minimalist",
    label: "Minimalist",
    blurb: "Very little, very well",
    phrase:
      "minimalist interior, few objects, plain surfaces, restrained palette, generous empty space",
  },
  {
    id: "industrial",
    label: "Industrial",
    blurb: "Exposed structure and metal",
    phrase:
      "industrial interior, exposed concrete and steel, dark metal, visible services",
  },
  {
    id: "scandinavian",
    label: "Scandinavian",
    blurb: "Pale timber, soft daylight",
    phrase:
      "scandinavian interior, pale timber, white walls, soft daylight, simple furniture",
  },
  {
    id: "japandi",
    label: "Japandi",
    blurb: "Low, calm, natural",
    phrase:
      "japandi interior, low furniture, natural textures, muted palette, calm and uncluttered",
  },
  {
    id: "classic",
    label: "Classic",
    blurb: "Mouldings and symmetry",
    phrase:
      "classical interior, cornice and panelling, symmetry, traditional joinery",
  },
  {
    id: "contemporary",
    label: "Contemporary",
    blurb: "Current, warm, liveable",
    phrase:
      "contemporary interior, warm neutrals, mixed textures, current furniture",
  },
  {
    id: "ethiopian",
    label: "Ethiopian Contemporary",
    blurb: "Local materials, current forms",
    // Named materials rather than a vague nod: "Ethiopian style" alone sends a
    // model reaching for tourist imagery instead of a building.
    phrase:
      "contemporary Ethiopian interior, warm earth tones, local hardwood, hand-woven textiles, hand-finished plaster, woven basketry detail, filtered daylight",
  },
  {
    id: "african-luxury",
    label: "African Luxury",
    blurb: "Bold, tactile, high-end",
    phrase:
      "high-end contemporary African interior, rich earth palette, carved timber, brass, handwoven textiles, sculptural furniture",
  },
  {
    id: "hotel",
    label: "Hotel Style",
    blurb: "Guest-ready and durable",
    phrase:
      "boutique hotel interior, layered lighting, upholstered headboard, durable finishes, styled surfaces",
  },
  {
    id: "office",
    label: "Office Style",
    blurb: "Workable and calm",
    phrase:
      "contemporary office interior, acoustic treatment, task lighting, planting, ergonomic furniture",
  },
  {
    id: "restaurant",
    label: "Restaurant Style",
    blurb: "Warm, social, hard-wearing",
    phrase:
      "restaurant interior, banquette seating, warm low lighting, hard-wearing surfaces, bar detail",
  },
];

export function findStyle(id: string): DesignStyle | undefined {
  return DESIGN_STYLES.find((style) => style.id === id);
}

// ---------------------------------------------------------------------------
// What can be changed
// ---------------------------------------------------------------------------

export type EditKind = "replace" | "remove" | "add" | "expand" | "variations";

export type EditTarget = {
  id: string;
  label: string;
  kind: EditKind;
  /** Common choices, offered as chips so nobody has to think of the word. */
  options?: string[];
};

export const EDIT_TARGETS: EditTarget[] = [
  {
    id: "flooring",
    label: "Flooring",
    kind: "replace",
    options: ["porcelain tile", "polished concrete", "oak boards", "terrazzo", "marble", "vinyl plank", "ceramic tile"],
  },
  {
    id: "wall-finish",
    label: "Wall finish",
    kind: "replace",
    options: ["smooth plaster", "microcement", "timber panelling", "exposed brick", "stone cladding", "wallpaper"],
  },
  {
    id: "paint",
    label: "Paint colour",
    kind: "replace",
    options: ["warm white", "soft grey", "deep green", "terracotta", "charcoal", "cream"],
  },
  {
    id: "ceiling",
    label: "Ceiling",
    kind: "replace",
    options: ["flat gypsum", "coffered", "exposed concrete", "timber slats", "stretch ceiling"],
  },
  {
    id: "doors",
    label: "Doors",
    kind: "replace",
    options: ["flush timber", "glazed steel", "panelled", "pivot", "sliding"],
  },
  {
    id: "windows",
    label: "Windows",
    kind: "replace",
    options: ["black aluminium", "UPVC", "timber frame", "floor to ceiling glazing"],
  },
  {
    id: "cabinets",
    label: "Cabinets",
    kind: "replace",
    options: ["handleless matt", "oak veneer", "shaker", "high gloss", "dark stained timber"],
  },
  {
    id: "countertops",
    label: "Countertops",
    kind: "replace",
    options: ["quartz", "granite", "marble", "solid timber", "stainless steel"],
  },
  {
    id: "furniture",
    label: "Furniture",
    kind: "replace",
    options: ["modern low-profile", "classic upholstered", "modular", "built-in joinery"],
  },
  {
    id: "lighting",
    label: "Lighting",
    kind: "replace",
    options: ["recessed downlights", "pendant cluster", "cove lighting", "track lighting", "wall sconces"],
  },
  {
    id: "curtains",
    label: "Curtains & blinds",
    kind: "replace",
    options: ["sheer linen", "blackout curtains", "roller blinds", "timber shutters"],
  },
  {
    id: "landscape",
    label: "Landscape",
    kind: "replace",
    options: ["indigenous planting", "paved terrace", "lawn and beds", "gravel and specimen trees"],
  },
  { id: "remove", label: "Remove objects", kind: "remove" },
  { id: "add", label: "Add objects", kind: "add" },
  { id: "expand", label: "Expand the space", kind: "expand" },
  { id: "variations", label: "More like this", kind: "variations" },
];

export function findTarget(id: string): EditTarget | undefined {
  return EDIT_TARGETS.find((target) => target.id === id);
}

// ---------------------------------------------------------------------------
// Prompt builders
//
// The sentence that keeps the room the user's room. Every builder ends with
// the same hold clause, because that is the instruction doing the work.
// ---------------------------------------------------------------------------

const HOLD =
  "Keep the room's exact geometry, camera angle, window and door positions, ceiling height and proportions unchanged. This is a real photograph of an existing space — redesign it, do not replace it with a different room.";

const HOLD_STRICT =
  "Change nothing else. Keep the layout, every other surface, all furniture, the camera angle and the lighting exactly as they are.";

/** The whole-space restyle. */
export function restylePrompt(options: {
  spaceType: string;
  styleId: string;
  instructions?: string;
}): string {
  const style = findStyle(options.styleId);
  const parts = [
    `Redesign this ${options.spaceType.toLowerCase()} in ${style?.label ?? options.styleId} style.`,
    style?.phrase,
    options.instructions?.trim(),
    HOLD,
  ];
  return parts.filter(Boolean).join(" ");
}

/** One surface, swapped, with everything else held. */
export function replacePrompt(options: {
  target: EditTarget;
  material: string;
  spaceType: string;
}): string {
  const { target, material } = options;

  switch (target.kind) {
    case "remove":
      return `Remove ${material || "the clutter"} from this ${options.spaceType.toLowerCase()}. Fill the space behind it so the result looks natural. ${HOLD_STRICT}`;
    case "add":
      return `Add ${material || "furniture appropriate to the room"} to this ${options.spaceType.toLowerCase()}, placed sensibly and lit to match. ${HOLD_STRICT}`;
    case "expand":
      return `Extend this image outwards, continuing the room naturally beyond its current edges in the same style, materials and lighting. ${HOLD}`;
    case "variations":
      return `Produce another version of this ${options.spaceType.toLowerCase()} with the same design intent but different furniture arrangement and styling. ${HOLD}`;
    default:
      return `Replace only the ${target.label.toLowerCase()} in this ${options.spaceType.toLowerCase()} with ${material}. ${HOLD_STRICT}`;
  }
}

/** Four options at once: same brief, deliberately different directions. */
export const OPTION_VARIANTS = [
  { id: "a", label: "Option A", nudge: "" },
  { id: "b", label: "Option B", nudge: "a warmer palette and more timber" },
  { id: "c", label: "Option C", nudge: "a cooler, more restrained palette" },
  { id: "d", label: "Option D", nudge: "bolder contrast and a statement piece" },
] as const;

export function variantPrompt(base: string, index: number): string {
  const variant = OPTION_VARIANTS[index];
  if (!variant || !variant.nudge) return base;
  return `${base} Use ${variant.nudge}.`;
}

// ---------------------------------------------------------------------------
// Materials
//
// Maps what the vision model saw onto something the marketplace can search
// for. A detected material is only useful here if it turns into a link.
// ---------------------------------------------------------------------------

export const MATERIAL_FAMILIES = [
  { id: "ceramic", label: "Ceramic", search: "ceramic tile", category: "construction-materials", aliases: ["ceramic"] },
  { id: "porcelain", label: "Porcelain", search: "porcelain tile", category: "construction-materials", aliases: ["porcelain"] },
  { id: "marble", label: "Marble", search: "marble", category: "construction-materials", aliases: ["marble", "travertine"] },
  { id: "granite", label: "Granite", search: "granite", category: "construction-materials", aliases: ["granite"] },
  { id: "wood", label: "Wood", search: "timber flooring", category: "flooring", aliases: ["wood", "timber", "hardwood", "oak", "walnut", "teak", "veneer", "plywood", "mdf", "chipboard", "parquet", "laminate"] },
  { id: "concrete", label: "Concrete", search: "cement", category: "construction-materials", aliases: ["concrete", "cement", "screed", "hcb", "hollow block"] },
  // Paint before gypsum so "painted plaster" — the commonest wall in Ethiopia
  // — sends people to paint, which is what they would be buying.
  { id: "paint", label: "Paint", search: "paint", category: "paint", aliases: ["paint", "painted", "emulsion", "distemper"] },
  { id: "gypsum", label: "Gypsum", search: "gypsum board", category: "construction-materials", aliases: ["gypsum", "plasterboard", "drywall", "plaster"] },
  { id: "glass", label: "Glass", search: "glass", category: "windows", aliases: ["glass", "glazed", "glazing", "mirror"] },
  { id: "metal", label: "Metal", search: "steel", category: "construction-materials", aliases: ["metal", "steel", "aluminium", "aluminum", "iron", "brass", "chrome"] },
  { id: "brick", label: "Brick", search: "block", category: "construction-materials", aliases: ["brick", "blockwork", "masonry"] },
  { id: "pvc", label: "PVC", search: "pvc", category: "construction-materials", aliases: ["pvc", "upvc", "vinyl"] },
  { id: "terrazzo", label: "Terrazzo", search: "terrazzo", category: "flooring", aliases: ["terrazzo"] },
  { id: "quartz", label: "Quartz", search: "quartz worktop", category: "kitchen", aliases: ["quartz"] },
] as const;

/**
 * The material family a free-text description belongs to.
 *
 * The vision model writes "timber veneer cabinet fronts", not "wood", so the
 * families carry the words a surveyor would actually use. Matched on the
 * longest term rather than the longest family name: "porcelain tile" must not
 * resolve through "tile", and "painted plaster" must reach gypsum, not paint.
 */
const MATERIAL_TERMS = MATERIAL_FAMILIES.flatMap((family) =>
  [family.label.toLowerCase(), ...family.aliases].map((term) => ({
    term,
    family,
  })),
).sort((a, b) => b.term.length - a.term.length);

export function matchMaterial(description: string) {
  const text = description.toLowerCase();
  return MATERIAL_TERMS.find(({ term }) => text.includes(term))?.family ?? null;
}

/**
 * Whether a described material is worth a marketplace link.
 *
 * The survey prompt asks the model to say "unclear" rather than guess, so the
 * word arrives often — and a shop link for "unclear" is worse than no link.
 */
const UNKNOWN = /^(unclear|unknown|not clear|not visible|n\/a|none|-)$/i;

export function isShoppable(description: string): boolean {
  const text = description.trim();
  if (!text || UNKNOWN.test(text)) return false;
  return matchMaterial(text) !== null || text.length > 3;
}

/** Where in the marketplace to look for it. */
export function marketplaceHref(description: string): string {
  const family = matchMaterial(description);
  if (family) {
    return `/marketplace?q=${encodeURIComponent(family.search)}&category=${family.category}`;
  }
  return `/marketplace?q=${encodeURIComponent((description.split(",")[0] ?? description).trim())}`;
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

export const FURNITURE_FAMILIES = [
  { id: "wardrobe", label: "Wardrobe", search: "wardrobe" },
  { id: "kitchen", label: "Kitchen", search: "kitchen cabinet" },
  { id: "bed", label: "Bed", search: "bed" },
  { id: "sofa", label: "Sofa", search: "sofa" },
  // Chair before dining, so "dining chairs" is not sold a dining table.
  { id: "chair", label: "Chair", search: "chair" },
  { id: "dining", label: "Dining table", search: "dining table" },
  { id: "tv", label: "TV unit", search: "tv unit" },
  { id: "desk", label: "Office desk", search: "office desk" },
  { id: "shelves", label: "Shelves", search: "shelving" },
  { id: "table", label: "Table", search: "table" },
] as const;

export function matchFurniture(item: string) {
  const text = item.toLowerCase();
  return (
    FURNITURE_FAMILIES.find(
      (family) => text.includes(family.id) || text.includes(family.label.toLowerCase()),
    ) ?? null
  );
}

export function furnitureHref(item: string): string {
  const family = matchFurniture(item);
  const query = family?.search ?? (item.split(",")[0] ?? item).trim();
  return `/marketplace?q=${encodeURIComponent(query)}&category=furniture`;
}

// ---------------------------------------------------------------------------
// The trades a finished design needs
// ---------------------------------------------------------------------------

export const TRADES = [
  { id: "interior-designer", label: "Interior Designer", query: "interior designer" },
  { id: "architect", label: "Architect", query: "architect" },
  { id: "contractor", label: "Contractor", query: "contractor" },
  { id: "carpenter", label: "Carpenter", query: "carpenter" },
  { id: "painter", label: "Painter", query: "painter" },
  { id: "electrician", label: "Electrician", query: "electrician" },
  { id: "plumber", label: "Plumber", query: "plumber" },
] as const;

export function tradeHref(query: string): string {
  return `/services?q=${encodeURIComponent(query)}`;
}
