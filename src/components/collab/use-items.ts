"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { ItemStore } from "@/lib/collab/item-store";
import { readItems, type Item } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/client";

import { saveItems } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { useStudio } from "./studio-context";

/**
 * A board's objects, live: loaded from the server, edited through the save
 * engine, and kept in step with everybody else by the Studio's channel.
 *
 * Leaving with unsaved changes asks first; closing the board sends what is
 * queued.
 */
export function useItems(boardId: string | null) {
  const { projectId, onItem } = useStudio();
  const [loaded, setLoaded] = useState<{ boardId: string; items: Item[] } | null>(null);
  const [failed, setFailed] = useState<{ boardId: string; attempt: number } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!boardId) return;
    let live = true;
    readItems(createClient(), boardId)
      .then((items) => { if (live) setLoaded({ boardId, items }); })
      .catch(() => { if (live) setFailed({ boardId, attempt }); });
    return () => { live = false; };
  }, [boardId, attempt]);

  const store = useMemo(() => {
    if (!boardId || loaded?.boardId !== boardId) return null;
    return new ItemStore(boardId, projectId, loaded.items, async (changes) => {
      try {
        return await saveItems(projectId, boardId, changes);
      } catch {
        return { ok: false as const, error: "No connection. Your changes are kept here and sent again when it is back." };
      }
    });
  }, [boardId, loaded, projectId]);

  useEffect(() => {
    if (!store) return;
    const offItem = onItem((item) => store.receive(item));
    const offConflict = store.onConflict((_, message) => toast.info(message, { id: `conflict:${message}` }));
    const warn = (event: BeforeUnloadEvent) => { if (store.hasUnsaved()) { event.preventDefault(); event.returnValue = ""; } };
    // Back online: send what is waiting, as the "not saved" message promised.
    const resend = () => { if (store.hasUnsaved()) void store.retry(); };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("online", resend);
    return () => {
      offItem();
      offConflict();
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", resend);
      void store.flush().finally(() => store.dispose());
    };
  }, [store, onItem]);

  const items = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.items() ?? EMPTY,
    () => EMPTY,
  );
  const status = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.getStatus() ?? SAVED,
    () => SAVED,
  );

  const error = failed && failed.boardId === boardId && failed.attempt === attempt && !store ? "This board could not be loaded. Check the connection." : null;
  return { store, items, status, loading: Boolean(boardId) && !store && !error, error, retryLoad: () => setAttempt((n) => n + 1) };
}

const EMPTY: Item[] = [];
const SAVED = { state: "saved" as const, pending: 0, error: null };
