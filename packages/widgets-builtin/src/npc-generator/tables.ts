// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { GenderType, NpcGeneratorState } from "./types";
import { ACCENT_PRESETS } from "../npc-library/npcFormat";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function range(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Name tables ────────────────────────────────────────────────────────────

const NAME_POOL = {
  masculine: ["Aldric", "Torvan", "Orin", "Cade", "Dorin", "Brenn", "Gareth", "Edwyn"],
  feminine: ["Mira", "Selene", "Brynn", "Lysa", "Nessa", "Aela", "Vira", "Calla"],
  last: ["Ashwood", "Coldwater", "Dusk", "Ironhold", "Marsh", "Nightvale", "Stoneford", "Wren"],
};

const AGE_RANGES: Record<string, [number, number]> = {
  any:         [18, 70],
  human:       [18, 70],
  elf:         [80, 600],
  dwarf:       [40, 350],
  orc:         [16, 50],
  halfling:    [20, 150],
  gnome:       [40, 400],
  tiefling:    [18, 80],
  dragonborn:  [15, 80],
  goliath:     [18, 80],
  other:       [1, 1000],
};

// ── Narrative tables ───────────────────────────────────────────────────────

export const TRAIT_TABLE = [
  "A long, jagged scar from jaw to collar",
  "Always fidgets with a worn coin",
  "Speaks in an unusually quiet, measured voice",
  "Never makes eye contact - always looking slightly past you",
  "Constantly checks over their shoulder",
  "Smells faintly of pipe smoke and pine tar",
  "Quotes obscure proverbs at odd moments",
  "Drums their fingers in rhythmic patterns when thinking",
  "Wears mismatched gloves - one leather, one wool",
  "Hums tunelessly while working, stops if noticed",
  "Collects small smooth pebbles in their coat pocket",
  "Refers to themselves in the third person when agitated",
  "A missing finger on the left hand, never explained",
  "Eyes of two different colours - one brown, one pale grey",
  "Walks with a slight limp that disappears when they think no one is watching",
  "Always carries a small folded letter but never reads it",
  "Laugh too loud and too long, then go suddenly quiet",
  "Speaks three languages but switches mid-sentence when nervous",
];

export const HOOK_TABLE = [
  "Secretly provides information to the Coppervein guild",
  "Owes a dangerous debt and is desperate for a way out",
  "Witnessed a murder months ago and has told no one",
  "Is searching for a sibling who vanished after the last war",
  "Holds a map fragment - doesn't know what it leads to",
  "Has been receiving threatening notes with no return address",
  "Knows the true identity of someone important in the city",
  "Was once a member of a now-outlawed organisation",
  "Stole something from a noble years ago - still afraid of being found",
  "Has a child in another city they haven't seen in three years",
  "Believes they are being followed - they are correct",
  "Overheard a conversation they should not have",
  "Is hiding a fugitive in their home, out of compassion",
  "Has a copy of a document that would ruin a powerful family",
];

export const VOICE_TABLE = [
  "Reedy and nervous; voice cracks under stress",
  "Low and measured, like someone choosing every word",
  "Brash and loud - laughs at their own jokes",
  "A soft, lilting accent from a distant region",
  "Clipped and precise, almost militaristic",
  "Warm and unhurried, like they have all the time in the world",
  "Rasping from old smoke damage or a healed wound",
  "Singsong cadence, almost mocking",
  "Barely above a whisper - you always lean in to hear them",
  "Quick and enthusiastic; they talk over themselves when excited",
  "Formal and slightly stiff, like someone who learned the language later in life",
  "Conspiratorial - drops to a murmur even in private",
];

// ── Occupations ────────────────────────────────────────────────────────────

export const OCCUPATIONS = [
  "Alchemist", "Animal Trainer", "Apothecary", "Archivist", "Armorer", "Artisan",
  "Assassin", "Bandit", "Beggar", "Blacksmith", "Bounty Hunter", "Brewer",
  "Carpenter", "Cartographer", "Clerk", "Clothier", "Commander", "Cook",
  "Courier", "Cultist", "Diplomat", "Dockworker", "Enforcer", "Entertainer",
  "Explorer", "Farmer", "Ferryman", "Fisherman", "Fletcher", "Forager",
  "Gambler", "Gravedigger", "Guard", "Guild Member", "Herbalist", "Hunter",
  "Innkeeper", "Investigator", "Jailer", "Jeweler", "Knight", "Leatherworker",
  "Librarian", "Mercenary", "Merchant", "Midwife", "Miller", "Miner",
  "Noble", "Physician", "Pirate", "Priest", "Ranger", "Sailor",
  "Scholar", "Scribe", "Sheriff", "Smuggler", "Soldier", "Spy",
  "Stablehand", "Surgeon", "Tax Collector", "Thief", "Trader", "Trapper",
  "Undertaker", "Watchman", "Weaver",
];

// ── SRD 5.2.1 classes ──────────────────────────────────────────────────────

export const DND_CLASSES = [
  "", // - (commoner)
  "Barbarian", "Bard", "Cleric", "Druid",
  "Fighter", "Monk", "Paladin", "Ranger", "Rogue",
  "Sorcerer", "Warlock", "Wizard",
];

export const DND_CLASS_LABELS: Record<string, string> = {
  "": "- (no class)",
  "Barbarian": "Barbarian", "Bard": "Bard",
  "Cleric": "Cleric", "Druid": "Druid", "Fighter": "Fighter",
  "Monk": "Monk", "Paladin": "Paladin", "Ranger": "Ranger",
  "Rogue": "Rogue", "Sorcerer": "Sorcerer", "Warlock": "Warlock",
  "Wizard": "Wizard",
};

// ── SRD 5.2.1 species plus a freeform option ──────────────────────────────

export const RACES = [
  "Any",
  "Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling",
  "Other",
];

// ── Generators ─────────────────────────────────────────────────────────────

export function generateName(gender: GenderType): string {
  let firstName: string;
  if (gender === "masculine") firstName = pick(NAME_POOL.masculine);
  else if (gender === "feminine") firstName = pick(NAME_POOL.feminine);
  else if (gender === "any") firstName = pick(Math.random() < 0.5 ? NAME_POOL.masculine : NAME_POOL.feminine);
  else firstName = pick([...NAME_POOL.masculine, ...NAME_POOL.feminine]);

  return `${firstName} ${pick(NAME_POOL.last)}`;
}

export function generateOccupation(): string {
  return pick(OCCUPATIONS);
}

export function generateTrait(): string { return pick(TRAIT_TABLE); }
export function generateHook(): string { return pick(HOOK_TABLE); }
export function generateVoice(): string { return pick(VOICE_TABLE); }

export function generateAge(race: string): number {
  const key = race.toLowerCase();
  const [min, max] = AGE_RANGES[key] ?? AGE_RANGES[key.split(" ").pop() ?? ""] ?? AGE_RANGES.any;
  return range(min, max);
}

export const GENDER_LABELS: Record<GenderType, string> = {
  any: "Any", masculine: "Masculine", feminine: "Feminine", other: "Other",
};
export const GENDER_TYPES: GenderType[] = ["any", "masculine", "feminine", "other"];

export function createDefaultNpcGeneratorState(): NpcGeneratorState {
  const race = "Human";
  return {
    gender: "any",
    race,
    name: generateName("any"),
    occupation: generateOccupation(),
    dndClass: "",
    level: null,
    age: generateAge(race),
    trait: generateTrait(),
    hook: generateHook(),
    voice: generateVoice(),
    relationship: null,
    accentColor: pick([...ACCENT_PRESETS]),
    locked: { name: false, occupation: false, trait: false, hook: false, voice: false, age: false },
    generateStats: false,
    stats: undefined,
    systemPrompt: "",
  };
}
