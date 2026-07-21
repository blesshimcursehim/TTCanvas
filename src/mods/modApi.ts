// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { logInfo, logWarn, logError } from "@ttcanvas/core";

/** Bump when `TTCanvasModApi` gains something, so a mod can feature-detect. */
export const MOD_API_VERSION = 1;

/**
 * Publishes `window.ttcanvas` for mod widgets. Call once, before any mod is imported.
 *
 * A global rather than an import because mods load from a blob URL (`loadMods.ts`), where bare
 * specifiers don't resolve - there is no import map to point `@ttcanvas/core` at. The shape lives
 * in `ttcanvas-mod-api.d.ts`, which mod authors copy to get the same types.
 *
 * This grants a mod no new privilege: mods already run in the main webview with full DOM and IPC
 * access (see the trust prompt in `loadMods.ts`). It only gives them a way to report their own
 * handled failures, which otherwise vanish - the app catches mod *crashes* through WidgetFrame's
 * error boundary and uncaught async errors through main.tsx, but a mod that catches its own error
 * and degrades quietly has nowhere to write.
 */
export function installModApi(): void {
  // The property below is non-configurable, so defining it twice throws. A dev-server hot reload
  // can re-execute this module without a fresh window, so treat an existing install as done.
  if ("ttcanvas" in window) return;
  // Tag mod-origin lines. When triaging a report, knowing a line came from third-party code
  // rather than from TTCanvas itself is usually the first thing worth knowing.
  const tag = (message: string) => `[mod] ${message}`;
  Object.defineProperty(window, "ttcanvas", {
    value: Object.freeze({
      apiVersion: MOD_API_VERSION,
      log: Object.freeze({
        info: (message: string) => logInfo(tag(message)),
        warn: (message: string, err?: unknown) => logWarn(tag(message), err),
        error: (message: string, err?: unknown) => logError(tag(message), err),
      }),
    }),
    // Non-writable and non-configurable: one mod must not be able to swap the logger out from
    // under another, or silence its own failures by replacing the object.
    writable: false,
    configurable: false,
  });
}
