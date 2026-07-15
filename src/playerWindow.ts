// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { invoke } from "@tauri-apps/api/core";

export interface PlayerWindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function openPlayerWindow(savedBounds?: { x: number | null; y: number | null; w: number | null; h: number | null }): Promise<void> {
  return invoke("open_player_window", {
    savedX: savedBounds?.x ?? null,
    savedY: savedBounds?.y ?? null,
    savedW: savedBounds?.w ?? null,
    savedH: savedBounds?.h ?? null,
  });
}

export function closePlayerWindow(): Promise<void> {
  return invoke("close_player_window");
}

export function playerWindowExists(): Promise<boolean> {
  return invoke("player_window_exists");
}

export function getPlayerWindowBounds(): Promise<PlayerWindowBounds | null> {
  return invoke("get_player_window_bounds");
}

export function setPlayerFullscreen(fullscreen: boolean): Promise<void> {
  return invoke("set_player_fullscreen", { fullscreen });
}
