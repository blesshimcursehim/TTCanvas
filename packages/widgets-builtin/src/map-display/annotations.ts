// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure geometry + hit-testing for map markup. All coordinates are normalised
// (0-1 of the image), so everything survives pan / zoom / resize and the
// GM-view -> player-view rescale. No React, no DOM - unit-tested in isolation.

import type { MapAnnotation, AnnotationColor } from "@ttcanvas/core";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

/** Handle ids for the 8-point transform box (corners + edge midpoints). */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLE_IDS: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Smallest normalised extent a shape is allowed to shrink to. */
export const MIN_EXTENT = 0.01;

/** Normalised axis-aligned bounding box of any annotation. */
export function annotationBounds(a: MapAnnotation): Rect {
  if (a.type === "arrow") {
    return rectFromPoints([{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }]);
  }
  if (a.type === "highlight") {
    return a.points.length ? rectFromPoints(a.points) : { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}

function rectFromPoints(pts: Point[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Shift every coordinate of an annotation by (dx, dy). */
export function translateAnnotation(a: MapAnnotation, dx: number, dy: number): MapAnnotation {
  if (a.type === "arrow") {
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }
  if (a.type === "highlight") {
    return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  return { ...a, x: a.x + dx, y: a.y + dy };
}

/** Remap an annotation's geometry from one bounding box to another (used by resize). */
export function scaleAnnotationToBounds(a: MapAnnotation, from: Rect, to: Rect): MapAnnotation {
  const sx = from.w === 0 ? 0 : to.w / from.w;
  const sy = from.h === 0 ? 0 : to.h / from.h;
  const map = (p: Point): Point => ({
    x: to.x + (p.x - from.x) * sx,
    y: to.y + (p.y - from.y) * sy,
  });
  if (a.type === "arrow") {
    const p1 = map({ x: a.x1, y: a.y1 });
    const p2 = map({ x: a.x2, y: a.y2 });
    return { ...a, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  if (a.type === "highlight") {
    return { ...a, points: a.points.map(map) };
  }
  return { ...a, x: to.x, y: to.y, w: to.w, h: to.h };
}

/** New bounds after dragging `handle` to the normalised pointer (px, py). */
export function boundsFromHandle(bounds: Rect, handle: HandleId, px: number, py: number): Rect {
  let left = bounds.x;
  let right = bounds.x + bounds.w;
  let top = bounds.y;
  let bottom = bounds.y + bounds.h;
  if (handle.includes("w")) left = px;
  if (handle.includes("e")) right = px;
  if (handle.includes("n")) top = py;
  if (handle.includes("s")) bottom = py;
  const x = Math.min(left, right);
  const y = Math.min(top, bottom);
  return {
    x,
    y,
    w: Math.max(Math.abs(right - left), MIN_EXTENT),
    h: Math.max(Math.abs(bottom - top), MIN_EXTENT),
  };
}

/** Normalised position of a handle on a bounding box. */
export function handlePoint(bounds: Rect, handle: HandleId): Point {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const x = handle.includes("w") ? bounds.x : handle.includes("e") ? bounds.x + bounds.w : cx;
  const y = handle.includes("n") ? bounds.y : handle.includes("s") ? bounds.y + bounds.h : cy;
  return { x, y };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Is the normalised point (px, py) close enough to select this annotation? */
export function hitTestAnnotation(a: MapAnnotation, px: number, py: number, tol: number): boolean {
  if (a.type === "arrow") {
    return distToSegment({ x: px, y: py }, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= tol;
  }
  if (a.type === "highlight") {
    const pts = a.points;
    if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y) <= tol;
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment({ x: px, y: py }, pts[i - 1], pts[i]) <= tol) return true;
    }
    return false;
  }
  // ring / box: hit anywhere inside the (tolerance-padded) bounding box
  return px >= a.x - tol && px <= a.x + a.w + tol && py >= a.y - tol && py <= a.y + a.h + tol;
}

/** Topmost annotation (last drawn wins) under the normalised point, or null. */
export function pickAnnotation(annotations: MapAnnotation[], px: number, py: number, tol: number): string | null {
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (hitTestAnnotation(annotations[i], px, py, tol)) return annotations[i].id;
  }
  return null;
}

/** Build a bbox-shaped annotation (ring / box) from a drag start -> end. */
export function bboxAnnotationFromDrag(
  id: string,
  type: "ring" | "box",
  start: Point,
  end: Point,
  color: AnnotationColor,
  stroke: 1 | 2 | 3,
): MapAnnotation {
  const r = rectFromPoints([start, end]);
  return { id, type, color, stroke, x: r.x, y: r.y, w: r.w, h: r.h };
}

/** Build an arrow annotation from a drag start -> end. */
export function arrowAnnotationFromDrag(
  id: string,
  start: Point,
  end: Point,
  color: AnnotationColor,
  stroke: 1 | 2 | 3,
): MapAnnotation {
  return { id, type: "arrow", color, stroke, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

/** Did a drag move far enough to count as a real shape (not a stray click)? */
export function isDragMeaningful(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) >= MIN_EXTENT;
}

// Spreadsheet-column-style base-26 conversion (0 -> "A", 25 -> "Z", 26 -> "AA", ...): unlike a
// plain base-26 number there's no digit for zero, so each step first decrements n by one - the
// idiomatic trick for turning a 0-based index into a letters-only sequence with no leading "A"s.
function toLetters(n: number): string {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

/**
 * The next unused auto-label (A, B, C, ... Z, AA, AB, ...) for a freshly drawn ring/box, skipping
 * any label already in use on the scene (including ones the GM typed by hand) so tags stay unique.
 */
export function nextAutoLabel(existing: MapAnnotation[]): string {
  const used = new Set(existing.map((a) => a.label).filter((l): l is string => !!l));
  for (let n = 0; ; n++) {
    const label = toLetters(n);
    if (!used.has(label)) return label;
  }
}
