// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  generateName,
  generateAge,
  createDefaultNpcGeneratorState,
  DND_CLASSES,
  GENDER_TYPES,
  RACES,
} from "./tables";
import type { GenderType } from "./types";

describe("generateName", () => {
  it("returns a non-empty string with a space (first + last)", () => {
    const name = generateName("masculine");
    expect(name).toMatch(/\S+ \S+/);
  });

  it("produces a result for every gender type", () => {
    for (const gender of GENDER_TYPES) {
      const name = generateName(gender);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("any gender picks from the full pool across 100 rolls", () => {
    const results = Array.from({ length: 100 }, () => generateName("any"));
    expect(results.every((r) => r.length > 0)).toBe(true);
  });

  it("other gender returns a name from the combined pool", () => {
    const name = generateName("other");
    expect(name).toMatch(/\S+ \S+/);
  });
});

describe("generateAge", () => {
  const cases: Array<[string, number, number]> = [
    ["human",      18,  70],
    ["elf",        80,  600],
    ["dwarf",      40,  350],
    ["orc",        16,  50],
    ["halfling",   20,  150],
    ["gnome",      40,  400],
    ["tiefling",   18,  80],
    ["dragonborn", 15,  80],
    ["goliath",    18,  80],
    ["other",       1,  1000],
  ];

  for (const [race, min, max] of cases) {
    it(`${race} age is between ${min} and ${max}`, () => {
      for (let i = 0; i < 20; i++) {
        const age = generateAge(race);
        expect(age).toBeGreaterThanOrEqual(min);
        expect(age).toBeLessThanOrEqual(max);
      }
    });
  }

  it("any species returns an adult age", () => {
    for (let i = 0; i < 20; i++) {
      const age = generateAge("any");
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(70);
    }
  });
});

describe("createDefaultNpcGeneratorState", () => {
  it("returns a valid state object", () => {
    const state = createDefaultNpcGeneratorState();
    expect(state.gender).toBeDefined();
    expect(state.race).toBeDefined();
    expect(typeof state.name).toBe("string");
    expect(state.name.length).toBeGreaterThan(0);
    expect(typeof state.occupation).toBe("string");
    expect(typeof state.trait).toBe("string");
    expect(typeof state.hook).toBe("string");
    expect(typeof state.voice).toBe("string");
    expect(typeof state.age === "number" || state.age === null).toBe(true);
  });

  it("produces a fresh state on each call (factory behaviour)", () => {
    const a = createDefaultNpcGeneratorState();
    const b = createDefaultNpcGeneratorState();
    expect(a).not.toBe(b);
  });

  it("all lock fields default to false", () => {
    const state = createDefaultNpcGeneratorState();
    expect(state.locked.name).toBe(false);
    expect(state.locked.occupation).toBe(false);
    expect(state.locked.trait).toBe(false);
    expect(state.locked.hook).toBe(false);
    expect(state.locked.voice).toBe(false);
    expect(state.locked.age).toBe(false);
  });
});

describe("GENDER_TYPES and RACES", () => {
  it("GENDER_TYPES includes all four options", () => {
    const expected: GenderType[] = ["any", "masculine", "feminine", "other"];
    expect(GENDER_TYPES).toEqual(expect.arrayContaining(expected));
    expect(GENDER_TYPES).toHaveLength(expected.length);
  });

  it("RACES contains only SRD 5.2.1 species plus utility options", () => {
    expect(RACES).toEqual([
      "Any",
      "Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling",
      "Other",
    ]);
  });

  it("DND_CLASSES contains only SRD 5.2.1 classes and commoner", () => {
    expect(DND_CLASSES).toEqual([
      "",
      "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
      "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
    ]);
  });
});
