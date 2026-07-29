// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { CatalogueItemRef } from "@ttcanvas/core";
import { askPriceCp, offerPriceCp } from "./pricing";
import type { Merchant, MerchantStock } from "./types";

function merchant(over: Partial<Merchant> = {}): Merchant {
  return {
    id: "m1", name: "Dorn's Forge", kind: "blacksmith",
    priceModifier: 1, buybackModifier: 0.5, stock: [], ...over,
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
