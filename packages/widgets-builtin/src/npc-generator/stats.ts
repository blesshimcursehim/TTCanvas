// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { NpcStats } from "./types";

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ALL_ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

const CLASS_HIT_DIE: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10, Paladin: 10, Ranger: 10,
  Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
  Sorcerer: 6, Wizard: 6,
};

// Base AC before dex (heavy/medium armor classes don't add dex)
const CLASS_AC_BASE: Record<string, number> = {
  Fighter: 18, Paladin: 18,                            // plate
  Cleric: 16,                                          // chain
  Barbarian: 12, Ranger: 12, Druid: 12, Bard: 12,      // light armor - add dex
  Monk: 10, Rogue: 12,                                 // light/unarmored - add dex
  Sorcerer: 11, Warlock: 11, Wizard: 11,               // unarmored - add dex (mage armor flavour)
};

// Whether the class adds dex modifier to AC
const CLASS_AC_ADDS_DEX: Record<string, boolean> = {
  Barbarian: true, Ranger: true, Druid: true, Bard: true,
  Monk: true, Rogue: true,
  Sorcerer: true, Warlock: true, Wizard: true,
};

const CLASS_PRIMARY_ABILITY: Record<string, [Ability, Ability]> = {
  Barbarian: ["str", "con"],
  Fighter: ["str", "con"],
  Paladin: ["str", "cha"],
  Ranger: ["dex", "wis"],
  Rogue: ["dex", "con"],
  Monk: ["dex", "wis"],
  Cleric: ["wis", "con"],
  Druid: ["wis", "con"],
  Bard: ["cha", "dex"],
  Sorcerer: ["cha", "con"],
  Warlock: ["cha", "con"],
  Wizard: ["int", "con"],
};

const CLASS_SIGNATURE_ACTIONS: Record<string, { name: string; description: string }[]> = {
  Fighter: [{ name: "Longsword", description: "Melee Weapon Attack: 1d8 + STR slashing damage. Versatile (1d10 two-handed)." }],
  Paladin: [{ name: "Longsword", description: "Melee Weapon Attack: 1d8 + STR slashing damage." }, { name: "Divine Smite", description: "Expend a spell slot to deal extra 2d8 radiant damage on a hit." }],
  Barbarian: [{ name: "Greataxe", description: "Melee Weapon Attack: 1d12 + STR slashing damage. Rage adds extra damage." }],
  Ranger: [{ name: "Longbow", description: "Ranged Weapon Attack (150/600 ft): 1d8 + DEX piercing damage." }, { name: "Shortsword", description: "Melee Weapon Attack: 1d6 + DEX piercing damage." }],
  Rogue: [{ name: "Shortsword", description: "Melee Weapon Attack: 1d6 + DEX piercing damage." }, { name: "Sneak Attack", description: "Once per turn, deal extra damage when you have Advantage or an ally is next to the target." }],
  Monk: [{ name: "Unarmed Strike", description: "Melee Attack Roll: 1d6 + DEX bludgeoning damage; can use a Bonus Action for a second strike." }],
  Cleric: [{ name: "Mace", description: "Melee Weapon Attack: 1d6 + STR bludgeoning damage." }, { name: "Sacred Flame", description: "Cantrip. DEX save or 1d8 radiant damage; no cover bonus." }],
  Druid: [{ name: "Quarterstaff", description: "Melee Weapon Attack: 1d6 + STR bludgeoning damage." }, { name: "Produce Flame", description: "Cantrip. Ranged Spell Attack (30 ft): 1d8 fire damage; also illuminates 10 ft." }],
  Bard: [{ name: "Rapier", description: "Melee Weapon Attack: 1d8 + DEX piercing damage." }, { name: "Vicious Mockery", description: "Cantrip. WIS save or 1d6 psychic damage and Disadvantage on the next attack roll." }],
  Sorcerer: [{ name: "Fire Bolt", description: "Cantrip. Ranged Spell Attack (120 ft): 1d10 fire damage." }],
  Warlock: [{ name: "Eldritch Blast", description: "Cantrip. Ranged Spell Attack (120 ft): 1d10 force damage; additional beams at higher levels." }],
  Wizard: [{ name: "Fire Bolt", description: "Cantrip. Ranged Spell Attack (120 ft): 1d10 fire damage." }, { name: "Magic Missile", description: "1st-level: three darts, each 1d4+1 force damage; no attack roll needed." }],
};

