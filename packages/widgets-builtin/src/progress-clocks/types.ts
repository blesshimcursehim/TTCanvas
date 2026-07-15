// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface ProgressClock {
  id: string;
  name: string;
  /** Total wedges, e.g. 4/6/8/10/12 (Blades in the Dark convention) or a custom size. */
  segments: number;
  /** How many wedges are filled in, 0..segments. */
  filled: number;
}

export interface ProgressClocksState {
  clocks: ProgressClock[];
  /** id of the clock currently shown on the player window's corner overlay, if any. */
  shownClockId?: string | null;
}
