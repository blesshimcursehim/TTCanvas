// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  totalQty, qtyFor, setQty, moveHolding, weightCarried, totalValueCp,
  currencyToCp, normaliseCurrency, splitEvenly, spendFromPurse, addToPurse,
} from "./ledger";
import type { CatalogueItem } from "./types";

const NO_COIN = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

function item(over: Partial<CatalogueItem> = {}): CatalogueItem {
  return { id: "i1", name: "Rations", kind: "gear", holdings: [], ...over };
}

describe("holdings", () => {
  it("sums quantities across holders", () => {
    const it1 = item({ holdings: [{ holderId: null, qty: 3 }, { holderId: "pc1", qty: 5 }] });
    expect(totalQty(it1)).toBe(8);
    expect(qtyFor(it1, "pc1")).toBe(5);
    expect(qtyFor(it1, null)).toBe(3);
    expect(qtyFor(it1, "nobody")).toBe(0);
  });

  it("drops a holding when its quantity hits zero", () => {
    const h = setQty([{ holderId: "pc1", qty: 2 }], "pc1", 0);
    expect(h).toEqual([]);
  });

  it("adds a holding for a holder that had none", () => {
    expect(setQty([], "pc2", 3)).toEqual([{ holderId: "pc2", qty: 3 }]);
  });

  it("floors a negative or fractional quantity", () => {
    expect(setQty([], "pc1", -4)).toEqual([]);
    expect(setQty([], "pc1", 2.7)).toEqual([{ holderId: "pc1", qty: 2 }]);
  });

  it("moves between holders without inventing quantity", () => {
    const h = moveHolding([{ holderId: null, qty: 4 }], null, "pc1", 3);
    expect(h).toEqual([{ holderId: null, qty: 1 }, { holderId: "pc1", qty: 3 }]);
  });

  it("caps a move at what the source actually holds", () => {
    const h = moveHolding([{ holderId: null, qty: 2 }], null, "pc1", 99);
    expect(h).toEqual([{ holderId: "pc1", qty: 2 }]);
  });

  it("is a no-op when source and target are the same holder", () => {
    const before = [{ holderId: "pc1", qty: 2 }];
    expect(moveHolding(before, "pc1", "pc1", 1)).toBe(before);
  });
});

describe("weight and value", () => {
  const items = [
    item({ id: "a", weightLb: 2, valueCp: 50, holdings: [{ holderId: "pc1", qty: 3 }] }),
    item({ id: "b", weightLb: 10, valueCp: 100, holdings: [{ holderId: "pc1", qty: 1 }, { holderId: null, qty: 2 }] }),
    item({ id: "c", holdings: [{ holderId: "pc1", qty: 4 }] }),  // no weight or value set
  ];

  it("totals a holder's carried pounds and ignores weightless items", () => {
    expect(weightCarried(items, "pc1")).toBe(16);
    expect(weightCarried(items, null)).toBe(20);
  });

  it("totals ledger value across every holding", () => {
    expect(totalValueCp(items)).toBe(3 * 50 + 3 * 100);
  });
});

describe("currency", () => {
  it("flattens a purse to copper", () => {
    expect(currencyToCp({ cp: 5, sp: 2, ep: 1, gp: 3, pp: 1 })).toBe(5 + 20 + 50 + 300 + 1000);
  });

  it("rolls loose copper up into larger coins", () => {
    expect(normaliseCurrency({ ...NO_COIN, cp: 1234 })).toEqual({ cp: 4, sp: 3, ep: 0, gp: 2, pp: 1 });
  });

  it("leaves electrum alone rather than surprising the table with it", () => {
    expect(normaliseCurrency({ ...NO_COIN, ep: 3, cp: 150 })).toEqual({ cp: 0, sp: 5, ep: 3, gp: 1, pp: 0 });
  });
});

