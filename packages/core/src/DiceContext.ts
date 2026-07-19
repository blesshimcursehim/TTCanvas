// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export interface DiceContextValue {
  /**
   * Roll a dice expression, push the result into the Dice Roller's history and reveal the widget.
   * Used by the character sheets' click-to-roll (1d20 + a stat's bonus); `adv` carries an optional
   * advantage / disadvantage from a modifier-key click. A no-op if `expr` is not valid notation, or
   * if there is no Dice Roller wired in (the default value below).
   */
  roll: (expr: string, adv: "advantage" | "disadvantage" | null, label: string) => void;
}

export const DiceContext = createContext<DiceContextValue>({ roll: () => {} });

export function useDice(): DiceContextValue {
  return useContext(DiceContext);
}
