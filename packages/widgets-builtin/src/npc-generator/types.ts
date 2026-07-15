// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export type GenderType = "any" | "masculine" | "feminine" | "other";

export interface NpcLocked {
  name: boolean;
  occupation: boolean;
  trait: boolean;
  hook: boolean;
  voice: boolean;
  age: boolean;
}

export interface NpcStats {
  cr: string;
  hp: number;
  hpMax: number;
  hpFormula: string;
  ac: number;
  speed: { walk: number };
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  actions: { name: string; description: string }[];
}

export interface NpcGeneratorState {
  gender: GenderType;
  race: string;
  name: string;
  occupation: string;
  dndClass: string;      // "" = no class / commoner
  level: number | null;
  age: number | null;
  trait: string;
  hook: string;
  voice: string;
  relationship: "ally" | "neutral" | "wary" | "hostile" | null;
  accentColor: string;
  locked: NpcLocked;
  generateStats: boolean;
  stats?: NpcStats;
  systemPrompt: string;
}
