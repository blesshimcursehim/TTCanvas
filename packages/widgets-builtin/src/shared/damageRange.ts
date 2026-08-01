// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure bounds maths for a damage expression, unit-tested directly (like items/ledger.ts and
// merchants/pricing.ts). Nothing here touches React.

import type { DamagePart } from "@ttcanvas/core";
import { parseExpression } from "../dice-roller/dice";

export interface DamageRange {
  min: number;
  max: number;
}

/**
 * The lowest and highest a damage expression can roll, so an item card can headline "2~11 Damage"
 * beside the notation. Reuses the Dice Roller's parser rather than growing a second one, which also
 * means the card and the Roll button always agree about what is valid notation.
 *
 * Returns null when the expression is not notation at all, and when it explodes (`!`), which has no
 * maximum. The caller shows the text as written in that case - nothing is rejected, because the GM's
 * "1d6 per level" is a perfectly good note even though it is not rollable.
 *
 * `min` is clamped at zero: "1d4-2" is a weak hit, not a heal.
 */
/**
 * Every damage component of a weapon as one expression, so "1d8+8 piercing" plus "1d6 thunder" plus
 * "1d4 necrotic" rolls and ranges as `1d8+8+1d6+1d4`. Returns "" when there is nothing to add up.
 *
 * A part already carrying its own sign keeps it, which is what lets a GM write a component as "-1d4"
 * for something that saps the weapon rather than adding to it.
 */
export function damageExpression(parts: readonly DamagePart[] | undefined): string {
  return (parts ?? [])
    .map((p) => p.dice.trim())
    .filter(Boolean)
    .map((d, i) => (i === 0 || d.startsWith("+") || d.startsWith("-") ? d : `+${d}`))
    .join("");
}

/** The combined range of every damage component. Null when any of them is not notation. */
export function totalDamageRange(parts: readonly DamagePart[] | undefined): DamageRange | null {
  const expr = damageExpression(parts);
  return expr ? damageRange(expr) : null;
}

export function damageRange(expr: string): DamageRange | null {
  const parsed = parseExpression(expr);
  if (!parsed) return null;

  let min = 0;
  let max = 0;
  for (const term of parsed.terms) {
    let lo: number;
    let hi: number;
    if (term.kind === "const") {
      lo = hi = term.value;
    } else {
      if (term.explode) return null;
      // kh/kl narrows how many dice count, not what each can show: keeping the highest 3 of 4d6
      // still spans 3 (all ones) to 18 (all sixes).
      const dice = term.keep ? term.keep.n : term.count;
      lo = dice;
      hi = dice * term.sides;
    }
    // A subtracted term takes its most at the bottom of the range and its least at the top.
    if (term.sign === 1) {
      min += lo;
      max += hi;
    } else {
      min -= hi;
      max -= lo;
    }
  }
  return { min: Math.max(0, min), max: Math.max(0, max) };
}
