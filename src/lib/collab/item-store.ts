import type { ItemChange, ItemKind } from "./model";
import type { Item } from "./queries";

/**
 * A board's objects as one person is editing them, kept in step with the
 * server and with everybody else.
 *
 * - An edit shows at once (optimistic) and is queued; edits to the same
 *   object coalesce, and the queue is sent in batches.
 * - Each save names the revision it was made from. While an object's save is
 *   in flight, further edits to it wait, so the revision they name is the one
 *   the server just gave back.
 * - A save that was overtaken — somebody else changed the object first — is
 *   not applied: the object as it now is replaces the local copy, and the
 *   caller is told so it can say so.
 * - A change arriving by realtime replaces the local copy unless this person
 *   has an unsent edit to that object; that edit is sent and meets the
 *   server's verdict like any other.
 * - "Saved" means the server said so. Until then the state is "saving", or
 *   "unsaved" with the reason when it failed, and `retry()` sends again.
 * - Undo and redo are edits like any other: they are saved, and can conflict.
 *
 * No React here: the board and the canvas wrap it, and the checks drive it
 * with a fake server.
 */

export type SaveFn = (changes: ItemChange[]) => Promise<
  | { ok: true; results: ({ id: string; ok: true; item: Item } | { id: string; ok: false; error: string; current: Item | null })[] }
  | { ok: false; error: string }
>;

export type StoreStatus = { state: "saved" | "saving" | "unsaved"; pending: number; error: string | null };

type Patch = Partial<Pick<Item, "x" | "y" | "w" | "h" | "rotation" | "z" | "parentId" | "data">>;
/**
 * What is waiting to be sent. `base` is the revision the edit was made on: a
 * collaborator's newer revision arriving meanwhile does not change it, so the
 * save is refused rather than written over their change.
 */
type Pending =
  | { op: "create"; item: Item }
  | { op: "update"; patch: Patch; base: number }
  | { op: "archive"; base: number }
  | { op: "restore"; base: number };

type Step = { before: Map<string, Item | null>; after: Map<string, Item | null> };

const GEOMETRY = ["x", "y", "w", "h", "rotation", "z"] as const;

export class ItemStore {
  private confirmed = new Map<string, Item>();
  private local = new Map<string, Item>();
  private pending = new Map<string, Pending>();
  private inFlight = new Set<string>();
  private listeners = new Set<() => void>();
  private conflictListeners = new Set<(item: Item | null, message: string) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: StoreStatus = { state: "saved", pending: 0, error: null };
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private transaction: Step | null = null;
  private snapshot: Item[] = [];

