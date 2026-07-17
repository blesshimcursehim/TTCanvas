// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure logic for the end-combat review: given the tracker's combatants and the live party roster,
// works out each party member's HP change to hand back, and buckets everyone else as "not carried
// back". No React, no side effects - unit-tested like combat.ts / groups.ts.

import type { Combatant, CombatantKind, SharedPartyMember } from "@ttcanvas/core";

export interface PartyHpDelta {
  memberId: string;
  name: string;
  /** The Party Tracker's current HP. */
  before: number;
  /** The combatant's HP, clamped to [0, maxHp] (the Party Tracker doesn't model negative HP). */
  after: number;
  maxHp: number;
  changed: boolean;
  /** Shown in the review, never applied - PartyMember has no conditions field. */
  conditions: string[];
  /** 2+ combatants claim this member (reachable on saves from the old always-additive add). The
   *  first is shown; the review warns rather than silently picking last-wins. */
  ambiguous: boolean;
}

export interface UnlinkedCombatant {
  name: string;
  kind: CombatantKind;
  hp: number;
  maxHp: number;
  conditions: string[];
  /** Why it can't be handed back - drives how the review groups it. */
  reason: "foe" | "npc-or-ally" | "unlinked-pc" | "member-gone";
}

export interface EndCombatReview {
  party: PartyHpDelta[];
  unlinked: UnlinkedCombatant[];
}

/**
 * Splits the combatants into party-HP deltas to hand back and everything else. A combatant maps to a
 * party member only when it is a PC carrying a sourceId that matches a live roster member; its HP is
 * clamped into [0, maxHp]. Foes, allies/NPCs, hand-added PCs (no sourceId) and PCs whose member was
 * since deleted all fall into `unlinked` with a reason. Conditions travel through for display only.
 */
export function buildEndCombatReview(
  combatants: Combatant[],
  party: SharedPartyMember[],
): EndCombatReview {
  const byId = new Map(party.map((m) => [m.id, m]));
  const partyDeltas: PartyHpDelta[] = [];
  const deltaByMember = new Map<string, PartyHpDelta>();
  const unlinked: UnlinkedCombatant[] = [];

  for (const c of combatants) {
    const conditions = c.conditions ?? [];
    const member = c.kind === "pc" && c.sourceId ? byId.get(c.sourceId) : undefined;

    if (member) {
      const existing = deltaByMember.get(member.id);
      if (existing) {
        // A second combatant claims the same PC - keep the first, flag the ambiguity.
        existing.ambiguous = true;
        continue;
      }
      const after = Math.max(0, Math.min(c.hp, member.maxHp));
      const delta: PartyHpDelta = {
        memberId: member.id,
        name: member.name,
        before: member.hp,
        after,
        maxHp: member.maxHp,
        changed: member.hp !== after,
        conditions,
        ambiguous: false,
      };
      partyDeltas.push(delta);
      deltaByMember.set(member.id, delta);
      continue;
    }

    const reason: UnlinkedCombatant["reason"] =
      c.kind === "foe" ? "foe"
        : c.kind === "ally" ? "npc-or-ally"
          : c.sourceId ? "member-gone" // a PC whose party member was deleted mid-combat
            : "unlinked-pc";           // a PC added by hand, with no link back to the roster
    unlinked.push({ name: c.name, kind: c.kind, hp: c.hp, maxHp: c.maxHp, conditions, reason });
  }

  return { party: partyDeltas, unlinked };
}
