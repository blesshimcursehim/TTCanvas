// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { abilityModifier, proficiencyBonus, proficiencyBonusForCr } from "./types";

describe("abilityModifier", () => {
  it("is +0 at 10-11 and rounds down", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(20)).toBe(5);
  });
});

describe("proficiencyBonus", () => {
  it("follows the SRD +2..+6 progression by tier", () => {
    for (const l of [1, 2, 3, 4]) expect(proficiencyBonus(l)).toBe(2);
    for (const l of [5, 6, 7, 8]) expect(proficiencyBonus(l)).toBe(3);
    for (const l of [9, 12]) expect(proficiencyBonus(l)).toBe(4);
    for (const l of [13, 16]) expect(proficiencyBonus(l)).toBe(5);
    for (const l of [17, 20]) expect(proficiencyBonus(l)).toBe(6);
  });

  it("clamps out-of-range levels into 1-20", () => {
    expect(proficiencyBonus(0)).toBe(2);
    expect(proficiencyBonus(-3)).toBe(2);
    expect(proficiencyBonus(25)).toBe(6);
  });

  it("floors a fractional level to a whole tier", () => {
    expect(proficiencyBonus(4.9)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
  });
});

describe("proficiencyBonusForCr", () => {
  it("puts fractional and CR 0 creatures in the +2 tier", () => {
    for (const cr of ["0", "1/8", "1/4", "1/2"]) expect(proficiencyBonusForCr(cr)).toBe(2);
  });

  it("follows the SRD CR progression up to +9 at CR 30", () => {
    for (const cr of ["1", "4"]) expect(proficiencyBonusForCr(cr)).toBe(2);
    for (const cr of ["5", "8"]) expect(proficiencyBonusForCr(cr)).toBe(3);
    for (const cr of ["9", "12"]) expect(proficiencyBonusForCr(cr)).toBe(4);
    for (const cr of ["17", "20"]) expect(proficiencyBonusForCr(cr)).toBe(6);
    expect(proficiencyBonusForCr("30")).toBe(9);
  });

  it("falls back to +2 for an unparseable CR", () => {
    expect(proficiencyBonusForCr("")).toBe(2);
    expect(proficiencyBonusForCr("weird")).toBe(2);
  });
});
