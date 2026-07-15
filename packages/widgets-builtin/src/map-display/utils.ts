// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { MapScale } from "./types";

/**
 * Computes the pan/scale that makes an image fit entirely within a viewport
 * (object-fit: contain semantics). The mapWrapper is flexbox-centered, so
 * panX/panY = 0 always centres the image; only scale varies.
 */
export function fitTransform(
  viewport: { w: number; h: number },
  img: { w: number; h: number },
): { panX: number; panY: number; scale: number } {
  const scale = Math.min(viewport.w / img.w, viewport.h / img.h);
  return { panX: 0, panY: 0, scale };
}

/**
 * The pan that centres the viewport on a normalized image-space point at a given scale - the
 * algebraic inverse of the toNorm() transform in MapDisplay (same "mapWrapper is flexbox-centered,
 * panX/panY = 0 = dead centre" convention as fitTransform above).
 */
export function panToPoint(
  img: { w: number; h: number },
  point: { nx: number; ny: number },
  scale: number,
): { panX: number; panY: number } {
  return {
    panX: img.w * scale * (0.5 - point.nx),
    panY: img.h * scale * (0.5 - point.ny),
  };
}

/**
 * Converts a distance between two normalized image-space points into a
 * human-readable string using the provided map scale. With no scale set it
 * falls back to counting grid squares (never raw pixels, which mean nothing to
 * a GM); if there is no usable grid either it returns an em-dash.
 *
 * @param p1 - start point in normalized coords (0-1)
 * @param p2 - end point in normalized coords (0-1)
 * @param imgSize - image dimensions in pixels
 * @param mapScale - optional per-scene scale config
 * @param gridSize - current grid cell size in pixels (used for "grid" mode)
 */
export function measureDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  imgSize: { w: number; h: number },
  mapScale: MapScale | undefined,
  gridSize: number,
): { pixels: number; formatted: string } {
  const dx = (p2.x - p1.x) * imgSize.w;
  const dy = (p2.y - p1.y) * imgSize.h;
  const pixels = Math.hypot(dx, dy);

  let pixelsPerUnit: number | null = null;
  if (mapScale?.mode === "grid" && mapScale.unitsPerCell != null && mapScale.unitsPerCell > 0 && gridSize > 0) {
    pixelsPerUnit = gridSize / mapScale.unitsPerCell;
  } else if (mapScale?.mode === "calibrate" && mapScale.pixelsPerUnit != null && mapScale.pixelsPerUnit > 0) {
    pixelsPerUnit = mapScale.pixelsPerUnit;
  }

  if (pixelsPerUnit === null) {
    // No real-world scale set: count grid squares, which is meaningful even
    // without a unit. With no usable grid, there is nothing sensible to show.
    if (gridSize > 0) {
      const squares = pixels / gridSize;
      return { pixels, formatted: `${squares.toFixed(1)} sq` };
    }
    return { pixels, formatted: "-" };
  }

  const value = pixels / pixelsPerUnit;
  const label = mapScale!.unitLabel || "units";
  const display = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return { pixels, formatted: `${display} ${label}` };
}
