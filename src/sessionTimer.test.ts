// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  elapsedMs,
  formatElapsed,
  formatElapsedPrecise,
  resetSessionTimer,
  sessionStatus,
  toggleSessionTimer,
} from "./sessionTimer";

const T0 = 1_000_000;

describe("sessionStatus", () => {
  it("is stopped when never started", () => {
    expect(sessionStatus({ startedAt: null, accumulatedMs: 0 })).toBe("stopped");
  });
  it("is running whenever startedAt is set", () => {
    expect(sessionStatus({ startedAt: T0, accumulatedMs: 0 })).toBe("running");
  });
  it("is paused when time is banked but not running", () => {
    expect(sessionStatus({ startedAt: null, accumulatedMs: 5000 })).toBe("paused");
  });
});

describe("elapsedMs", () => {
  it("adds the live span while running", () => {
    expect(elapsedMs({ startedAt: T0, accumulatedMs: 5000 }, T0 + 3000)).toBe(8000);
  });
  it("is exactly the banked time while paused", () => {
    expect(elapsedMs({ startedAt: null, accumulatedMs: 5000 }, T0 + 999_999)).toBe(5000);
  });
  it("clamps to 0 when startedAt is in the future", () => {
    // A hand-edited file or a backwards system-clock jump.
    expect(elapsedMs({ startedAt: T0 + 10_000, accumulatedMs: 0 }, T0)).toBe(0);
  });
});

describe("toggleSessionTimer", () => {
  it("starts from stopped without banking anything", () => {
    expect(toggleSessionTimer({ startedAt: null, accumulatedMs: 0 }, T0)).toEqual({
      startedAt: T0,
      accumulatedMs: 0,
    });
  });

  it("banks the exact span at `now`, not to the last whole second", () => {
    // The reason toggle takes `now` at all: the display only refreshes once a second, so
    // reusing a rendered value would silently drop up to ~1s on every pause.
    const paused = toggleSessionTimer({ startedAt: T0, accumulatedMs: 0 }, T0 + 1500);
    expect(paused).toEqual({ startedAt: null, accumulatedMs: 1500 });
  });

  it("resumes from paused keeping the banked time", () => {
    expect(toggleSessionTimer({ startedAt: null, accumulatedMs: 5000 }, T0)).toEqual({
      startedAt: T0,
      accumulatedMs: 5000,
    });
  });

  it("round-trips: start, run, pause, resume, pause accumulates both spans", () => {
    let s = toggleSessionTimer({ startedAt: null, accumulatedMs: 0 }, T0);
    s = toggleSessionTimer(s, T0 + 2000);
    s = toggleSessionTimer(s, T0 + 60_000);
    s = toggleSessionTimer(s, T0 + 63_000);
    expect(s).toEqual({ startedAt: null, accumulatedMs: 5000 });
  });
});

describe("resetSessionTimer", () => {
  it("returns to stopped from running", () => {
    expect(resetSessionTimer()).toEqual({ startedAt: null, accumulatedMs: 0 });
  });
  it("returns a fresh object each call (never a shared default)", () => {
    expect(resetSessionTimer()).not.toBe(resetSessionTimer());
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "0:00"],
    [65_000, "0:01"],
    [3_599_000, "0:59"],
    [3_600_000, "1:00"],
    [36_000_000, "10:00"],
  ])("formats %ims as %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it("floors rather than rounds", () => {
    expect(formatElapsed(59_900)).toBe("0:00");
  });

  it("clamps negative input to 0:00", () => {
    expect(formatElapsed(-5000)).toBe("0:00");
  });
});

describe("formatElapsedPrecise", () => {
  it("keeps seconds for the session menu", () => {
    expect(formatElapsedPrecise(8_133_000)).toBe("2:15:33");
  });
  it("zero-pads minutes and seconds", () => {
    expect(formatElapsedPrecise(3_601_000)).toBe("1:00:01");
  });
});
