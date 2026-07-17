// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { AbilityScores } from "./types";

/**
 * Read-only view of a single Bestiary creature, exposed to other widgets (e.g. the Encounter
 * Builder) so they can reference creatures without reaching into the Bestiary's own widget state.
 * Deliberately a subset of the full `BestiaryEntry` - just the combat-relevant fields.
 */
export interface BestiaryCreatureRef {
  id: string;
  name: string;
  cr: string;
  hp: number;
  ac: number;
  portrait?: string;
  /** Hit-dice formula (e.g. "10d8+20") - lets the Encounter Builder roll HP per instance. */
  hitDice?: string;
  /** Rich-statblock ability scores, if filled in - lets initiative rolls add a DEX modifier. */
  abilityScores?: AbilityScores;
}

export interface BestiaryContextValue {
  creatures: BestiaryCreatureRef[];
}

export const BestiaryContext = createContext<BestiaryContextValue>({ creatures: [] });

export function useBestiary(): BestiaryContextValue {
  return useContext(BestiaryContext);
}
