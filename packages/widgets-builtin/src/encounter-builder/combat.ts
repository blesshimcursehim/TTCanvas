// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure "start combat" logic, unit-tested with an injectable rng (like roll-tables/engine.ts and
// xp-tracker/xpMath.ts). Turns a saved Encounter + the live Bestiary/Party/NPC data into the list
// of combatants to push into the Initiative Tracker - no React, no side effects.

import { abilityModifier } from "@ttcanvas/core";
import type {
  Combatant, CombatantKind, BestiaryCreatureRef, InitiativeGroup, SharedPartyMember, NpcRef,
} from "@ttcanvas/core";
import { parseExpression, rollExpression } from "../dice-roller/dice";
import type { Encounter, EncounterMember } from "./types";

/** A d20 initiative roll. `rng` returns a float in [0,1) - injectable for tests. */
export function rollInitiative(rng: () => number = Math.random): number {
  return Math.floor(rng() * 20) + 1;
}

/**
 * Rolls HP from a hit-dice formula (Bestiary `hitDice` / NPC `hpFormula`), reusing the Dice Roller's
 * evaluator rather than a second parser. Falls back to the source's static average HP when the
 * formula is missing or unparseable (a creature can be edited after the row was ticked), and never
 * returns below 1 - a fresh combatant at 0 HP would be dead on arrival.
 */
export function rollHp(formula: string | undefined, staticHp: number, rng: () => number = Math.random): number {
  if (!formula) return staticHp;
  const expr = parseExpression(formula);
  if (!expr) return staticHp;
  return Math.max(1, rollExpression(expr, rng).total);
}

/** The live data an encounter's rows resolve against, one map per source kind. */
export interface CombatSources {
  bestiary: Map<string, BestiaryCreatureRef>;
  party: Map<string, SharedPartyMember>;
  /** Keyed by vault-relative filename - the app-wide NPC identity. */
  npcs: Map<string, NpcRef>;
}

export interface BuildOptions {
  /** Roll a d20 initiative per combatant (and per party member whose stored initiative is 0). */
  autoRoll: boolean;
}

export interface BuildResult {
  combatants: Omit<Combatant, "id">[];
  /** Number of included members whose source was missing from its library and skipped. */
  missing: number;
  /** Group-initiative groups formed by any count>1 member with `groupInit` set. */
  groups: InitiativeGroup[];
}

/** A row's source resolved to just the fields the expansion loop needs, so it can run once for
 *  all three kinds instead of one near-duplicate loop each. */
interface ResolvedSource {
  name: string;
  /** Current HP the combatant enters with (a party member mid-adventure may be below full). */
  hp: number;
  /** Maximum HP - separate from `hp`, since a party member can enter combat already hurt. */
  maxHp: number;
  ac: number;
  /** Ability score, 10 (a +0 modifier) when the source has no statblock. */
  dex: number;
  kind: CombatantKind;
  portraitPath?: string;
  /** Set only for a source that is a single individual - see the sourceId rule in buildCombatants. */
  identity?: string;
  /** Party only: a stored initiative is preferred over a roll when non-zero. */
  storedInitiative?: number;
  /** Hit-dice formula for optional rolled HP; undefined when the source carries none. */
  hpFormula?: string;
}

function resolveMember(member: EncounterMember, sources: CombatSources): ResolvedSource | null {
  const { kind, id } = member.source;
  if (kind === "bestiary") {
    const c = sources.bestiary.get(id);
    if (!c) return null;
    // A Bestiary entry is a template with one static HP, so current and max are the same.
    return {
      name: c.name, hp: c.hp, maxHp: c.hp, ac: c.ac, dex: c.abilityScores?.dex ?? 10, kind: "foe",
      portraitPath: c.portrait, // data URL; the map/player token loaders accept it inline
      hpFormula: c.hitDice,
    };
  }
  if (kind === "party") {
    const m = sources.party.get(id);
    if (!m) return null;
    // A party member enters combat at their recorded current HP, which may be below max.
    return {
      name: m.name, hp: m.hp, maxHp: m.maxHp, ac: m.ac, dex: m.abilityScores?.dex ?? 10, kind: "pc",
      portraitPath: m.portraitPath ?? undefined, // vault file path from the Party Tracker
      identity: m.id,
      storedInitiative: m.initiative,
    };
  }
  const n = sources.npcs.get(id);
  if (!n) return null;
  // A named NPC's HP is a specific individual's, not a template average - so a formula is only for
  // rolling when no HP has been decided yet. Once hp/hpMax are set, they win and rolling is off.
  const hpDecided = n.hp !== undefined || n.hpMax !== undefined;
  return {
    name: n.name,
    // An NPC's combat fields are all optional - it may be a shopkeeper with no statblock at all.
    hp: n.hp ?? n.hpMax ?? 0,
    maxHp: n.hpMax ?? n.hp ?? 0,
    ac: n.ac ?? 10,
    dex: n.abilityScores?.dex ?? 10,
    kind: member.kind ?? "foe",
    portraitPath: n.portrait,
    identity: n.filename,
    hpFormula: hpDecided ? undefined : n.hpFormula,
  };
}

