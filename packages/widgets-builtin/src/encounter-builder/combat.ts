// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure "start combat" logic, unit-tested with an injectable rng (like roll-tables/engine.ts and
// xp-tracker/xpMath.ts). Turns a saved Encounter + the live Bestiary/Party data into the list of
// combatants to push into the Initiative Tracker - no React, no side effects.

import { abilityModifier } from "@ttcanvas/core";
import type { Combatant, BestiaryCreatureRef, InitiativeGroup, SharedPartyMember } from "@ttcanvas/core";
import type { Encounter } from "./types";

/** A d20 initiative roll. `rng` returns a float in [0,1) - injectable for tests. */
export function rollInitiative(rng: () => number = Math.random): number {
  return Math.floor(rng() * 20) + 1;
}

export interface BuildOptions {
  /** Append the party as PCs alongside the encounter creatures. */
  addParty: boolean;
  /** Roll a d20 initiative per creature (and per party member whose stored initiative is 0). */
  autoRoll: boolean;
}

export interface BuildResult {
  combatants: Omit<Combatant, "id">[];
  /** Number of encounter members whose creature was missing from the Bestiary and skipped. */
  missing: number;
  /** Group-initiative groups formed by any count>1 member with `groupInit` set. */
  groups: InitiativeGroup[];
}

/**
 * Expands an encounter into combatants for the Initiative Tracker. Each member is resolved to its
 * live Bestiary creature via `creaturesById`; a member whose creature no longer exists is skipped
 * and counted in `missing`. A creature with count>1 is numbered (`Goblin 1`, `Goblin 2`, ...) and,
 * by default, each copy rolls its own initiative. A member with `groupInit` set instead rolls once
 * for the whole stack and shares it via a new combined `InitiativeGroup` (`groups`) - the classic
 * "these N monsters act together" variant. Foes get a d20 roll when `autoRoll`, else initiative 0;
 * a roll adds the creature's DEX modifier (`abilityScores.dex`, 0 if unset). When `addParty`, party
 * members are appended as PCs using their stored initiative (rolled, DEX modifier included, only if
 * `autoRoll` and their stored value is 0).
 */
export function buildCombatants(
  encounter: Encounter,
  creaturesById: Map<string, BestiaryCreatureRef>,
  party: SharedPartyMember[],
  opts: BuildOptions,
  rng: () => number = Math.random,
): BuildResult {
  const combatants: Omit<Combatant, "id">[] = [];
  const groups: InitiativeGroup[] = [];
  let missing = 0;

  for (const member of encounter.members) {
    const creature = creaturesById.get(member.creatureId);
    if (!creature) {
      missing++;
      continue;
    }
    const count = Math.max(1, Math.floor(member.count) || 1);
    const asGroup = member.groupInit && count > 1;
    const groupId = asGroup ? crypto.randomUUID() : undefined;
    const groupInitiative = asGroup
      ? (opts.autoRoll ? rollInitiative(rng) + abilityModifier(creature.abilityScores?.dex ?? 10) : 0)
      : undefined;
    if (asGroup && groupId && groupInitiative !== undefined) {
      groups.push({ id: groupId, label: creature.name, initiative: groupInitiative, combined: true });
    }
    for (let i = 0; i < count; i++) {
      combatants.push({
        name: count > 1 ? `${creature.name} ${i + 1}` : creature.name,
        initiative: asGroup
          ? (groupInitiative as number)
          : (opts.autoRoll ? rollInitiative(rng) + abilityModifier(creature.abilityScores?.dex ?? 10) : 0),
        hp: creature.hp,
        maxHp: creature.hp,
        ac: creature.ac,
        kind: "foe",
        // No sourceId: creature.id here - every copy of a count>1 member (Goblin 1, Goblin 2, ...)
        // would otherwise share the same "identity", breaking map-token dedup and the initiative
        // spotlight once more than one is on the map. Left unset, each falls back to its own
        // unique combatant id once addCombatants assigns one (see CombatantRow's sourceId fallback).
        portraitPath: creature.portrait, // data URL; the map/player token loaders accept it inline
        groupId,
      });
    }
  }

  if (opts.addParty) {
    for (const m of party) {
      const initiative = m.initiative || (opts.autoRoll ? rollInitiative(rng) + abilityModifier(m.abilityScores?.dex ?? 10) : 0);
      combatants.push({
        name: m.name,
        initiative,
        hp: m.hp,
        maxHp: m.maxHp,
        ac: m.ac,
        kind: "pc",
        sourceId: m.id,
        portraitPath: m.portraitPath ?? undefined, // vault file path from the Party Tracker
      });
    }
  }

  return { combatants, missing, groups };
}
