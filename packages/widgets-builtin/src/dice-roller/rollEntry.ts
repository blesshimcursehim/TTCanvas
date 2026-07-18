// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Shared construction of a history RollEntry from a dice expression. Kept out of the pure
// evaluator (dice.ts) because it adds an id + timestamp, and out of the widget so the cross-widget
// roll action (App's DiceContext) and the Dice Roller itself build entries the same way.

import { evaluate, formatBreakdown, type AdvMode } from "./dice";
import type { RollEntry } from "./types";

/** How many rolls the Dice Roller keeps in history before dropping the oldest. */
export const MAX_HISTORY = 30;

/**
 * Evaluate `expr` under `adv` and wrap the outcome as a labelled history entry, or `null` if the
 * expression is not valid notation (so callers can skip rather than push a broken row).
 */
export function buildRollEntry(expr: string, adv: AdvMode, label: string): RollEntry | null {
  const outcome = evaluate(expr, adv);
  if (!outcome) return null;
  const { breakdown, alt } = outcome;
  return {
    id: crypto.randomUUID(),
    label,
    expr,
    total: breakdown.total,
    breakdown: formatBreakdown(breakdown),
    altTotal: alt ? alt.total : null,
    adv: outcome.adv,
    crit: breakdown.crit,
    fumble: breakdown.fumble,
    at: Date.now(),
  };
}
