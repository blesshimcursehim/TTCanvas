// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { clockWedges } from "./wedges";

describe("clockWedges", () => {
  it("returns one wedge per segment", () => {
    expect(clockWedges(6, 0, 10)).toHaveLength(6);
    expect(clockWedges(1, 0, 10)).toHaveLength(1);
  });

  it("marks exactly the first `filled` wedges as filled, in order", () => {
    const wedges = clockWedges(4, 2, 10);
    expect(wedges.map((w) => w.filled)).toEqual([true, true, false, false]);
  });

  it("marks none filled at 0 and all filled at the segment count", () => {
    expect(clockWedges(5, 0, 10).every((w) => !w.filled)).toBe(true);
    expect(clockWedges(5, 5, 10).every((w) => w.filled)).toBe(true);
  });

  it("starts every wedge's path at the centre", () => {
    for (const w of clockWedges(8, 3, 12)) {
      expect(w.d.startsWith("M12,12")).toBe(true);
    }
  });

  it("places the first wedge's start point at 12 o'clock and the second's at 3 o'clock (r=10)", () => {
    const [w0, w1] = clockWedges(4, 0, 10);
    // 12 o'clock: (cx, cy-r) = (10, 0). 3 o'clock: (cx+r, cy) = (20, 10).
    expect(w0.d).toContain("L10,0 ");
    expect(w1.d).toContain("L20,10 ");
  });
});
