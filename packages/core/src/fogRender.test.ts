// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { fogModeOf, lastBrushPoint } from "./fogRender";
import type { FogReveal } from "./types";

describe("fogModeOf", () => {
  it("treats a reveal with no mode field as 'reveal' (legacy data)", () => {
    expect(fogModeOf({ shape: "brush", cx: 0.5, cy: 0.5, r: 0.05 })).toBe("reveal");
  });

  it("returns 'reveal' when explicitly set", () => {
    expect(fogModeOf({ shape: "rect", x: 0, y: 0, w: 1, h: 1, mode: "reveal" })).toBe("reveal");
  });

  it("returns 'hide' when explicitly set", () => {
    expect(fogModeOf({ shape: "brush", cx: 0.5, cy: 0.5, r: 0.05, mode: "hide" })).toBe("hide");
  });
});

describe("lastBrushPoint", () => {
  it("returns null for an empty list", () => {
    expect(lastBrushPoint([])).toBeNull();
  });

  it("returns null when the list has only rects", () => {
    const reveals: FogReveal[] = [{ shape: "rect", x: 0, y: 0, w: 0.2, h: 0.2 }];
    expect(lastBrushPoint(reveals)).toBeNull();
  });

  it("finds the most recent brush point, skipping a trailing rect", () => {
    const reveals: FogReveal[] = [
      { shape: "brush", cx: 0.1, cy: 0.1, r: 0.05, mode: "hide" },
      { shape: "brush", cx: 0.2, cy: 0.2, r: 0.05 },
      { shape: "rect", x: 0, y: 0, w: 0.1, h: 0.1 },
    ];
    expect(lastBrushPoint(reveals)).toEqual({ cx: 0.2, cy: 0.2, r: 0.05, mode: "reveal" });
  });

  it("carries the last brush point's mode through", () => {
    const reveals: FogReveal[] = [
      { shape: "brush", cx: 0.1, cy: 0.1, r: 0.05, mode: "reveal" },
      { shape: "brush", cx: 0.3, cy: 0.3, r: 0.05, mode: "hide" },
    ];
    expect(lastBrushPoint(reveals)?.mode).toBe("hide");
  });
});
