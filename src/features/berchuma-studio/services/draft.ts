import { parseSpec, type DesignSpec } from "../types/spec";

/**
 * The design in progress, kept where a page navigation cannot reach it.
 *
 * The reported problem, in the owner's words: an accidental back gesture. The
 * studio holds its design in React state, and React state does not survive a
 * navigation — so a stray swipe on a phone, a mis-tapped bottom-bar icon, or a
 * browser deciding to reclaim the tab took an hour of fitting out cabinets
 * with it. There was no other copy anywhere until Save was pressed.
 *
 * This writes one to localStorage as the design changes. Deliberately not a
 * row in `designs`: a draft row would appear in the owner's own list of
 * designs the moment they moved a slider, and "everything I ever half-started"
 * is not a list anybody wants. The cost is that a draft does not follow the
 * person to another device, which is much the smaller of the two problems —
 * and Save, which does go to the database, is still one press away.
 *
 * Everything read back is treated as untrusted. It is JSON from a store
 * anybody with the browser open can edit, and it goes through `parseSpec` for
 * the same reason the API does: a draft that is not a design must not be able
 * to draw one.
 *
 * Modelled on `src/lib/projects/draft.ts`, which solved this for the project
 * form. Same shape, same version gate, same refusal to half-restore.
 */

export const DRAFT_VERSION = 1;

/**
 * How long a draft is worth offering back.
 *
 * A fortnight. Long enough to cover a phone put down over a weekend and picked
 * up the following week; short enough that a design abandoned a month ago does
 * not reappear over a fresh start and get mistaken for it.
 */
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type StudioDraft = {
  version: number;
  savedAt: number;
  spec: DesignSpec;
  /** The design this draft belongs to, when it was opened from a saved one. */
  designId: string | null;
};

/**
 * One key per person, and per design.
 *
 * Per person because a shared phone must not show one owner's work to the
 * next. Per design because editing a saved wardrobe and starting a new
 * bookshelf are two pieces of work, and one draft slot would mean opening the
 * second discarded the first.
 */
export function draftKey(userId: string, designId?: string | null): string {
  return `medosha:studio-draft:${userId}:${designId ?? "new"}`;
}

export function readDraft(storage: Storage, key: string): StudioDraft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    // Safari in private mode throws on access, not only on write.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Partial<StudioDraft>;
    // A draft written by an older shape is discarded rather than
    // half-restored: putting back three fields of eight is worse than asking
    // for them again, because it looks like it worked.
    if (candidate.version !== DRAFT_VERSION) return null;

    const savedAt =
      typeof candidate.savedAt === "number" ? candidate.savedAt : 0;
    if (savedAt <= 0 || Date.now() - savedAt > DRAFT_TTL_MS) return null;

    // The same gate the API uses. A hand-edited draft is untrusted input, and
    // this is the last place before it becomes a drawing and a price.
    const spec = parseSpec(candidate.spec);
    if (!spec.ok) return null;

    return {
      version: DRAFT_VERSION,
      savedAt,
      spec: spec.spec,
      designId:
        typeof candidate.designId === "string" ? candidate.designId : null,
    };
  } catch {
    return null;
  }
}

export function writeDraft(
  storage: Storage,
  key: string,
  spec: DesignSpec,
  designId: string | null,
): boolean {
  try {
    storage.setItem(
      key,
      JSON.stringify({
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        spec,
        designId,
      } satisfies StudioDraft),
    );
    return true;
  } catch {
    // Quota, or a browser that refuses storage. The studio still works; it
    // just stops promising to remember, which the line under the title says.
    return false;
  }
}

export function clearDraft(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do about it, and nothing depends on it.
  }
}

/**
 * Whether a draft is worth putting back over what is already open.
 *
 * Not worth it when it is the same design: opening a saved design writes a
 * draft of it within a second, and offering that back on the next visit would
 * be offering somebody their own unchanged work as though it were unsaved
 * progress.
 *
 * Compared by content rather than by a timestamp, because a draft written by
 * the autosave and the design it was written from are equal in every way that
 * matters and differ in when they were touched.
 */
export function differsFrom(draft: StudioDraft, current: DesignSpec | null): boolean {
  if (!current) return true;

  // Both sides parsed, because only one of them has been.
  //
  // `readDraft` puts what it found through `parseSpec`, which fills in every
  // optional field with its default — so a draft written from a spec and read
  // straight back is not string-equal to the spec it came from, and comparing
  // the raw one against the parsed one reports a difference in fields nobody
  // touched. Parsing the other side too compares like with like.
  //
  // It costs one parse per page load, which is where this is called.
  const parsed = parseSpec(current);
  const mine = parsed.ok ? parsed.spec : current;
  return JSON.stringify(draft.spec) !== JSON.stringify(mine);
}

/** How long ago, in words, for the line that offers it back. */
export function savedAgo(savedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 90) return "a moment ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
