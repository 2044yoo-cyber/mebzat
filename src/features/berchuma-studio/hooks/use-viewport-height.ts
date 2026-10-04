"use client";

import { useEffect, useState } from "react";

import {
  coveredAtBottom,
  stickyViewportHeight,
  usableHeight,
} from "../services/mobile-layout";

/**
 * How tall the sticky 3D viewport should be, measured from the page it is in.
 *
 * Returns 0 until there is something real to report. The caller leaves the
 * height unset at 0 so the first paint uses the CSS fallback instead of a box
 * of the wrong size that corrects itself a frame later.
 *
 * Three things move this number and all three are watched:
 *
 *   - the scrollport resizing, which on a phone is mostly the browser's own
 *     address bar growing and shrinking as you scroll;
 *   - the window resizing or being rotated;
 *   - the navigation bar appearing, which it does not do at the same moment
 *     the column it covers is laid out.
 *
 * `visualViewport` is listened to as well as `window`, because on iOS the
 * address bar collapsing fires only there — `resize` on `window` does not
 * report it, and without this the model stayed the size it was before the bar
 * went away and left a band of blank page under it.
 */
export function useViewportHeight(element: HTMLElement | null): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!element) return;

    // The column this page actually scrolls in. Walking up to it rather than
    // being told which one it is: the studio is rendered inside the app
    // shell's workspace column on this route and could be somewhere else on
    // the next, and `document.documentElement` is the right answer when there
    // is no scrolling ancestor at all.
    const scrollport = element.closest("main") ?? document.documentElement;

    function measure() {
      const box = scrollport.getBoundingClientRect();

      // The fixed navigation bar, if this screen has one. Found by its role
      // rather than by a class, and re-found on every measurement because it
      // is mounted by a different part of the tree and may not have existed
      // when this effect first ran.
      const bar = document.querySelector<HTMLElement>("[data-bottom-nav]");
      const covered = coveredAtBottom(
        box,
        bar ? bar.getBoundingClientRect() : null,
      );

      setHeight(stickyViewportHeight(usableHeight(box.height, covered)));
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(scrollport);

    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [element]);

  return height;
}
