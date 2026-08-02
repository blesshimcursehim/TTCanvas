// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { CatalogueItemRef } from "@ttcanvas/core";
import type { Rarity } from "../items/types";
import { generateStock, matchByName, mergeStock } from "./generate";
import type { MerchantStock } from "./types";

function item(id: string, name: string, rarity?: Rarity, kind = "gear"): CatalogueItemRef {
  return { id, name, kind, ...(rarity ? { rarity } : {}) };
}

const CATALOGUE: CatalogueItemRef[] = [
  item("c1", "Rope", undefined, "gear"),           // no rarity: counts as common
  item("c2", "Torch", "common", "gear"),
  item("u1", "Silvered dagger", "uncommon", "weapon"),
  item("r1", "Flametongue", "rare", "weapon"),
  item("v1", "Staff of power", "very-rare", "magic"),
  item("l1", "Holy avenger", "legendary", "weapon"),
  item("a1", "The Axe of Ages", "artifact", "weapon"),
];

const ALL_RARITIES: Rarity[] = ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"];

/** Deterministic rng cycling through the given values, so a scripted pick is reproducible. */
function scripted(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function rarityOf(row: MerchantStock): string {
  return CATALOGUE.find((c) => c.id === row.itemId)?.rarity ?? "common";
}

describe("generateStock - availability is the merchant's own list", () => {
  it("never yields a rarity the merchant doesn't stock, over many runs", () => {
    // The case Bless raised: a modest shop must not turn up a legendary, however often it restocks.
    for (let seed = 0; seed < 200; seed++) {
      const rng = scripted([seed / 200, (seed * 7 % 200) / 200, (seed * 13 % 200) / 200]);
      const stock = generateStock(CATALOGUE, {
        rarities: ["common", "uncommon"], kinds: [], count: 5, existing: [],
      }, rng);
      expect(stock.every((s) => ["common", "uncommon"].includes(rarityOf(s)))).toBe(true);
    }
  });

  it("deals exclusively in one rarity when only one is ticked", () => {
    const stock = generateStock(CATALOGUE, { rarities: ["rare"], kinds: [], count: 3, existing: [] }, scripted([0.5]));
    expect(stock).toHaveLength(1);            // only one rare exists in the catalogue
    expect(rarityOf(stock[0])).toBe("rare");
  });

  it("only produces an artifact when the GM has explicitly ticked it", () => {
    // Not in any preset, but a fence with something under the counter is the GM's call to make.
    const without = generateStock(CATALOGUE, {
      rarities: ALL_RARITIES.filter((r) => r !== "artifact"), kinds: [], count: 20, existing: [],
    }, scripted([0.99, 0.99, 0.5]));
    expect(without.some((s) => rarityOf(s) === "artifact")).toBe(false);

    const with_ = generateStock(CATALOGUE, { rarities: ["artifact"], kinds: [], count: 1, existing: [] }, scripted([0.5]));
    expect(rarityOf(with_[0])).toBe("artifact");
  });

  it("generates nothing at all when no rarity is ticked", () => {
    expect(generateStock(CATALOGUE, { rarities: [], kinds: [], count: 5, existing: [] })).toEqual([]);
  });
});

describe("generateStock - degrading well on a thin catalogue", () => {
  it("still fills a shop when the catalogue is entirely common", () => {
    // TTCanvas ships no item content, so this is the ordinary case for a new vault, not an edge one.
    const commonOnly = [item("c1", "Rope"), item("c2", "Torch", "common"), item("c3", "Chalk", "common")];
    const stock = generateStock(commonOnly, { rarities: ALL_RARITIES, kinds: [], count: 3, existing: [] }, scripted([0.5]));
    expect(stock).toHaveLength(3);
  });

  it("returns fewer lines than asked rather than repeating itself when the pool runs dry", () => {
    const stock = generateStock(CATALOGUE, { rarities: ["rare"], kinds: [], count: 10, existing: [] }, scripted([0.5]));
    expect(stock).toHaveLength(1);
    expect(new Set(stock.map((s) => s.itemId)).size).toBe(stock.length);
  });

  it("treats an item with no rarity as common", () => {
    const stock = generateStock([item("c1", "Rope")], { rarities: ["common"], kinds: [], count: 1, existing: [] }, scripted([0.5]));
    expect(stock[0].itemId).toBe("c1");
  });

  it("filters by kind, and applies no kind filter when the list is empty", () => {
    const weapons = generateStock(CATALOGUE, { rarities: ALL_RARITIES, kinds: ["weapon"], count: 10, existing: [] }, scripted([0.5]));
    expect(weapons.every((s) => CATALOGUE.find((c) => c.id === s.itemId)?.kind === "weapon")).toBe(true);

    const anything = generateStock(CATALOGUE, { rarities: ALL_RARITIES, kinds: [], count: 10, existing: [] }, scripted([0.5]));
    expect(anything.length).toBeGreaterThan(weapons.length);
  });
});

describe("generateStock - shelf invariants", () => {
  it("never restocks an item already on the shelf", () => {
    const existing: MerchantStock[] = [{ itemId: "r1", qty: 1 }];
    const stock = generateStock(CATALOGUE, { rarities: ["rare"], kinds: [], count: 5, existing }, scripted([0.5]));
    expect(stock).toEqual([]);
  });

  it("never produces the same item twice in one run", () => {
    const stock = generateStock(CATALOGUE, { rarities: ALL_RARITIES, kinds: [], count: 7, existing: [] }, scripted([0.3, 0.7, 0.1]));
    expect(new Set(stock.map((s) => s.itemId)).size).toBe(stock.length);
  });

  it("stocks depth of cheap goods but only one of anything rare", () => {
    const common = generateStock(CATALOGUE, { rarities: ["common"], kinds: [], count: 2, existing: [] }, scripted([0.5, 0.5, 0.99]));
    expect(common.every((s) => (s.qty ?? 0) >= 1)).toBe(true);

    const rare = generateStock(CATALOGUE, { rarities: ["rare"], kinds: [], count: 1, existing: [] }, scripted([0.99]));
    expect(rare[0].qty).toBe(1);
  });

  it("snapshots the name so a later catalogue deletion still reads", () => {
    const stock = generateStock(CATALOGUE, { rarities: ["rare"], kinds: [], count: 1, existing: [] }, scripted([0.5]));
    expect(stock[0].name).toBe("Flametongue");
  });

  it("treats a zero or negative count as nothing to do", () => {
    expect(generateStock(CATALOGUE, { rarities: ALL_RARITIES, kinds: [], count: 0, existing: [] })).toEqual([]);
    expect(generateStock(CATALOGUE, { rarities: ALL_RARITIES, kinds: [], count: -3, existing: [] })).toEqual([]);
  });
});

describe("matchByName", () => {
  it("matches regardless of case and surrounding or repeated whitespace", () => {
    const { matched, unmatched } = matchByName([{ text: "  flametongue " }, { text: "SILVERED   DAGGER" }], CATALOGUE);
    expect(matched.map((m) => m.itemId)).toEqual(["r1", "u1"]);
    expect(unmatched).toEqual([]);
  });

  it("reports text with no catalogue item rather than inventing one", () => {
    const { matched, unmatched } = matchByName([{ text: "Rusty spoon" }, { text: "Rope" }], CATALOGUE);
    expect(matched.map((m) => m.itemId)).toEqual(["c1"]);
    expect(unmatched).toEqual(["Rusty spoon"]);
  });

  it("lists each unmatched name once however often it was rolled", () => {
    const { unmatched } = matchByName([{ text: "Rusty spoon" }, { text: "Rusty spoon" }], CATALOGUE);
    expect(unmatched).toEqual(["Rusty spoon"]);
  });

  it("folds a repeated hit into one line with a higher quantity", () => {
    const { matched } = matchByName([{ text: "Torch" }, { text: "torch" }, { text: "TORCH" }], CATALOGUE);
    expect(matched).toHaveLength(1);
    expect(matched[0].qty).toBe(3);
  });

  it("ignores empty rolled text instead of reporting it as a miss", () => {
    const { matched, unmatched } = matchByName([{ text: "   " }], CATALOGUE);
    expect(matched).toEqual([]);
    expect(unmatched).toEqual([]);
  });
});

describe("mergeStock", () => {
  it("tops up an existing line rather than adding a duplicate row", () => {
    const merged = mergeStock([{ itemId: "c1", qty: 2 }], [{ itemId: "c1", qty: 3 }]);
    expect(merged).toEqual([{ itemId: "c1", qty: 5 }]);
  });

  it("appends a line the shelf did not have", () => {
    const merged = mergeStock([{ itemId: "c1", qty: 2 }], [{ itemId: "r1", qty: 1, name: "Flametongue" }]);
    expect(merged).toHaveLength(2);
  });

  it("leaves an unlimited line unlimited", () => {
    const merged = mergeStock([{ itemId: "c1", qty: null }], [{ itemId: "c1", qty: 4 }]);
    expect(merged[0].qty).toBeNull();
  });

  it("keeps a hand-set price override when topping up", () => {
    const merged = mergeStock([{ itemId: "c1", qty: 1, priceCpOverride: 7 }], [{ itemId: "c1", qty: 1 }]);
    expect(merged[0].priceCpOverride).toBe(7);
  });

  it("does not mutate the shelf it was given", () => {
    const existing: MerchantStock[] = [{ itemId: "c1", qty: 1 }];
    mergeStock(existing, [{ itemId: "c1", qty: 5 }]);
    expect(existing[0].qty).toBe(1);
  });
});
