// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useCallback, useId, useRef, useState, type ReactNode, Component } from "react";
import { WidgetChromeContext, logError } from "@ttcanvas/core";
import { useCanvasTransform } from "./CanvasContext";
import { Icon } from "../icons/Icon";
import { renderMarkdown } from "@ttcanvas/widgets-builtin";
import styles from "./WidgetFrame.module.css";

type IconName = Parameters<typeof Icon>[0]["name"];

// Keyboard move/resize step, in the same world units the mouse-drag math already works in (see
// onHeaderMouseDown/onResizeMouseDown below) - unlike the mouse path there's no screen-px delta to
// convert, so these are just picked to feel like a small nudge vs. a deliberate jump.
const MOVE_STEP = 8;
const MOVE_STEP_LARGE = 40;
const RESIZE_STEP = 8;
const RESIZE_STEP_LARGE = 40;

function arrowDelta(key: string): { dx: number; dy: number } | null {
  switch (key) {
    case "ArrowUp":    return { dx: 0, dy: -1 };
    case "ArrowDown":  return { dx: 0, dy: 1 };
    case "ArrowLeft":  return { dx: -1, dy: 0 };
    case "ArrowRight": return { dx: 1, dy: 0 };
    default:           return null;
  }
}

interface Props {
  title: string;
  icon?: string;
  help?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focused?: boolean;
  selected?: boolean;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onClose: () => void;
  /** Bring to front, no selection change (content-area click). */
  onFocus?: () => void;
  /** Bring to front + clear selection (header click on unselected widget). */
  onSelect?: () => void;
  /** Toggle this widget in the multi-selection. */
  onShiftClick?: () => void;
  /** Move all selected widgets together by an incremental delta. */
  onGroupMove?: (deltaX: number, deltaY: number) => void;
  children: ReactNode;
  minWidth?: number;
  minHeight?: number;
}

interface WEBState { crashed: boolean }

