// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { wrapForward, wrapBack } from "./roundClock";

describe("wrapForward / wrapBack", () => {
  it("undoes a single auto-advanced wrap", () => {
    const advances = wrapForward([], 6);
    const { delta, roundAdvances } = wrapBack(advances);
    expect(delta).toBe(6);
    expect(roundAdvances).toEqual([]);
  });

  it("does nothing for a wrap that happened with auto-advance off", () => {
    // delta is 0 (a recorded no-op), not undefined - that's reserved for "no boundary at all".
    // Either way `if (delta)` in the component skips the advanceGameTime call.
    const advances = wrapForward([], 0);
    const { delta, roundAdvances } = wrapBack(advances);
    expect(delta).toBe(0);
    expect(roundAdvances).toEqual([]);
  });

  it("has nothing to undo at round 1 before any wrap ever happened", () => {
    const { delta, roundAdvances } = wrapBack([]);
    expect(delta).toBeUndefined();
    expect(roundAdvances).toEqual([]);
  });

  it("undoes each boundary's own delta in reverse order, even after roundSeconds changed mid-combat", () => {
    // round1 -> round2 at 6s/round, then roundSeconds changed to 10, round2 -> round3 at 10s/round.
    let advances = wrapForward([], 6);
    advances = wrapForward(advances, 10);
    expect(advances).toEqual([6, 10]);

    const back1 = wrapBack(advances); // round3 -> round2: undo the 10s this boundary added
    expect(back1.delta).toBe(10);
    expect(back1.roundAdvances).toEqual([6]);

    const back2 = wrapBack(back1.roundAdvances); // round2 -> round1: undo the 6s this boundary added
    expect(back2.delta).toBe(6);
    expect(back2.roundAdvances).toEqual([]);
  });

  it("skips a boundary that had auto-advance off without disturbing an earlier real delta", () => {
    // round1 -> round2 with auto-advance on (6s), then auto-advance turned off, round2 -> round3 (0s).
    let advances = wrapForward([], 6);
    advances = wrapForward(advances, 0);
    expect(advances).toEqual([6, 0]);

    const back1 = wrapBack(advances); // round3 -> round2: nothing was added for this boundary
    expect(back1.delta).toBe(0);
    expect(back1.roundAdvances).toEqual([6]);

    const back2 = wrapBack(back1.roundAdvances); // round2 -> round1: the earlier real delta is intact
    expect(back2.delta).toBe(6);
    expect(back2.roundAdvances).toEqual([]);
  });

  it("undoes a boundary enabled after an earlier one wrapped without advancing", () => {
    // round1 -> round2 with auto-advance off (0s), then auto-advance turned on, round2 -> round3 (6s).
    let advances = wrapForward([], 0);
    advances = wrapForward(advances, 6);
    expect(advances).toEqual([0, 6]);

    const back1 = wrapBack(advances); // round3 -> round2: undo the 6s this boundary added
    expect(back1.delta).toBe(6);
    expect(back1.roundAdvances).toEqual([0]);

    const back2 = wrapBack(back1.roundAdvances); // round2 -> round1: nothing was ever added here
    expect(back2.delta).toBe(0);
    expect(back2.roundAdvances).toEqual([]);
  });
});
