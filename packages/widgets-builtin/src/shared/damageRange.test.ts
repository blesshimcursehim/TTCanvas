// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { damageRange } from "./damageRange";

describe("damageRange", () => {
  it("spans a plain die", () => {
    expect(damageRange("1d6")).toEqual({ min: 1, max: 6 });
  });

  it("counts every die", () => {
    expect(damageRange("2d6")).toEqual({ min: 2, max: 12 });
  });

  it("shifts by a flat bonus", () => {
    expect(damageRange("2d6+3")).toEqual({ min: 5, max: 15 });
  });

  it("shifts down by a penalty", () => {
    // The BG3 club: 1d6-1 reads as "0~5 Damage".
    expect(damageRange("1d6-1")).toEqual({ min: 0, max: 5 });
  });

  it("clamps a negative floor at zero rather than reading as a heal", () => {
    expect(damageRange("1d4-2")).toEqual({ min: 0, max: 2 });
  });

  it("counts only the kept dice", () => {
    // Keeping the highest 3 of 4d6 still spans 3 (all ones) to 18 (all sixes).
    expect(damageRange("4d6kh3")).toEqual({ min: 3, max: 18 });
  });

  it("subtracts a whole dice term at its widest", () => {
    // 1d6 - 1d4 ranges from 1-4 = -3 (clamped to 0) up to 6-1 = 5.
    expect(damageRange("1d6-1d4")).toEqual({ min: 0, max: 5 });
  });

  it("sums several dice terms", () => {
    expect(damageRange("1d8+2d6+1")).toEqual({ min: 4, max: 21 });
  });

  it("sums a weapon whose damage comes from several sources", () => {
    // 1d8+8 piercing plus 1d6 thunder plus 1d4 necrotic. One range covers the lot.
    expect(damageRange("1d8+8+1d6+1d4")).toEqual({ min: 11, max: 26 });
  });

  it("defaults a bare d20 to one die", () => {
    expect(damageRange("d20")).toEqual({ min: 1, max: 20 });
  });

  it("gives up on exploding dice, which have no maximum", () => {
    expect(damageRange("1d6!")).toBeNull();
  });

  it("gives up on text that is not notation", () => {
    expect(damageRange("banana")).toBeNull();
    expect(damageRange("1d6 per level")).toBeNull();
    expect(damageRange("")).toBeNull();
  });
});
