// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { dedupe } from "../shared/importExport";
import { validatePartyBundle, partyMemberContentKey } from "./partyImport";
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

  it("drops members without a string id or a non-empty name", () => {
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
