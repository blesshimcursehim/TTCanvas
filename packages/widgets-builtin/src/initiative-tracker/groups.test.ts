// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { buildTurnOrder, syncGroupInitiative, createGroup, dissolveGroup, pruneEmptyGroups } from "./groups";
import type { Combatant, InitiativeGroup } from "./types";

function combatant(overrides: Partial<Combatant> & { id: string }): Combatant {
  return { name: overrides.id, initiative: 0, hp: 10, maxHp: 10, ac: 10, kind: "foe", ...overrides };
}

describe("buildTurnOrder", () => {
  it("keeps ungrouped combatants as individual entries, sorted by initiative", () => {
    const combatants = [combatant({ id: "a", initiative: 5 }), combatant({ id: "b", initiative: 15 })];
    const order = buildTurnOrder(combatants, []);
    expect(order.map((e) => e.id)).toEqual(["b", "a"]);
    expect(order.every((e) => e.kind === "combatant")).toBe(true);
  });

  it("collapses a combined group into one entry at the group's initiative", () => {
    const group: InitiativeGroup = { id: "g1", label: "Goblins", initiative: 12, combined: true };
    const combatants = [
      combatant({ id: "a", initiative: 5 }),
      combatant({ id: "g1a", initiative: 12, groupId: "g1" }),
      combatant({ id: "g1b", initiative: 12, groupId: "g1" }),
    ];
    const order = buildTurnOrder(combatants, [group]);
    expect(order.map((e) => e.id)).toEqual(["g1", "a"]);
    const groupEntry = order[0];
    expect(groupEntry.kind).toBe("group");
    if (groupEntry.kind === "group") {
      expect(groupEntry.members.map((m) => m.id)).toEqual(["g1a", "g1b"]);
    }
  });

  it("keeps a separate group's members as individual entries clustered by initiative", () => {
    const group: InitiativeGroup = { id: "g1", label: "Goblins", initiative: 12, combined: false };
    const combatants = [
      combatant({ id: "g1a", initiative: 12, groupId: "g1" }),
      combatant({ id: "g1b", initiative: 12, groupId: "g1" }),
      combatant({ id: "b", initiative: 20 }),
    ];
    const order = buildTurnOrder(combatants, [group]);
    expect(order.map((e) => e.id)).toEqual(["b", "g1a", "g1b"]);
    expect(order.every((e) => e.kind === "combatant")).toBe(true);
  });
});

describe("syncGroupInitiative", () => {
  it("propagates a new value to every member, leaving others untouched", () => {
    const combatants = [
      combatant({ id: "a", initiative: 1, groupId: "g1" }),
      combatant({ id: "b", initiative: 1, groupId: "g1" }),
      combatant({ id: "c", initiative: 9 }),
    ];
    const next = syncGroupInitiative(combatants, "g1", 18);
    expect(next.find((c) => c.id === "a")?.initiative).toBe(18);
    expect(next.find((c) => c.id === "b")?.initiative).toBe(18);
    expect(next.find((c) => c.id === "c")?.initiative).toBe(9);
  });
});

describe("createGroup", () => {
  it("creates a new group from ungrouped combatants and sets their initiative", () => {
    const combatants = [combatant({ id: "a", initiative: 3 }), combatant({ id: "b", initiative: 7 })];
    const { combatants: nextCombatants, groups } = createGroup(combatants, [], ["a", "b"], {
      label: "Goblins", initiative: 15, combined: true,
    });
    expect(groups).toHaveLength(1);
    expect(nextCombatants.every((c) => c.groupId === groups[0].id && c.initiative === 15)).toBe(true);
  });

  it("merges into an existing group when exactly one selected member already belongs to one", () => {
    const existing: InitiativeGroup = { id: "g1", label: "Goblins", initiative: 12, combined: true };
    const combatants = [
      combatant({ id: "a", initiative: 12, groupId: "g1" }),
      combatant({ id: "c", initiative: 9 }),
    ];
    const { combatants: nextCombatants, groups } = createGroup(combatants, [existing], ["a", "c"], {
      label: "Goblins", initiative: 12, combined: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("g1");
    expect(nextCombatants.find((c) => c.id === "c")?.groupId).toBe("g1");
  });

  it("syncs every existing member of a retained group, not just the ones newly selected", () => {
    const existing: InitiativeGroup = { id: "g1", label: "Goblins", initiative: 12, combined: true };
    const combatants = [
      combatant({ id: "a", initiative: 12, groupId: "g1" }), // selected
      combatant({ id: "b", initiative: 12, groupId: "g1" }), // already in g1, NOT selected this time
      combatant({ id: "c", initiative: 9 }), // new arrival, selected
    ];
    const { combatants: nextCombatants, groups } = createGroup(combatants, [existing], ["a", "c"], {
      label: "Goblins", initiative: 18, combined: true,
    });
    expect(groups).toHaveLength(1);
    // "b" wasn't part of this selection but is still a member of the retained group - it must not
    // be left behind at the old initiative once the group's shared roll changes.
    expect(nextCombatants.find((c) => c.id === "b")).toMatchObject({ groupId: "g1", initiative: 18 });
    expect(nextCombatants.every((c) => c.groupId === "g1" && c.initiative === 18)).toBe(true);
  });
});

describe("dissolveGroup", () => {
  it("clears groupId on members and removes the group, keeping the last synced initiative", () => {
    const group: InitiativeGroup = { id: "g1", label: "Goblins", initiative: 14, combined: true };
    const combatants = [
      combatant({ id: "a", initiative: 14, groupId: "g1" }),
      combatant({ id: "b", initiative: 14, groupId: "g1" }),
    ];
    const { combatants: next, groups } = dissolveGroup(combatants, [group], "g1");
    expect(groups).toEqual([]);
    expect(next.every((c) => c.groupId === undefined && c.initiative === 14)).toBe(true);
  });
});

describe("pruneEmptyGroups", () => {
  it("drops a group with zero remaining members", () => {
    const groups: InitiativeGroup[] = [
      { id: "g1", label: "Goblins", initiative: 12, combined: true },
      { id: "g2", label: "Wolves", initiative: 8, combined: true },
    ];
    const combatants = [combatant({ id: "a", initiative: 8, groupId: "g2" })];
    expect(pruneEmptyGroups(combatants, groups).map((g) => g.id)).toEqual(["g2"]);
  });
});
