// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { SharedPartyMember, AbilityScores, NamedEntry, SpellcastingBlock, PCCurrency } from "@ttcanvas/core";

// PCCurrency moved to core (the Inventory widget and PartyMemberPatch need it too); re-exported here
// so existing importers of party-tracker/types keep resolving.
export type { PCCurrency };

export interface CustomField {
  label: string;
  value: string;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface PartyMember extends SharedPartyMember {
  race: string;
  cls: string;        // "class" is a reserved word
  subclass?: string;
  level: number;
  speed?: number;     // walk speed in ft
  sp: number;
  maxSp: number;
  pp: number;         // passive perception
  gp: number;         // legacy gold field - mirrors currency.gp; read/write via ./currency.ts
  notes: string;
  inspiration: boolean;
  portraitPath?: string | null;
  portraitFullPath?: string | null;
  customFields?: CustomField[];
  deathSaves?: DeathSaves;
  // rich sheet fields (optional - populated via PCSheetModal)
  abilityScores?: AbilityScores;
  savingThrows?: string[];
  skills?: Record<string, number>;
  spellcasting?: SpellcastingBlock;
  equipment?: string[];
  currency?: PCCurrency;
  features?: NamedEntry[];
  traits?: NamedEntry[];
  reactions?: NamedEntry[];
}

export interface PartyTrackerState {
  members: PartyMember[];
  compact: boolean;
}
