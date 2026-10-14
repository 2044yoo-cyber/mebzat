"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fitView, toWorld, zoomAt, type Box, type Point, type View } from "@/lib/collab/canvas-geometry";

/**
 * Pan and zoom for a surface: the canvas, a free board, a drawing.
 *
 * Wheel zooms about the cursor (and pans, with a trackpad's two-finger
 * scroll); two fingers pinch and pan together; nothing here moves an
 * object, so a gesture meant for the view can never drag something by
 * accident. The surface decides what a single pointer does.
 */
export function useViewport(initial: View = { zoom: 1, x: 0, y: 0 }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>(initial);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; centre: Point; view: View } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.ctrlKey || event.metaKey) {
        // Pinch on a trackpad, or Ctrl + wheel: zoom.
        setView((current) => zoomAt(current, point, Math.exp(-event.deltaY * 0.01)));
      } else if (event.deltaMode === 0 && Math.abs(event.deltaX) + Math.abs(event.deltaY) < 50 && !event.shiftKey) {
        // A trackpad's two-finger scroll: pan.
        setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
      } else {
        setView((current) => zoomAt(current, point, Math.exp(-event.deltaY * 0.0015)));
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", wheel); };
  }, []);

  const local = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = ref.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  /** Pass every pointerdown here first. True when it became (or is part of) a pinch. */
  const pointerDown = useCallback((event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: viewRef.current };
      return true;
    }
    return pointers.current.size > 2;
  }, [local]);

  /** True while two fingers are down: the move belongs to the view. */
  const pointerMove = useCallback((event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return false;
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size < 2 || !pinch.current) return false;
    const [a, b] = [...pointers.current.values()] as [Point, Point];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const start = pinch.current;
    const zoomed = zoomAt(start.view, start.centre, distance / Math.max(1, start.distance));
    setView({ ...zoomed, x: zoomed.x + centre.x - start.centre.x, y: zoomed.y + centre.y - start.centre.y });
    return true;
  }, [local]);

  const pointerUp = useCallback((event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }, []);

  const pan = useCallback((dx: number, dy: number) => setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy })), []);
  const zoomBy = useCallback((factor: number) => setView((current) => zoomAt(current, { x: size.width / 2, y: size.height / 2 }, factor)), [size]);
  const fit = useCallback((bounds: Box | null) => setView(fitView(bounds, size)), [size]);
  const reset = useCallback(() => setView({ zoom: 1, x: size.width / 2, y: size.height / 2 }), [size]);
  const world = useCallback((event: { clientX: number; clientY: number }) => toWorld(local(event), viewRef.current), [local]);

  return { surfaceRef: ref, view, setView, size, local, world, pointerDown, pointerMove, pointerUp, pan, zoomBy, fit, reset };
}
