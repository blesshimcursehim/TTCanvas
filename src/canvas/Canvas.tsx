// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useRef, useEffect, useCallback, useState, type ReactNode } from "react";
import styles from "./Canvas.module.css";
import { CanvasContext } from "./CanvasContext";

interface Transform {
  x: number;
  y: number;
  scale: number;
}

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const GRID_SIZE = 24;
const ZOOM_SENSITIVITY = 0.002;
const PAN_STEP = 40;
const PAN_STEP_LARGE = 200;

function arrowDelta(key: string): { dx: number; dy: number } | null {
  switch (key) {
    case "ArrowUp":    return { dx: 0, dy: -1 };
    case "ArrowDown":  return { dx: 0, dy: 1 };
    case "ArrowLeft":  return { dx: -1, dy: 0 };
    case "ArrowRight": return { dx: 1, dy: 0 };
    default:           return null;
  }
}

export function Canvas({
  children,
  showGrid = true,
  showVignette = false,
  backgroundSrc = null,
  onMarqueeSelect,
  onClearSelection,
  statusBarSlot,
}: {
  children?: ReactNode;
  showGrid?: boolean;
  showVignette?: boolean;
  /** Per-layout GM-only backdrop, already resolved to a displayable src (e.g. a data URL). */
  backgroundSrc?: string | null;
  statusBarSlot?: ReactNode;
  onMarqueeSelect?: (rect: WorldRect) => void;
  onClearSelection?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const transform = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<DragState | null>(null);
  const spaceDown = useRef(false);
  // marquee: start in container-relative coords
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const onMarqueeSelectRef = useRef(onMarqueeSelect);
  useEffect(() => { onMarqueeSelectRef.current = onMarqueeSelect; });
  const onClearSelectionRef = useRef(onClearSelection);
  useEffect(() => { onClearSelectionRef.current = onClearSelection; });

  const applyTransform = useCallback(() => {
    const { x, y, scale } = transform.current;
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    if (containerRef.current) {
      const scaledGrid = GRID_SIZE * scale;
      const bx = ((x % scaledGrid) + scaledGrid) % scaledGrid;
      const by = ((y % scaledGrid) + scaledGrid) % scaledGrid;
      containerRef.current.style.backgroundSize = `${scaledGrid}px ${scaledGrid}px`;
      containerRef.current.style.backgroundPosition = `${bx}px ${by}px`;
    }
  }, []);

  const startPan = useCallback((clientX: number, clientY: number) => {
    drag.current = {
      startX: clientX,
      startY: clientY,
      originX: transform.current.x,
      originY: transform.current.y,
    };
    containerRef.current?.classList.add(styles.panning);
  }, []);

  // Keyboard equivalent of the mouse/wheel pan, mirroring WidgetFrame's Tab-to-a-handle-then-arrow-
  // keys idiom: Tab reaches the canvas itself, then arrow keys pan it (Shift for a bigger step).
  // Guarded on e.target === containerRef.current (not just e.currentTarget) so a keydown bubbling up
  // from a focused widget's own input/textarea - which also lands on this handler, since React's
  // onKeyDown delegates via bubbling - never hijacks the cursor keys typing depends on.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== containerRef.current) return;
      const delta = arrowDelta(e.key);
      if (!delta) return;
      e.preventDefault();
      const step = e.shiftKey ? PAN_STEP_LARGE : PAN_STEP;
      // Matches the wheel handler's sign convention just below (scroll-style: Right/Down reveals
      // more content to that side, panning the view rather than moving an object across it).
      transform.current.x -= delta.dx * step;
      transform.current.y -= delta.dy * step;
      applyTransform();
    },
    [applyTransform],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const isMiddleClick = e.button === 1;
      const isLeftClick = e.button === 0;
      // Both branches below call preventDefault(), which also suppresses the browser's own
      // focus-on-mousedown for this tabIndex={0} container - so without this line, clicking the
      // canvas never focuses it and the arrow-key pan (guarded on the container being the focus
      // target) silently does nothing until the user happens to find Tab. Only when the press
      // actually lands on the canvas itself: a click on a widget belongs to that widget.
      //
      // data-pointer-focus marks this as a *mouse* focus so the CSS can suppress the focus ring.
      // :focus-visible would normally do that itself, but it only skips the ring for the browser's
      // own pointer-driven focus - a programmatic focus() like this one still matches it, which
      // would put a 2px accent outline around the entire viewport on every background click.
      // Cleared on blur below, so a later Tab back to the canvas rings normally.
      if (e.target === containerRef.current) {
        containerRef.current.dataset.pointerFocus = "";
        containerRef.current.focus();
      }
      if (isMiddleClick || (isLeftClick && spaceDown.current)) {
        e.preventDefault();
        startPan(e.clientX, e.clientY);
      } else if (isLeftClick && e.target === containerRef.current) {
        e.preventDefault();
        const rect = containerRef.current!.getBoundingClientRect();
        marqueeStart.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    },
    [startPan],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseMove = (e: MouseEvent) => {
      if (drag.current) {
        transform.current.x = drag.current.originX + (e.clientX - drag.current.startX);
        transform.current.y = drag.current.originY + (e.clientY - drag.current.startY);
        applyTransform();
      }
      if (marqueeStart.current) {
        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        const x = Math.min(curX, marqueeStart.current.x);
        const y = Math.min(curY, marqueeStart.current.y);
        setMarqueeRect({
          x,
          y,
          w: Math.abs(curX - marqueeStart.current.x),
          h: Math.abs(curY - marqueeStart.current.y),
        });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (drag.current) {
        drag.current = null;
        container.classList.remove(styles.panning);
      }
      if (marqueeStart.current) {
        const rect = container.getBoundingClientRect();
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;
        const dx = curX - marqueeStart.current.x;
        const dy = curY - marqueeStart.current.y;

        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
          onClearSelectionRef.current?.();
        } else {
          const { x: tx, y: ty, scale } = transform.current;
          const toWorldX = (sx: number) => (sx - tx) / scale;
          const toWorldY = (sy: number) => (sy - ty) / scale;
          const x1 = toWorldX(Math.min(curX, marqueeStart.current.x));
          const y1 = toWorldY(Math.min(curY, marqueeStart.current.y));
          const x2 = toWorldX(Math.max(curX, marqueeStart.current.x));
          const y2 = toWorldY(Math.max(curY, marqueeStart.current.y));
          onMarqueeSelectRef.current?.({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        }

        marqueeStart.current = null;
        setMarqueeRect(null);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();

      if (e.ctrlKey) {
        // Pinch-to-zoom (trackpad) or Ctrl+scroll (mouse wheel)
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.current.scale * factor));
        const r = newScale / transform.current.scale;
        transform.current.x = cursorX - r * (cursorX - transform.current.x);
        transform.current.y = cursorY - r * (cursorY - transform.current.y);
        transform.current.scale = newScale;
      } else if (e.shiftKey) {
        // Shift+scroll swaps the axis: a plain mouse wheel and a two-finger vertical trackpad swipe
        // both reliably produce deltaY and nothing on deltaX, and some Linux/libinput touchpad setups
        // never report a horizontal two-finger swipe as deltaX either - not something fixable by
        // reading the wheel event differently, since the driver just never sends it. Shift+scroll is
        // the standard desktop-app fallback for horizontal panning that works off deltaY regardless.
        transform.current.x -= e.deltaY;
        transform.current.y -= e.deltaX;
      } else {
        // Two-finger scroll (trackpad) or plain wheel (mouse) → pan
        transform.current.x -= e.deltaX;
        transform.current.y -= e.deltaY;
      }
      applyTransform();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.repeat &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        spaceDown.current = true;
        container.classList.add(styles.panMode);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown.current = false;
        container.classList.remove(styles.panMode);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("wheel", onWheel);
    };
  }, [applyTransform]);

  // Pan canvas so a world-space widget rect is centered in the viewport
  useEffect(() => {
    function handler(e: Event) {
      const { x, y, w, h } = (e as CustomEvent<{ x: number; y: number; w: number; h: number }>).detail;
      const el = containerRef.current;
      if (!el) return;
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const s = transform.current.scale;
      transform.current.x = vw / 2 - (x + w / 2) * s;
      transform.current.y = vh / 2 - (y + h / 2) * s;
      applyTransform();
    }
    window.addEventListener("ttcanvas:focus-widget", handler);
    return () => window.removeEventListener("ttcanvas:focus-widget", handler);
  }, [applyTransform]);

  const containerClass = [
    styles.container,
    showGrid ? styles.hasGrid : "",
    showVignette ? styles.hasVignette : "",
  ].filter(Boolean).join(" ");

  return (
    <CanvasContext.Provider value={transform}>
      <div
        ref={containerRef}
        className={containerClass}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        // Guarded on the container itself: onBlur is focusout, which also bubbles up from a widget's
        // own fields losing focus, and those have nothing to do with how the canvas got focused.
        onBlur={(e) => {
          if (e.target === containerRef.current) delete containerRef.current.dataset.pointerFocus;
        }}
        // Deliberately focusable so arrow keys can pan it, but there is no ARIA role for "pannable
        // 2D surface" to make it interactive in the rule's eyes. Suppressed here rather than
        // repo-wide (unlike the static-element-interaction family in eslint.config.js, which fires
        // in ~99 places) so an accidental non-interactive tab stop anywhere else still gets caught.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label="Canvas"
        // Deliberately no `title`: this element is the whole viewport, so a tooltip on it fires
        // wherever the pointer rests on empty canvas rather than over a small control the way a
        // tooltip is meant to. The hint lives in the keyboard help overlay (?) instead.
      >
        {backgroundSrc && (
          <div className={styles.backdrop} style={{ backgroundImage: `url(${backgroundSrc})` }} />
        )}
        <div ref={worldRef} className={styles.world}>
          {children}
        </div>
        {marqueeRect && marqueeRect.w > 3 && marqueeRect.h > 3 && (
          <div
            className={styles.marquee}
            style={{
              left: marqueeRect.x,
              top: marqueeRect.y,
              width: marqueeRect.w,
              height: marqueeRect.h,
            }}
          />
        )}
        {statusBarSlot}
      </div>
    </CanvasContext.Provider>
  );
}
