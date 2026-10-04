import "server-only";

import type { OptionCategory } from "@/lib/ai/rendering/options";

/**
 * What Medosha knows about rendering, and the client does not.
 *
 * Somebody picks the word "Rain". What reaches the image model is a paragraph
 * about wet pavement, softened shadows, atmospheric moisture and restrained
 * rainfall — because "rain" alone produces a fantasy storm with the building
 * lost behind it, and because a client should not have to know that to get a
 * usable picture.
 *
 * ## Why this file is `server-only`
 *
 * Not tidiness. Next bundles whatever a client component imports, so a single
 * import of this file from the workspace would ship every instruction below to
 * the browser in readable JavaScript. The brief asks that the client not see
 * them; `server-only` makes that a build error rather than a promise. The
 * labels the panel renders come from `options.ts`, which deliberately contains
 * no sentence describing how to render anything.
 *
 * ## Why it is one file
 *
 * The instructions were going to end up spread through the option list, the
 * panel and the prompt builder, and once that happens nobody can answer "what
 * does Rain actually do" without reading three files and guessing at the order
 * they combine in. One table, one place to improve it, one version number on
 * the result.
 *
 * ## Versioning
 *
 * Every generated image records the version that produced it. When somebody
 * says "the renders were better last month", that is the difference between a
 * conversation and an investigation.
 */

/**
 * Bump on any change to the instructions below.
 *
 * Minor for a reworded instruction, major for a change to how they combine.
 * It is stamped onto every render and stored with it.
 */
export const RENDERING_KNOWLEDGE_VERSION = "1.0.0";

export type KnowledgeEntry = {
  /** The paragraph that actually reaches the model. */
  hidden: string;
  /**
   * What this option means when the geometry is locked.
   *
   * Some options are written as *design* instructions, because that is what
   * they are: "Modern" normally means clean contemporary geometry and simple
   * volumes. Sent to an image model alongside somebody's existing four-storey
   * block, that sentence is an order to redesign it — and it was, which is the
   * reported bug. Strict mode was being overruled by the style chip.
   *
   * So an option that describes architecture carries a second form describing
   * only its *presentation*: the same building, photographed and finished as a
   * modern building would be. Options that were already only about light,
   * weather or surface need no variant and have none.
   */
  strict?: string;
  /**
   * Options this one overrules, by id.
   *
   * Not a warning to the user — the panel never says "that combination is
   * invalid". Night plus natural daylight is a thing somebody can reasonably
   * click, and the right answer is that night wins, quietly.
   */
  overrules?: string[];
};

/**
 * The table.
 *
 * Keyed by option id, so `options.ts` and this file are joined by the same
 * strings the UI already uses and there is no second naming scheme to keep in
 * step.
 */
