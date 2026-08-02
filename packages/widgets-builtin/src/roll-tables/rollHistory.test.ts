// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { buildRollHistoryItems } from "./rollHistory";
import type { ResolvedRoll } from "./engine";
import type { RollTable, RollTableEntry } from "./types";

const table: RollTable = { id: "t1", name: "Loot", die: 20, entries: [] };

function entry(text: string): RollTableEntry {
  return { id: "e1", text, weight: 1 };
}

function resolved(over: Partial<ResolvedRoll> = {}): ResolvedRoll {
  return {
    steps: [{ tableId: "t1", tableName: "Loot", roll: 7, entry: entry("Gems") }],
    text: "Gems",
    ...over,
  };
}

describe("buildRollHistoryItems", () => {
  it("carries the table identity, roll and text onto each item", () => {
    const [item] = buildRollHistoryItems(table, [resolved()], 1000);
    expect(item).toMatchObject({ tableId: "t1", tableName: "Loot", roll: 7, text: "Gems", at: 1000 });
    expect(item.id).toBeTypeOf("string");
  });

  it("gives every result from one click the same timestamp", () => {
    const items = buildRollHistoryItems(table, [resolved(), resolved({ text: "Coins" })], 2000);
    expect(items.map((i) => i.at)).toEqual([2000, 2000]);
  });

  it("gives each result its own id", () => {
    const items = buildRollHistoryItems(table, [resolved(), resolved()], 0);
    expect(items[0].id).not.toBe(items[1].id);
  });

  it("substitutes a placeholder for an empty entry", () => {
    expect(buildRollHistoryItems(table, [resolved({ text: "" })], 0)[0].text).toBe("(empty entry)");
  });

  it("sets chain only when a subtable was traversed", () => {
    const single = buildRollHistoryItems(table, [resolved()], 0)[0];
    expect(single.chain).toBeUndefined();

    const nested = resolved({
      steps: [
        { tableId: "t1", tableName: "Loot", roll: 3, entry: entry("roll gems") },
        { tableId: "t2", tableName: "Gems", roll: 5, entry: entry("Ruby") },
      ],
      text: "Ruby",
    });
    expect(buildRollHistoryItems(table, [nested], 0)[0].chain).toBe("Loot → Gems");
  });

  it("takes the roll from the first step, not the last", () => {
    const nested = resolved({
      steps: [
        { tableId: "t1", tableName: "Loot", roll: 3, entry: entry("roll gems") },
        { tableId: "t2", tableName: "Gems", roll: 5, entry: entry("Ruby") },
      ],
    });
    expect(buildRollHistoryItems(table, [nested], 0)[0].roll).toBe(3);
  });

  it("returns nothing for no results", () => {
    expect(buildRollHistoryItems(table, [], 0)).toEqual([]);
  });
});
