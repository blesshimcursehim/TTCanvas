// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { ItemKind, Rarity } from "../items/types";

export const MERCHANT_KINDS = ["general", "blacksmith", "apothecary", "magic", "tavern", "fence", "temple"] as const;
export type MerchantKind = typeof MERCHANT_KINDS[number];

/**
 * One-click fills for `Merchant.rarities`. Named for the shop rather than the settlement, because
 * the two come apart: a slum in a major city is still a slum. Every generator surveyed gates stock
 * on settlement size, which gets exactly that case wrong, so these are a starting point the GM edits
 * rather than a rule the generator enforces.
 *
 * "artifact" is in no preset - an artifact is a plot object, not merchandise - but the GM can still
 * tick it by hand for the shop that really does have one under the counter.
 */
export const RARITY_PRESETS: { label: string; rarities: Rarity[] }[] = [
  { label: "Squalid", rarities: ["common"] },
  { label: "Modest", rarities: ["common", "uncommon"] },
  { label: "Comfortable", rarities: ["common", "uncommon", "rare"] },
  { label: "Wealthy", rarities: ["common", "uncommon", "rare", "very-rare"] },
  { label: "Fabled", rarities: ["common", "uncommon", "rare", "very-rare", "legendary"] },
];

/**
 * How often each rarity turns up *relative to the others the merchant stocks*. Renormalised over
 * whichever rarities are actually ticked, so a merchant selling only rare goods sells rare goods
 * every time, while one selling common through rare sees roughly 60/30/10. This is why there is no
 * weights UI: ticking a box is the only control, and the curve supplies the feel.
 */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 30,
  rare: 10,
  "very-rare": 4,
  legendary: 1,
  artifact: 0.5,
};

/** Which item kinds a merchant of each sort leans towards, as the generator's opening offer. */
export const KINDS_BY_MERCHANT: Record<MerchantKind, ItemKind[]> = {
  general: ["gear", "treasure"],
  blacksmith: ["weapon", "armour"],
  apothecary: ["consumable"],
  magic: ["magic"],
  tavern: ["consumable", "gear"],
  fence: ["treasure", "magic"],
  temple: ["consumable", "gear"],
};

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
  /**
   * The item's name as it was when this row was created. Display fallback only, never the source of
   * truth: the live catalogue lookup always wins, and this is what lets a row whose item has since
   * been deleted read "Longsword (missing from Items)" instead of a bare id. Same denormalised
   * snapshot `EncounterMember.name` and `Merchant.owner` keep, for the same reason.
   */
  name?: string;
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
  /**
   * Which rarities generation may draw from. The entire availability rule, and deliberately the
   * GM's to set: a back-alley fence with a legendary blade under the counter is a story, not a bug,
   * so nothing here caps it. An empty list means generation has nothing to draw and says so.
   */
  rarities: Rarity[];
  stock: MerchantStock[];
}

export interface MerchantsState {
  merchants: Merchant[];
  selectedId: string | null;
  query: string;
  kindFilter: MerchantKind | null;
  /** Vault path last used for a cross-vault pull. */
  pullVaultPath?: string;
  /**
   * Keep the player window's price list in step with the selected merchant, so a purchase updates
   * the shelf the table is reading. Off by default and GM-toggled, exactly like Map Display's
   * `autoPushMap`: while it is on this widget owns the player scene, which is only ever the GM's
   * call to make.
   */
  autoCast?: boolean;
}
