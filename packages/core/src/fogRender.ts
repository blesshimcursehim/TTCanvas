// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Shared fog-of-war canvas compositing, used by both MapDisplay (GM window) and
// PlayerWindow so the two surfaces can never drift out of sync on how fog renders.

import type { FogMode, FogReveal } from "./types";

export interface BrushPoint {
  cx: number;
  cy: number;
  r: number;
  mode: FogMode;
}

/** `mode` is absent on fog data saved before hide mode existed - treat that as "reveal". */
export function fogModeOf(reveal: FogReveal): FogMode {
  return reveal.mode ?? "reveal";
}

/** Last brush reveal in the list (skipping rects), used to chain a new stroke onto it. */
export function lastBrushPoint(reveals: FogReveal[]): BrushPoint | null {
  for (let i = reveals.length - 1; i >= 0; i--) {
    const r = reveals[i];
    if (r.shape === "brush") return { cx: r.cx, cy: r.cy, r: r.r, mode: fogModeOf(r) };
  }
  return null;
}

// Renders reveals onto ctx in array order. Reveal regions punch holes (destination-out);
// hide regions paint fog back on (source-over black). Composite mode only switches when
// consecutive regions actually change mode, and a brush stroke only chains into the
// previous point (for a smooth connecting line instead of discrete dabs) when both are
// the same mode - otherwise a reveal stroke and a hide stroke that happen to start near
// each other would incorrectly draw a connecting segment in the wrong mode.
export function renderFogReveals(
  ctx: CanvasRenderingContext2D,
  reveals: FogReveal[],
  w: number,
  h: number,
  prevBrush: BrushPoint | null,
) {
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let prev = prevBrush;
  let currentMode: FogMode | null = null;
  for (const r of reveals) {
    const mode = fogModeOf(r);
    if (mode !== currentMode) {
      ctx.globalCompositeOperation = mode === "hide" ? "source-over" : "destination-out";
      currentMode = mode;
    }
    if (r.shape === "rect") {
      prev = null;
      ctx.fillRect(r.x * w, r.y * h, r.w * w, r.h * h);
      continue;
    }
    const x = r.cx * w;
    const y = r.cy * h;
    const radius = r.r * w;
    if (prev !== null && prev.mode === mode && Math.hypot(r.cx - prev.cx, r.cy - prev.cy) <= r.r * 3) {
      ctx.beginPath();
      ctx.lineWidth = radius * 2;
      ctx.moveTo(prev.cx * w, prev.cy * h);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    prev = { cx: r.cx, cy: r.cy, r: r.r, mode };
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Full redraw: opaque black base, then reveals/hides applied in order. */
export function drawFogCanvas(canvas: HTMLCanvasElement, w: number, h: number, reveals: FogReveal[]) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  renderFogReveals(ctx, reveals, w, h, null);
}
