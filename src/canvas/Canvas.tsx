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

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const isMiddleClick = e.button === 1;
      const isLeftClick = e.button === 0;
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
      <div ref={containerRef} className={containerClass} onMouseDown={onMouseDown}>
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
