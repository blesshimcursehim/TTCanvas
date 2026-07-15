// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  entryWeight,
  totalWeight,
  entryRanges,
  rollTable,
  padValue,
  formatRange,
  resolveRoll,
  parseCount,
  rollTableMultiple,
} from "./engine";
import type { RollTable, RollTableEntry } from "./types";

function entry(id: string, text: string, weight = 1, extra: Partial<RollTableEntry> = {}): RollTableEntry {
  return { id, text, weight, ...extra };
}

function table(entries: RollTableEntry[], die = 20, extra: Partial<RollTable> = {}): RollTable {
  return { id: "t1", name: "Test", die, entries, ...extra };
}

/** A deterministic rng that yields exactly `value` in [0,1). */
const rngConst = (value: number) => () => value;

describe("entryWeight", () => {
  it("returns the weight when it is a positive integer", () => {
    expect(entryWeight(entry("a", "x", 3))).toBe(3);
  });
  it("floors a fractional weight", () => {
    expect(entryWeight(entry("a", "x", 2.9))).toBe(2);
  });
  it("treats a zero, negative, or NaN weight as 1", () => {
    expect(entryWeight(entry("a", "x", 0))).toBe(1);
    expect(entryWeight(entry("a", "x", -4))).toBe(1);
    expect(entryWeight(entry("a", "x", NaN))).toBe(1);
  });
});

describe("totalWeight", () => {
  it("sums entry weights", () => {
    expect(totalWeight([entry("a", "x", 1), entry("b", "y", 3), entry("c", "z", 1)])).toBe(5);
  });
  it("is 0 for an empty table", () => {
    expect(totalWeight([])).toBe(0);
  });
});

describe("entryRanges", () => {
  it("assigns each weight-1 entry a single consecutive value", () => {
    const ranges = entryRanges([entry("a", "x"), entry("b", "y"), entry("c", "z")]);
    expect(ranges).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 2 },
      { from: 3, to: 3 },
    ]);
  });
  it("widens a weighted entry's range and shifts the ones after it", () => {
    const ranges = entryRanges([entry("a", "x", 5), entry("b", "y", 1)]);
    expect(ranges).toEqual([
      { from: 1, to: 5 },
      { from: 6, to: 6 },
    ]);
  });
  it("returns an empty list for no entries", () => {
    expect(entryRanges([])).toEqual([]);
  });
});

describe("rollTable", () => {
  const t = table([entry("a", "first", 5), entry("b", "second", 1)]); // total 6

  it("returns null for an empty table", () => {
    expect(rollTable(table([]), rngConst(0))).toBeNull();
  });

  it("lands on the first entry at the low end of the roll range", () => {
    // rng 0 -> roll 1 -> within 1..5
    const r = rollTable(t, rngConst(0));
    expect(r).not.toBeNull();
    expect(r!.roll).toBe(1);
    expect(r!.entry.id).toBe("a");
  });

  it("lands on a weighted entry across its whole span", () => {
    // rng just below 5/6 -> roll 5 -> still entry a
    const r = rollTable(t, rngConst(4.9 / 6));
    expect(r!.roll).toBe(5);
    expect(r!.entry.id).toBe("a");
  });

  it("lands on the last entry at the top of the range", () => {
    // rng just below 1 -> roll 6 -> entry b
    const r = rollTable(t, rngConst(0.999));
    expect(r!.roll).toBe(6);
    expect(r!.entry.id).toBe("b");
  });

  it("weights selection proportionally over many rolls", () => {
    // A crude LCG so the distribution is deterministic yet spread out.
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let a = 0;
    for (let i = 0; i < 6000; i++) {
      if (rollTable(t, rng)!.entry.id === "a") a++;
    }
    // entry a has 5/6 of the weight; allow generous slack.
    expect(a / 6000).toBeGreaterThan(0.7);
    expect(a / 6000).toBeLessThan(0.95);
  });
});

describe("padValue", () => {
  it("does not pad when the die is single-digit", () => {
    expect(padValue(3, 6)).toBe("3");
  });
  it("pads to two digits for a d100", () => {
    expect(padValue(5, 100)).toBe("05");
    expect(padValue(42, 100)).toBe("42");
  });
});

describe("formatRange", () => {
  it("shows a single padded value for a weight-1 entry", () => {
    expect(formatRange({ from: 5, to: 5 }, 100)).toBe("05");
  });
  it("shows a padded from-to for a spanning entry", () => {
    expect(formatRange({ from: 1, to: 5 }, 100)).toBe("01-05");
  });
});