export const KNOWLEDGE: Record<string, KnowledgeEntry> = {
  // ---- Scene --------------------------------------------------------------
  exterior: {
    hidden:
      "An exterior architectural photograph. The building is the subject and fills the frame naturally, with enough of its surroundings to read its setting.",
  },
  interior: {
    hidden:
      "An interior architectural photograph. Show the room's real proportions, the daylight entering it, and how the surfaces meet.",
  },
  "street-view": {
    hidden:
      "A street-level view, as a person standing on the pavement opposite would see it, including the immediate street context.",
  },
  aerial: {
    hidden:
      "An elevated view looking down on the building and its plot, showing the roof and the way the building sits on its site.",
  },
  "landscape-scene": {
    hidden:
      "A wider view in which the building sits within its landscape, the setting given as much weight as the architecture.",
  },
  presentation: {
    hidden:
      "A clean architectural presentation image: even composition, uncluttered surroundings, the building shown clearly and without distraction.",
  },

  // ---- Time ---------------------------------------------------------------
  morning: {
    hidden:
      "Morning light. A low sun angle, soft directional sunlight, cooler ambient shadows with subtle warm highlights, long soft shadows, and a fresh clear atmosphere.",
  },
  midday: {
    hidden:
      "Midday light. A high sun, bright natural illumination, short shadows, neutral daylight colour, balanced exposure, and clear architectural readability across the whole facade.",
  },
  afternoon: {
    hidden:
      "Afternoon light. Directional sunlight, moderately long shadows, a warmer cast than midday, and balanced contrast.",
  },
  "golden-hour": {
    hidden:
      "Golden hour. Low warm sunlight, long architectural shadows, golden highlights on the surfaces the sun reaches, soft directional illumination, and warm light bouncing back into the shadows. Keep the exposure realistic and do not let the warmth flatten into uniform orange.",
  },
  sunset: {
    hidden:
      "Sunset. Low-angle warm sunlight, an orange and amber atmosphere, long soft shadows, and a realistic sunset gradient in the sky. Controlled exposure — the building is lit by a sunset, it is not itself orange.",
  },
  "blue-hour": {
    hidden:
      "Blue hour, after the sun has gone. A deep blue ambient sky, cool exterior illumination, warm artificial light from inside the building, a realistic warm-against-cool contrast, and believable reflections in the glass.",
    overrules: ["clear-blue"],
  },
  night: {
    hidden:
      "Night. A dark natural sky, artificial architectural lighting, warm interior lights visible through the openings, realistic exterior fittings, controlled highlights, and areas that are genuinely dark rather than lifted.",
    // Night beats every daylight instruction, whatever else was clicked.
    overrules: ["natural", "clear-blue", "soft-clouds", "daylight-artificial"],
  },

  // ---- Weather ------------------------------------------------------------
  clear: {
    hidden:
      "Clean atmospheric conditions: a realistic sky, natural daylight, clearly defined architectural shadows, and normal atmospheric perspective into the distance.",
  },
  "partly-cloudy": {
    hidden:
      "Realistic cloud formations with sunlight coming through them, so shadow edges vary in softness across the scene. Natural daylight throughout.",
  },
  overcast: {
    hidden:
      "Heavy cloud cover acting as one very large diffuse light source. Very soft shadows, little direct-sun contrast, neutral daylight colour, and smooth gradients across the facades.",
    overrules: ["clear-blue", "dramatic"],
  },
  rain: {
    hidden:
      "A physically believable rainy scene. Overcast sky, soft diffused daylight, genuinely wet surfaces — wet pavement, wet stone, wet concrete, wet metal, water beading on glass — with realistic reflections in the wet ground and subtle standing puddles. Shadows are softened, and there is real atmospheric moisture in the air. Rainfall is restrained and the exposure is natural: the architecture stays clearly visible. No fantasy storm, no dramatic downpour, no cinematic effects.",
    overrules: ["clear-blue", "clear"],
  },
  "after-rain": {
    hidden:
      "Just after rain. Surfaces are still wet with subtle reflections and residual moisture, small puddles remain on the ground, the air is fresh and clean, and the cloud is breaking up. No active rainfall.",
    overrules: ["clear"],
  },
  fog: {
    hidden:
      "Atmospheric fog. Reduced visibility into the distance, softened contrast, strong atmospheric perspective, and a subtle sense of moisture. The building itself remains readable — the fog is behind and around it, not over it.",
    overrules: ["clear", "clear-blue"],
  },

  // ---- Lighting -----------------------------------------------------------
  natural: {
    hidden:
      "Physically believable daylight, with realistic directional lighting and shadows that fall where the sun would put them.",
  },
  soft: {
    hidden:
      "A large diffuse light source. Soft shadow edges and low harsh contrast, without losing the form of the building.",
  },
  dramatic: {
    hidden:
      "Strong, controlled shadows that emphasise architectural depth and relief, while keeping the contrast within a range a real camera could hold.",
  },
  warm: {
    hidden:
      "Warm illumination and warm highlights. The warmth is in the light, not in the materials — surface colours stay true.",
  },
  cool: {
    hidden:
      "Cool atmospheric lighting. The coolness is in the light, not in the materials — nothing turns unnaturally blue.",
  },
  "interior-warm": {
    hidden:
      "Warm practical lighting inside the building, visible through the windows and doors, reading as rooms that are occupied.",
  },
  "daylight-artificial": {
    hidden:
      "Daylight and artificial architectural lighting together, in a believable balance — the artificial fittings are visibly on without overpowering the daylight.",
  },

  // ---- Sky ----------------------------------------------------------------
  "clear-blue": {
    hidden:
      "A natural daytime sky with a realistic gradient from horizon to zenith.",
  },
  "soft-clouds": {
    hidden: "Natural, softly lit cloud formations giving the sky depth.",
  },
  "dramatic-clouds": {
    hidden:
      "Large, realistic cloud formations at an architectural scale, with genuine perspective in the cloud layer.",
  },
  "sunset-sky": {
    hidden: "A realistic warm sunset gradient across the sky.",
  },
  "blue-hour-sky": {
    hidden: "A deep blue post-sunset sky, even and luminous.",
  },
  "night-sky": {
    hidden: "A natural dark night sky.",
  },

  // ---- Style --------------------------------------------------------------
  "preserve-style": {
    hidden:
      "Keep the architectural language exactly as it is in the source image. Do not restyle it.",
  },
  modern: {
    hidden:
      "Clean contemporary geometry, simple volumes, crisp facade composition, modern material expression, and an uncluttered result.",
    strict:
      "Give the existing building a modern visual treatment: crisp clean surfaces, precise material junctions, an uncluttered setting, and the restrained palette of contemporary architectural photography. Do not alter any geometry — the massing, openings and facade composition are already fixed.",
  },
  contemporary: {
    hidden:
      "Current architectural language: refined proportions, balanced material combinations, and generous glazing where the design already allows it.",
    strict:
      "Present the existing building in current architectural-photography language: balanced material combinations, refined surface finishes and careful tonal control. Change no proportions, no glazing and no openings.",
  },
  minimalist: {
    hidden:
      "Simple planes, reduced complexity, a limited material palette, and minimal ornament.",
    strict:
      "Photograph the existing building in a minimal manner: a restrained material palette, clean uncluttered surroundings, quiet tones and no visual noise. The planes, openings and complexity of the building itself stay exactly as they are.",
  },
  luxury: {
    hidden:
      "Premium materials, refined detailing, elegant landscaping, and the finish of high-end architectural photography.",
    strict:
      "Finish the existing building as a high-end architectural photograph: premium material rendering, immaculate surfaces, refined detailing in the way materials meet, and elegant grounds. This is a photographic and material treatment of this building — do not turn it into a different, grander one.",
  },
  industrial: {
    hidden:
      "Exposed concrete, metal and glass, with the structure expressed rather than concealed.",
    strict:
      "Render the existing materials with an industrial character — honest concrete, metal and glass, with their real texture and wear. Do not expose, add or alter any structure that is not already visible in the source image.",
  },
  tropical: {
    hidden:
      "Climate-responsive architecture: deep shading, natural ventilation, warm materials, and lush planting around the building.",
    strict:
      "Present the existing building in a tropical setting: lush planting around it, warm humid light, and materials responding to that climate. The building itself — its shading, openings and form — is unchanged.",
  },
  traditional: {
    hidden:
      "Preserve the traditional character. Use culturally appropriate materials and forms, and do not introduce unrelated modern geometry.",
    strict:
      "Preserve the traditional character exactly as built, rendering its materials and craftsmanship faithfully. Introduce no new geometry and no modern elements.",
  },

  // ---- Materials ----------------------------------------------------------
  "preserve-materials": {
    hidden:
      "Keep every material and colour exactly as it appears in the source image.",
  },
  "white-stucco": {
    hidden:
      "White stucco with a fine plaster texture: subtle roughness, natural diffuse response to light, and micro-variation across the surface. Not a flat white CGI panel.",
  },
  concrete: {
    hidden:
      "Fair-faced concrete with realistic surface variation, visible pour and board marks where appropriate, and correct roughness.",
  },
  "natural-stone": {
    hidden:
      "Natural stone with realistic texture, colour variation between pieces, believable joints, correct roughness, and stones at a credible size for the building.",
  },
  brick: {
    hidden:
      "Brickwork at realistic brick dimensions, with mortar joints, natural colour variation between bricks, and subtle weathering.",
  },
  wood: {
    hidden:
      "Timber with realistic grain running in the correct direction, subtle colour variation between boards, and realistic roughness. Not plastic.",
  },
  glass: {
    hidden:
      "Glass with realistic reflections of the surroundings, believable transparency, and some sense of the interior behind it.",
  },
  metal: {
    hidden:
      "Metal with a realistic metallic response, controlled reflections and correct roughness — powder-coated or polished as the design suggests.",
  },
  "mixed-materials": {
    hidden:
      "A considered combination of materials, each rendered with its own correct texture and reflectance rather than a single uniform finish.",
  },

  // ---- Landscape ----------------------------------------------------------
  "preserve-landscape": {
    hidden: "Keep the surroundings as they appear in the source image.",
  },
  "minimal-landscape": {
    hidden: "Clean hardscape with restrained, deliberate planting.",
  },
  "modern-landscape": {
    hidden: "Structured planting beds and contemporary hardscape.",
  },
  "tropical-landscape": {
    hidden: "Layered, lush planting with large-leaved species.",
  },
  "grass-trees": {
    hidden: "Natural lawn with a moderate number of established trees.",
  },
  "urban-landscape": {
    hidden: "Pavements, kerbs, street furniture and realistic urban context.",
  },
  "dry-ethiopian": {
    hidden:
      "Planting appropriate to the Ethiopian highlands: eucalyptus, acacia, hardy shrubs, dry-season grass, and red-brown soil with local stone.",
  },
  "luxury-landscape": {
    hidden:
      "Designed landscaping with mature specimen planting, quality paving and considered exterior lighting.",
  },

  // ---- Activity -----------------------------------------------------------
  "no-people": {
    hidden: "No people and no vehicles anywhere in the image.",
  },
  "few-people": {
    hidden:
      "A small number of people, naturally positioned, present only to give the building scale.",
  },
  "people-cars": {
    hidden:
      "A limited number of people and a few vehicles, realistically placed. The building remains the subject.",
  },
  "active-street": {
    hidden:
      "A busier street with more movement and activity, while the architecture still dominates the frame.",
  },
  "luxury-lifestyle": {
    hidden:
      "A few well-dressed people and one or two premium vehicles, tastefully placed and never crowding the building.",
  },

  // ---- Camera -------------------------------------------------------------
  "eye-level": {
    hidden:
      "Photographed at human eye height, as an architectural photographer would stand, with vertical lines kept vertical.",
  },
  "street-camera": {
    hidden: "A pedestrian's viewpoint from the street, with the pavement in shot.",
  },
  "low-angle": {
    hidden:
      "A slight upward angle that emphasises the building's height, with verticals corrected so it does not read as distortion.",
  },
  "high-angle": {
    hidden: "An elevated viewpoint looking slightly down on the building.",
  },
  "aerial-camera": {
    hidden: "A drone viewpoint above the building, looking down at an angle.",
  },
  "wide-angle": {
    hidden:
      "A moderate architectural wide angle — enough to take in the building and its setting, with no fisheye curvature.",
  },
  "close-up": {
    hidden:
      "Close in on the facade, showing how the materials meet and how the details are made.",
  },

  // ---- Quality ------------------------------------------------------------
  fast: { hidden: "A quick preview. Composition and light matter more than fine detail." },
  standard: { hidden: "A well-finished architectural visualization." },
  high: {
    hidden:
      "The highest fidelity: physically accurate materials with correct roughness and reflectance, realistic global illumination, soft contact shadows, ambient occlusion where surfaces meet, true glass with accurate reflections, correct human scale, and high dynamic range with no blown highlights.",
  },
};

