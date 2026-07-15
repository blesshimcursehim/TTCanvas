// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface EncounterMember {
  id: string;
  /** Id of the referenced Bestiary creature (BestiaryEntry.id). */
  creatureId: string;
  /** Denormalised name snapshot - for display and to still read sensibly if the creature is deleted. */
  name: string;
  /** How many of this creature the encounter contains. >= 1. */
  count: number;
  /** When count > 1: roll initiative once and share it across the whole stack (group initiative),
   *  instead of each copy rolling separately. Meaningless at count 1. Absent = false. */
  groupInit?: boolean;
}

export interface Encounter {
  id: string;
  name: string;
  /** Optional GM notes / setup blurb for the encounter. */
  notes?: string;
  members: EncounterMember[];
}

export interface EncounterBuilderState {
  encounters: Encounter[];
  selectedId: string | null;
}
