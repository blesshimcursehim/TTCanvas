// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure price maths, unit-tested directly (like items/ledger.ts). Nothing here touches React.

import type { CatalogueItemRef } from "@ttcanvas/core";
import type { Merchant, MerchantStock } from "./types";

/**
 * What this merchant asks for one unit, in copper. An explicit per-stock override wins, otherwise
 * the catalogue value scaled by the merchant's modifier.
 *
 * An item with no `valueCp` (or one whose catalogue entry has since been deleted) prices at 0 rather
 * than being unbuyable: "ask the GM" is a real answer, and TTCanvas never blocks a trade.
 */
export function askPriceCp(stock: MerchantStock, item: CatalogueItemRef | undefined, merchant: Merchant): number {
  if (stock.priceCpOverride !== undefined) return Math.max(0, Math.round(stock.priceCpOverride));
  return Math.max(0, Math.round((item?.valueCp ?? 0) * merchant.priceModifier));
}

/** What this merchant pays for one unit of the party's goods. */
export function offerPriceCp(item: CatalogueItemRef | undefined, merchant: Merchant): number {
  return Math.max(0, Math.round((item?.valueCp ?? 0) * merchant.buybackModifier));
}
