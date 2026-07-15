// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { parseExpression, rollExpression, evaluate, formatBreakdown } from "./dice";

// A deterministic rng: `face(f, sides)` returns the mid-bucket float that makes
// `Math.floor(rng() * sides) + 1` land exactly on face `f`, so tests read as dice faces.
const face = (f: number, sides: number): number => (f - 0.5) / sides;
function rngSeq(values: number[]): () => number {
  let i = 0;
  return () => values[i++];
}

describe("parseExpression", () => {
  it("accepts valid notation", () => {
    for (const ok of ["d20", "2d6", "2d6+3", "2d6 - 1d4 + 5", "4d6kh3", "5d6kl2", "d6!", "1d20+7", "10"]) {
      expect(parseExpression(ok), ok).not.toBeNull();
    }
  });

  it("rejects invalid notation", () => {
    for (const bad of ["", "  ", "d", "2d", "d0", "abc", "2d6+", "2d6xh3", "4d6kh5", "1..2", "d6!!x"]) {
      expect(parseExpression(bad), bad).toBeNull();
    }
  });
});

describe("rollExpression", () => {
  it("sums a constant-only expression", () => {
    const r = rollExpression(parseExpression("7")!, rngSeq([]));
    expect(r.total).toBe(7);
  });

  it("sums multi-term dice and constants with signs", () => {
    // 2d6 -> (5,6), 1d8 -> (8), + 4  => 5+6+8+4 = 23
    const rng = rngSeq([face(5, 6), face(6, 6), face(8, 8)]);
    const r = rollExpression(parseExpression("2d6 + 1d8 + 4")!, rng);
    expect(r.total).toBe(23);
    expect(formatBreakdown(r)).toBe("(5,6)+(8)+4");
  });

  it("subtracts a negative term", () => {
    // 1d20 -> 15, minus 2  => 13
    const r = rollExpression(parseExpression("1d20 - 2")!, rngSeq([face(15, 20)]));
    expect(r.total).toBe(13);
    expect(formatBreakdown(r)).toBe("(15)-2");
  });

  it("keeps the highest N dice (kh) and marks the dropped one", () => {
    // 4d6kh3 -> rolls (5,6,4,2), keep top 3 (6,5,4) = 15, drop 2
    const rng = rngSeq([face(5, 6), face(6, 6), face(4, 6), face(2, 6)]);
    const r = rollExpression(parseExpression("4d6kh3")!, rng);
    expect(r.total).toBe(15);
    expect(formatBreakdown(r)).toBe("(6,5,4,~2)");
  });

  it("keeps the lowest N dice (kl)", () => {
    // 4d6kl1 -> rolls (5,6,4,2), keep lowest 1 (2)
    const rng = rngSeq([face(5, 6), face(6, 6), face(4, 6), face(2, 6)]);
    const r = rollExpression(parseExpression("4d6kl1")!, rng);
    expect(r.total).toBe(2);
  });

  it("explodes a die on its max face", () => {
    // d6! -> 6 (explode) -> 6 (explode) -> 2 (stop) = 14
    const rng = rngSeq([face(6, 6), face(6, 6), face(2, 6)]);
    const r = rollExpression(parseExpression("d6!")!, rng);
    expect(r.total).toBe(14);
  });

  it("flags crit on a lone natural 20 only", () => {
    expect(rollExpression(parseExpression("d20")!, rngSeq([face(20, 20)])).crit).toBe(true);
    expect(rollExpression(parseExpression("d20")!, rngSeq([face(1, 20)])).fumble).toBe(true);
    // A d20 inside a larger expression does not read as a crit.
    const rng = rngSeq([face(20, 20), face(3, 6)]);
    const r = rollExpression(parseExpression("1d20 + 1d6")!, rng);
    expect(r.crit).toBe(false);
    // A modified d20 (advantage handled elsewhere) still isn't a "lone" crit source.
    expect(rollExpression(parseExpression("2d20kh1")!, rngSeq([face(20, 20), face(4, 20)])).crit).toBe(false);
  });
});

describe("evaluate (advantage / disadvantage)", () => {
  it("returns null on invalid notation", () => {
    expect(evaluate("nonsense", null)).toBeNull();
  });

  it("keeps the higher total with advantage and returns the other as alt", () => {
    // First 1d20 -> 8, second -> 17. Advantage keeps 17.
    const rng = rngSeq([face(8, 20), face(17, 20)]);
    const out = evaluate("1d20", "advantage", rng)!;
    expect(out.breakdown.total).toBe(17);
    expect(out.alt?.total).toBe(8);
  });

  it("keeps the lower total with disadvantage", () => {
    const rng = rngSeq([face(8, 20), face(17, 20)]);
    const out = evaluate("1d20", "disadvantage", rng)!;
    expect(out.breakdown.total).toBe(8);
    expect(out.alt?.total).toBe(17);
  });

  it("does not roll twice when adv is null", () => {
    const out = evaluate("1d20", null, rngSeq([face(11, 20)]))!;
    expect(out.breakdown.total).toBe(11);
    expect(out.alt).toBeUndefined();
  });
});
