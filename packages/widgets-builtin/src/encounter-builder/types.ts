// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { CombatantKind } from "@ttcanvas/core";

export type EncounterSourceKind = "bestiary" | "party" | "npc";

/**
 * Where an encounter row's combatant comes from. `id` is that source's identity in its own
 * registry: a `BestiaryEntry.id`, a `SharedPartyMember.id`, or - for NPCs - the vault-relative
 * filename ("npcs/captain-vell.json"), which is how the whole app refers to NPCs.
 *
 * Flat rather than a discriminated union on purpose: all three kinds carry exactly one string, so
 * a union with identical payloads would buy nothing and cost a key helper everywhere generic code
 * touches `source.id` (resolution, the missing-row check, dedupe).
 */
export interface EncounterSource {
  kind: EncounterSourceKind;
  id: string;
}

export interface EncounterMember {
  id: string;
  source: EncounterSource;
  /** Denormalised name snapshot - for display and to still read sensibly if the source is deleted. */
  name: string;
  /** How many of this source the encounter contains. >= 1. Always 1 for a party source, whose
   *  roster is a list of individuals. */
  count: number;
  /** When count > 1: roll initiative once and share it across the whole stack (group initiative),
   *  instead of each copy rolling separately. Meaningless at count 1. Absent = false. */
  groupInit?: boolean;
  /** Roll HP from the source's hit-dice formula instead of using its static average HP. Absent =
   *  false. Only meaningful on a bestiary/npc source that has a parseable formula. */
  rollHp?: boolean;
  /** With rollHp and count > 1: roll HP once and share it across the stack, mirroring groupInit.
   *  Absent = false, i.e. each copy rolls its own. */
  sharedHp?: boolean;
  /** Excluded from "Start combat" without deleting the row. Absent = included. */
  included?: boolean;
  /** Which side an NPC row joins on - an NPC can be either. Seeded from the NPC's relationship
   *  when the row is added. Ignored for bestiary (always "foe") and party (always "pc") rows.
   *  Absent = "foe". */
  kind?: CombatantKind;
}

export interface Encounter {
  id: string;
  name: string;
  /** Optional GM notes / setup blurb for the encounter. */
  notes?: string;
  /** Explicit XP reward for finishing this encounter, routed to the XP Tracker after combat.
   *  Deliberately GM-entered and never derived from challenge rating, which would be system- and
   *  version-specific. Absent = no reward. */
  rewardXp?: number;
  members: EncounterMember[];
}

export interface EncounterBuilderState {
  encounters: Encounter[];
  selectedId: string | null;
}
