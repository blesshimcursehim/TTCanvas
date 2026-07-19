// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { AbilityScores, NpcRelationship } from "./types";

/**
 * Read-only view of a single NPC Library entry, exposed to other widgets (the Encounter Builder,
 * Gazetteer, Relationship Web) so they can reference NPCs without each re-scanning the vault.
 * Deliberately a subset of the full `ParsedNpc` - identity, display, and the combat-relevant
 * fields - mirroring `BestiaryCreatureRef` / `SharedPartyMember`.
 *
 * Identity is the vault-relative `filename`, matching how the rest of the app refers to NPCs
 * ([[npc:...]] links, App's handleOpenNpc, Gazetteer and Relationship Web links). Despite the
 * name, this is stable across renames: NPC Library writes back to the same file rather than
 * renaming it. `id` is carried for display keys and a possible future migration.
 *
 * Unlike Bestiary and Party, NPCs are individual vault files rather than widget state, so this
 * context is populated by an async scan in `src/NpcProvider.tsx`, not derived from singletonStates.
 */
export interface NpcRef {
  filename: string;
  id: string;
  name: string;
  relationship?: NpcRelationship;
  portrait?: string;
  cr?: string;
  hp?: number;
  hpMax?: number;
  /** Hit-dice expression (e.g. "4d8+4") - lets the Encounter Builder offer rolled HP. */
  hpFormula?: string;
  ac?: number;
  /** Rich-statblock ability scores, if filled in - lets initiative rolls add a DEX modifier. */
  abilityScores?: AbilityScores;
  /** Free-text faction/location from the library entry - lets the Relationship Web suggest links
   *  from metadata the GM already recorded, instead of re-typing them into the graph. */
  faction?: string;
  location?: string;
}

export interface NpcContextValue {
  npcs: NpcRef[];
  /** True until the first vault scan settles, so a picker can say "Loading" rather than "No NPCs". */
  loading: boolean;
}

export const NpcContext = createContext<NpcContextValue>({ npcs: [], loading: false });

export function useNpcs(): NpcContextValue {
  return useContext(NpcContext);
}
