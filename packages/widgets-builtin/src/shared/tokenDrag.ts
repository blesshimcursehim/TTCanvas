// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { MapTokenKind } from "@ttcanvas/core";

export interface TokenDragData {
  sourceId: string;
  label: string;
  color: string;
  portraitPath?: string; // vault-relative path, e.g. "portraits/uuid.jpg"
  kind?: MapTokenKind;    // seeds the map token's visibility group; absent -> "npc"
}

// Module-level variable - avoids relying on dataTransfer.getData which
// WebView2 on Windows doesn't expose reliably for custom MIME types.
let active: TokenDragData | null = null;

export function setActiveTokenDrag(data: TokenDragData): void { active = data; }
export function getActiveTokenDrag(): TokenDragData | null { return active; }
export function clearActiveTokenDrag(): void { active = null; }

// The keyboard-reachable alternative to dragging a card onto the map: place it dead-centre on the
// active scene instead. MapDisplay listens for this window event and adds/moves a token exactly as
// it would from a drop, deduping by sourceId the same way. One shared dispatcher (rather than each
// caller building its own CustomEvent) keeps the event's shape defined in exactly one place.
export function placeTokenAtCenter(data: TokenDragData): void {
  window.dispatchEvent(new CustomEvent("ttcanvas:place-token", { detail: data }));
}
