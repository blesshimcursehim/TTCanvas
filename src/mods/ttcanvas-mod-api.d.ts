// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/**
 * The API TTCanvas exposes to mod widgets on `window.ttcanvas`.
 *
 * Mods are loaded from a blob URL (`src/mods/loadMods.ts`), so bare specifiers like
 * `@ttcanvas/core` cannot resolve inside one - a global is the only channel that works without
 * asking every mod author to configure a bundler. This file is the single source of truth for its
 * shape: the app typechecks against it, and mod authors copy it next to their own source to get
 * the same types.
 *
 * Treat this as a public API. Mods in the wild call it, so removing or renaming anything here is
 * a breaking change; add to `apiVersion` rather than reshaping what is already published.
 */
interface TTCanvasModLog {
  /** Record something noteworthy that is not a fault. */
  info(message: string): void;
  /** Record a recoverable failure - the widget degraded but carried on. */
  warn(message: string, err?: unknown): void;
  /** Record a failure of something the user actually asked for. */
  error(message: string, err?: unknown): void;
}

interface TTCanvasModApi {
  /** Bumped when this interface gains something. Feature-detect against it rather than assuming. */
  readonly apiVersion: number;
  /**
   * Writes to the same local, redacted log file the app itself uses, so a mod's failures show up
   * in Preferences > Diagnostics alongside everything else. Messages are tagged as mod-origin
   * automatically. Nothing is ever sent off the machine.
   */
  readonly log: TTCanvasModLog;
}

interface Window {
  readonly ttcanvas: TTCanvasModApi;
}
