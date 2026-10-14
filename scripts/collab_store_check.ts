/**
 * The Studio's save engine: edits show at once, reach the server in batches,
 * never overwrite somebody else's change, and say "saved" only when the
 * server has.
 *
 *   npx tsx scripts/collab_store_check.ts
 *
 * Driven against a fake server that applies revisions the way 0105's trigger
 * does — an update names the revision it was made from, and a stale one is
 * refused with the object as it now is.
 */
import assert from "node:assert/strict";

import type { ItemChange } from "../src/lib/collab/model";
import type { Item } from "../src/lib/collab/queries";
import { ItemStore, type SaveFn } from "../src/lib/collab/item-store";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const BOARD = "b0000000-0000-4000-8000-000000000001";
const PROJECT = "a0000000-0000-4000-8000-000000000001";

/** A server with the database's rules about revisions. */
function server() {
  const rows = new Map<string, Item>();
  const calls: ItemChange[][] = [];
  let offline = false;
  let refuse: string | null = null;
  const save: SaveFn = async (changes) => {
    calls.push(changes);
    await Promise.resolve();
    if (offline) throw new Error("offline");
    const results = changes.map((change) => {
      if (refuse) return { id: change.id, ok: false as const, error: refuse, current: rows.get(change.id) ?? null };
      if (change.op === "create") {
        const { op: _op, ...fields } = change;
        void _op;
        const item: Item = { id: change.id, boardId: BOARD, projectId: PROJECT, kind: change.kind, parentId: change.parentId ?? null, x: fields.x ?? 0, y: fields.y ?? 0, w: fields.w ?? 0, h: fields.h ?? 0, rotation: fields.rotation ?? 0, z: fields.z ?? 0, data: (change.data ?? {}) as Record<string, unknown>, drawingId: change.drawingId ?? null, storagePath: change.storagePath ?? null, revision: 1, archived: false, updatedBy: "me", updatedAt: "now" };
        rows.set(item.id, item);
        return { id: change.id, ok: true as const, item };
      }
      const current = rows.get(change.id);
      if (!current || current.revision !== change.revision) return { id: change.id, ok: false as const, error: "Somebody else changed this a moment ago. It has been reloaded.", current: current ?? null };
      let next: Item = { ...current, revision: current.revision + 1 };
      if (change.op === "archive") next.archived = true;
      else if (change.op === "restore") next.archived = false;
      else {
        const { op: _op, id: _id, revision: _revision, data, parentId, ...geometry } = change;
        void _op; void _id; void _revision;
        next = { ...next, ...geometry, ...(parentId !== undefined ? { parentId } : {}), ...(data !== undefined ? { data: data as Record<string, unknown> } : {}) };
      }
      rows.set(next.id, next);
      return { id: change.id, ok: true as const, item: next };
    });
    return { ok: true as const, results };
  };
  /** Somebody else editing the same object on another screen. */
  const elsewhere = (id: string, patch: Partial<Item>) => { const row = rows.get(id)!; const next = { ...row, ...patch, revision: row.revision + 1 }; rows.set(id, next); return next; };
  return { rows, calls, save, elsewhere, setOffline: (value: boolean) => { offline = value; }, setRefuse: (value: string | null) => { refuse = value; } };
}

const fresh = (initial: Item[] = []) => { const db = server(); for (const item of initial) db.rows.set(item.id, item); const store = new ItemStore(BOARD, PROJECT, initial, db.save, 1_000_000); return { db, store }; };

