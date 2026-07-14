import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pinch-to-zoom + drag-to-pan for one video frame. Deliberately simple: zoom
 * always scales around the frame's center (not the pinch midpoint) — good
 * enough for lining up two clips of different framing/distance, and much
 * simpler than anchor-preserving zoom math. Saved per video pair (F-52) so
 * reopening a comparison looks the same as when it was left.
 *
 * Uses raw Pointer Events (not React's synthetic props) so we can register
 * wheel as non-passive and keep a live per-pointer position map without
 * fighting stale closures.
 */

export interface ZoomPanState {
  scale: number; // 1 = no zoom
  x: number; // screen-pixel pan offset
  y: number;
}

export const DEFAULT_ZOOM_PAN: ZoomPanState = { scale: 1, x: 0, y: 0 };

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 300;

export interface ZoomPan extends ZoomPanState {
  containerRef: React.RefObject<HTMLDivElement>;
  isZoomed: boolean;
  reset: () => void;
  setState: (s: ZoomPanState) => void;
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export function useZoomPan(): ZoomPan {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setStateRaw] = useState<ZoomPanState>(DEFAULT_ZOOM_PAN);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<ZoomPanState>(DEFAULT_ZOOM_PAN);
  const lastTapAt = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const beginDrag = (x: number, y: number) => {
      dragStart.current = { x, y };
      dragOrigin.current = stateRef.current;
    };

    const onPointerDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        pinchStartDist.current = dist(a, b);
        pinchStartScale.current = stateRef.current.scale;
        dragStart.current = null; // pinch takes over from any single-finger drag
      } else if (pointers.current.size === 1) {
        const now = performance.now();
        if (now - lastTapAt.current < DOUBLE_TAP_MS) {
          setStateRaw(DEFAULT_ZOOM_PAN);
          lastTapAt.current = 0;
        } else {
          lastTapAt.current = now;
        }
        beginDrag(e.clientX, e.clientY);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        if (pinchStartDist.current > 0) {
          const ratio = dist(a, b) / pinchStartDist.current;
          const scale = clampScale(pinchStartScale.current * ratio);
          setStateRaw((s) => ({ ...s, scale }));
        }
      } else if (pointers.current.size === 1 && dragStart.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setStateRaw({ ...dragOrigin.current, x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy });
      }
    };

    const endPointer = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 1) {
        // Dropped from 2 fingers to 1: restart drag tracking from the
        // remaining finger's current spot instead of an anchor from the pinch.
        const [[, pos]] = Array.from(pointers.current.entries());
        beginDrag(pos.x, pos.y);
      } else {
        dragStart.current = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = 1 - e.deltaY * 0.0015;
      setStateRaw((s) => ({ ...s, scale: clampScale(s.scale * factor) }));
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endPointer);
    el.addEventListener("pointercancel", endPointer);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endPointer);
      el.removeEventListener("pointercancel", endPointer);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const reset = useCallback(() => setStateRaw(DEFAULT_ZOOM_PAN), []);
  const setState = useCallback((s: ZoomPanState) => setStateRaw(s), []);
  const isZoomed = state.scale !== 1 || state.x !== 0 || state.y !== 0;

  return { ...state, containerRef, isZoomed, reset, setState };
}