describe("resolveRoll", () => {
  it("returns null for an empty starting table", () => {
    expect(resolveRoll(table([]), [], rngConst(0))).toBeNull();
  });

  it("resolves a plain table in a single step", () => {
    const t = table([entry("a", "Goblin ambush")]);
    const r = resolveRoll(t, [t], rngConst(0));
    expect(r).not.toBeNull();
    expect(r!.steps).toHaveLength(1);
    expect(r!.text).toBe("Goblin ambush");
  });

  it("follows a subtableId link and returns the resolved entry's text", () => {
    const b = table([entry("b1", "Rusty dagger")], 20, { id: "b", name: "Loot" });
    const a = table([entry("a1", "roll loot", 1, { subtableId: "b" })], 20, { id: "a", name: "Encounters" });
    const r = resolveRoll(a, [a, b], rngConst(0));
    expect(r).not.toBeNull();
    expect(r!.steps.map((s) => s.tableId)).toEqual(["a", "b"]);
    expect(r!.text).toBe("Rusty dagger");
  });

  it("degrades to a missing-table result when the linked table id no longer exists", () => {
    const a = table([entry("a1", "roll loot", 1, { subtableId: "ghost", note: "keep this note" })], 20, { id: "a" });
    const r = resolveRoll(a, [a], rngConst(0));
    expect(r!.steps).toHaveLength(1);
    expect(r!.text).toBe("(missing table)");
    expect(r!.note).toBe("keep this note");
  });

  it("degrades to a missing-table result when the linked table itself has no entries", () => {
    const b = table([], 20, { id: "b", name: "Empty" });
    const a = table([entry("a1", "roll loot", 1, { subtableId: "b" })], 20, { id: "a" });
    const r = resolveRoll(a, [a, b], rngConst(0));
    expect(r!.steps).toHaveLength(1);
    expect(r!.text).toBe("(missing table)");
  });

  it("catches an A -> B -> A cycle instead of looping forever", () => {
    const a = table([entry("a1", "to b", 1, { subtableId: "b" })], 20, { id: "a", name: "A" });
    const b = table([entry("b1", "to a", 1, { subtableId: "a" })], 20, { id: "b", name: "B" });
    const r = resolveRoll(a, [a, b], rngConst(0));
    expect(r).not.toBeNull();
    expect(r!.text).toBe("(table loop detected)");
    expect(r!.steps.length).toBeGreaterThan(0);
  });
});

describe("parseCount", () => {
  it("parses a plain positive integer", () => {
    expect(parseCount("3")).toBe(3);
  });
  it("rejects 0 and negative integers", () => {
    expect(parseCount("0")).toBeNull();
  });
  it("rejects a non-matching expression", () => {
    expect(parseCount("abc")).toBeNull();
    expect(parseCount("")).toBeNull();
  });
  it("rolls a dN expression with an implicit count of 1", () => {
    expect(parseCount("d6", rngConst(0))).toBe(1); // floor(0*6)+1
  });
  it("rolls an NdM expression, summing each die", () => {
    expect(parseCount("2d6", rngConst(0.5))).toBe(8); // (floor(0.5*6)+1) * 2 = 4*2
  });
  it("applies a positive or negative modifier", () => {
    expect(parseCount("1d6+2", rngConst(0))).toBe(3); // 1 + 2
    expect(parseCount("1d6-10", rngConst(0))).toBe(1); // 1 - 10 = -9, clamped to 1
  });
});

describe("rollTableMultiple", () => {
  it("rolls once when count is unset", () => {
    const t = table([entry("a", "x")]);
    expect(rollTableMultiple(t, [t], rngConst(0))).toHaveLength(1);
  });

  it("rolls `count` times for a plain integer count", () => {
    const t = table([entry("a", "x")], 20, { count: "3" });
    expect(rollTableMultiple(t, [t], rngConst(0))).toHaveLength(3);
  });

  it("caps the roll count so a reckless expression can't flood the results", () => {
    const t = table([entry("a", "x")], 20, { count: "d6+100" });
    expect(rollTableMultiple(t, [t], rngConst(0.99))).toHaveLength(20);
  });

  it("returns no results for an empty table regardless of count", () => {
    const t = table([], 20, { count: "3" });
    expect(rollTableMultiple(t, [t], rngConst(0))).toEqual([]);
  });
});
