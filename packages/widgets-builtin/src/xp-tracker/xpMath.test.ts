// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { levelForXp, splitXp, levelProgress, applyEncounterAward, XP_HISTORY_CAP, DEFAULT_XP_THRESHOLDS } from "./xpMath";
import type { XpTrackerState } from "./types";

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

describe("applyEncounterAward", () => {
  const base = (over: Partial<XpTrackerState> = {}): XpTrackerState => ({
    mode: "perPc", partyXp: 0, perPc: {}, ...over,
  });
  const input = (total: number, recipientIds: string[]) => ({
    total, recipientIds, label: "Goblins", id: "a1", at: 1000,
  });

  it("splits the total across recipients in perPc mode, rounding down", () => {
    const next = applyEncounterAward(base({ perPc: { p1: 100, p2: 0 } }), input(1000, ["p1", "p2", "p3"]));
    // 1000 / 3 -> 333 each
    expect(next.perPc).toEqual({ p1: 433, p2: 333, p3: 333 });
  });

  it("advances the shared pool by the per-head share in party mode", () => {
    const next = applyEncounterAward(base({ mode: "party", partyXp: 500 }), input(1200, ["p1", "p2", "p3", "p4"]));
    // 1200 / 4 -> 300 added to the pool
    expect(next.partyXp).toBe(800);
    expect(next.perPc).toEqual({});
  });

  it("pushes an undo snapshot of the prior totals", () => {
    const next = applyEncounterAward(base({ partyXp: 10, perPc: { p1: 5 } }), input(90, ["p1"]));
    expect(next.history).toEqual([{ id: "a1", label: "Goblins", at: 1000, prevPartyXp: 10, prevPerPc: { p1: 5 } }]);
  });

  it("caps history at XP_HISTORY_CAP", () => {
    const full = Array.from({ length: XP_HISTORY_CAP }, (_, i) => ({ id: `h${i}`, label: "x", prevPartyXp: 0, prevPerPc: {} }));
    const next = applyEncounterAward(base({ perPc: { p1: 0 }, history: full }), input(50, ["p1"]));
    expect(next.history).toHaveLength(XP_HISTORY_CAP);
    expect(next.history?.[0].id).toBe("a1");
  });

  it("is a no-op with no recipients", () => {
    const s = base({ perPc: { p1: 10 } });
    expect(applyEncounterAward(s, input(500, []))).toBe(s);
  });

  it("is a no-op when the share rounds to zero", () => {
    // 2 XP across 3 PCs -> 0 each, nothing to record.
    const s = base({ perPc: { p1: 10 } });
    expect(applyEncounterAward(s, input(2, ["p1", "p2", "p3"]))).toBe(s);
  });

  it("never drops a recipient below zero on a negative correction", () => {
    const next = applyEncounterAward(base({ perPc: { p1: 100 } }), input(-600, ["p1", "p2"]));
    // -600 / 2 -> -300; p1 100-300 clamps to 0, p2 0-300 clamps to 0
    expect(next.perPc).toEqual({ p1: 0, p2: 0 });
  });
});
