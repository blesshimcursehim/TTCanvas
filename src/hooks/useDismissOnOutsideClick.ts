// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useEffect, type RefObject } from "react";

/**
 * Dismiss a popover when the user left-clicks outside of `ref`, or presses Escape.
 *
 * Listens for a document `mousedown` in the capture phase and only fires on the
 * primary button (`button === 0`). That deliberately ignores middle-button panning
 * (`button === 1`) and wheel-zoom (a `wheel` event, not a `mousedown`), so an open
 * popover survives canvas navigation but closes on a plain click elsewhere.
 *
 * Escape is a plain bubble-phase `keydown` listener on `document`, so it fires
 * after any inner handler inside the popover (e.g. an inline rename input
 * cancelling itself on Escape) - that inner handler must call
 * `e.stopPropagation()` if it wants to handle Escape *instead of* dismissing the
 * whole popover, otherwise both fire.
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active, onDismiss]);
}
