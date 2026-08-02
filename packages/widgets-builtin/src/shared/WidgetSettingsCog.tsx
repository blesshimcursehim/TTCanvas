// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useId, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWidgetChrome } from "@ttcanvas/core";
import styles from "./WidgetSettingsCog.module.css";

interface Props {
  /** Accessible label for the cog button. */
  label?: string;
  children: ReactNode;
}

/**
 * A per-widget settings cog. It portals a gear button into the widget frame's
 * header (via `WidgetChromeContext`) and reveals `children` in a popover panel.
 * Uses the native Popover API, so the panel is promoted to the top layer and
 * escapes the canvas transform/clip the same way the frame's help popover does.
 *
 * `children` render in the widget's own component tree - not the frame's - so
 * they keep full access to the widget's state, handlers and data layer (some
 * widgets keep their collection in vault files, not `state`), which a frame-level
 * settings component could never reach.
 */
export function WidgetSettingsCog({ label = "Settings", children }: Props) {
  const popoverId = useId();
  const { headerSlot } = useWidgetChrome();
  const cogRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel is a top-layer popover, so it's positioned against the viewport - by
  // default dead-centre. Anchor it just under the cog button instead (flipping above
  // when the cog sits low on screen). CSS anchor positioning would be the native way,
  // but it isn't in every WebView yet (WebKit), so we place it in JS on `beforetoggle`,
  // which runs before the popover paints - so there's no visible jump.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    function place(e: Event) {
      const cog = cogRef.current;
      const p = panelRef.current;
      if ((e as ToggleEvent).newState !== "open" || !cog || !p) return;
      const r = cog.getBoundingClientRect();
      const pad = 8;
      const width = Math.min(320, window.innerWidth - 2 * pad);
      // Right-align the panel to the cog, clamped inside the viewport.
      p.style.left = `${Math.max(pad, Math.min(r.right - width, window.innerWidth - width - pad))}px`;
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow >= 260 || spaceBelow >= r.top) {
        p.style.top = `${r.bottom + 6}px`;
        p.style.bottom = "auto";
      } else {
        p.style.bottom = `${window.innerHeight - r.top + 6}px`;
        p.style.top = "auto";
      }
    }
    panel.addEventListener("beforetoggle", place);
    return () => panel.removeEventListener("beforetoggle", place);
  }, []);

  const cogButton = (
    <button
      ref={cogRef}
      type="button"
      className={styles.cog}
      popoverTarget={popoverId}
      title={label}
      aria-label={label}
      // Don't let the click start a widget drag via the header's mousedown handler.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );

  return (
    <>
      {headerSlot && createPortal(cogButton, headerSlot)}
      <div ref={panelRef} id={popoverId} popover="auto" className={styles.panel}>
        {children}
      </div>
    </>
  );
}
