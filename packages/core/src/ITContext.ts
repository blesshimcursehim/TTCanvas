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

export type StartCombatMode = "replace" | "append";

/**
 * Snapshot of the encounter a combat was started from - stored on InitiativeTrackerState so the
 * end-combat review can offer the encounter's reward without reaching back into Encounter Builder
 * state. A snapshot, not a live link: editing the encounter mid-combat must not change a pending
 * award. Absent = an ad-hoc combat (hand-added combatants, or Bestiary's quick-add).
 */
export interface CombatEncounterRef {
  id: string;
  name: string;
  /** XP reward to route to the XP Tracker after combat, if the encounter set one. */
  rewardXp?: number;
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
  /** The encounter this combat was started from, for the end-combat review's reward hand-off.
   *  Absent = an ad-hoc combat. Cleared when combat ends. */
  encounter?: CombatEncounterRef;
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
   * Push a built encounter into the tracker and reveal it - the Encounter Builder's "Start combat".
   * "replace" wipes the live combat first (combatants, groups, round, current turn, round advances);
   * "append" merges, skipping any combatant whose sourceId is already present so a party member or
   * lone NPC can't be added twice. `groups` carries any pre-formed group-initiative groups, and
   * `encounter` is the snapshot stored for the end-combat review. Replaces the old always-additive
   * addCombatants. Returns how many combatants were actually added - fewer than built when append
   * drops duplicates - so the caller can report the accepted count rather than the built count.
   */
  startCombat: (
    cs: Omit<Combatant, "id">[],
    groups: InitiativeGroup[],
    mode: StartCombatMode,
    encounter?: CombatEncounterRef,
  ) => number;
  /**
   * How many combatants are in the tracker right now - lets the Encounter Builder warn before
   * replacing a live combat. Deliberately a count, not the list: exposing combatants[] would bounce
   * this context on every HP tick and re-render every useIT() consumer, Map Display included.
   */
  combatantCount: number;
  /**
   * sourceId (falling back to id) of every combatant whose turn it currently is - lets Map Display
   * spotlight the linked token(s) on the GM's own map (the player-window equivalent travels via
   * InitiativeOverlay.activeSourceIds, since the player window has no context, only the pushed
   * overlay). Usually one entry; a combined group's turn lists every member.
   */
  activeSourceIds: string[];
}

const defaultValue: ITContextValue = {
  addCombatant: () => {}, startCombat: () => 0, combatantCount: 0, activeSourceIds: [],
};

export const ITContext = createContext<ITContextValue>(defaultValue);
export function useIT(): ITContextValue { return useContext(ITContext); }
