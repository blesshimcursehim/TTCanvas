// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { AbilityScores } from "./types";

export interface SharedPartyMember {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  /** Vault-relative portrait file path (e.g. "portraits/uuid.jpg"), so tokens/combatants can reuse it. */
  portraitPath?: string | null;
  /** Rich-sheet ability scores, if the GM filled them in - lets initiative rolls add a DEX modifier. */
  abilityScores?: AbilityScores;
}

export interface PartyContextValue {
  members: SharedPartyMember[];
}

export const PartyContext = createContext<PartyContextValue>({ members: [] });

export function useParty(): PartyContextValue {
  return useContext(PartyContext);
}
