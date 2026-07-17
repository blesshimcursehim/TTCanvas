// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type {
  AbilityScores, BestiaryCreatureRef, SharedPartyMember, NpcRef, CombatantKind,
} from "@ttcanvas/core";
import { rollInitiative, buildCombatants, type CombatSources } from "./combat";
import type { Encounter, EncounterMember } from "./types";

function creature(
  id: string, name: string, hp = 10, ac = 12, portrait?: string, abilityScores?: AbilityScores,
): BestiaryCreatureRef {
  return { id, name, cr: "1", hp, ac, portrait, abilityScores };
}
function pc(
  id: string, name: string, initiative = 0, portraitPath?: string, abilityScores?: AbilityScores,
): SharedPartyMember {
  return { id, name, hp: 20, maxHp: 20, ac: 15, initiative, portraitPath, abilityScores };
}
function npc(
  filename: string, name: string, hp = 12, ac = 13, abilityScores?: AbilityScores,
): NpcRef {
  return { filename, id: `id-${filename}`, name, hp, ac, abilityScores };
}

function bestiaryMember(creatureId: string, name: string, count = 1, groupInit = false): EncounterMember {
  return { id: `m-${creatureId}`, source: { kind: "bestiary", id: creatureId }, name, count, groupInit };
}
function partyMember(id: string, name: string): EncounterMember {
  return { id: `m-${id}`, source: { kind: "party", id }, name, count: 1 };
}
function npcMember(filename: string, name: string, count = 1, kind?: CombatantKind): EncounterMember {
  return { id: `m-${filename}`, source: { kind: "npc", id: filename }, name, count, kind };
}

