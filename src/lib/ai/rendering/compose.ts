import "server-only";

import {
  CATEGORY_PRIORITY,
  CREATIVE_RULES,
  EDIT_LOCK,
  GEOMETRY_LOCK,
  GEOMETRY_LOCK_CLOSING,
  KNOWLEDGE,
  PRESERVATION_RULE,
  RENDERING_KNOWLEDGE_VERSION,
} from "@/lib/ai/rendering/knowledge";
import type { OptionCategory, RenderSettings } from "@/lib/ai/rendering/options";

/**
 * Turning a panel full of choices into one instruction.
 *
 * Three things happen here, in order, and each exists because of a way the
 * naive version goes wrong.
 *
 * ## Conflicts are resolved, not reported
 *
 * Somebody can pick Night and Natural daylight. Both are reasonable clicks and
 * together they are nonsense, and a panel that greys out half its options every
 * time you touch one is a panel nobody enjoys. So contradictions are settled
 * quietly: `overrules` in the knowledge table says night beats daylight, fog
 * beats clear, rain beats a clear blue sky. The user is never told off.
 *
 * Golden Hour and Rain are *not* a conflict, and that is the test case worth
 * keeping in mind — warm low sun through breaking rain is a real and beautiful
 * thing, and a compatibility system that forbids it is too blunt.
 *
 * ## Order is fixed
 *
 * Models weight the beginning and end of a prompt more heavily than the middle.
 * So the source image's description comes first, the member's own words come
 * early and unmodified, the environment is stated in a fixed order, and the
 * preservation rule goes last — where it is least likely to be dropped, and it
 * is the one instruction whose loss is most obvious in the result.
 *
 * ## The member's words are never rewritten
 *
 * They are quoted. Everything the panel contributes is added around them. An
 * assistant that paraphrases "make the red walls white" into its own words is
 * one that will eventually paraphrase it into something else.
 */

export type ComposedPrompt = {
  /** What goes to the image model when it is *generating*. Server-side only. */
  prompt: string;
  /**
   * The same request, written as changes to a supplied image.
   *
   * A generation prompt and an edit prompt are different documents, and using
   * one where the other belongs is a real failure rather than a stylistic one.
   * A generation prompt has to describe the whole building, because the model
   * has nothing else to go on. Handed to an *editing* endpoint — which already
   * has the building — that same description reads as "draw all of this", and
   * the model obligingly redraws it, which is precisely the outcome the lock
   * exists to prevent.
   *
   * So the edit form says nothing about what the building is. It says what to
   * change and what not to touch, and lets the pixels speak for the rest.
   */
  editPrompt: string;
  /** Stamped onto the render so a result can be traced to the rules that made it. */
  version: string;
  /** Ids dropped by a conflict. Server-side diagnostics only. */
  overruled: string[];
};

/** Every id the member selected, flattened, in category priority order. */
function selectedIds(settings: RenderSettings): { id: string; category: OptionCategory }[] {
  const out: { id: string; category: OptionCategory }[] = [];
  for (const category of CATEGORY_PRIORITY) {
    for (const id of settings.selections[category] ?? []) {
      out.push({ id, category });
    }
  }
  return out;
}

/**
 * Drops the ids that something else overrules.
 *
 * A single pass over the winners' `overrules` lists. Not transitive on purpose:
 * a two-step chain would let one obscure combination silently remove an option
 * the member explicitly chose, and the failure would be almost impossible to
 * reason about from the result.
 */
export function resolveConflicts(ids: string[]): {
  kept: string[];
  overruled: string[];
} {
  const banned = new Set<string>();

  for (const id of ids) {
    for (const loser of KNOWLEDGE[id]?.overrules ?? []) {
      // Only bans something the member actually picked, and never itself.
      if (loser !== id && ids.includes(loser)) banned.add(loser);
    }
  }

  return {
    kept: ids.filter((id) => !banned.has(id)),
    overruled: [...banned],
  };
}

/**
 * The final instruction.
 *
 * `description` is what Grok saw when it looked at the uploaded image. Without
 * it there is nothing to preserve *from*, and "make the walls white" produces
 * somebody else's building with white walls.
 */
