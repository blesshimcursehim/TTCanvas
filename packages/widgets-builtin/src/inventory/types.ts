// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { PCCurrency } from "@ttcanvas/core";

export const RARITIES = ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"] as const;
export type Rarity = typeof RARITIES[number];

export const ITEM_KINDS = ["weapon", "armour", "consumable", "magic", "treasure", "gear"] as const;
export type ItemKind = typeof ITEM_KINDS[number];

/**
 * How many of an item one holder has. `holderId` is a `PartyMember.id`, or null for the party stash.
 * Holdings live on the item rather than the item being duplicated per holder, so eight rations split
 * across three characters stay one record.
 */
export interface Holding {
  holderId: string | null;
  qty: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  kind: ItemKind;
  rarity?: Rarity;
  /** Unit value in copper - a 5sp torch stays an integer instead of drifting as 0.5gp. */
  valueCp?: number;
  weightLb?: number;
  /** Markdown, wikilink-aware. */
  description?: string;
  attuned?: boolean;
  holdings: Holding[];
}

export interface InventoryState {
  items: InventoryItem[];
  /** The shared party purse, distinct from each PC's own currency on their sheet. */
  currency: PCCurrency;
  query: string;
  kindFilter: ItemKind | null;
  /** Encumbrance is opt-in; plenty of tables ignore it. */
  showWeight: boolean;
  /** One shared carry limit in pounds. No STR maths - TTCanvas is not a rules engine. */
  carryLimitLb: number | null;
  /** Vault path last used for a cross-vault pull. */
  pullVaultPath?: string;
}
