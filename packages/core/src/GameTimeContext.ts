// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/**
 * Cross-widget action for advancing the shared in-game clock (the Time
 * Tracker's time), e.g. Initiative Tracker adding the round length when a
 * combat round completes. Read the current time via useCalendar(); this
 * context carries only the action so its value stays referentially stable
 * and consumers don't re-render on every clock change.
 */
export interface GameTimeContextValue {
  /**
   * Advance the in-game clock by deltaSeconds (negative rewinds). A no-op
   * when no calendar is defined or no current date is set.
   */
  advanceGameTime: (deltaSeconds: number) => void;
}

const defaultValue: GameTimeContextValue = { advanceGameTime: () => {} };

export const GameTimeContext = createContext<GameTimeContextValue>(defaultValue);
export function useGameTime(): GameTimeContextValue { return useContext(GameTimeContext); }
