// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { parseLocationJson, serializeLocationJson, nameToFilename, makeBlankLocation } from "./gazetteerFormat";
import type { GazetteerLocation } from "./types";

describe("gazetteerFormat", () => {
  it("round-trips a location through serialize/parse, dropping the transient filename", () => {
    const loc: GazetteerLocation = {
      filename: "locations/gilded-cage.json",
      id: "abc",
      name: "The Gilded Cage",
      kind: "poi",
      parentId: "citadel",
      summary: "A gambling house",
      body: "Notes with [[Vex]]",
      playerBlurb: "Smoke and low lamplight.",
      imagePath: "portraits/abc.jpg",
      links: [{ kind: "npc", ref: "npcs/vex.json", label: "Vex" }, { kind: "faction", ref: null, label: "Ashen Veil" }],
    };
    const json = serializeLocationJson(loc);
    expect(JSON.parse(json).filename).toBeUndefined();
    const back = parseLocationJson("locations/gilded-cage.json", json);
    expect(back).toEqual(loc);
  });

  it("backfills a missing id and defaults an unknown kind to poi", () => {
    const loc = parseLocationJson("locations/x.json", JSON.stringify({ name: "X", kind: "banana" }));
    expect(loc.id).toBeTruthy();
    expect(loc.kind).toBe("poi");
    expect(loc.parentId).toBeNull();
    expect(loc.links).toEqual([]);
  });

  it("drops malformed links but keeps valid ones", () => {
    const loc = parseLocationJson("locations/x.json", JSON.stringify({
      name: "X",
      links: [{ kind: "npc", ref: "npcs/a.json", label: "A" }, { kind: "bogus" }, { label: "no kind" }],
    }));
    expect(loc.links).toEqual([{ kind: "npc", ref: "npcs/a.json", label: "A" }]);
  });

  it("falls back to a blank location on invalid JSON or a nameless object", () => {
    const bad = parseLocationJson("locations/broken-vault.json", "{ not json");
    expect(bad.name).toBe("Broken Vault");
    expect(bad.id).toBeTruthy();
    const nameless = parseLocationJson("locations/no-name.json", JSON.stringify({ kind: "region" }));
    expect(nameless.name).toBe("No Name");
  });

  it("slugifies names into locations/ paths", () => {
    expect(nameToFilename("The Gilded Cage")).toBe("locations/the-gilded-cage.json");
    expect(nameToFilename("  !!!  ")).toBe("locations/place.json");
  });

  it("makeBlankLocation titles from the filename", () => {
    expect(makeBlankLocation("locations/barrow-of-kings.json").name).toBe("Barrow Of Kings");
  });
});
