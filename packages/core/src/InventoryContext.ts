// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/**
 * A ledger item as other widgets see it. `kind` and `rarity` are plain strings here so the Inventory
 * widget keeps ownership of its own unions - the same reason BestiaryCreatureRef.cr is a string.
 */
export interface InventoryItemRef {
  id: string;
  name: string;
  /** How many this holder has, not the party total. */
  qty: number;
  kind: string;
  rarity?: string;
  /** Unit value in copper. Format with `formatCoin`. */
  valueCp?: number;
  weightLb?: number;
  description?: string;
}

export interface InventoryContextValue {
  /**
   * Ledger items assigned to a party member, keyed by `PartyMember.id`. Read-only: the PC sheet
   * shows these instead of flattening them into `equipment: string[]`, which would throw away
   * rarity, value, weight and description. Returns a stable empty array when the member holds
   * nothing, so a consumer can memoise on the result.
   */
  itemsFor: (memberId: string) => readonly InventoryItemRef[];
}

const EMPTY: readonly InventoryItemRef[] = [];

export const InventoryContext = createContext<InventoryContextValue>({ itemsFor: () => EMPTY });

export function useInventory(): InventoryContextValue {
  return useContext(InventoryContext);
}
