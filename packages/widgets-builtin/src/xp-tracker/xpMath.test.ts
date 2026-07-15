// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { levelForXp, splitXp, levelProgress, DEFAULT_XP_THRESHOLDS } from "./xpMath";

describe("levelForXp", () => {
  it("returns level 1 for 0 xp", () => {
    expect(levelForXp(0, DEFAULT_XP_THRESHOLDS)).toBe(1);
  });

  it("returns level 1 for xp below the level-2 threshold", () => {
    expect(levelForXp(299, DEFAULT_XP_THRESHOLDS)).toBe(1);
  });

  it("returns the next level exactly at its threshold", () => {
    expect(levelForXp(300, DEFAULT_XP_THRESHOLDS)).toBe(2);
  });

  it("returns the highest level for xp beyond the top threshold", () => {
    expect(levelForXp(1_000_000, DEFAULT_XP_THRESHOLDS)).toBe(20);
  });

  it("returns null for an empty threshold table (GM cleared it)", () => {
    expect(levelForXp(5000, [])).toBeNull();
  });

  it("works with a custom, shorter threshold table", () => {
    expect(levelForXp(150, [0, 100, 200])).toBe(2);
  });
});

describe("splitXp", () => {
  it("splits evenly when it divides cleanly", () => {
    expect(splitXp(400, 4)).toBe(100);
  });

  it("rounds each share down, dropping the remainder", () => {
    expect(splitXp(100, 3)).toBe(33);
  });

  it("returns 0 when there are no recipients", () => {
    expect(splitXp(500, 0)).toBe(0);
  });

  it("returns 0 for a negative recipient count", () => {
    expect(splitXp(500, -1)).toBe(0);
  });

  it("returns 0 when the total is smaller than the recipient count", () => {
    expect(splitXp(2, 5)).toBe(0);
  });
});

describe("levelProgress", () => {
  it("reports zero progress at the bottom of a band", () => {
    const p = levelProgress(0, DEFAULT_XP_THRESHOLDS);
    expect(p.level).toBe(1);
    expect(p.next).toBe(300);
    expect(p.fraction).toBe(0);
  });

  it("reports halfway through the level-1 band", () => {
    expect(levelProgress(150, DEFAULT_XP_THRESHOLDS).fraction).toBeCloseTo(0.5);
  });

  it("measures progress within a mid-table band", () => {
    // Level 6 band runs 14000-23000, so 18000 is 4/9 through it.
    const p = levelProgress(18000, DEFAULT_XP_THRESHOLDS);
    expect(p.level).toBe(6);
    expect(p.next).toBe(23000);
    expect(p.fraction).toBeCloseTo(4 / 9);
  });

  it("reports max level as full with no next threshold", () => {
    const p = levelProgress(1_000_000, DEFAULT_XP_THRESHOLDS);
    expect(p.level).toBe(20);
    expect(p.next).toBeNull();
    expect(p.fraction).toBe(1);
  });

  it("returns null level for an empty threshold table", () => {
    expect(levelProgress(5000, []).level).toBeNull();
  });
});
