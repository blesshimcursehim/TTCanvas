// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export const MERCHANT_KINDS = ["general", "blacksmith", "apothecary", "magic", "tavern", "fence", "temple"] as const;
export type MerchantKind = typeof MERCHANT_KINDS[number];

export interface MerchantStock {
  /**
   * -> `CatalogueItem.id` in the Items widget. Non-exclusive: many merchants may stock the same
   * item, and editing a longsword's price in Items updates every merchant that sells one. Third use
   * of the reference pattern behind `Combatant.templateId` and `DrawnCard.cardId`.
   */
  itemId: string;
  /** null for unlimited stock - a general store never runs out of rope. */
  qty: number | null;
  /** This merchant's asking price in copper, overriding `item.valueCp * priceModifier`. */
  priceCpOverride?: number;
}

export interface Merchant {
  id: string;
  name: string;
  kind: MerchantKind;
  /** Free text, or the cached display name of the linked NPC. */
  owner?: string;
  /**
   * NPC Library filename ("npcs/vex.json") of the proprietor. When set, `owner` is the cached name
   * from that source - the same convention NpcLibrary uses for `location`/`locationRef`, and what
   * makes a cross-vault pull degrade to readable text instead of a dangling id. Not every
   * shopkeeper deserves an NPC file, so free text stays valid.
   */
  ownerRef?: string;
  /** Free text, or the cached display name of the linked Gazetteer place. */
  location?: string;
  /** Gazetteer location filename, same shape and click-through as `MapToken.locationRef`. */
  locationRef?: string;
  /** Markdown, wikilink-aware. */
  description?: string;
  /** 1.0 is list price. 1.2 is a gouging port town. */
  priceModifier: number;
  /** What the merchant pays for the party's goods. 0.5 by default. */
  buybackModifier: number;
  stock: MerchantStock[];
}

export interface MerchantsState {
  merchants: Merchant[];
  selectedId: string | null;
  query: string;
  kindFilter: MerchantKind | null;
  /** Vault path last used for a cross-vault pull. */
  pullVaultPath?: string;
}
