// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export type CombatantKind = "pc" | "foe" | "ally";

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  kind: CombatantKind;
  conditions?: string[];
  /** Origin of this combatant, e.g. a Bestiary entry id (set by the Encounter Builder). Back-compat: absent on old saves. */
  sourceId?: string;
  /** Portrait to carry onto a map token: a vault file path (party) or an inline data URL (Bestiary). */
  portraitPath?: string;
  /** Group-initiative membership, if any - see InitiativeGroup. Absent = not grouped. */
  groupId?: string;
}

/** A shared initiative roll for two or more combatants (group initiative). */
export interface InitiativeGroup {
  id: string;
  label: string;
  initiative: number;
  /**
   * true = the group is a single turn-order entry (members act together; "Next turn" skips the
   * whole group at once). false = members keep individual turns, just clustered together under
   * the same shared initiative number.
   */
  combined: boolean;
}

export interface InitiativeTrackerState {
  combatants: Combatant[];
  currentId: string | null;
  round: number;
  showOnPlayer: boolean;
  autoAdvanceTime?: boolean; // absent (pre-F7 saves) = false
  roundSeconds?: number;     // absent = 6
  /**
   * The exact seconds delta (0 if auto-advance was off) that each forward round-wrap applied to
   * the game clock, oldest first. Lets Prev undo precisely what the matching Next added, rather
   * than assuming the *current* auto-advance toggle / roundSeconds - both of which may have
   * changed since. Absent (pre-existing saves) = [].
   */
  roundAdvances?: number[];
  /** Group-initiative groups. Absent (pre-existing saves) = []. */
  groups?: InitiativeGroup[];
  /** Toast a GM-facing nudge each time a round wraps ("lair actions"). Absent = false. */
  lairActionReminder?: boolean;
}

/** One row of the player-facing initiative overlay. */
export interface InitiativeTurn {
  name: string;
  kind: CombatantKind;
  current: boolean;
  next: boolean;
}

/**
 * Player-facing initiative payload. Deliberately omits HP / AC / initiative
 * values - players see only the current turn and who's next, not the full
 * GM-facing order. Pushed over a dedicated `it-update` channel that overlays
 * the active scene.
 */
export interface InitiativeOverlay {
  round: number;
  /**
   * At most two entries, current turn first: `[current, next]`, or just `[current]` when
   * current and next are the same (only one entry in the turn order). There is no case with
   * zero valid entries - push `null` instead of an `InitiativeOverlay` when there's no current
   * turn, rather than an object with an empty `turns` array.
   */
  turns: InitiativeTurn[];
  /**
   * sourceId (falling back to id) of every combatant whose turn it currently is - lets the player
   * window spotlight the linked token(s). Usually one entry; a combined group's turn lists every
   * member, since the whole group acts together.
   */
  activeSourceIds: string[];
}

export interface ITContextValue {
  addCombatant: (c: Omit<Combatant, "id">) => void;
  /**
   * Add several combatants in one state update - used by the Encounter Builder's "Start combat".
   * `groups` carries any pre-formed group-initiative groups (e.g. a count>1 monster stack added
   * with "Roll as group" on) to merge into state alongside the new combatants.
   */
  addCombatants: (cs: Omit<Combatant, "id">[], groups?: InitiativeGroup[]) => void;
  /**
   * sourceId (falling back to id) of every combatant whose turn it currently is - lets Map Display
   * spotlight the linked token(s) on the GM's own map (the player-window equivalent travels via
   * InitiativeOverlay.activeSourceIds, since the player window has no context, only the pushed
   * overlay). Usually one entry; a combined group's turn lists every member.
   */
  activeSourceIds: string[];
}

const defaultValue: ITContextValue = { addCombatant: () => {}, addCombatants: () => {}, activeSourceIds: [] };

export const ITContext = createContext<ITContextValue>(defaultValue);
export function useIT(): ITContextValue { return useContext(ITContext); }
