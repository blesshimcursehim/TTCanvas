// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useCallback, useId, type ReactNode, Component } from "react";
import { useCanvasTransform } from "./CanvasContext";
import { Icon } from "../icons/Icon";
import { logError } from "../diagnostics/log";
import { renderMarkdown } from "@ttcanvas/widgets-builtin";
import styles from "./WidgetFrame.module.css";

type IconName = Parameters<typeof Icon>[0]["name"];

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
          <span className={styles.grip} aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={styles.gripDot} />
            ))}
          </span>
          <button
            className={styles.headBtn}
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
        <WidgetErrorBoundary title={title}>{children}</WidgetErrorBoundary>
      </div>
      <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown} />
    </div>
  );
}
