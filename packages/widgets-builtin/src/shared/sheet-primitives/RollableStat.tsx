// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { ReactNode } from "react";
import { useDice } from "@ttcanvas/core";
import styles from "./RollableStat.module.css";

function fmtBonus(bonus: number): string {
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}

/** 1d20 plus a signed flat bonus; a bare "1d20" when the bonus is zero. */
function d20Expr(bonus: number): string {
  return bonus === 0 ? "1d20" : `1d20${bonus >= 0 ? "+" : ""}${bonus}`;
}

/** Modifier-key convention shared by every rollable stat: Shift = advantage, Alt = disadvantage. */
function advFromEvent(e: { shiftKey: boolean; altKey: boolean }): "advantage" | "disadvantage" | null {
  if (e.shiftKey) return "advantage";
  if (e.altKey) return "disadvantage";
  return null;
}

interface Props {
  /** The flat bonus added to 1d20 - an ability modifier, save bonus or skill bonus. */
  bonus: number;
  /** What is being rolled; becomes the Dice Roller history label ("STR check", "Athletics"). */
  label: string;
  /** Owner name, prefixed onto the label so history reads "Aria: Athletics". */
  subject?: string;
  /** Typography class from the call site so the number keeps its existing look - `.rollable` only
   *  resets the button chrome and adds the affordance, so the two never fight over the cascade. */
  className?: string;
  /** Rendered text; defaults to the signed bonus. */
  children?: ReactNode;
}

/**
 * A character-sheet stat rendered as a button: click to roll 1d20 + `bonus` into the Dice Roller.
 * Hold Shift for advantage or Alt for disadvantage (Shift/Alt + Enter works for keyboard users, so
 * this stays reachable without a mouse). A real <button> keeps it focusable and screen-reader labelled.
 */
export function RollableStat({ bonus, label, subject, className, children }: Props) {
  const { roll } = useDice();
  const full = subject ? `${subject}: ${label}` : label;
  const hint = `Roll ${label} (${fmtBonus(bonus)}). Shift for advantage, Alt for disadvantage.`;
  return (
    <button
      type="button"
      className={`${styles.rollable} ${className ?? ""}`}
      title={hint}
      aria-label={hint}
      onClick={(e) => roll(d20Expr(bonus), advFromEvent(e), full)}
    >
      {children ?? fmtBonus(bonus)}
    </button>
  );
}
