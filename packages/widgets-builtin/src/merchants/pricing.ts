// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure price maths, unit-tested directly (like items/ledger.ts). Nothing here touches React.

import { formatCoin, type CatalogueItemRef, type ShopPayload } from "@ttcanvas/core";
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

/**
 * The merchant's shelves as a player-facing price list. This is the whole boundary between what the
 * GM sees and what the table sees, so it is a pure function with a test rather than inline JSX:
 * buyback rate, price modifier, the party purse and the merchant's notes are all GM-only and simply
 * never enter the payload. Prices are formatted here because the player window does no coin maths.
 *
 * A row whose catalogue item has been deleted is dropped rather than shown from its name snapshot:
 * with no catalogue entry there is no price to quote, and a dangling reference is the GM's
 * bookkeeping problem, not something to put in front of the players. Sold-out rows are kept and
 * marked, since an empty peg on the wall is information the party wants.
 */
export function buildShopPayload(
  merchant: Merchant,
  itemById: ReadonlyMap<string, CatalogueItemRef>,
): ShopPayload {
  const subtitle = [merchant.kind, merchant.location?.trim()].filter(Boolean).join(" · ");
  return {
    name: merchant.name.trim() || "Merchant",
    ...(subtitle ? { subtitle } : {}),
    lines: merchant.stock.flatMap((row) => {
      const item = itemById.get(row.itemId);
      if (!item) return [];
      return [{
        name: item.name,
        price: formatCoin(askPriceCp(row, item, merchant)),
        qty: row.qty,
        ...(item.rarity ? { rarity: item.rarity } : {}),
      }];
    }),
  };
}
