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