/**
 * Expands an encounter into combatants for the Initiative Tracker. Each member resolves to its live
 * source (Bestiary creature / party member / NPC Library entry); a member whose source no longer
 * exists is skipped and counted in `missing`, and a member with `included: false` is skipped
 * silently. A source with count>1 is numbered (`Goblin 1`, `Goblin 2`, ...) and, by default, each
 * copy rolls its own initiative. A member with `groupInit` set instead rolls once for the whole
 * stack and shares it via a new combined `InitiativeGroup` - the classic "these N act together"
 * variant. A roll happens only when `autoRoll` (else initiative 0) and adds the source's DEX
 * modifier; a party member's stored non-zero initiative wins over a roll.
 *
 * Optional rolled HP works the same way: `rollHp` rolls from the source's hit-dice formula instead
 * of using its static average, and `sharedHp` rolls once for the whole stack (mirroring `groupInit`)
 * rather than once per copy.
 *
 * rng consumption order is pinned so tests can script it: per member, the shared rolls first (group
 * initiative, then shared HP), then per copy (initiative, then that copy's HP).
 */
export function buildCombatants(
  encounter: Encounter,
  sources: CombatSources,
  opts: BuildOptions,
  rng: () => number = Math.random,
): BuildResult {
  const combatants: Omit<Combatant, "id">[] = [];
  const groups: InitiativeGroup[] = [];
  let missing = 0;

  for (const member of encounter.members) {
    if (member.included === false) continue;
    const resolved = resolveMember(member, sources);
    if (!resolved) {
      missing++;
      continue;
    }

    // Only a Bestiary entry is a template that stacks. Party members and NPCs are named individuals:
    // "Aria 1 / Aria 2" or "Agnes Holk 3" is nonsense, and splitting one entry across copies would
    // force dropping its identity (see below), breaking the dedupe that "Start combat" relies on.
    const count = member.source.kind === "bestiary" ? Math.max(1, Math.floor(member.count) || 1) : 1;

    const rollFor = () =>
      opts.autoRoll ? rollInitiative(rng) + abilityModifier(resolved.dex) : 0;

    const asGroup = Boolean(member.groupInit) && count > 1;
    const groupId = asGroup ? crypto.randomUUID() : undefined;
    const groupInitiative = asGroup ? rollFor() : undefined;
    if (asGroup && groupId && groupInitiative !== undefined) {
      groups.push({ id: groupId, label: resolved.name, initiative: groupInitiative, combined: true });
    }

    // rollHp only applies with a formula to roll from; otherwise every copy keeps the static average.
    const rollingHp = Boolean(member.rollHp) && resolved.hpFormula !== undefined;
    // sharedHp rolls once for the whole stack (like groupInit), consumed here before the per-copy loop.
    const sharedHp = rollingHp && Boolean(member.sharedHp)
      ? rollHp(resolved.hpFormula, resolved.hp, rng)
      : undefined;

    // A combatant gets a sourceId only when it is the sole instance of an *individual* source.
    // Bestiary entries are templates - one entry legitimately spawns N interchangeable goblins, and
    // two separate builds can each spawn a lone Bugbear from the same entry - so they never get one
    // (identity is left unset even at count 1); every copy would otherwise share an identity, breaking
    // map-token dedupe and the initiative spotlight (each instead falls back to its own combatant id,
    // see CombatantRow's `sourceId ?? id`). Party members and NPCs are individuals, pinned to count 1
    // above, and carry `identity`, so they always keep it. The `count === 1` guard is thus belt-and-
    // braces for the individuals and the reason bestiary never qualifies.
    const sourceId = resolved.identity !== undefined && count === 1 ? resolved.identity : undefined;

    for (let i = 0; i < count; i++) {
      const initiative = asGroup
        ? (groupInitiative as number)
        : (resolved.storedInitiative || rollFor());
      // Rolled HP (shared roll if set, else this copy's own) makes a fresh combatant at full health,
      // so current and max both take the rolled value. Otherwise keep the source's own current/max -
      // which differ for a party member who walked in already hurt.
      const rolled = rollingHp ? (sharedHp ?? rollHp(resolved.hpFormula, resolved.hp, rng)) : undefined;
      const hp = rolled ?? resolved.hp;
      const maxHp = rolled ?? resolved.maxHp;
      combatants.push({
        name: count > 1 ? `${resolved.name} ${i + 1}` : resolved.name,
        initiative,
        hp,
        maxHp,
        ac: resolved.ac,
        kind: resolved.kind,
        sourceId,
        portraitPath: resolved.portraitPath,
        groupId,
      });
    }
  }

  return { combatants, missing, groups };
}