async function main() {
  // ---------------------------------------------------------------------------
  // 1. An edit shows at once; "saved" waits for the server.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", x: 10, y: 20, w: 200, h: 160, data: { text: "Walnut?" } });
    equal(store.items().map((item) => item.id), [note.id], "1: a new note is on the board straight away");
    equal(store.getStatus().state, "saving", "1: and the board says it is saving, not saved");
    ok(store.hasUnsaved(), "1: with unsaved changes");
    await store.flush();
    equal(store.getStatus().state, "saved", "1: saved once the server has it");
    equal(store.get(note.id)?.revision, 1, "1: at the server's revision");
    equal(db.rows.get(note.id)?.x, 10, "1: where it was put");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 2. Edits to one object coalesce; a batch is one undo step.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const a = store.create({ kind: "sticky", x: 0, y: 0, data: { text: "a" } });
    const b = store.create({ kind: "sticky", x: 300, y: 0, data: { text: "b" } });
    await store.flush();
    db.calls.length = 0;
    store.batch(() => { for (let step = 1; step <= 20; step += 1) { store.update(a.id, { x: step * 5 }); store.update(b.id, { x: 300 + step * 5 }); } });
    await store.flush();
    equal(db.calls.length, 1, "2: twenty steps of a drag reach the server as one request");
    equal(db.calls[0]!.map((change) => [change.id, change.op, "x" in change ? change.x : null]), [[a.id, "update", 100], [b.id, "update", 400]], "2: one change per object, at where it ended up");
    store.undo();
    equal([store.get(a.id)!.x, store.get(b.id)!.x], [0, 300], "2: one undo puts both back");
    await store.flush();
    equal([db.rows.get(a.id)!.x, db.rows.get(b.id)!.x], [0, 300], "2: and the undo is saved");
    store.redo();
    await store.flush();
    equal([db.rows.get(a.id)!.x, db.rows.get(b.id)!.x], [100, 400], "2: so is the redo");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 3. An edit made while a save is on its way waits for it, and names the new revision.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", data: { text: "x" } });
    await store.flush();
    store.update(note.id, { x: 50 });
    const first = store.flush();
    store.update(note.id, { y: 70 });
    const premature = store.flush();
    await first; await premature;
    await store.flush();
    equal(db.rows.get(note.id)?.revision, 3, "3: both edits saved, one after the other");
    equal([db.rows.get(note.id)?.x, db.rows.get(note.id)?.y], [50, 70], "3: neither lost");
    ok(db.calls.every((changes) => changes.every((change) => change.op !== "update" || change.revision >= 1)), "3: every update names a revision");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 4. Somebody else changed it first: their change stands, and this person is told.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", x: 0, data: { text: "mine" } });
    await store.flush();
    db.elsewhere(note.id, { x: 999, data: { text: "theirs" } });
    const told: string[] = [];
    store.onConflict((item, message) => told.push(`${item?.data.text}: ${message}`));
    store.update(note.id, { x: 5, data: { text: "mine, edited" } });
    await store.flush();
    equal(db.rows.get(note.id)?.data, { text: "theirs" }, "4: the other person's change is not overwritten");
    equal(store.get(note.id)?.data, { text: "theirs" }, "4: this screen now shows it");
    equal(store.get(note.id)?.x, 999, "4: where they put it");
    equal(told, ["theirs: Somebody else changed this a moment ago. It has been reloaded."], "4: and says so");
    equal(store.getStatus().state, "saved", "4: nothing is left pretending to be unsaved");
    // An edit made while the losing save was on its way builds on the
    // overtaken version: it is dropped, not replayed onto theirs.
    db.elsewhere(note.id, { x: 1000 });
    store.update(note.id, { x: 6 });
    const losing = store.flush();
    store.update(note.id, { x: 7 });
    await losing;
    const sentSoFar = db.calls.length;
    await store.flush();
    equal([db.rows.get(note.id)?.x, store.get(note.id)?.x], [1000, 1000], "4: an edit made on top of the stale one is dropped with it");
    equal(db.calls.length, sentSoFar, "4: not sent again to be refused again");
    ok(!store.hasUnsaved() && store.getStatus().state === "saved", "4: and nothing is left waiting, or reported as an error");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 5. No connection: kept here, marked unsaved, sent again.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", data: { text: "x" } });
    db.setOffline(true);
    await store.flush();
    equal(store.getStatus().state, "unsaved", "5: a failed save says unsaved");
    ok(store.getStatus().error?.includes("No connection"), "5: and why");
    ok(store.get(note.id), "5: the note is still on the screen");
    ok(!db.rows.has(note.id), "5: (and not on the server)");
    store.update(note.id, { x: 40 });
    db.setOffline(false);
    await store.retry();
    equal(store.getStatus().state, "saved", "5: retried, it is saved");
    equal(db.rows.get(note.id)?.x, 40, "5: with the edit made while offline");
    equal(db.rows.size, 1, "5: once, not twice");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 6. Refused outright (no longer allowed): back to what the server has, and said.
  // ---------------------------------------------------------------------------
  {
    const existing: Item = { id: "c0000000-0000-4000-8000-000000000001", boardId: BOARD, projectId: PROJECT, kind: "sticky", parentId: null, x: 1, y: 1, w: 1, h: 1, rotation: 0, z: 1, data: { text: "kept" }, drawingId: null, storagePath: null, revision: 4, archived: false, updatedBy: null, updatedAt: "" };
    const { db, store } = fresh([existing]);
    db.setRefuse("You can comment but not change boards. Ask the owner for editor access.");
    store.update(existing.id, { x: 500 });
    await store.flush();
    equal(store.get(existing.id)?.x, 1, "6: a refused edit is taken back off the screen");
    equal(store.getStatus().state, "unsaved", "6: and the board does not claim it was saved");
    ok(store.getStatus().error?.includes("editor access"), "6: it says why");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 7. Delete and undo; something made and deleted before it was saved.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", x: 7, data: { text: "x" } });
    await store.flush();
    store.archive(note.id);
    equal(store.items().length, 0, "7: deleted, it leaves the board");
    await store.flush();
    equal(db.rows.get(note.id)?.archived, true, "7: archived on the server, not destroyed");
    store.undo();
    await store.flush();
    equal(db.rows.get(note.id)?.archived, false, "7: undo brings it back");
    equal(store.items().map((item) => item.x), [7], "7: where it was");
    store.archive(note.id);
    store.undo();
    await store.flush();
    equal(db.rows.get(note.id)?.archived, false, "7: deleted and undone before saving: still there");
    const before = db.calls.length;
    const scratch = store.create({ kind: "sticky", data: { text: "oops" } });
    store.archive(scratch.id);
    await store.flush();
    equal(db.calls.length, before, "7: made and deleted before it was ever saved: nothing sent");
    ok(!store.hasUnsaved(), "7: nor left waiting to be sent");
    ok(!db.rows.has(scratch.id), "7: and nothing on the server");
    // Moved, deleted, then undone twice: back, and back where it was.
    store.update(note.id, { x: 70 });
    await store.flush();
    store.archive(note.id);
    await store.flush();
    store.undo();
    await store.flush();
    await store.flush();
    equal([db.rows.get(note.id)?.archived, db.rows.get(note.id)?.x], [false, 70], "7: an undone delete restores it as it was");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 8. Realtime: another person's change arrives.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", x: 0, data: { text: "x" } });
    await store.flush();
    let renders = 0;
    store.subscribe(() => { renders += 1; });
    store.receive(db.elsewhere(note.id, { x: 123 }));
    equal(store.get(note.id)?.x, 123, "8: a collaborator's move shows here");
    ok(renders > 0, "8: and the board redraws");
    const stale = { ...db.rows.get(note.id)!, revision: 1, x: -1 };
    store.receive(stale);
    equal(store.get(note.id)?.x, 123, "8: an older copy arriving late is ignored");
    store.update(note.id, { x: 5 });
    store.receive(db.elsewhere(note.id, { x: 456 }));
    equal(store.get(note.id)?.x, 5, "8: while this person is editing it, their edit stays on their screen");
    await store.flush();
    equal(store.get(note.id)?.x, 456, "8: until the server says the other change came first");
    store.receive({ ...db.rows.get(note.id)!, boardId: "b0000000-0000-4000-8000-000000000999", revision: 99, x: -7 });
    equal(store.get(note.id)?.x, 456, "8: a change to another board is not this board's");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 8b. A drag over many pointer events is one undo step.
  // ---------------------------------------------------------------------------
  {
    const { store } = fresh();
    const note = store.create({ kind: "sticky", x: 0, data: { text: "x" } });
    await store.flush();
    store.beginStep();
    for (let x = 1; x <= 30; x += 1) store.update(note.id, { x });
    store.endStep();
    store.undo();
    equal(store.get(note.id)?.x, 0, "8b: a 30-event drag is undone in one step");
    ok(store.canUndo(), "8b: (the create is still there to undo)");
    store.redo();
    equal(store.get(note.id)?.x, 30, "8b: and redone in one");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 8c. A drag that becomes a pinch is taken back: nothing moved, nothing sent.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const note = store.create({ kind: "sticky", x: 5, y: 7, data: { text: "x" } });
    await store.flush();
    const sentBefore = db.calls.length;
    const undoable = store.canUndo();
    store.beginStep();
    for (let x = 6; x <= 9; x += 1) store.update(note.id, { x, y: x });
    store.cancelStep();
    equal([store.get(note.id)?.x, store.get(note.id)?.y], [5, 7], "8c: cancelled, the note is back where it was");
    ok(!store.hasUnsaved(), "8c: with nothing waiting to be saved");
    await store.flush();
    equal(db.calls.length, sentBefore, "8c: and nothing sent to the server");
    equal(store.canUndo(), undoable, "8c: nor anything added to undo");
    store.undo();
    ok(!store.get(note.id) || store.get(note.id)?.archived, "8c: undo still takes back the step before it (the create)");
    store.dispose();
  }

  // ---------------------------------------------------------------------------
  // 9. Creates reach the server parents first, and the snapshot is stable.
  // ---------------------------------------------------------------------------
  {
    const { db, store } = fresh();
    const column = store.create({ kind: "column", data: { title: "Materials" } });
    const card = store.create({ kind: "note", parentId: column.id, data: { text: "Oak" } });
    await store.flush();
    equal(db.calls.at(-1)!.map((change) => change.id), [column.id, card.id], "9: a column is saved before the card in it");
    const first = store.items();
    ok(first === store.items(), "9: reading twice without a change gives the same array (React can rely on it)");
    store.update(card.id, { y: 10 });
    ok(first !== store.items(), "9: and a new one after a change");
    store.update(card.id, { y: 10 });
    const again = store.items();
    store.update(card.id, { y: 10 });
    ok(again === store.items(), "9: an edit that changes nothing is not a change");
    store.dispose();
  }

  console.log(`Studio save engine: ${checks} checks — optimistic edits, batched and coalesced saves, revisions in order, conflicts kept, offline and retry, refusals taken back, delete and undo, realtime merge`);
}

main().catch((error) => { console.error(error); process.exit(1); });