  constructor(
    private boardId: string,
    private projectId: string,
    initial: readonly Item[],
    private save: SaveFn,
    private delay = 400,
  ) {
    for (const item of initial) this.confirmed.set(item.id, item);
    this.local = new Map(this.confirmed);
    this.snapshot = this.compute();
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  /** The objects as this person sees them, archived ones left out. Stable between changes. */
  items(): Item[] { return this.snapshot; }
  get(id: string): Item | undefined { return this.local.get(id); }
  getStatus(): StoreStatus { return this.status; }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  hasUnsaved() { return this.pending.size > 0 || this.inFlight.size > 0; }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onConflict(listener: (item: Item | null, message: string) => void) { this.conflictListeners.add(listener); return () => { this.conflictListeners.delete(listener); }; }

  private compute() { return [...this.local.values()].filter((item) => !item.archived).sort((a, b) => a.z - b.z); }
  private emit() {
    this.snapshot = this.compute();
    const pendingCount = this.pending.size + this.inFlight.size;
    // Unsaved stays unsaved — with its reason — until a save succeeds.
    if (this.status.state === "unsaved") this.status = { ...this.status, pending: pendingCount };
    else this.status = { state: pendingCount ? "saving" : "saved", pending: pendingCount, error: null };
    for (const listener of this.listeners) listener();
  }

  // -------------------------------------------------------------------------
  // Editing
  // -------------------------------------------------------------------------

  /** Several edits as one undo step: an alignment, a paste. */
  batch(run: () => void) {
    const outer = this.transaction === null;
    if (outer) this.beginStep();
    try { run(); } finally { if (outer) this.endStep(); }
  }

  /** A step that spans many events — a drag from pointerdown to pointerup — undone as one. */
  beginStep() { if (!this.transaction) this.transaction = { before: new Map(), after: new Map() }; }
  endStep() {
    const step = this.transaction;
    this.transaction = null;
    if (step?.before.size) { this.undoStack.push(step); if (this.undoStack.length > 200) this.undoStack.shift(); this.redoStack = []; }
    this.emit();
  }

  /**
   * Takes back the step under way, as if it never began: a drag that turned
   * out to be the first finger of a pinch. Not undoable, because nothing happened.
   */
  cancelStep() {
    const step = this.transaction;
    this.transaction = null;
    if (!step?.before.size) { this.emit(); return; }
    for (const [id, before] of step.before) {
      if (before === null) {
        const queued = this.pending.get(id);
        if (queued?.op === "create" && !this.inFlight.has(id) && !this.confirmed.has(id)) { this.pending.delete(id); this.local.delete(id); }
        else { const current = this.local.get(id); if (current) this.local.set(id, { ...current, archived: true }); this.pending.set(id, { op: "archive", base: this.base(id) }); }
      } else {
        this.restore(id, before);
      }
    }
    this.changed();
  }

  private record(id: string, before: Item | null, after: Item | null) {
    const step = this.transaction;
    if (step) {
      if (!step.before.has(id)) step.before.set(id, before);
      step.after.set(id, after);
    } else {
      this.undoStack.push({ before: new Map([[id, before]]), after: new Map([[id, after]]) });
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
  }

  create(input: { id?: string; kind: ItemKind; x?: number; y?: number; w?: number; h?: number; rotation?: number; z?: number; parentId?: string | null; data?: Record<string, unknown>; drawingId?: string | null; storagePath?: string | null }): Item {
    const item: Item = {
      id: input.id ?? crypto.randomUUID(), boardId: this.boardId, projectId: this.projectId, kind: input.kind,
      parentId: input.parentId ?? null, x: input.x ?? 0, y: input.y ?? 0, w: input.w ?? 0, h: input.h ?? 0,
      rotation: input.rotation ?? 0, z: input.z ?? this.topZ() + 1, data: input.data ?? {},
      drawingId: input.drawingId ?? null, storagePath: input.storagePath ?? null,
      revision: 0, archived: false, updatedBy: null, updatedAt: new Date().toISOString(),
    };
    this.local.set(item.id, item);
    this.pending.set(item.id, { op: "create", item });
    this.record(item.id, null, item);
    this.changed();
    return item;
  }

  update(id: string, patch: Patch) {
    const before = this.local.get(id);
    if (!before || before.archived) return;
    const after: Item = { ...before, ...patch, data: patch.data ?? before.data };
    if (sameItem(before, after)) return;
    this.local.set(id, after);
    const queued = this.pending.get(id);
    if (queued?.op === "create") queued.item = after;
    else if (queued?.op === "update") queued.patch = { ...queued.patch, ...patch };
    else if (queued?.op === "restore") this.followUps.set(id, { ...this.followUps.get(id), ...patch });
    else this.pending.set(id, { op: "update", patch, base: this.base(id) });
    this.record(id, before, after);
    this.changed();
  }

  archive(id: string) {
    const before = this.local.get(id);
    if (!before || before.archived) return;
    const after = { ...before, archived: true };
    this.local.set(id, after);
    const queued = this.pending.get(id);
    // Made and deleted before it was ever saved: nothing to tell the server.
    if (queued?.op === "create" && !this.inFlight.has(id)) this.pending.delete(id);
    else this.pending.set(id, { op: "archive", base: this.base(id) });
    this.record(id, before, after);
    this.changed();
  }

  private base(id: string) {
    const queued = this.pending.get(id);
    return queued && queued.op !== "create" ? queued.base : this.confirmed.get(id)?.revision ?? 0;
  }

  private restore(id: string, to: Item) {
    this.local.set(id, { ...to, archived: false });
    const confirmed = this.confirmed.get(id);
    if (!confirmed) { this.pending.set(id, { op: "create", item: { ...to, archived: false } }); return; }
    const patch = difference(confirmed, to);
    const base = this.base(id);
    if (confirmed.archived) {
      // A restore and an update cannot go in one change: the restore goes
      // first, the update follows once it is saved.
      this.pending.set(id, { op: "restore", base });
      if (Object.keys(patch).length) this.followUps.set(id, patch);
    } else if (Object.keys(patch).length) {
      this.pending.set(id, { op: "update", patch, base });
    } else {
      // Back to exactly what the server has: nothing to send.
      this.pending.delete(id);
    }
  }
  private followUps = new Map<string, Patch>();

  undo() { this.travel(this.undoStack, this.redoStack, "before"); }
  redo() { this.travel(this.redoStack, this.undoStack, "after"); }

  private travel(from: Step[], to: Step[], side: "before" | "after") {
    const step = from.pop();
    if (!step) return;
    for (const [id, state] of step[side]) {
      if (state === null || state.archived) {
        const current = this.local.get(id);
        if (current && !current.archived) {
          this.local.set(id, { ...current, archived: true });
          const queued = this.pending.get(id);
          if (queued?.op === "create" && !this.inFlight.has(id) && !this.confirmed.has(id)) this.pending.delete(id);
          else this.pending.set(id, { op: "archive", base: this.base(id) });
        }
      } else {
        this.restore(id, state);
      }
    }
    to.push(step);
    this.changed();
  }

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  private changed() {
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }

  private topZ() { let top = 0; for (const item of this.local.values()) if (item.z > top) top = item.z; return top; }

  /** Sends what is queued and not already on its way. Resolves when the server has answered. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const changes: ItemChange[] = [];
    const sent = new Map<string, Pending>();
    for (const [id, queued] of this.pending) {
      if (this.inFlight.has(id)) continue;
      const confirmed = this.confirmed.get(id);
      if (queued.op === "create") {
        const item = queued.item;
        changes.push({ op: "create", id, kind: item.kind, x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation, z: item.z, parentId: item.parentId, drawingId: item.drawingId, storagePath: item.storagePath, data: item.data });
      } else {
        if (!confirmed) continue;
        if (queued.op === "update") changes.push({ op: "update", id, revision: queued.base, ...queued.patch });
        else changes.push({ op: queued.op, id, revision: queued.base });
      }
      sent.set(id, queued);
      if (changes.length >= 200) break;
    }
    if (!changes.length) return;
    for (const id of sent.keys()) { this.pending.delete(id); this.inFlight.add(id); }
    this.emit();

    let response: Awaited<ReturnType<SaveFn>>;
    try {
      response = await this.save(changes);
    } catch {
      response = { ok: false, error: "No connection. Your changes are kept here and sent again when it is back." };
    }

    for (const id of sent.keys()) this.inFlight.delete(id);
    if (!response.ok) {
      // Nothing was saved: put it all back, ahead of anything queued since.
      for (const [id, queued] of sent) if (!this.pending.has(id)) this.pending.set(id, queued); else this.mergeBack(id, queued);
      this.status = { state: "unsaved", pending: this.pending.size, error: response.error };
      this.emit();
      return;
    }

    let failure: string | null = null;
    for (const result of response.results) {
      if (result.ok) {
        this.confirmed.set(result.id, result.item);
        // Deleted on the server, but brought back here while that was on its way.
        const here = this.local.get(result.id);
        if (result.item.archived && here && !here.archived) {
          const queued = this.pending.get(result.id);
          const patch = { ...difference(result.item, here), ...(queued?.op === "update" ? queued.patch : {}) };
          this.pending.set(result.id, { op: "restore", base: result.item.revision });
          if (Object.keys(patch).length) this.followUps.set(result.id, patch);
          this.local.set(result.id, { ...here, revision: result.item.revision });
          continue;
        }
        // An edit made here while this save was on its way was made on top of
        // it: it now builds on the revision the server just gave.
        const next = this.pending.get(result.id);
        if (next && next.op !== "create") next.base = result.item.revision;
        if (!this.pending.has(result.id)) this.local.set(result.id, result.item);
        else this.local.set(result.id, { ...this.local.get(result.id)!, revision: result.item.revision });
        const followUp = this.followUps.get(result.id);
        if (followUp) { this.followUps.delete(result.id); this.pending.set(result.id, { op: "update", patch: followUp, base: result.item.revision }); }
      } else if (result.current && result.current.revision !== (this.confirmed.get(result.id)?.revision ?? 0)) {
        // Overtaken: the object as it now is, and the edits made on top of
        // the old one are dropped rather than replayed onto somebody else's.
        this.confirmed.set(result.id, result.current);
        this.local.set(result.id, result.current);
        this.pending.delete(result.id);
        for (const listener of this.conflictListeners) listener(result.current, result.error);
      } else {
        // Refused outright — not valid, or no longer allowed. Back to what the server has.
        if (result.current) this.confirmed.set(result.id, result.current);
        const confirmed = this.confirmed.get(result.id);
        if (confirmed) this.local.set(result.id, confirmed); else this.local.delete(result.id);
        this.pending.delete(result.id);
        failure = result.error;
        for (const listener of this.conflictListeners) listener(null, result.error);
      }
    }
    if (failure) this.status = { state: "unsaved", pending: this.pending.size, error: failure };
    else if (this.status.state === "unsaved") this.status = { state: "saving", pending: 0, error: null };
    this.emit();
    if (this.pending.size) this.changed();
  }

  private mergeBack(id: string, earlier: Pending) {
    const later = this.pending.get(id)!;
    if (earlier.op === "create" && later.op === "update") this.pending.set(id, { op: "create", item: { ...earlier.item, ...later.patch } });
    else if (earlier.op === "update" && later.op === "update") this.pending.set(id, { op: "update", patch: { ...earlier.patch, ...later.patch }, base: earlier.base });
  }

  retry() { this.status = { ...this.status, state: "saving" }; return this.flush(); }

  /** Stops the save timer. What is queued stays queued; call `flush` first to send it. */
  dispose() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  // -------------------------------------------------------------------------
  // Everybody else
  // -------------------------------------------------------------------------

  /** A row from realtime or a reload. Newer than what is known, and not being edited here: it wins. */
  receive(item: Item) {
    if (item.boardId !== this.boardId) return;
    const known = this.confirmed.get(item.id);
    if (known && known.revision >= item.revision) return;
    this.confirmed.set(item.id, item);
    if (!this.pending.has(item.id) && !this.inFlight.has(item.id)) {
      this.local.set(item.id, item);
      this.emit();
    }
  }
}

function difference(from: Item, to: Item): Patch {
  const patch: Patch = {};
  for (const key of GEOMETRY) if (to[key] !== from[key]) patch[key] = to[key];
  if (to.parentId !== from.parentId) patch.parentId = to.parentId;
  if (JSON.stringify(to.data) !== JSON.stringify(from.data)) patch.data = to.data;
  return patch;
}

function sameItem(a: Item, b: Item) {
  return GEOMETRY.every((key) => a[key] === b[key]) && a.parentId === b.parentId && (a.data === b.data || JSON.stringify(a.data) === JSON.stringify(b.data));
}
