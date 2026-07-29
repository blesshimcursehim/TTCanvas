// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/**
 * An item *definition* as other widgets see it. `kind` and `rarity` are plain strings here so the
 * Items widget keeps ownership of its own unions - the same reason BestiaryCreatureRef.cr is a
 * string. Carries no holdings: this is what a merchant's stock picker browses.
 */
export interface CatalogueItemRef {
  id: string;
  name: string;
  kind: string;
  rarity?: string;
  /** Unit value in copper. Format with `formatCoin`. */
  valueCp?: number;
  weightLb?: number;
  description?: string;
}

/** A definition plus one holder's count of it. */
export interface ItemRef extends CatalogueItemRef {
  /** How many this holder has, not the party total. */
  qty: number;
}

export interface ItemsContextValue {
  /**
   * Catalogue items assigned to a party member, keyed by `PartyMember.id`. Read-only: the PC sheet
   * shows these instead of flattening them into `equipment: string[]`, which would throw away
   * rarity, value, weight and description. Returns a stable empty array when the member holds
   * nothing, so a consumer can memoise on the result.
   */
  itemsFor: (memberId: string) => readonly ItemRef[];

  /** Every item definition, name-sorted. What a merchant's stock picker browses. */
  catalogue: readonly CatalogueItemRef[];

  /**
   * What the party stash (holderId null) holds, with counts. Separate from `itemsFor` because the
   * stash is nobody's character sheet, and it is exactly what a merchant buys from.
   */
  partyStash: readonly ItemRef[];

  /**
   * The shared party purse flattened to copper, so a buyer can warn *before* the click. Advisory
   * only - `grantToParty` never consults it, because TTCanvas warns and does not block.
   */
  purseCp: number;

  /**
   * Add `qty` of an existing catalogue item to the party stash and pay for it, in one write.
   * Creates nothing: an unknown `itemId` is ignored, the same way `patchMembers` ignores an unknown
   * member id, because Merchants stocks by reference and a dangling reference is the GM's to fix in
   * Items. `unitCostCp` is PER UNIT.
   */
  grantToParty: (itemId: string, qty: number, unitCostCp?: number) => void;

  /**
   * The reverse. `qty` is capped at what the party actually holds and the payout scales to the count
   * actually taken, so selling five of two potions pays for two.
   */
  takeFromParty: (itemId: string, qty: number, unitPayoutCp?: number) => void;
}

const EMPTY_ITEMS: readonly ItemRef[] = [];
const EMPTY_CATALOGUE: readonly CatalogueItemRef[] = [];

export const ItemsContext = createContext<ItemsContextValue>({
  itemsFor: () => EMPTY_ITEMS,
  catalogue: EMPTY_CATALOGUE,
  partyStash: EMPTY_ITEMS,
  purseCp: 0,
  grantToParty: () => {},
  takeFromParty: () => {},
});

export function useItems(): ItemsContextValue {
  return useContext(ItemsContext);
}
