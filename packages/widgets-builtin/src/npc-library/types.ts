// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { AbilityScores, NamedEntry, SpellcastingBlock } from "@ttcanvas/core";

export type NpcRelationship = "ally" | "neutral" | "wary" | "hostile";

export interface NpcCustomField {
  label: string;
  value: string;
}

export interface ParsedNpc {
  // file metadata
  filename: string;            // vault-relative: "npcs/{slug}.json"

  // identity
  id: string;                  // uuid - stable across renames
  name: string;
  race: string;
  occupation: string;
  class?: string;              // 5E-compatible class (Fighter, Wizard…); absent = commoner
  subclass?: string;
  level?: number;              // 1-20
  age?: number;
  gender?: string;
  accentColor?: string;        // oklch string for avatar circle

  // narrative
  trait?: string;
  hook?: string;
  voice?: string;
  notes?: string;              // GM freeform markdown

  // library metadata
  relationship?: NpcRelationship;
  location?: string;
  faction?: string;
  customFields?: NpcCustomField[];
  lastSeen?: string;
  tags?: string[];
  encountered?: boolean;

  // portrait
  portrait?: string;           // vault-relative path - 400×400 crop
  portraitFull?: string;       // vault-relative path - full image (≤1920px)

  // combat (all optional)
  cr?: string;
  hp?: number;
  hpMax?: number;
  hpFormula?: string;
  ac?: number;
  speed?: { walk?: number; fly?: number; swim?: number; burrow?: number; climb?: number };
  abilityScores?: AbilityScores;
  savingThrows?: string[];
  skills?: Record<string, number>;
  senses?: string;
  passivePerception?: number;
  languages?: string[];
  damageImmunities?: string[];
  damageResistances?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  traits?: NamedEntry[];
  actions?: NamedEntry[];
  reactions?: NamedEntry[];
  legendaryActions?: NamedEntry[];
  spellcasting?: SpellcastingBlock;
}

export interface NpcLibraryState {
  selectedFile: string | null;
}
