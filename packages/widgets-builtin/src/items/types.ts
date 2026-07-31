// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { PCCurrency, DamagePart } from "@ttcanvas/core";

export type { DamagePart };

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

/**
 * One item *definition*. A catalogue entry first, a possession second: an item with no `holdings` at
 * all is perfectly valid and means "this exists in the world, nobody has one" - which is what lets
 * the Merchants widget stock something the party has never owned.
 */
export interface CatalogueItem {
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
  /**
   * A weapon's damage, in order: the first part is its base, the rest stack on top. Each part's dice
   * are parsed with the Dice Roller's `parseExpression` so the card can quote a total range and roll
   * the lot; unparseable text is kept and shown as written rather than rejected, because TTCanvas
   * warns and does not block.
   *
   * Damage types are free text with a `<datalist>` of suggestions rather than an enum: an enum would
   * make TTCanvas a 5e-only app, and shipping a fixed vocabulary is content we would have to licence.
   * Same reasoning for `range` and `armourClass` below.
   */
  damage?: DamagePart[];
  /**
   * Alternate dice for the base damage - a two-handed grip, or a thrown one. Printed beside the base
   * as "1d8 (1d6)". Deliberately outside the damage range: a range quoting both grips at once would
   * be quoting a weapon nobody is holding.
   */
  versatileDice?: string;
  /**
   * A magic weapon's flat bonus, shown on its own line. Display only, never folded into the damage
   * range - by the time a GM writes "1d8+8" the bonus is usually already in there, and adding it
   * again would silently inflate every enchanted weapon.
   */
  enchantment?: number;
  /** "20/60 ft". A string, because every system writes ranges differently. */
  range?: string;
  /** Armour only: "14 + Dex (max 2)". */
  armourClass?: string;
  /**
   * Free-text tags - light, finesse, versatile, stealth disadvantage. Not weapon-specific: a potion
   * is as entitled to a tag as a sword is.
   */
  properties?: string[];
  holdings: Holding[];
}

export interface ItemsState {
  items: CatalogueItem[];
  /** The shared party purse, distinct from each PC's own currency on their sheet. */
  currency: PCCurrency;
  query: string;
  kindFilter: ItemKind | null;
  /**
   * Whether the list shows everything, only what somebody holds, or only unheld definitions.
   * Defaults to "all" - a fresh vault filtered to "held" would look broken to a GM who hasn't yet
   * met the catalogue/holdings distinction.
   */
  heldFilter: "all" | "held" | "catalogue";
  /** Encumbrance is opt-in; plenty of tables ignore it. */
  showWeight: boolean;
  /** One shared carry limit in pounds. No STR maths - TTCanvas is not a rules engine. */
  carryLimitLb: number | null;
  /** Vault path last used for a cross-vault pull. */
  pullVaultPath?: string;
}
