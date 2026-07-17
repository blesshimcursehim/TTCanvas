// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { Combatant, CombatantKind, SharedPartyMember } from "@ttcanvas/core";
import { buildEndCombatReview } from "./endCombat";

function combatant(over: Partial<Combatant> & Pick<Combatant, "id" | "name">): Combatant {
  return { initiative: 10, hp: 10, maxHp: 10, ac: 12, kind: "foe" as CombatantKind, ...over };
}
function pcCombatant(id: string, name: string, hp: number, sourceId: string, conditions?: string[]): Combatant {
  return combatant({ id, name, hp, maxHp: 30, kind: "pc", sourceId, conditions });
}
function member(id: string, name: string, hp: number, maxHp = 30): SharedPartyMember {
  return { id, name, hp, maxHp, ac: 15, initiative: 0, level: 1 };
}

describe("buildEndCombatReview", () => {
  it("reports a changed party member's HP delta", () => {
    const review = buildEndCombatReview([pcCombatant("c1", "Aria", 9, "p1")], [member("p1", "Aria", 24)]);
    expect(review.party).toEqual([
      { memberId: "p1", name: "Aria", before: 24, after: 9, maxHp: 30, changed: true, conditions: [], ambiguous: false },
    ]);
    expect(review.unlinked).toEqual([]);
  });

  it("marks an unchanged member changed:false but still lists it", () => {
    const review = buildEndCombatReview([pcCombatant("c1", "Borin", 18, "p1")], [member("p1", "Borin", 18)]);
    expect(review.party[0]).toMatchObject({ before: 18, after: 18, changed: false });
  });

  it("clamps HP above maxHp down to maxHp", () => {
    const review = buildEndCombatReview([pcCombatant("c1", "Aria", 99, "p1")], [member("p1", "Aria", 20, 30)]);
    expect(review.party[0].after).toBe(30);
  });

  it("clamps negative HP up to 0 (the roster has no negative HP)", () => {
    const review = buildEndCombatReview([pcCombatant("c1", "Cass", -4, "p1")], [member("p1", "Cass", 12)]);
    expect(review.party[0].after).toBe(0);
  });

  it("carries a PC's remaining conditions through for display", () => {
    const review = buildEndCombatReview([pcCombatant("c1", "Aria", 9, "p1", ["Poisoned"])], [member("p1", "Aria", 24)]);
    expect(review.party[0].conditions).toEqual(["Poisoned"]);
  });

  it("buckets a foe as not-carried-back", () => {
    const review = buildEndCombatReview([combatant({ id: "g", name: "Goblin", kind: "foe" })], []);
    expect(review.party).toEqual([]);
    expect(review.unlinked).toEqual([{ name: "Goblin", kind: "foe", hp: 10, maxHp: 10, conditions: [], reason: "foe" }]);
  });

  it("buckets an ally / NPC-sourced combatant separately from a foe", () => {
    const review = buildEndCombatReview([combatant({ id: "v", name: "Vex", kind: "ally", sourceId: "npcs/vex.json" })], []);
    expect(review.unlinked[0]).toMatchObject({ name: "Vex", reason: "npc-or-ally" });
  });

  it("buckets a hand-added PC (no sourceId) as unlinked-pc", () => {
    const review = buildEndCombatReview([combatant({ id: "x", name: "Guest", kind: "pc" })], []);
    expect(review.unlinked[0]).toMatchObject({ name: "Guest", reason: "unlinked-pc" });
  });

  it("buckets a PC whose party member was deleted as member-gone", () => {
    const review = buildEndCombatReview([pcCombatant("c1", "Ghost", 5, "p-deleted")], [member("p1", "Aria", 20)]);
    expect(review.party).toEqual([]);
    expect(review.unlinked[0]).toMatchObject({ name: "Ghost", reason: "member-gone" });
  });

  it("flags a member claimed by two combatants ambiguous and keeps the first", () => {
    const review = buildEndCombatReview(
      [pcCombatant("c1", "Aria", 11, "p1"), pcCombatant("c2", "Aria (dup)", 3, "p1")],
      [member("p1", "Aria", 24)],
    );
    expect(review.party).toHaveLength(1);
    expect(review.party[0]).toMatchObject({ after: 11, ambiguous: true });
    expect(review.unlinked).toEqual([]); // the duplicate isn't re-bucketed
  });

  it("returns empty lists for an empty combat", () => {
    expect(buildEndCombatReview([], [member("p1", "Aria", 20)])).toEqual({ party: [], unlinked: [] });
  });

  it("handles a mixed combat end to end", () => {
    const review = buildEndCombatReview(
      [
        pcCombatant("c1", "Aria", 9, "p1", ["Poisoned"]),
        pcCombatant("c2", "Borin", 18, "p2"),
        combatant({ id: "g1", name: "Goblin 1", kind: "foe" }),
        combatant({ id: "a1", name: "Sidekick", kind: "ally" }),
      ],
      [member("p1", "Aria", 24), member("p2", "Borin", 18), member("p3", "Cass", 30)],
    );
    expect(review.party.map((d) => [d.name, d.after, d.changed])).toEqual([
      ["Aria", 9, true],
      ["Borin", 18, false],
    ]);
    expect(review.unlinked.map((u) => u.reason)).toEqual(["foe", "npc-or-ally"]);
  });
});
