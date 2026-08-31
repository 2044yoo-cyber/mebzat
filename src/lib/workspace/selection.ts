"use client";

import { useSyncExternalStore } from "react";

import type { MapProperty } from "@/types/database.types";

/**
 * What the workspace currently has selected.
 *
 * The context panel lives in the shell, but the thing it describes is chosen
 * deep inside the workspace — a pin on the city map, a row in the price table.
 * Threading a callback down through those trees would couple every module to
 * the shell, so selection goes through this store instead: the workspace
 * publishes, the panel subscribes, and neither imports the other.
 *
 * Cleared on navigation by the panel, so a property selected on /city does not
 * still be showing when the workspace has moved to /marketplace.
 */

export type Selection =
  | {
      kind: "property";
      id: string;
      /**
       * The map already has the summary when the marker is clicked, so it
       * travels with the selection. The panel can render price, title and
       * photo immediately and fill in the rest from the API — no skeleton.
       */
      property: MapProperty;
    }
  | { kind: "product"; id: string; label?: string }
  | { kind: "listing"; id: string; label?: string }
  | null;

let selection: Selection = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Selection {
  return selection;
}

function getServerSnapshot(): Selection {
  return null;
}

export function select(next: Selection) {
  // Reference equality is enough: callers pass a fresh object per selection,
  // and re-selecting the same id should still be a no-op.
  if (selection?.kind === next?.kind && selection?.id === next?.id) return;
  selection = next;
  emit();
}

export function clearSelection() {
  if (selection === null) return;
  selection = null;
  emit();
}

export function useSelection(): Selection {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
