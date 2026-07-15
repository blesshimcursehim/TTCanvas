// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { AbilityScores, BestiaryCreatureRef, SharedPartyMember } from "@ttcanvas/core";
import { rollInitiative, buildCombatants } from "./combat";
import type { Encounter, EncounterMember } from "./types";

function creature(
  id: string, name: string, hp = 10, ac = 12, portrait?: string, abilityScores?: AbilityScores,
): BestiaryCreatureRef {
  return { id, name, cr: "1", hp, ac, portrait, abilityScores };
}
function member(creatureId: string, name: string, count = 1, groupInit = false): EncounterMember {
  return { id: `m-${creatureId}`, creatureId, name, count, groupInit };
}
function encounter(members: EncounterMember[]): Encounter {
  return { id: "e1", name: "Test", members };
}
function byId(...cs: BestiaryCreatureRef[]): Map<string, BestiaryCreatureRef> {
  return new Map(cs.map((c) => [c.id, c]));
}
function pc(
  id: string, name: string, initiative = 0, portraitPath?: string, abilityScores?: AbilityScores,
): SharedPartyMember {
  return { id, name, hp: 20, maxHp: 20, ac: 15, initiative, portraitPath, abilityScores };
}
/** A minimal AbilityScores with just dex set meaningfully - the other scores are irrelevant to these tests. */
function dex(score: number): AbilityScores {
  return { str: 10, dex: score, con: 10, int: 10, wis: 10, cha: 10 };
}

/** A deterministic rng that yields exactly `value` in [0,1). */
const rngConst = (value: number) => () => value;

describe("rollInitiative", () => {
  it("maps rng 0 to 1 (low end of a d20)", () => {
    expect(rollInitiative(rngConst(0))).toBe(1);
  });
  it("maps rng just below 1 to 20 (high end)", () => {
    expect(rollInitiative(rngConst(0.999))).toBe(20);
  });
});

