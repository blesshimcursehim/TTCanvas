// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/** A saved, labelled roll - e.g. "Longsword +7" bound to the expression "1d20+7". */
export interface RollMacro {
  id: string;
  label: string;
  expr: string;
}

/** One finished roll, kept in history and rendered in the result card / cast overlay. */
export interface RollEntry {
  id: string;
  /** The macro label if it came from one, otherwise the raw expression. */
  label: string;
  expr: string;
  total: number;
  /** Compact human breakdown, e.g. `(5,6)+(8)+4` (from dice.ts formatBreakdown). */
  breakdown: string;
  /** With advantage/disadvantage, the discarded total - shown as "adv 17 / 12". */
  altTotal: number | null;
  adv: "advantage" | "disadvantage" | null;
  crit: boolean;
  fumble: boolean;
  at: number;
}

export interface DiceRollerState {
  macros: RollMacro[];
  history: RollEntry[];
  /** The command-line expression the GM is editing. */
  input: string;
  adv: "advantage" | "disadvantage" | null;
  /** Macro search box (Hybrid layout) - filters the macro grid by label/expr. */
  query: string;
  /** The history entry currently cast to the player window, or null when nothing is shown. */
  castId: string | null;
}
