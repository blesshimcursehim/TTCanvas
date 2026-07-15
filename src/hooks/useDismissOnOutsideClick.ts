// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, type RefObject } from "react";

/**
 * Dismiss a popover when the user left-clicks outside of `ref`.
 *
 * Listens for a document `mousedown` in the capture phase and only fires on the
 * primary button (`button === 0`). That deliberately ignores middle-button panning
 * (`button === 1`) and wheel-zoom (a `wheel` event, not a `mousedown`), so an open
 * popover survives canvas navigation but closes on a plain click elsewhere.
 */
export function useDismissOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [ref, active, onDismiss]);
}
