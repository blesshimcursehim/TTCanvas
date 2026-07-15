// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { advancePlaylist, type PlaylistCursor } from "./playlist";

describe("advancePlaylist", () => {
  it("returns null for an empty or single-track playlist - nothing to cross to", () => {
    const cursor: PlaylistCursor = { index: 0, playsDone: 0 };
    expect(advancePlaylist(cursor, 0, false, true)).toBeNull();
    expect(advancePlaylist(cursor, 1, false, true)).toBeNull();
    expect(advancePlaylist(cursor, 1, true, true)).toBeNull();
  });

  describe("sequential", () => {
    it("advances to the next index", () => {
      const cursor: PlaylistCursor = { index: 0, playsDone: 2 };
      expect(advancePlaylist(cursor, 3, false, true)).toEqual({ index: 1, playsDone: 3 });
    });

    it("wraps to 0 past the end when looping", () => {
      const cursor: PlaylistCursor = { index: 2, playsDone: 5 };
      expect(advancePlaylist(cursor, 3, false, true)).toEqual({ index: 0, playsDone: 6 });
    });

    it("stops past the end when not looping", () => {
      const cursor: PlaylistCursor = { index: 2, playsDone: 5 };
      expect(advancePlaylist(cursor, 3, false, false)).toBeNull();
    });
  });

  describe("shuffle", () => {
    it("never repeats the current index", () => {
      const cursor: PlaylistCursor = { index: 1, playsDone: 0 };
      for (let i = 0; i < 50; i++) {
        const next = advancePlaylist(cursor, 4, true, true, Math.random);
        expect(next?.index).not.toBe(1);
      }
    });

    it("picks the given index via an injected rand()", () => {
      const cursor: PlaylistCursor = { index: 0, playsDone: 0 };
      // rand() -> 0.5 over the 3 remaining slots (1,2,3) picks slot 1 -> index 2
      // (Math.floor(0.5 * 3) = 1, then +1 since 1 >= current index 0 -> index 2)
      const next = advancePlaylist(cursor, 4, true, true, () => 0.5);
      expect(next).toEqual({ index: 2, playsDone: 1 });
    });

    it("stops once every track has played when not looping", () => {
      let cursor: PlaylistCursor = { index: 0, playsDone: 0 };
      for (let i = 0; i < 2; i++) {
        const next = advancePlaylist(cursor, 3, true, false, () => 0);
        expect(next).not.toBeNull();
        cursor = next!;
      }
      expect(advancePlaylist(cursor, 3, true, false, () => 0)).toBeNull();
    });
  });
});
