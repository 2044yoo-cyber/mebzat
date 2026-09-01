import "server-only";

/**
 * Turning "make the red walls white" into something an image model obeys.
 *
 * An image model does what the prompt says and nothing about what it does not
 * say. That is the whole problem with architectural editing: a member types
 * four words about a wall, and the model — given only those four words —
 * produces a different building that happens to have white walls.
 *
 * So a prompt built here has three parts, in this order:
 *
 *   1. **The building.** What Grok saw when it looked at the uploaded image:
 *      storeys, window bays, balconies, materials, camera, light. Without this
 *      the model has nothing to preserve *from*.
 *   2. **The change.** The member's own words, never rewritten. If they said
 *      "make the red walls white" then that is what the prompt says, because
 *      an assistant that paraphrases the instruction is an assistant that
 *      quietly changes it.
 *   3. **The rules.** What must survive the change, and how it should be
 *      rendered.
 *
 * The order matters. Models weight the beginning and the end of a prompt more
 * than the middle, so the description grounds it, the instruction is stated
 * plainly, and the preservation rules land last where they are least likely to
 * be dropped.
 */

/** What the member pressed, or what the router read the sentence as. */
export type ArchitecturalAction =
  | "redesign"
  | "render"
  | "materials"
  | "lighting"
  | "generate";

/**
 * What must not change.
 *
 * Written as a list of nouns rather than as "keep the geometry", because
 * "geometry" is a word the model can satisfy loosely and "the same number of
 * floors" is one it cannot. Every item here is something the brief names.
 */
const PRESERVE = [
  "the same building form and massing",
  "the same number of floors and the same floor heights",
  "the same window positions, sizes and count",
  "the same door and entrance positions",
  "the same balconies, railings and canopies",
  "the same roof form and pitch",
  "the same overall proportions",
  "the same camera position, angle and framing",
].join(", ");

/**
 * How a render should look.
 *
 * Quality words only. Nothing here changes the design — no "modern", no
 * "luxury", no "award-winning", because those are design instructions wearing
 * the costume of quality instructions and they are how a render of somebody's
 * actual building comes back as a different, glossier building.
 */
const PHOTOREALISM = [
  "photorealistic architectural visualization",
  "physically accurate materials with correct roughness and reflectance",
  "realistic global illumination and soft contact shadows",
  "ambient occlusion where surfaces meet",
  "true glass with accurate reflections and transparency",
  "correct human scale",
  "shot on a full-frame camera with a tilt-shift lens, vertical lines kept vertical",
  "high dynamic range, no blown highlights",
].join(", ");

/**
 * The sentence that says the change is the only change.
 *
 * Repeated in two forms — the positive list above and this negative — because
 * a single phrasing is one the model can miss and two phrasings of the same
 * constraint measurably hold better.
 */
const ONLY_THIS = "Change only what the instruction asks for. Everything else in the description must be reproduced unchanged.";

export type PromptInput = {
  /** The member's own words. Never rewritten. */
  instruction: string;
  /** Grok's reading of the uploaded image, when there is one. */
  description?: string | null;
  action: ArchitecturalAction;
};

/**
 * The prompt sent to the image model.
 *
 * Every branch produces one paragraph of description, one line of instruction
 * and one block of rules, so the shape is the same whichever button was
 * pressed and the difference between them is only what the rules say.
 */
export function buildArchitecturalPrompt(input: PromptInput): string {
  const instruction = input.instruction.trim();
  const description = input.description?.trim();
  const parts: string[] = [];

  if (description) {
    parts.push(`This is the existing building, observed from the source photograph:\n${description}`);
  }

  parts.push(`Instruction: ${instruction}`);

  switch (input.action) {
    case "materials":
      parts.push(
        `Apply only the material or colour change described in the instruction. Keep ${PRESERVE}. Every surface not named in the instruction keeps its existing material and colour. ${ONLY_THIS}`,
      );
      parts.push(PHOTOREALISM);
      break;

    case "lighting":
      parts.push(
        `Change only the lighting and the time of day. Keep ${PRESERVE}, and keep every material and colour exactly as described. ${ONLY_THIS}`,
      );
      parts.push(PHOTOREALISM);
      break;

    case "render":
      parts.push(
        // The render case is the strictest: the input is usually a SketchUp or
        // Revit screenshot and the member wants *this* model rendered, not a
        // building like it.
        `Produce a photorealistic render of exactly this building. Keep ${PRESERVE}. Do not redesign, do not restyle, do not add or remove any element. The only change is from an untextured or diagrammatic model to a photographic image. ${ONLY_THIS}`,
      );
      parts.push(PHOTOREALISM);
      break;

    case "redesign":
      // The one case where changing the design is the point. The form is still
      // held unless the member asked for it to change — "redesign the facade"
      // is not "demolish it and build a different block".
      parts.push(
        `Redesign as instructed. Unless the instruction explicitly asks to change the form, keep the same building footprint, the same number of floors, the same floor heights and the same camera position — the redesign is of the facade, materials, openings and detail, not of the building's shape.`,
      );
      parts.push(PHOTOREALISM);
      break;

    case "generate":
      // No source image. There is nothing to preserve, so the only additions
      // are the quality words — and even those are held back unless the member
      // asked for something photographic.
      if (wantsPhotoreal(instruction)) parts.push(PHOTOREALISM);
      break;
  }

  return parts.join("\n\n");
}

/**
 * Whether a from-nothing prompt should carry the render instructions.
 *
 * Somebody asking for a sketch, a diagram or a watercolour does not want
 * "photorealistic architectural visualization" bolted onto it, and adding it
 * unconditionally is how a request for a concept sketch comes back as a
 * photograph.
 */
function wantsPhotoreal(instruction: string): boolean {
  const text = instruction.toLowerCase();
  const against = [
    "sketch",
    "diagram",
    "drawing",
    "watercolour",
    "watercolor",
    "illustration",
    "cartoon",
    "line art",
    "floor plan",
    "floorplan",
    "elevation",
    "section",
    "blueprint",
  ];
  if (against.some((word) => text.includes(word))) return false;

  const forWords = ["render", "photoreal", "realistic", "photograph", "visuali"];
  return forWords.some((word) => text.includes(word));
}

/**
 * What the member's words mean for the prompt.
 *
 * The router upstream already has a capability for each turn, but this file is
 * also called from the image adapter, which sees only a prompt. Reading the
 * words a second time is cheap and means the adapter is correct even when it
 * is called from somewhere that has no router.
 */
export function actionFrom(text: string, hasImage: boolean): ArchitecturalAction {
  const words = text.toLowerCase();

  if (!hasImage) return "generate";

  if (/\b(render|photoreal|realistic|visuali[sz])/.test(words)) return "render";
  if (/\b(light|lighting|evening|sunset|golden hour|night|dusk|dawn)/.test(words)) {
    return "lighting";
  }
  if (
    /\b(material|cladding|stone|timber|wood|paint|colou?r|white|grey|gray|brick|concrete|render the walls|plaster|tile)/.test(
      words,
    )
  ) {
    return "materials";
  }
  if (/\b(redesign|restyle|modernis|moderniz|make it modern|new design)/.test(words)) {
    return "redesign";
  }

  // An instruction about an image that is none of the above is still an edit,
  // and the safest edit is the one that changes least.
  return "materials";
}