/**
 * The rules that are not attached to any one option.
 *
 * Ordered by the priority the brief sets out, and the order matters: models
 * weight the start and end of a prompt more than the middle, so preservation
 * goes last, where it is least likely to be dropped.
 */
export const PRESERVATION_RULE =
  "Preserve the existing design exactly. Keep the same building geometry and massing, the same number of floors and floor heights, the same roof form, the same window and door positions and sizes, the same balconies and railings, the same facade composition and proportions, and the same camera position and framing. Change only what the instruction asks for; everything else must be reproduced as it is.";

/**
 * The geometry lock.
 *
 * Stated twice in a strict prompt — once near the top, before any style or
 * material instruction has a chance to be read as licence, and once at the very
 * end where the model's attention returns. Repetition is not sloppiness here:
 * it is the only lever available, and a single mention in the middle of a long
 * prompt is the one most reliably ignored.
 *
 * Written as prohibitions rather than as "preserve the geometry", because
 * "geometry" is a word a model can satisfy loosely and "do not add, remove,
 * move, resize or reshape any architectural element" is one it cannot.
 */
export const GEOMETRY_LOCK =
  "Treat the source image as a locked architectural reference. This is a photorealistic rendering of an existing building, not a redesign of it. " +
  "Preserve exactly: the overall massing and footprint, the number of floors and their heights, the roof geometry, slope, edges and parapets, every balcony with its position and size, every window and door with its position and size, all columns, beams, walls and wall positions, all openings, every facade projection, recess, cantilever and overhang, stairs, terraces, railings, boundary walls, and the building's proportions and perspective. " +
  "Do not add, remove, move, resize or reshape any architectural element. Do not invent architectural elements that are not in the source image. Do not reinterpret, restyle or reconstruct the architecture. " +
  "Apply only the visual and environmental changes described: lighting, weather, sky, atmosphere, shadows, material appearance and finish, reflections, and anything the client explicitly asked for. " +
  "The result must be recognisably the same building as the source image.";

