// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { generateStats } from "./stats";

describe("generateStats", () => {
  it("produces sensible stats for a Human Fighter level 5", () => {
    const stats = generateStats({ dndClass: "Fighter", level: 5, race: "Human" });
    expect(stats.cr).toBe("3");
    expect(stats.ac).toBe(18);
    expect(stats.hp).toBeGreaterThanOrEqual(20);
    expect(stats.hp).toBeLessThanOrEqual(70);
    expect(stats.speed.walk).toBe(30);
    expect(stats.abilityScores.str).toBe(15);
    expect(stats.actions.some((a) => a.name === "Longsword")).toBe(true);
  });

  it("produces caster-shaped stats for a Dwarf Wizard level 1", () => {
    const stats = generateStats({ dndClass: "Wizard", level: 1, race: "Dwarf" });
    expect(stats.cr).toBe("1/4");
    expect(stats.hp).toBeGreaterThanOrEqual(3);
    expect(stats.hp).toBeLessThanOrEqual(8);
    expect(stats.speed.walk).toBe(30);
    expect(stats.abilityScores.int).toBe(15);
    expect(stats.abilityScores.con).toBe(14);
    expect(stats.actions.some((a) => a.name === "Fire Bolt")).toBe(true);
  });

  it("produces commoner stats when no class is set", () => {
    const stats = generateStats({ dndClass: "", level: null, race: "Human" });
    expect(stats.cr).toBe("0");
    expect(stats.ac).toBeGreaterThanOrEqual(10);
    expect(stats.ac).toBeLessThanOrEqual(12);
    expect(stats.hp).toBeGreaterThanOrEqual(1);
    expect(stats.actions.some((a) => a.name === "Club")).toBe(true);
  });

  it("applies race speed correctly", () => {
    expect(generateStats({ dndClass: "Fighter", level: 1, race: "Halfling" }).speed.walk).toBe(30);
    expect(generateStats({ dndClass: "Fighter", level: 1, race: "Gnome" }).speed.walk).toBe(30);
    expect(generateStats({ dndClass: "Fighter", level: 1, race: "Goliath" }).speed.walk).toBe(35);
    expect(generateStats({ dndClass: "Fighter", level: 1, race: "Elf" }).speed.walk).toBe(30);
  });

  it("does not apply species-based ability score bonuses", () => {
    const stats = generateStats({ dndClass: "Fighter", level: 1, race: "Human" });
    expect(Object.values(stats.abilityScores).sort((a, b) => a - b)).toEqual([8, 10, 12, 13, 14, 15]);
  });

  it("scales CR with level", () => {
    expect(generateStats({ dndClass: "Fighter", level: 1, race: "Human" }).cr).toBe("1/4");
    expect(generateStats({ dndClass: "Fighter", level: 3, race: "Human" }).cr).toBe("1");
    expect(generateStats({ dndClass: "Fighter", level: 5, race: "Human" }).cr).toBe("3");
    expect(generateStats({ dndClass: "Fighter", level: 10, race: "Human" }).cr).toBe("7");
    expect(generateStats({ dndClass: "Fighter", level: 20, race: "Human" }).cr).toBe("10");
  });

  it("produces a valid HP formula string", () => {
    const stats = generateStats({ dndClass: "Fighter", level: 5, race: "Human" });
    expect(stats.hpFormula).toMatch(/^5d10([+-]\d+)?$/);
  });
});
