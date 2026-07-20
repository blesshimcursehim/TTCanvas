// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useId, type ReactNode } from "react";
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

  const cogButton = (
    <button
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
      <div id={popoverId} popover="auto" className={styles.panel}>
        {children}
      </div>
    </>
  );
}
