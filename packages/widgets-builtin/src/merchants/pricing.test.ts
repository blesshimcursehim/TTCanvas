// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { CatalogueItemRef } from "@ttcanvas/core";
import { askPriceCp, offerPriceCp, buildShopPayload } from "./pricing";
import type { Merchant, MerchantStock } from "./types";

function merchant(over: Partial<Merchant> = {}): Merchant {
  return {
    id: "m1", name: "Dorn's Forge", kind: "blacksmith",
    priceModifier: 1, buybackModifier: 0.5, rarities: ["common", "uncommon"], stock: [], ...over,
  };
}

function stock(over: Partial<MerchantStock> = {}): MerchantStock {
  return { itemId: "i1", qty: 1, ...over };
}

const sword: CatalogueItemRef = { id: "i1", name: "Longsword", kind: "weapon", valueCp: 1500 };

describe("askPriceCp", () => {
  it("asks list price at a modifier of 1", () => {
    expect(askPriceCp(stock(), sword, merchant())).toBe(1500);
  });

  it("applies the merchant's markup", () => {
    expect(askPriceCp(stock(), sword, merchant({ priceModifier: 1.2 }))).toBe(1800);
  });

  it("rounds a fractional result to whole copper", () => {
    // 1500 * 1.111 = 1666.5, which must not reach the ledger as a fraction.
    expect(askPriceCp(stock(), sword, merchant({ priceModifier: 1.111 }))).toBe(1667);
  });

  it("lets a per-stock override beat the modifier entirely", () => {
    expect(askPriceCp(stock({ priceCpOverride: 100 }), sword, merchant({ priceModifier: 5 }))).toBe(100);
  });

  it("honours a zero override rather than falling through to the catalogue value", () => {
    // A deliberate freebie is a real thing a GM sets, so 0 must not read as "unset".
    expect(askPriceCp(stock({ priceCpOverride: 0 }), sword, merchant())).toBe(0);
  });

  it("prices an item with no value at zero rather than NaN", () => {
    const valueless: CatalogueItemRef = { id: "i2", name: "Old rope", kind: "gear" };
    expect(askPriceCp(stock(), valueless, merchant())).toBe(0);
  });

  it("prices a dangling reference at zero instead of crashing", () => {
    expect(askPriceCp(stock(), undefined, merchant())).toBe(0);
  });
});

describe("offerPriceCp", () => {
  it("pays half by default", () => {
    expect(offerPriceCp(sword, merchant())).toBe(750);
  });

  it("pays nothing at a buyback of zero", () => {
    expect(offerPriceCp(sword, merchant({ buybackModifier: 0 }))).toBe(0);
  });

  it("can pay over the odds for a merchant who wants something badly", () => {
    expect(offerPriceCp(sword, merchant({ buybackModifier: 1.5 }))).toBe(2250);
  });

  it("offers nothing for a dangling reference", () => {
    expect(offerPriceCp(undefined, merchant())).toBe(0);
  });
});

describe("buildShopPayload", () => {
  const potion: CatalogueItemRef = { id: "i2", name: "Potion of Healing", kind: "consumable", rarity: "uncommon", valueCp: 5000 };
  const catalogue = new Map<string, CatalogueItemRef>([[sword.id, sword], [potion.id, potion]]);

  it("prices the shelf with the merchant's markup, already formatted", () => {
    const shop = buildShopPayload(
      merchant({ priceModifier: 2, stock: [stock({ itemId: "i1", qty: 3 })] }),
      catalogue,
    );
    // The player window does no coin maths - it prints what it is handed, down to formatCoin's
    // choice of the largest exact denomination (3000cp is "3 pp", not "30 gp").
    expect(shop.lines).toEqual([{ name: "Longsword", price: "3 pp", qty: 3 }]);
  });

  it("carries the rarity through so the players can read the shelf at a glance", () => {
    const shop = buildShopPayload(merchant({ stock: [stock({ itemId: "i2" })] }), catalogue);
    expect(shop.lines[0]?.rarity).toBe("uncommon");
  });

  it("keeps unlimited stock as null rather than inventing a count", () => {
    const shop = buildShopPayload(merchant({ stock: [stock({ itemId: "i1", qty: null })] }), catalogue);
    expect(shop.lines[0]?.qty).toBeNull();
  });

  it("keeps a sold-out line, since an empty peg is information the party wants", () => {
    const shop = buildShopPayload(merchant({ stock: [stock({ itemId: "i1", qty: 0 })] }), catalogue);
    expect(shop.lines).toHaveLength(1);
    expect(shop.lines[0]?.qty).toBe(0);
  });

  it("drops a row whose catalogue item is gone instead of quoting a price it cannot know", () => {
    const shop = buildShopPayload(
      merchant({ stock: [stock({ itemId: "deleted", name: "Flametongue" }), stock({ itemId: "i1" })] }),
      catalogue,
    );
    expect(shop.lines.map((l) => l.name)).toEqual(["Longsword"]);
  });

  it("leaves every GM-only figure behind", () => {
    const shop = buildShopPayload(
      merchant({ priceModifier: 3, buybackModifier: 0.1, description: "Secretly a fence", stock: [stock()] }),
      catalogue,
    );
    // The whole GM/player boundary for this scene: nothing but a name, a locator and priced lines.
    expect(Object.keys(shop).sort()).toEqual(["lines", "name", "subtitle"]);
    expect(JSON.stringify(shop)).not.toContain("fence");
  });

  it("locates the shop by kind and place when it has one", () => {
    expect(buildShopPayload(merchant({ location: "Citadel of Thorns" }), catalogue).subtitle)
      .toBe("blacksmith · Citadel of Thorns");
    expect(buildShopPayload(merchant(), catalogue).subtitle).toBe("blacksmith");
  });

  it("falls back to a readable name rather than casting a blank card", () => {
    expect(buildShopPayload(merchant({ name: "   " }), catalogue).name).toBe("Merchant");
  });
});