describe("buildCombatants", () => {
  const opts = { addParty: false, autoRoll: false };

  it("expands a member's count and numbers the copies", () => {
    const e = encounter([member("g", "Goblin", 3)]);
    const { combatants } = buildCombatants(e, byId(creature("g", "Goblin")), [], opts);
    expect(combatants.map((c) => c.name)).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]);
  });

  it("does not number a solo creature", () => {
    const e = encounter([member("b", "Bugbear")]);
    const { combatants } = buildCombatants(e, byId(creature("b", "Bugbear")), [], opts);
    expect(combatants).toHaveLength(1);
    expect(combatants[0].name).toBe("Bugbear");
  });

  it("copies live creature stats onto a foe combatant", () => {
    const e = encounter([member("o", "Ogre")]);
    const { combatants } = buildCombatants(e, byId(creature("o", "Ogre", 59, 11)), [], opts);
    expect(combatants[0]).toMatchObject({ hp: 59, maxHp: 59, ac: 11, kind: "foe", initiative: 0 });
  });

  it("leaves sourceId unset on foes, even with count>1, so each instance can be linked to its own map token", () => {
    const e = encounter([member("g", "Goblin", 2)]);
    const { combatants } = buildCombatants(e, byId(creature("g", "Goblin")), [], opts);
    expect(combatants.every((c) => c.sourceId === undefined)).toBe(true);
  });

  it("carries a creature's portrait (data URL) onto its foe combatants", () => {
    const e = encounter([member("g", "Goblin")]);
    const { combatants } = buildCombatants(e, byId(creature("g", "Goblin", 7, 15, "data:image/jpeg;base64,AAAA")), [], opts);
    expect(combatants[0].portraitPath).toBe("data:image/jpeg;base64,AAAA");
  });

  it("carries a party member's portrait path onto its PC combatant", () => {
    const e = encounter([]);
    const { combatants } = buildCombatants(
      e, byId(), [pc("p1", "Aria", 12, "portraits/p1.jpg")],
      { addParty: true, autoRoll: false },
    );
    expect(combatants[0].portraitPath).toBe("portraits/p1.jpg");
  });

  it("skips a member whose creature is missing and counts it", () => {
    const e = encounter([member("g", "Goblin", 2), member("ghost", "Deleted")]);
    const { combatants, missing } = buildCombatants(e, byId(creature("g", "Goblin")), [], opts);
    expect(combatants).toHaveLength(2); // only the 2 goblins
    expect(missing).toBe(1);
  });

  it("adds everyone at initiative 0 when autoRoll is off", () => {
    const e = encounter([member("g", "Goblin", 2)]);
    const { combatants } = buildCombatants(e, byId(creature("g", "Goblin")), [], opts);
    expect(combatants.every((c) => c.initiative === 0)).toBe(true);
  });

  it("rolls a d20 per foe when autoRoll is on", () => {
    const e = encounter([member("g", "Goblin", 2)]);
    const { combatants } = buildCombatants(e, byId(creature("g", "Goblin")), [], { addParty: false, autoRoll: true }, rngConst(0.999));
    expect(combatants.map((c) => c.initiative)).toEqual([20, 20]);
  });

  it("adds a foe's DEX modifier to an auto-rolled initiative", () => {
    const e = encounter([member("g", "Goblin")]);
    const { combatants } = buildCombatants(
      e, byId(creature("g", "Goblin", 10, 12, undefined, dex(18))), [],
      { addParty: false, autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20 + 4); // dex 18 -> +4
  });

  it("treats a foe with no abilityScores as +0 (regression guard)", () => {
    const e = encounter([member("g", "Goblin")]);
    const { combatants } = buildCombatants(
      e, byId(creature("g", "Goblin")), [], { addParty: false, autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20);
  });

  it("adds a party member's DEX modifier to an auto-rolled initiative", () => {
    const e = encounter([]);
    const { combatants } = buildCombatants(
      e, byId(), [pc("p1", "Aria", 0, undefined, dex(14))],
      { addParty: true, autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20 + 2); // dex 14 -> +2
  });

  it("includes a foe's DEX modifier in a group's shared roll", () => {
    const e = encounter([member("g", "Goblin", 3, true)]);
    const { combatants, groups } = buildCombatants(
      e, byId(creature("g", "Goblin", 10, 12, undefined, dex(16))), [],
      { addParty: false, autoRoll: true }, rngConst(0.999),
    );
    expect(groups[0].initiative).toBe(20 + 3); // dex 16 -> +3
    expect(combatants.every((c) => c.initiative === 23)).toBe(true);
  });

  it("does not append the party when addParty is off", () => {
    const e = encounter([member("g", "Goblin")]);
    const { combatants } = buildCombatants(e, byId(creature("g", "Goblin")), [pc("p1", "Aria", 15)], opts);
    expect(combatants).toHaveLength(1);
    expect(combatants[0].kind).toBe("foe");
  });

  it("appends the party as PCs using their stored initiative when addParty is on", () => {
    const e = encounter([member("g", "Goblin")]);
    const { combatants } = buildCombatants(
      e, byId(creature("g", "Goblin")), [pc("p1", "Aria", 15)],
      { addParty: true, autoRoll: false },
    );
    const aria = combatants.find((c) => c.name === "Aria");
    expect(aria).toMatchObject({ kind: "pc", initiative: 15, sourceId: "p1" });
  });

  it("rolls for a party member whose stored initiative is 0 when autoRoll is on", () => {
    const e = encounter([]);
    const { combatants } = buildCombatants(
      e, byId(), [pc("p1", "Aria", 0)],
      { addParty: true, autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20);
  });

  it("keeps a party member's nonzero initiative even when autoRoll is on", () => {
    const e = encounter([]);
    const { combatants } = buildCombatants(
      e, byId(), [pc("p1", "Aria", 7)],
      { addParty: true, autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(7);
  });

  it("rolls a shared initiative once for a groupInit count>1 member and returns a combined group", () => {
    const e = encounter([member("g", "Goblin", 4, true)]);
    const { combatants, groups } = buildCombatants(
      e, byId(creature("g", "Goblin")), [], { addParty: false, autoRoll: true }, rngConst(0.999),
    );
    expect(combatants.map((c) => c.initiative)).toEqual([20, 20, 20, 20]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: "Goblin", initiative: 20, combined: true });
    expect(combatants.every((c) => c.groupId === groups[0].id)).toBe(true);
  });

  it("does not group a solo creature even when groupInit is set (count 1 is meaningless)", () => {
    const e = encounter([member("b", "Bugbear", 1, true)]);
    const { combatants, groups } = buildCombatants(e, byId(creature("b", "Bugbear")), [], opts);
    expect(groups).toHaveLength(0);
    expect(combatants[0].groupId).toBeUndefined();
  });

  it("leaves ungrouped members without a groupId alongside a grouped one", () => {
    const e = encounter([member("g", "Goblin", 3, true), member("o", "Ogre", 2, false)]);
    const { combatants, groups } = buildCombatants(e, byId(creature("g", "Goblin"), creature("o", "Ogre")), [], opts);
    expect(groups).toHaveLength(1);
    const goblins = combatants.filter((c) => c.name.startsWith("Goblin"));
    const ogres = combatants.filter((c) => c.name.startsWith("Ogre"));
    expect(goblins.every((c) => c.groupId === groups[0].id)).toBe(true);
    expect(ogres.every((c) => c.groupId === undefined)).toBe(true);
  });
});
