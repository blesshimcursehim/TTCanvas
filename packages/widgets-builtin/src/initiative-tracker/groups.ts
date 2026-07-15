// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure logic for group initiative: two or more combatants sharing a single roll. A group is
// either "combined" (one turn-order entry - the whole group acts together, "Next turn" skips
// past it in one step) or "separate" (members keep individual turns, just clustered together
// under the same shared initiative number). No React, no side effects - see groups.test.ts.

import type { Combatant, InitiativeGroup } from "./types";

export type TurnEntry =
  | { id: string; initiative: number; kind: "combatant"; combatant: Combatant }
  | { id: string; initiative: number; kind: "group"; group: InitiativeGroup; members: Combatant[] };

/**
 * Collapses combined groups into single turn-order entries and sorts everything by initiative.
 * A "separate" group's members stay as individual entries - they sort adjacent to each other
 * anyway, since their initiative is kept in sync (see syncGroupInitiative).
 */
export function buildTurnOrder(combatants: Combatant[], groups: InitiativeGroup[]): TurnEntry[] {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const combined = new Map<string, Combatant[]>();
  const entries: TurnEntry[] = [];

  for (const c of combatants) {
    const group = c.groupId ? groupsById.get(c.groupId) : undefined;
    if (group?.combined) {
      const members = combined.get(group.id);
      if (members) {
        members.push(c);
      } else {
        combined.set(group.id, [c]);
      }
      continue;
    }
    entries.push({ id: c.id, initiative: c.initiative, kind: "combatant", combatant: c });
  }

  for (const [groupId, members] of combined) {
    const group = groupsById.get(groupId);
    if (!group) continue; // unreachable given the lookup above, but keeps this pure/total
    entries.push({ id: group.id, initiative: group.initiative, kind: "group", group, members });
  }

  return entries.sort((a, b) => b.initiative - a.initiative);
}

/** Propagates a new shared initiative value to every member of a group. */
export function syncGroupInitiative(combatants: Combatant[], groupId: string, initiative: number): Combatant[] {
  return combatants.map((c) => (c.groupId === groupId ? { ...c, initiative } : c));
}

export interface CreateGroupOptions {
  label: string;
  initiative: number;
  combined: boolean;
}

/**
 * Groups the given combatants together. If exactly one of them already belongs to a group, the
 * rest are folded into that existing group instead of creating a new one (covers "add this new
 * arrival to the mob"); its label/initiative/combined are updated from `opts`.
 */
export function createGroup(
  combatants: Combatant[],
  groups: InitiativeGroup[],
  memberIds: string[],
  opts: CreateGroupOptions,
): { combatants: Combatant[]; groups: InitiativeGroup[] } {
  const memberIdSet = new Set(memberIds);
  const existingGroupIds = new Set(
    combatants.filter((c) => memberIdSet.has(c.id) && c.groupId).map((c) => c.groupId as string),
  );

  const groupId = existingGroupIds.size === 1 ? [...existingGroupIds][0] : crypto.randomUUID();
  const group: InitiativeGroup = { id: groupId, label: opts.label, initiative: opts.initiative, combined: opts.combined };

  // Sync every member of a retained group, not just the newly selected ones - otherwise a member
  // that was already in the group but wasn't part of this selection keeps its old initiative while
  // the group record moves to the new one, desyncing the "shared roll" the group is supposed to be.
  const nextCombatants = combatants.map((c) =>
    memberIdSet.has(c.id) || c.groupId === groupId ? { ...c, groupId, initiative: opts.initiative } : c,
  );
  const nextGroups = [...groups.filter((g) => g.id !== groupId), group];

  return { combatants: nextCombatants, groups: nextGroups };
}

/** Dissolves a group: members keep their last-synced initiative as an independent value. */
export function dissolveGroup(
  combatants: Combatant[],
  groups: InitiativeGroup[],
  groupId: string,
): { combatants: Combatant[]; groups: InitiativeGroup[] } {
  return {
    combatants: combatants.map((c) => (c.groupId === groupId ? { ...c, groupId: undefined } : c)),
    groups: groups.filter((g) => g.id !== groupId),
  };
}

/** Drops groups with zero remaining members - keeps state tidy after a combatant is removed. */
export function pruneEmptyGroups(combatants: Combatant[], groups: InitiativeGroup[]): InitiativeGroup[] {
  const liveGroupIds = new Set(combatants.flatMap((c) => (c.groupId ? [c.groupId] : [])));
  return groups.filter((g) => liveGroupIds.has(g.id));
}