function encounter(members: EncounterMember[]): Encounter {
  return { id: "e1", name: "Test", members };
}
function sources(parts: {
  bestiary?: BestiaryCreatureRef[]; party?: SharedPartyMember[]; npcs?: NpcRef[];
} = {}): CombatSources {
  return {
    bestiary: new Map((parts.bestiary ?? []).map((c) => [c.id, c])),
    party: new Map((parts.party ?? []).map((m) => [m.id, m])),
    npcs: new Map((parts.npcs ?? []).map((n) => [n.filename, n])),
  };
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
  const opts = { autoRoll: false };

  it("expands a member's count and numbers the copies", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 3)]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("g", "Goblin")] }), opts);
    expect(combatants.map((c) => c.name)).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]);
  });

  it("does not number a solo creature", () => {
    const e = encounter([bestiaryMember("b", "Bugbear")]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("b", "Bugbear")] }), opts);
    expect(combatants).toHaveLength(1);
    expect(combatants[0].name).toBe("Bugbear");
  });

  it("copies live creature stats onto a foe combatant", () => {
    const e = encounter([bestiaryMember("o", "Ogre")]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("o", "Ogre", 59, 11)] }), opts);
    expect(combatants[0]).toMatchObject({ hp: 59, maxHp: 59, ac: 11, kind: "foe", initiative: 0 });
  });

  it("carries a creature's portrait (data URL) onto its foe combatants", () => {
    const e = encounter([bestiaryMember("g", "Goblin")]);
    const { combatants } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin", 7, 15, "data:image/jpeg;base64,AAAA")] }), opts,
    );
    expect(combatants[0].portraitPath).toBe("data:image/jpeg;base64,AAAA");
  });

  it("carries a party member's portrait path onto its PC combatant", () => {
    const e = encounter([partyMember("p1", "Aria")]);
    const { combatants } = buildCombatants(e, sources({ party: [pc("p1", "Aria", 12, "portraits/p1.jpg")] }), opts);
    expect(combatants[0].portraitPath).toBe("portraits/p1.jpg");
  });

  it("skips a member whose creature is missing and counts it", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 2), bestiaryMember("ghost", "Deleted")]);
    const { combatants, missing } = buildCombatants(e, sources({ bestiary: [creature("g", "Goblin")] }), opts);
    expect(combatants).toHaveLength(2); // only the 2 goblins
    expect(missing).toBe(1);
  });

  it("adds everyone at initiative 0 when autoRoll is off", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 2)]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("g", "Goblin")] }), opts);
    expect(combatants.every((c) => c.initiative === 0)).toBe(true);
  });

  it("rolls a d20 per foe when autoRoll is on", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 2)]);
    const { combatants } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin")] }), { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants.map((c) => c.initiative)).toEqual([20, 20]);
  });

  it("adds a foe's DEX modifier to an auto-rolled initiative", () => {
    const e = encounter([bestiaryMember("g", "Goblin")]);
    const { combatants } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin", 10, 12, undefined, dex(18))] }),
      { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20 + 4); // dex 18 -> +4
  });

  it("treats a foe with no abilityScores as +0 (regression guard)", () => {
    const e = encounter([bestiaryMember("g", "Goblin")]);
    const { combatants } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin")] }), { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20);
  });

  it("adds a party member's DEX modifier to an auto-rolled initiative", () => {
    const e = encounter([partyMember("p1", "Aria")]);
    const { combatants } = buildCombatants(
      e, sources({ party: [pc("p1", "Aria", 0, undefined, dex(14))] }), { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20 + 2); // dex 14 -> +2
  });

  it("includes a foe's DEX modifier in a group's shared roll", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 3, true)]);
    const { combatants, groups } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin", 10, 12, undefined, dex(16))] }),
      { autoRoll: true }, rngConst(0.999),
    );
    expect(groups[0].initiative).toBe(20 + 3); // dex 16 -> +3
    expect(combatants.every((c) => c.initiative === 23)).toBe(true);
  });

  it("adds the party as PCs using their stored initiative", () => {
    const e = encounter([bestiaryMember("g", "Goblin"), partyMember("p1", "Aria")]);
    const { combatants } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin")], party: [pc("p1", "Aria", 15)] }), opts,
    );
    const aria = combatants.find((c) => c.name === "Aria");
    expect(aria).toMatchObject({ kind: "pc", initiative: 15, sourceId: "p1" });
  });

  it("rolls for a party member whose stored initiative is 0 when autoRoll is on", () => {
    const e = encounter([partyMember("p1", "Aria")]);
    const { combatants } = buildCombatants(
      e, sources({ party: [pc("p1", "Aria", 0)] }), { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(20);
  });

  it("keeps a party member's nonzero initiative even when autoRoll is on", () => {
    const e = encounter([partyMember("p1", "Aria")]);
    const { combatants } = buildCombatants(
      e, sources({ party: [pc("p1", "Aria", 7)] }), { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants[0].initiative).toBe(7);
  });

  it("rolls a shared initiative once for a groupInit count>1 member and returns a combined group", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 4, true)]);
    const { combatants, groups } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin")] }), { autoRoll: true }, rngConst(0.999),
    );
    expect(combatants.map((c) => c.initiative)).toEqual([20, 20, 20, 20]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: "Goblin", initiative: 20, combined: true });
    expect(combatants.every((c) => c.groupId === groups[0].id)).toBe(true);
  });

  it("does not group a solo creature even when groupInit is set (count 1 is meaningless)", () => {
    const e = encounter([bestiaryMember("b", "Bugbear", 1, true)]);
    const { combatants, groups } = buildCombatants(e, sources({ bestiary: [creature("b", "Bugbear")] }), opts);
    expect(groups).toHaveLength(0);
    expect(combatants[0].groupId).toBeUndefined();
  });

  it("leaves ungrouped members without a groupId alongside a grouped one", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 3, true), bestiaryMember("o", "Ogre", 2, false)]);
    const { combatants, groups } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin"), creature("o", "Ogre")] }), opts,
    );
    expect(groups).toHaveLength(1);
    const goblins = combatants.filter((c) => c.name.startsWith("Goblin"));
    const ogres = combatants.filter((c) => c.name.startsWith("Ogre"));
    expect(goblins.every((c) => c.groupId === groups[0].id)).toBe(true);
    expect(ogres.every((c) => c.groupId === undefined)).toBe(true);
  });

  // ── Source kinds ──────────────────────────────────────────

  it("resolves each source kind to the right combatant kind", () => {
    const e = encounter([bestiaryMember("g", "Goblin"), partyMember("p1", "Aria"), npcMember("npcs/vex.json", "Vex")]);
    const { combatants } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin")], party: [pc("p1", "Aria")], npcs: [npc("npcs/vex.json", "Vex")] }),
      opts,
    );
    // An NPC with no explicit side defaults to foe.
    expect(combatants.map((c) => c.kind)).toEqual(["foe", "pc", "foe"]);
  });

  it("honours an NPC row's kind for an ally, defaulting to foe", () => {
    const e = encounter([npcMember("npcs/vex.json", "Vex", 1, "ally"), npcMember("npcs/rook.json", "Rook")]);
    const { combatants } = buildCombatants(
      e, sources({ npcs: [npc("npcs/vex.json", "Vex"), npc("npcs/rook.json", "Rook")] }), opts,
    );
    expect(combatants.find((c) => c.name === "Vex")?.kind).toBe("ally");
    expect(combatants.find((c) => c.name === "Rook")?.kind).toBe("foe");
  });

  it("copies an NPC's stats, falling back for a statblock-less NPC", () => {
    const e = encounter([npcMember("npcs/vex.json", "Vex")]);
    const { combatants } = buildCombatants(e, sources({ npcs: [{ filename: "npcs/vex.json", id: "x", name: "Vex" }] }), opts);
    expect(combatants[0]).toMatchObject({ hp: 0, maxHp: 0, ac: 10 });
  });

  it("skips a missing party member or NPC and counts it, like a missing creature", () => {
    const e = encounter([partyMember("gone", "Ghost"), npcMember("npcs/gone.json", "Vanished")]);
    const { combatants, missing } = buildCombatants(e, sources(), opts);
    expect(combatants).toHaveLength(0);
    expect(missing).toBe(2);
  });

  it("pins a party row's count to 1 even if the stored count is higher", () => {
    const e = encounter([{ ...partyMember("p1", "Aria"), count: 3 }]);
    const { combatants } = buildCombatants(e, sources({ party: [pc("p1", "Aria")] }), opts);
    expect(combatants).toHaveLength(1);
    expect(combatants[0].name).toBe("Aria"); // not "Aria 1"
  });

  // ── The sourceId rule: only a sole instance of an *individual* source gets an identity ──

  it("leaves sourceId unset on foes, even with count>1, so each instance can be linked to its own map token", () => {
    const e = encounter([bestiaryMember("g", "Goblin", 2)]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("g", "Goblin")] }), opts);
    expect(combatants.every((c) => c.sourceId === undefined)).toBe(true);
  });

  it("leaves sourceId unset on a solo bestiary foe too - the entry is a template, and two builds could each spawn one", () => {
    const e = encounter([bestiaryMember("b", "Bugbear", 1)]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("b", "Bugbear")] }), opts);
    expect(combatants[0].sourceId).toBeUndefined();
  });

  it("sets sourceId on a party member, who is an individual", () => {
    const e = encounter([partyMember("p1", "Aria")]);
    const { combatants } = buildCombatants(e, sources({ party: [pc("p1", "Aria")] }), opts);
    expect(combatants[0].sourceId).toBe("p1");
  });

  it("sets sourceId on a solo NPC (an individual), keyed by filename", () => {
    const e = encounter([npcMember("npcs/vex.json", "Vex")]);
    const { combatants } = buildCombatants(e, sources({ npcs: [npc("npcs/vex.json", "Vex")] }), opts);
    expect(combatants[0].sourceId).toBe("npcs/vex.json");
  });

  it("leaves sourceId unset on a count>1 NPC, which is being used as a template", () => {
    const e = encounter([npcMember("npcs/fanatic.json", "Cult Fanatic", 3)]);
    const { combatants } = buildCombatants(e, sources({ npcs: [npc("npcs/fanatic.json", "Cult Fanatic")] }), opts);
    expect(combatants).toHaveLength(3);
    expect(combatants.every((c) => c.sourceId === undefined)).toBe(true);
  });

  // ── Inclusion ─────────────────────────────────────────────

  it("skips an excluded member without counting it as missing", () => {
    const e = encounter([
      { ...bestiaryMember("g", "Goblin", 2), included: false },
      bestiaryMember("o", "Ogre"),
    ]);
    const { combatants, missing } = buildCombatants(
      e, sources({ bestiary: [creature("g", "Goblin"), creature("o", "Ogre")] }), opts,
    );
    expect(combatants.map((c) => c.name)).toEqual(["Ogre"]);
    expect(missing).toBe(0);
  });

  it("treats an absent `included` as included (back-compat with rows saved before the toggle)", () => {
    const e = encounter([bestiaryMember("g", "Goblin")]);
    const { combatants } = buildCombatants(e, sources({ bestiary: [creature("g", "Goblin")] }), opts);
    expect(combatants).toHaveLength(1);
  });
});
