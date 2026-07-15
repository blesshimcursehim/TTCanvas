// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/** Snapshot taken just before an award was applied, so it can be undone. */
export interface XpAward {
  id: string;
  label: string;
  /** Wall-clock time of the award (ms epoch). Absent on entries saved before this field existed. */
  at?: number;
  prevPartyXp: number;
  prevPerPc: Record<string, number>;
}

export interface XpTrackerState {
  mode: "party" | "perPc";
  partyXp: number;
  perPc: Record<string, number>;
  /** Cumulative XP required for each level, index 0 = level 1. Undefined = use the built-in defaults. */
  thresholds?: number[];
  /** Most recent first, capped. */
  history?: XpAward[];
}