class WidgetErrorBoundary extends Component<{ children: ReactNode; title: string }, WEBState> {
  constructor(props: { children: ReactNode; title: string }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError(): WEBState { return { crashed: true }; }
  override componentDidCatch(error: Error) {
    logError(`Widget "${this.props.title}" crashed`, error);
  }
  override render() {
    if (this.state.crashed) {
      return (
        <div className={styles.crash}>
          <span className={styles.crashMsg}>"{this.props.title}" crashed</span>
          <button
            className={styles.crashReset}
            onClick={() => this.setState({ crashed: false })}
          >
            Click to reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetFrame({
  title,
  icon,
  help,
  x,
  y,
  width,
  height,
  focused = false,
  selected = false,
  onMove,
  onResize,
  onClose,
  onFocus,
  onSelect,
  onShiftClick,
  onGroupMove,
  children,
  minWidth = 160,
  minHeight = 100,
}: Props) {
  const transformRef = useCanvasTransform();
  const helpId = useId();
  // State-backed so a widget consuming WidgetChromeContext re-renders once the
  // header slot node exists and can portal its settings cog into it.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  const onHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) {
        e.stopPropagation();
        e.preventDefault();
        onShiftClick?.();
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      // If not already selected, clear group and focus just this widget
      if (!selected) {
        onSelect?.();
      }
      // If already selected, hold off - may be starting a group drag

      const startX = e.clientX;
      const startY = e.clientY;
      const originX = x;
      const originY = y;
      let didMove = false;
      let lastClientX = startX;
      let lastClientY = startY;

      const onMouseMove = (ev: MouseEvent) => {
        if (!didMove) {
          if (Math.abs(ev.clientX - startX) < 2 && Math.abs(ev.clientY - startY) < 2) return;
          didMove = true;
        }
        const scale = transformRef.current.scale;
        if (selected && onGroupMove) {
          const incDx = (ev.clientX - lastClientX) / scale;
          const incDy = (ev.clientY - lastClientY) / scale;
          lastClientX = ev.clientX;
          lastClientY = ev.clientY;
          onGroupMove(incDx, incDy);
        } else {
          onMove(
            originX + (ev.clientX - startX) / scale,
            originY + (ev.clientY - startY) / scale,
          );
        }
      };

      const onMouseUp = () => {
        if (!didMove && selected) {
          // Click on a selected widget without dragging → clear group, select just this
          onSelect?.();
        }
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [x, y, selected, onMove, onGroupMove, onSelect, onShiftClick, transformRef],
  );

  // Landing keyboard focus on the move or resize handle (Tab, possibly from far outside the
  // viewport since the canvas pans via a CSS transform rather than native scroll, so the browser's
  // own scroll-into-view on focus can't help) re-centres the canvas on this widget - reusing the
  // same "ttcanvas:focus-widget" event Canvas.tsx already listens for. Deliberately does not bring
  // the widget to front: arriving via Tab should just make it visible, not reorder the z-stack on
  // every widget you pass through - z-order only changes once you actually move/resize it, or click.
  const focusWidgetOnCanvas = useCallback(() => {
    window.dispatchEvent(new CustomEvent("ttcanvas:focus-widget", { detail: { x, y, w: width, h: height } }));
  }, [x, y, width, height]);

  // Tracks whether this keyboard-move session has already promoted the widget, so repeated arrow
  // presses while the handle stays focused don't call onSelect again - mirrors onHeaderMouseDown's
  // once-per-drag onSelect() at mousedown.
  const moveKeyboardPromotedRef = useRef(false);
  const onGripFocus = useCallback(() => {
    moveKeyboardPromotedRef.current = false;
    focusWidgetOnCanvas();
  }, [focusWidgetOnCanvas]);
  const onGripKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const delta = arrowDelta(e.key);
      if (!delta) return;
      e.preventDefault();
      const step = e.shiftKey ? MOVE_STEP_LARGE : MOVE_STEP;
      const dx = delta.dx * step;
      const dy = delta.dy * step;
      if (!moveKeyboardPromotedRef.current) {
        moveKeyboardPromotedRef.current = true;
        if (!selected) onSelect?.();
      }
      if (selected && onGroupMove) onGroupMove(dx, dy);
      else onMove(x + dx, y + dy);
    },
    [selected, onSelect, onGroupMove, onMove, x, y],
  );

  const resizeKeyboardPromotedRef = useRef(false);
  const onResizeHandleFocus = useCallback(() => {
    resizeKeyboardPromotedRef.current = false;
    focusWidgetOnCanvas();
  }, [focusWidgetOnCanvas]);
  const onResizeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const delta = arrowDelta(e.key);
      if (!delta) return;
      e.preventDefault();
      const step = e.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
      if (!resizeKeyboardPromotedRef.current) {
        resizeKeyboardPromotedRef.current = true;
        onFocus?.();
      }
      onResize(Math.max(minWidth, width + delta.dx * step), Math.max(minHeight, height + delta.dy * step));
    },
    [width, height, minWidth, minHeight, onResize, onFocus],
  );

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onFocus?.();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = width;
      const startHeight = height;

      const onMouseMove = (e: MouseEvent) => {
        const scale = transformRef.current.scale;
        onResize(
          Math.max(minWidth, startWidth + (e.clientX - startX) / scale),
          Math.max(minHeight, startHeight + (e.clientY - startY) / scale),
        );
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [width, height, minWidth, minHeight, onResize, transformRef, onFocus],
  );

  const frameClass = [
    styles.frame,
    focused ? styles.focused : "",
    selected ? styles.selected : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={frameClass}
      style={{ left: x, top: y, width, height }}
      onMouseDown={(e) => { e.stopPropagation(); onFocus?.(); }}
    >
      <div className={styles.header} onMouseDown={onHeaderMouseDown}>
        <div className={styles.titleGroup}>
          {icon && <Icon name={icon as IconName} size={13} stroke={1.5} className={styles.titleIcon} />}
          <span className={styles.title}>{title}</span>
        </div>
        <div className={styles.headRight}>
          {help && (
            // Native popovers escape the canvas clipping and handle Escape and light dismiss.
            <button
              type="button"
              className={styles.headBtn}
              popoverTarget={helpId}
              title={`Help for ${title}`}
              aria-label={`Help for ${title}`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              i
            </button>
          )}
          {/* Widgets portal a settings cog into this slot via WidgetChromeContext. */}
          <span className={styles.headSlot} ref={setHeaderSlot} />
          <button
            type="button"
            className={styles.grip}
            aria-label={`Move ${title} widget`}
            title="Move (arrow keys, Shift for a bigger step)"
            onFocus={onGripFocus}
            onKeyDown={onGripKeyDown}
            // No onMouseDown guard here, unlike the other header buttons: a mousedown on the grip
            // should bubble up and start the header's drag, since this button is the drag handle.
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={styles.gripDot} aria-hidden="true" />
            ))}
          </button>
          <button
            className={`${styles.headBtn} ${styles.headBtnDanger}`}
            onClick={onClose}
            title="Close"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Icon name="close" size={13} stroke={2} />
          </button>
        </div>
      </div>
      {help && (
        <div id={helpId} className={styles.helpPopover} popover="auto">
          <div
            className={styles.helpContent}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(help) }}
          />
        </div>
      )}
      <div className={styles.content}>
        <WidgetChromeContext.Provider value={{ headerSlot }}>
          <WidgetErrorBoundary title={title}>{children}</WidgetErrorBoundary>
        </WidgetChromeContext.Provider>
      </div>
      <button
        type="button"
        className={styles.resizeHandle}
        aria-label={`Resize ${title} widget`}
        title="Resize (arrow keys, Shift for a bigger step)"
        onMouseDown={onResizeMouseDown}
        onFocus={onResizeHandleFocus}
        onKeyDown={onResizeKeyDown}
      />
    </div>
  );
}
