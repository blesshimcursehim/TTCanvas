// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/** Where a pad's playlist currently is: which track, and how many it has played so far. */
export interface PlaylistCursor {
  index: number;
  playsDone: number;
}

/**
 * Given the currently-playing track, decide what plays next.
 * Returns `null` when the playlist should stop instead of advancing (end
 * reached with looping off) - the caller then lets the current track finish
 * naturally rather than crossfading into anything.
 */
export function advancePlaylist(
  cursor: PlaylistCursor,
  trackCount: number,
  shuffle: boolean,
  loop: boolean,
  rand: () => number = Math.random,
): PlaylistCursor | null {
  if (trackCount <= 1) return null;

  const playsDone = cursor.playsDone + 1;

  if (shuffle) {
    if (!loop && playsDone >= trackCount) return null;
    // Exclude the current index so consecutive plays never repeat a track.
    let next = Math.floor(rand() * (trackCount - 1));
    if (next >= cursor.index) next += 1;
    return { index: next, playsDone };
  }

  const next = cursor.index + 1;
  if (next >= trackCount) {
    return loop ? { index: 0, playsDone } : null;
  }
  return { index: next, playsDone };
}
