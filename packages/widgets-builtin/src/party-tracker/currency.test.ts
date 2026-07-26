// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { currencyOf, withCurrency } from "./currency";

describe("currencyOf", () => {
  it("returns the purse when the member has one", () => {
    const purse = { cp: 1, sp: 2, ep: 3, gp: 4, pp: 5 };
    expect(currencyOf({ gp: 99, currency: purse })).toEqual(purse);
  });

  it("seeds a missing purse from the legacy gp stat rather than zeroing it", () => {
    expect(currencyOf({ gp: 12 })).toEqual({ cp: 0, sp: 0, ep: 0, gp: 12, pp: 0 });
  });

  it("treats a missing or corrupt legacy gp as nothing", () => {
    expect(currencyOf({}).gp).toBe(0);
    expect(currencyOf({ gp: -5 }).gp).toBe(0);
    expect(currencyOf({ gp: 2.7 }).gp).toBe(2);
  });
});

describe("withCurrency", () => {
  it("mirrors gold onto the legacy field so the card and the sheet agree", () => {
    const next = { cp: 0, sp: 0, ep: 0, gp: 40, pp: 1 };
    expect(withCurrency({ gp: 10 }, next)).toEqual({ gp: 40, currency: next });
  });

  it("leaves every other field on the member untouched", () => {
    const member = { id: "m1", name: "Vex", gp: 1, hp: 9 };
    expect(withCurrency(member, { cp: 0, sp: 0, ep: 0, gp: 3, pp: 0 }))
      .toMatchObject({ id: "m1", name: "Vex", hp: 9, gp: 3 });
  });

  it("round-trips through currencyOf", () => {
    const next = { cp: 7, sp: 0, ep: 0, gp: 3, pp: 0 };
    expect(currencyOf(withCurrency({ gp: 0 }, next))).toEqual(next);
  });
});
