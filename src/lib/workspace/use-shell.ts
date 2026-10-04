"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  hydrate,
  subscribe,
} from "@/lib/workspace/store";

/**
 * Reads workspace layout state.
 *
 * `useSyncExternalStore` gives the server the defaults and the client whatever
 * was saved, without a setState in an effect — the store notifies, React
 * re-renders. The one effect here calls `hydrate()`, which is idempotent and
 * mutates the store rather than component state.
 */
export function useShell() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    hydrate();
  }, []);

  return state;
}

/**
 * A parsed shortcut, or null if the string does not describe one.
 *
 * Parsing is separated from binding so an unusable combo is discovered once,
 * before the listener is attached, rather than on every keystroke for the
 * lifetime of the page.
 */
type Shortcut = {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
};

export function parseHotkey(combo: unknown): Shortcut | null {
  if (typeof combo !== "string") return null;

  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  // "mod+" and "" both land here. Binding either would mean a listener that
  // can never match, or worse — one that matches every key.
  const key = parts.at(-1);
  if (!key || key === "mod" || key === "shift" || key === "alt") return null;

  return {
    key,
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  };
}

/**
 * The key of an event, if it has one.
 *
 * `KeyboardEvent.key` is typed as a plain string, which is a lie in three
 * situations this application actually meets. A synthetic `new Event("keydown")`
 * — dispatched by password managers, autofill and some test helpers — arrives
 * at a keydown listener with no `key` at all. An Android soft keyboard sends
 * `"Unidentified"` mid-composition. And a browser extension can dispatch a
 * partially-built event object that satisfies nothing.
 *
 * So the value is checked rather than trusted, and anything that is not a
 * usable key is treated as "not my shortcut" — which is the correct outcome
 * for an event that says nothing about which key was pressed.
 */
function keyOf(event: Event): string | null {
  const key = (event as Partial<KeyboardEvent>).key;
  if (typeof key !== "string") return null;

  const lowered = key.toLowerCase();
  if (!lowered || lowered === "unidentified" || lowered === "dead") return null;

  return lowered;
}

/** Whether the event happened while the user was typing into something. */
function isTypingTarget(target: EventTarget | null): boolean {
  // `instanceof HTMLElement` rather than a cast: the target of an event can be
  // a Document, a Window or an element in another realm, and a cast would
  // happily read `.tagName` off any of them.
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Registers a keyboard shortcut on the document.
 *
 * `combo` is written as it reads: "mod+k" (mod is ⌘ on macOS, Ctrl elsewhere),
 * "shift+\\", "escape". Typing inside a field is ignored unless the combo uses
 * a modifier, so "/" never steals a character from a textarea.
 *
 * Nothing here can throw. A shortcut that cannot be parsed is never bound, and
 * an event that cannot be read is ignored — a malformed keystroke must not be
 * able to take down the page the user is working in.
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
) {
  // A ref rather than a dependency, so an inline handler does not tear down
  // and rebind the document listener on every render of the component that
  // owns it. Written in an effect, because a ref must not be touched mid-render.
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const shortcut = parseHotkey(combo);
    if (!shortcut) {
      // Loud in development, silent in production: a typo in a combo should be
      // findable, but must not be a console full of noise for a user.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[medosha:hotkey] "${combo}" is not a usable shortcut.`);
      }
      return;
    }

    function onKeyDown(event: Event) {
      // An IME is mid-composition. Every keystroke in Amharic passes through
      // here, and none of them are shortcuts.
      if ((event as Partial<KeyboardEvent>).isComposing) return;

      const pressed = keyOf(event);
      if (!pressed || !shortcut || pressed !== shortcut.key) return;

      const keyboard = event as Partial<KeyboardEvent>;
      const mod = Boolean(keyboard.metaKey || keyboard.ctrlKey);
      if (shortcut.mod !== mod) return;
      if (shortcut.shift !== Boolean(keyboard.shiftKey)) return;
      if (shortcut.alt !== Boolean(keyboard.altKey)) return;

      // A bare key must not fire while the user is typing.
      if (!shortcut.mod && !shortcut.alt && isTypingTarget(event.target)) {
        return;
      }

      // The handler belongs to a component and can throw for reasons that have
      // nothing to do with the keystroke. Letting that escape puts the error
      // inside a DOM event listener, where React's boundaries cannot catch it —
      // which is how one bad shortcut takes down the whole workspace.
      try {
        latest.current(event as KeyboardEvent);
      } catch (error) {
        console.error(`[medosha:hotkey] "${combo}" handler failed:`, error);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled]);
}
