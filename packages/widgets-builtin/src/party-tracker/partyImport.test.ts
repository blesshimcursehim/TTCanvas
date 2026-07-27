// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { dedupe } from "../shared/importExport";
import { validatePartyBundle, partyMemberContentKey, normalizeMember } from "./partyImport";
import type { PartyMember } from "./types";

// Minimal valid member; overrides fill in the fields a given test cares about.
const member = (over: Partial<PartyMember> & { id: string; name: string }): PartyMember =>
  ({
    race: "",
    cls: "",
    level: 1,
    hp: 10,
    maxHp: 10,
    ac: 10,
    initiative: 0,
    sp: 0,
    maxSp: 0,
    pp: 10,
    gp: 0,
    notes: "",
    inspiration: false,
    ...over,
  }) as PartyMember;

describe("normalizeMember", () => {
  it("drops a member without a string id or non-empty name", () => {
    expect(normalizeMember({ name: "no id" })).toBeNull();
    expect(normalizeMember({ id: "1", name: "   " })).toBeNull();
    expect(normalizeMember({ id: 5, name: "num id" })).toBeNull();
    expect(normalizeMember(null)).toBeNull();
  });

  it("coerces wrong-typed fields the UI touches so they can't crash a consumer", () => {
    const norm = normalizeMember({
      id: "1",
      name: "Aria",
      portraitPath: 42, // would crash on .split()
      portraitFullPath: { nope: true },
      customFields: "not an array", // would crash on .map()
      hp: "80", // wrong type
      level: null,
    });
    expect(norm).not.toBeNull();
    // Bad portrait paths become null (the modal guards on falsy), never a number.
    expect(norm?.portraitPath).toBeNull();
    expect(norm?.portraitFullPath).toBeNull();
    // A non-array customFields is dropped, not passed through.
    expect(norm?.customFields).toBeUndefined();
    // Wrong-typed scalars fall back to their defaults.
    expect(norm?.hp).toBe(0);
    expect(norm?.level).toBe(1);
  });

  it("keeps valid fields, including a good portrait path and custom fields", () => {
    const norm = normalizeMember({
      id: "1",
      name: "Aria",
      portraitPath: "portraits/1.jpg",
      customFields: [{ label: "Bond", value: "The party" }, "garbage"],
      hp: 30,
    });
    expect(norm?.portraitPath).toBe("portraits/1.jpg");
    expect(norm?.customFields).toEqual([{ label: "Bond", value: "The party" }]);
    expect(norm?.hp).toBe(30);
  });

  it("drops nested sheet fields the sheet .map()s/.includes()s over when they aren't arrays", () => {
    const norm = normalizeMember({
      id: "1",
      name: "Aria",
      equipment: "bad", // sheet does (equipment ?? []).map(...) - a string would throw
      savingThrows: "bad", // sheet does savingThrows.map(...) once .length is truthy
      spellcasting: { ability: "int", spells: "bad" }, // (spells ?? []).map(...)
      features: "bad",
      traits: "bad",
      reactions: "bad",
    });
    expect(norm?.equipment).toBeUndefined();
    expect(norm?.savingThrows).toBeUndefined();
    expect(norm?.spellcasting?.spells).toBeUndefined();
    expect(norm?.features).toBeUndefined();
    expect(norm?.traits).toBeUndefined();
    expect(norm?.reactions).toBeUndefined();
  });

  it("filters array elements of the wrong shape instead of keeping them raw", () => {
    const norm = normalizeMember({
      id: "1",
      name: "Aria",
      equipment: ["Sword", 5, null, "Shield"],
      savingThrows: ["str", 42, "dex"],
      features: [{ name: "Rage", description: "..." }, { name: "bad" }, "garbage"],
    });
    expect(norm?.equipment).toEqual(["Sword", "Shield"]);
    expect(norm?.savingThrows).toEqual(["str", "dex"]);
    expect(norm?.features).toEqual([{ name: "Rage", description: "..." }]);
  });

  it("rebuilds a malformed abilityScores/currency/skills object instead of passing it through", () => {
    const norm = normalizeMember({
      id: "1",
      name: "Aria",
      abilityScores: { str: "bad", dex: 14 },
      currency: "bad",
      skills: { Stealth: 3, Perception: "bad" },
    });
    expect(norm?.abilityScores).toEqual({ str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 });
    expect(norm?.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    expect(norm?.skills).toEqual({ Stealth: 3 });
  });

  it("keeps well-formed nested sheet fields intact", () => {
    const norm = normalizeMember({
      id: "1",
      name: "Aria",
      equipment: ["Sword", "Shield"],
      savingThrows: ["str", "con"],
      spellcasting: { ability: "wis", saveDC: 14, spells: [{ level: 1, name: "Bless" }] },
      currency: { cp: 1, sp: 2, ep: 0, gp: 30, pp: 0 },
    });
    expect(norm?.equipment).toEqual(["Sword", "Shield"]);
    expect(norm?.savingThrows).toEqual(["str", "con"]);
    expect(norm?.spellcasting).toEqual({ ability: "wis", saveDC: 14, spells: [{ level: 1, name: "Bless" }] });
    expect(norm?.currency).toEqual({ cp: 1, sp: 2, ep: 0, gp: 30, pp: 0 });
  });
});

describe("validatePartyBundle", () => {
  it("returns the members from a valid bundle", () => {
    const parsed = { type: "ttcanvas-party", version: 1, members: [member({ id: "1", name: "Aria" })] };
    const result = validatePartyBundle(parsed);
    expect(result).toHaveLength(1);
    expect(result?.[0].name).toBe("Aria");
  });

  it("returns null when members is missing or not an array", () => {
    expect(validatePartyBundle({ type: "ttcanvas-party" })).toBeNull();
    expect(validatePartyBundle({ members: "nope" })).toBeNull();
    expect(validatePartyBundle(null)).toBeNull();
  });

  it("drops invalid members, returning an empty array when all are invalid", () => {
    // A present members array with no valid entries yields [] - the caller turns
    // that into an import error rather than a silent no-op.
    const parsed = { members: [{ name: "no id" }, { id: "2", name: "   " }] };
    expect(validatePartyBundle(parsed)).toEqual([]);
  });

  it("keeps the valid members and drops the rest", () => {
    const parsed = {
      members: [member({ id: "1", name: "Ok" }), { name: "no id" }, { id: "2", name: "   " }],
    };
    const result = validatePartyBundle(parsed);
    expect(result).toHaveLength(1);
    expect(result?.[0].id).toBe("1");
  });
});

describe("party dedupe by content key", () => {
  const opts = { idOf: (m: PartyMember) => m.id, contentKeyOf: partyMemberContentKey };
  const existing = [member({ id: "a", name: "Aria", level: 3 })];

  it("flags a matching id as an idConflict", () => {
    const incoming = [member({ id: "a", name: "Aria the Renamed", level: 4 })];
    const r = dedupe(incoming, existing, opts);
    expect(r.idConflicts).toHaveLength(1);
    expect(r.clean).toHaveLength(0);
  });

  it("flags identical content under a new id as a contentDuplicate", () => {
    // Same sheet as `existing`, only the id differs - the content key ignores id.
    const incoming = [member({ id: "b", name: "Aria", level: 3 })];
    const r = dedupe(incoming, existing, opts);
    expect(r.contentDuplicates).toHaveLength(1);
    expect(r.clean).toHaveLength(0);
  });

  it("treats a genuinely new member as clean", () => {
    const incoming = [member({ id: "c", name: "Borin", level: 2 })];
    const r = dedupe(incoming, existing, opts);
    expect(r.clean).toHaveLength(1);
    expect(r.idConflicts).toHaveLength(0);
    expect(r.contentDuplicates).toHaveLength(0);
  });
});
