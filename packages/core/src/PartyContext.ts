// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { AbilityScores, PCCurrency } from "./types";

export interface SharedPartyMember {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  /** Character level as recorded on the sheet. Free-standing: the XP Tracker derives its own level
   *  from XP and offers an explicit, one-way hand-back rather than syncing this live. */
  level: number;
  /** Vault-relative portrait file path (e.g. "portraits/uuid.jpg"), so tokens/combatants can reuse it. */
  portraitPath?: string | null;
  /** Rich-sheet ability scores, if the GM filled them in - lets initiative rolls add a DEX modifier. */
  abilityScores?: AbilityScores;
}

/** A one-way, explicit hand-back to the Party Tracker roster. Absent fields are left untouched. */
export interface PartyMemberPatch {
  id: string;
  /** Clamped to [0, maxHp] by the writer, matching the Party Tracker's own clamp. */
  hp?: number;
  level?: number;
  /**
   * Coins to ADD to this member's purse, not the purse to set - "+3 gp", never "gp is now 13".
   * The addition happens inside the state updater, so a share handed out by the Inventory widget
   * cannot clobber a coin edit the GM made on the sheet in between. Negative values are allowed and
   * floor at zero, so a caller that needs to know whether the member could afford it must check
   * first. Absent coins are left untouched.
   */
  currencyDelta?: Partial<PCCurrency>;
}

export interface PartyContextValue {
  members: SharedPartyMember[];
  /**
   * Write values back to the Party Tracker roster - the end-of-combat HP hand-back and confirmed
   * level-ups. Deliberately explicit and one-way, so out-of-combat edits are never silently
   * overwritten by a live sync. Ids with no matching member are ignored.
   */
  patchMembers: (patches: PartyMemberPatch[]) => void;
}

export const PartyContext = createContext<PartyContextValue>({ members: [], patchMembers: () => {} });

export function useParty(): PartyContextValue {
  return useContext(PartyContext);
}
