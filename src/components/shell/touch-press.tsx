"use client";

import { useEffect } from "react";

/**
 * Makes `:active` fire on an iPhone.
 *
 * Safari applies `:active` to anchors on its own, and to nothing else unless
 * the document has a touch listener somewhere above the element. It is a
 * twenty-year-old quirk and it is still true: without this, every `<button>` on
 * Medosha keeps its press styles on a desktop and loses them on precisely the
 * device most of Medosha is read on, which is the failure this whole system was
 * written to fix — silently, and only on iOS, where it is hardest to notice.
 *
 * An empty handler is the entire fix. It is registered once, on the document,
 * and it is passive so it can never delay or cancel a scroll: a listener that
 * does nothing still must not be allowed to make the page feel heavy.
 *
 * Android does not need it and is unharmed by it.
 */
export function TouchPress() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  return null;
}
