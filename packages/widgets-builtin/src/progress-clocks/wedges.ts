// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure SVG pie-wedge geometry for the clock face - no React, no DOM, unit-tested in isolation
// (like map-display/annotations.ts).

export interface Wedge {
  /** SVG <path> "d" attribute for this wedge, a full pie slice from the centre. */
  d: string;
  filled: boolean;
}

/**
 * Path data for each of `segments` equal pie wedges of a circle of radius `r` centred at (r, r)
 * (so the whole face fits a `2r x 2r` viewBox starting at the origin), first wedge at 12 o'clock,
 * going clockwise. The first `filled` wedges (in that same order) are marked filled.
 */
export function clockWedges(segments: number, filled: number, r: number): Wedge[] {
  const cx = r;
  const cy = r;
  const wedges: Wedge[] = [];
  for (let i = 0; i < segments; i++) {
    // -PI/2 rotates the 0th wedge's start to 12 o'clock instead of 3 o'clock (the unrotated
    // angle-0 point for cos/sin), then each wedge sweeps 1/segments of the full circle clockwise.
    const startAngle = (i / segments) * 2 * Math.PI - Math.PI / 2;
    const endAngle = ((i + 1) / segments) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    // SVG's arc flag for "the long way around" - only relevant when a single wedge spans more
    // than half the circle (segments 1 or 2), but harmless (always 0) at typical clock sizes.
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
    wedges.push({ d, filled: i < filled });
  }
  return wedges;
}
