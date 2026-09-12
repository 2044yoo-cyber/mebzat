/**
 * The unfinished project, kept where a page navigation cannot reach it.
 *
 * The reported problem: fill in a title, add a photograph, go and look at
 * something else, come back, and it is all gone. React state does not survive
 * a navigation and neither does an uncontrolled form's DOM, so every one of
 * those fields was only ever alive for as long as the page was.
 *
 * This puts them in localStorage instead, written on a debounce as the person
 * types. It is deliberately not a row in `projects`: a draft row would have to
 * be created on the first keystroke, and the brief asks for nothing to be
 * published while the form is being filled in. The cost is that a draft does
 * not follow the person to another device, which is the smaller of the two
 * problems by a distance.
 *
 * The image URLs go in here too, the moment each upload finishes. Those are
 * the expensive part to lose — the file is already in storage and paid for,
 * and only the reference to it was living in a variable.
 *
 * Everything read back out is treated as untrusted. It is JSON from a store
 * anybody with the browser open can edit, and a draft that throws on parse
 * takes the form down with it.
 */

export const DRAFT_VERSION = 1;

export type ProjectDraft = {
  version: number;
  savedAt: number;
  /** Form field name to value, for every text, number and select input. */
  values: Record<string, string>;
  images: string[];
  primary: string | null;
};

export function draftKey(userId: string, projectId?: string): string {
  return `medosha:project-draft:${userId}:${projectId ?? "new"}`;
}

/** Whether there is anything in here worth offering to restore. */
export function isDraftWorthKeeping(draft: ProjectDraft | null): boolean {
  if (!draft) return false;
  if (draft.images.length > 0) return true;
  return Object.values(draft.values).some((v) => v.trim().length > 0);
}

export function readDraft(storage: Storage, key: string): ProjectDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    // Safari in private mode throws on access, not just on write.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Partial<ProjectDraft>;
    // A draft written by an older shape of this form is discarded rather than
    // half-restored: restoring three of its eight fields is worse than asking
    // for them again, because it looks like it worked.
    if (candidate.version !== DRAFT_VERSION) return null;

    const values: Record<string, string> = {};
    if (candidate.values && typeof candidate.values === "object") {
      for (const [k, v] of Object.entries(candidate.values)) {
        if (typeof v === "string") values[k] = v;
      }
    }

    const images = Array.isArray(candidate.images)
      ? candidate.images.filter((u): u is string => typeof u === "string")
      : [];

    const primary =
      typeof candidate.primary === "string" && images.includes(candidate.primary)
        ? candidate.primary
        : null;

    return {
      version: DRAFT_VERSION,
      savedAt: typeof candidate.savedAt === "number" ? candidate.savedAt : 0,
      values,
      images,
      primary,
    };
  } catch {
    return null;
  }
}

export function writeDraft(
  storage: Storage,
  key: string,
  draft: Omit<ProjectDraft, "version" | "savedAt">,
): boolean {
  try {
    storage.setItem(
      key,
      JSON.stringify({
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        ...draft,
      }),
    );
    return true;
  } catch {
    // Quota, or a browser that refuses storage. The form still works; it just
    // stops promising to remember, which the status line then has to say.
    return false;
  }
}

export function clearDraft(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do about it, and nothing that depends on it.
  }
}

/**
 * The form's text fields, as a plain object.
 *
 * Files are skipped — they are already in storage, and their URLs travel in
 * `images` — and so is anything that is not a string, which is what a File
 * entry comes back as.
 */
export function valuesFromForm(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of new FormData(form).entries()) {
    if (typeof value !== "string") continue;
    // Written by the images component from its own state, and restored from
    // `images`/`primary`. Copying them here as well would give one fact two
    // homes in the same object.
    if (name === "images" || name === "primaryImage") continue;
    values[name] = value;
  }
  return values;
}

/**
 * Put a saved draft back into an uncontrolled form.
 *
 * Returns the values it could not place, which is how a caller learns that a
 * field it renders itself — the category select, which decides which other
 * fields exist — still needs handling.
 */
export function applyDraftToForm(
  form: HTMLFormElement,
  values: Record<string, string>,
): string[] {
  const unplaced: string[] = [];

  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      field.value = value;
    } else {
      unplaced.push(name);
    }
  }

  return unplaced;
}