describe("splitEvenly", () => {
  it("divides on the copper total so nobody gets the odd coin", () => {
    const { shares, remainder } = splitEvenly({ ...NO_COIN, gp: 3 }, ["a", "b"]);
    expect(shares).toEqual([
      { memberId: "a", delta: { cp: 0, sp: 5, ep: 0, gp: 1, pp: 0 } },
      { memberId: "b", delta: { cp: 0, sp: 5, ep: 0, gp: 1, pp: 0 } },
    ]);
    expect(remainder).toEqual(NO_COIN);
  });

  it("leaves the indivisible copper in the party purse", () => {
    const { shares, remainder } = splitEvenly({ ...NO_COIN, cp: 10 }, ["a", "b", "c"]);
    expect(shares.every((s) => s.delta.cp === 3)).toBe(true);
    expect(remainder.cp).toBe(1);
  });

  it("conserves the total across shares and remainder", () => {
    const purse = { cp: 7, sp: 3, ep: 0, gp: 11, pp: 2 };
    const { shares, remainder } = splitEvenly(purse, ["a", "b", "c"]);
    const paid = shares.reduce((sum, s) => sum + currencyToCp(s.delta), 0);
    expect(paid + currencyToCp(remainder)).toBe(currencyToCp(purse));
  });

  it("returns the purse untouched when there is nobody to pay", () => {
    const purse = { ...NO_COIN, gp: 5 };
    expect(splitEvenly(purse, [])).toEqual({ shares: [], remainder: purse });
  });

  it("divides electrum by value without paying anyone in electrum", () => {
    const { shares, remainder } = splitEvenly({ ...NO_COIN, ep: 2 }, ["a", "b"]);
    // 2 ep = 100 cp, so 5 sp each rather than "nothing to split".
    expect(shares).toEqual([
      { memberId: "a", delta: { cp: 0, sp: 5, ep: 0, gp: 0, pp: 0 } },
      { memberId: "b", delta: { cp: 0, sp: 5, ep: 0, gp: 0, pp: 0 } },
    ]);
    expect(remainder).toEqual(NO_COIN);
  });
});

describe("spendFromPurse / addToPurse", () => {
  it("makes change across denominations, tidying what is left", () => {
    // The case applyCurrencyDelta gets wrong: it floors each coin independently, so debiting gold
    // from a purse holding only silver would take nothing at all and report success. The change
    // comes back tidied (500cp as 5gp, not 50sp), the same rolling-up that Tidy does.
    expect(spendFromPurse({ ...NO_COIN, sp: 100 }, 500)).toEqual({ ...NO_COIN, gp: 5 });
  });

  it("spends an exact amount down to nothing", () => {
    expect(spendFromPurse({ ...NO_COIN, gp: 5 }, 500)).toEqual(NO_COIN);
  });

  it("clamps an unaffordable spend at empty rather than going negative", () => {
    // Warn, don't block: the GM can overspend, but a negative coin count isn't renderable.
    expect(spendFromPurse({ ...NO_COIN, gp: 1 }, 999999)).toEqual(NO_COIN);
  });

  it("preserves existing electrum where it still fits", () => {
    const out = spendFromPurse({ ...NO_COIN, ep: 2, gp: 5 }, 100);
    expect(out.ep).toBe(2);
    expect(currencyToCp(out)).toBe(500);
  });

  it("treats a zero or negative spend as a no-op", () => {
    const purse = { ...NO_COIN, gp: 3 };
    expect(spendFromPurse(purse, 0)).toEqual(purse);
    expect(spendFromPurse(purse, -50)).toEqual(purse);
  });

  it("credits a sale and tidies it into the largest coins", () => {
    expect(addToPurse(NO_COIN, 500)).toEqual({ ...NO_COIN, gp: 5 });
  });

  it("round-trips a spend and a credit back to the same total", () => {
    const purse = { ...NO_COIN, gp: 7, sp: 3 };
    expect(currencyToCp(addToPurse(spendFromPurse(purse, 250), 250))).toBe(currencyToCp(purse));
  });
});