export function composeRenderPrompt(input: {
  settings: RenderSettings;
  /** Grok's reading of the source image. Absent when generating from nothing. */
  description?: string | null;
}): ComposedPrompt {
  const { settings, description } = input;

  const selected = selectedIds(settings);
  const { kept, overruled } = resolveConflicts(selected.map((entry) => entry.id));

  /**
   * Whether the model may change the architecture.
   *
   * One switch, and it is the toggle labelled "Preserve Original Architecture".
   * Nothing else may unlock the geometry — not Balanced, not Creative, not a
   * style chip.
   *
   * This used to require preservation *and* strict freedom together, which read
   * sensibly and behaved badly: somebody who had explicitly asked to preserve
   * their architecture, and then moved the creative slider one notch to get
   * nicer landscaping, silently lost the geometry lock. The two settings answer
   * different questions. Preservation answers "is this my building?" and
   * creative freedom answers "how much licence over everything else?" — the
   * surroundings, the finish, the staging.
   *
   * So: geometry follows the toggle alone. Somebody who genuinely wants the
   * building reinterpreted turns preservation off, which is a deliberate act
   * with a label that says what it does.
   */
  const allowGeometryChanges = !settings.preserveDesign;
  const locked = !allowGeometryChanges;

  const parts: string[] = [];

  // 1. The building, so there is something to preserve.
  if (description) {
    parts.push(
      `This is the existing building, observed from the source image:\n${description}`,
    );
  }

  // 2. The lock, before anything that could be read as licence. A style chip
  //    arriving first sets the frame for everything after it, and this is the
  //    frame that has to win.
  if (locked) parts.push(GEOMETRY_LOCK);

  // 3. The member's own words, quoted rather than absorbed. An explicit request
  //    outranks everything except the lock — and the lock exists partly to make
  //    sure "make the red wall white" changes the colour and not the wall.
  const instruction = settings.instruction.trim();
  if (instruction) parts.push(`The client asks: ${instruction}`);

  // 4. The environment, in priority order, one sentence per choice. Under the
  //    lock, an option's strict form is used where it has one.
  const environment = kept
    .map((id) => {
      const entry = KNOWLEDGE[id];
      if (!entry) return undefined;
      return locked ? (entry.strict ?? entry.hidden) : entry.hidden;
    })
    .filter((line): line is string => Boolean(line));

  if (environment.length > 0) parts.push(environment.join(" "));

  // 5. How much licence.
  const creative = CREATIVE_RULES[settings.creative];
  if (creative) parts.push(creative);

  // 6. What must survive. Last, deliberately — models weight the end of a
  //    prompt, and this is the rule whose loss is most obvious in the result.
  if (settings.preserveDesign) parts.push(PRESERVATION_RULE);
  if (locked) parts.push(GEOMETRY_LOCK_CLOSING);

  /**
   * The edit form.
   *
   * Deliberately without the description of the building. The endpoint has the
   * building; repeating it in words invites a redraw of what it can already
   * see. What it needs is the delta and the prohibitions.
   */
  const editParts: string[] = [];

  if (locked) editParts.push(EDIT_LOCK);
  if (instruction) editParts.push(`The client asks: ${instruction}`);
  if (environment.length > 0) editParts.push(environment.join(" "));
  if (creative) editParts.push(creative);
  if (locked) editParts.push(GEOMETRY_LOCK_CLOSING);

  return {
    prompt: parts.join("\n\n"),
    editPrompt: editParts.join("\n\n"),
    version: RENDERING_KNOWLEDGE_VERSION,
    overruled,
  };
}

/**
 * What Grok should look hardest at, given what is about to change.
 *
 * A render that is going to swap the facade material needs the *existing*
 * material described precisely, or there is nothing to swap from. Pointing the
 * vision read at the categories being changed costs nothing and makes the
 * description carry the detail the prompt will need.
 */
export function focusFor(settings: RenderSettings): string {
  const wants: string[] = [];
  const has = (category: OptionCategory, id: string) =>
    (settings.selections[category] ?? []).includes(id);

  if (!has("materials", "preserve-materials")) {
    wants.push("every visible material and its exact colour, surface by surface");
  }
  if (!has("style", "preserve-style")) {
    wants.push("the facade composition, the window grid and the roof form");
  }
  if (!has("landscape", "preserve-landscape")) {
    wants.push("the ground, the planting and the immediate surroundings");
  }

  wants.push("the camera position and the number of storeys");

  return wants.join("; ");
}
