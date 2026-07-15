// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { FogReveal, MapToken, MapAnnotation, MarkupPreset } from "@ttcanvas/core";

export type { FogReveal, MapToken, MapAnnotation, MarkupPreset };

export interface MapScale {
  mode: "grid" | "calibrate";
  unitLabel: string;
  unitsPerCell?: number;
  pixelsPerUnit?: number;
}

export interface MapScene {
  id: string;
  name: string;
  selectedMap: string | null;
  fogEnabled: boolean;
  fogReveals: FogReveal[];
  tokens: MapToken[];
  annotations?: MapAnnotation[];
  markupPreset?: MarkupPreset; // default "cartographer"
  gridEnabled: boolean;
  gridSize: number;
  panX: number;
  panY: number;
  scale: number;
  mapScale?: MapScale;
  gridOffsetX?: number;
  gridOffsetY?: number;
}

export interface MapDisplayState {
  mapsFolder: string | null;
  scenes: MapScene[];
  activeSceneId: string;
  autoPushMap?: boolean;
  /** One-shot "locate or place a pin for this Gazetteer place" request, set by App.tsx from the
   * Gazetteer's "Pin this place" button. `id` is a fresh uid per click (not `locationRef`) so a
   * repeat click re-fires the effect even for the same place. Cleared by MapDisplay the same
   * frame it's consumed - the 1s save debounce means it never reaches disk. */
  locateRequest?: { id: string; locationRef: string; label: string };
}