/**
 * The last line of a strict prompt.
 *
 * Short on purpose. The full lock is long, and the end of a prompt is where a
 * single sentence carries furthest.
 */
/**
 * The lock, for an endpoint that already has the image.
 *
 * Shorter than `GEOMETRY_LOCK`, and pointedly so. That one lists what to
 * preserve because a generating model has never seen the building; an editing
 * model is looking straight at it, and a long inventory of its own contents
 * reads as a specification to build from rather than a thing to leave alone.
 *
 * So this says: keep the pixels, change these properties.
 */
export const EDIT_LOCK =
  "Edit the supplied image. Keep the building in it exactly as it is — the same geometry, massing, floor count, roof, windows, doors, balconies, walls, projections, stairs, railings, entrance and camera composition, pixel for pixel where possible. " +
  "Do not redraw, redesign, reinterpret or reconstruct the building. Do not move, add, remove, resize or reshape any part of it. " +
  "Change only the visual properties described below: lighting, sky, weather, atmosphere, shadows, surface materials and finish, reflections, and anything the client explicitly asks for.";

export const GEOMETRY_LOCK_CLOSING =
  "Above all: this is the same building as the source image, photographed differently. Any change to its geometry is a failure.";

export const CREATIVE_RULES: Record<string, string> = {
  strict:
    "Make only the changes named above, and only as surface, light and environment. Anything not explicitly requested stays exactly as it is in the source image.",
  balanced:
    "Make the changes named above, and you may tidy the result — cleaner surroundings, better composed foreground — but the architecture itself stays as it is.",
  creative:
    "You have room to interpret the scene and its surroundings, provided the building's main architectural concept, massing and floor count survive.",
};

/**
 * The order categories are written into the prompt.
 *
 * Style deliberately sits *after* materials and well after the environment.
 * It is the category most likely to be read as permission to redesign, so it
 * arrives late, in the middle of the prompt where a stray design instruction
 * carries least — and in strict mode it has been rewritten to be about
 * presentation before it ever gets here.
 */
export const CATEGORY_PRIORITY: OptionCategory[] = [
  "scene",
  "time",
  "weather",
  "lighting",
  "sky",
  "materials",
  "style",
  "landscape",
  "activity",
  "camera",
  "quality",
];
