"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * The shell needs this in JavaScript, not only in CSS: below the desktop
 * breakpoint the context panel must not be *rendered*, not merely hidden — a
 * panel that exists off-screen still fetches, still subscribes, and on the map
 * still holds a second copy of the property it is describing.
 *
 * `useSyncExternalStore` subscribes straight to the MediaQueryList, so a
 * resize updates the value without a setState inside an effect. The server
 * snapshot is false, which makes the first client render match the markup and
 * means the panel appears after hydration rather than flashing away.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window === "undefined") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