const COMMONER_ACTIONS = [{ name: "Club", description: "Melee Weapon Attack: 1d4 bludgeoning damage." }];

function levelToCr(level: number | null): string {
  if (level === null) return "0";
  if (level <= 1) return "1/4";
  if (level === 2) return "1/2";
  if (level === 3) return "1";
  if (level === 4) return "2";
  if (level <= 6) return "3";
  if (level <= 8) return "5";
  if (level <= 12) return "7";
  return "10";
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function rollHp(hitDie: number, level: number, conMod: number): { hp: number; formula: string } {
  let total = 0;
  for (let i = 0; i < level; i++) {
    total += Math.floor(Math.random() * hitDie) + 1;
  }
  total += conMod * level;
  const bonus = conMod * level;
  const sign = bonus >= 0 ? "+" : "";
  const formula = `${level}d${hitDie}${bonus !== 0 ? `${sign}${bonus}` : ""}`;
  return { hp: Math.max(1, total), formula };
}

function assignAbilityScores(primaries: [Ability, Ability]): Record<Ability, number> {
  // Standard array, top scores go to primary abilities first
  const remaining = [...ALL_ABILITIES.filter((a) => !primaries.includes(a))];
  // Shuffle the remaining four
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  const order: Ability[] = [primaries[0], primaries[1], ...remaining];
  const scores = {} as Record<Ability, number>;
  order.forEach((ability, i) => {
    scores[ability] = STANDARD_ARRAY[i];
  });
  return scores;
}

function balancedAbilityScores(): Record<Ability, number> {
  // Commoner: shuffle the standard array fully, no primary preference
  const shuffled = [...ALL_ABILITIES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const scores = {} as Record<Ability, number>;
  shuffled.forEach((ability, i) => {
    scores[ability] = STANDARD_ARRAY[i];
  });
  return scores;
}

export interface GenerateStatsInput {
  dndClass: string;
  level: number | null;
  race: string;
}

export function generateStats({ dndClass, level, race }: GenerateStatsInput): NpcStats {
  const isCommoner = !dndClass;
  const effectiveLevel = isCommoner ? 1 : Math.max(1, level ?? 1);
  const hitDie = isCommoner ? 4 : (CLASS_HIT_DIE[dndClass] ?? 8);

  const abilityScores = isCommoner
    ? balancedAbilityScores()
    : assignAbilityScores(CLASS_PRIMARY_ABILITY[dndClass] ?? ["str", "con"]);

  const conMod = abilityMod(abilityScores.con);
  const dexMod = abilityMod(abilityScores.dex);
  const { hp, formula } = rollHp(hitDie, effectiveLevel, conMod);

  const baseAc = isCommoner ? 10 : (CLASS_AC_BASE[dndClass] ?? 12);
  const acAddsDex = isCommoner ? true : (CLASS_AC_ADDS_DEX[dndClass] ?? false);
  const dexBonusForAc = acAddsDex ? Math.max(0, Math.min(dexMod, 5)) : 0;
  const ac = baseAc + dexBonusForAc;

  const speedWalk = race === "Goliath" ? 35 : 30;

  const actions = isCommoner
    ? COMMONER_ACTIONS
    : (CLASS_SIGNATURE_ACTIONS[dndClass] ?? COMMONER_ACTIONS);

  return {
    cr: isCommoner ? "0" : levelToCr(level),
    hp,
    hpMax: hp,
    hpFormula: formula,
    ac,
    speed: { walk: speedWalk },
    abilityScores,
    actions,
  };
}
