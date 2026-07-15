// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { AbilityScores, NamedEntry, SpellcastingBlock } from "@ttcanvas/core";

export type CreatureSize = "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan";

export interface BestiaryEntry {
  id: string;
  name: string;
  creatureType: string;
  tags: string[];
  cr: string;
  hp: number;
  ac: number;
  portrait?: string;    // data URL - 400×400 crop
  portraitFull?: string; // data URL - full image (≤1920px)
  notes: string;
  folderId: string | null;
  // Extended statblock
  size?: CreatureSize;
  alignment?: string;
  speed?: string;
  hitDice?: string;
  abilityScores?: AbilityScores;
  savingThrows?: Partial<Record<keyof AbilityScores, number>>;
  skillBonuses?: Record<string, number>;
  damageResistances?: string;
  damageImmunities?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  specialTraits?: NamedEntry[];
  actions?: NamedEntry[];
  bonusActions?: NamedEntry[];
  reactions?: NamedEntry[];
  legendaryResistances?: number;
  legendaryActions?: NamedEntry[];
  mythicActions?: NamedEntry[];
  lairActions?: NamedEntry[];
  spellcasting?: SpellcastingBlock;
}

export interface BestiaryFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface BestiaryState {
  entries: BestiaryEntry[];
  folders: BestiaryFolder[];
  /** One-shot request to open a creature's sheet, set by a `[[creature:...]]` link. The widget opens
   * the sheet and clears it the same frame; the 1s save debounce coalesces set+clear so it never
   * persists. (The state schema deliberately keeps this field so it survives WidgetSlot's re-parse.) */
  openRequestId?: string;
}
