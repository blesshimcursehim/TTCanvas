// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export interface SessionLogContextValue {
  /**
   * Append one line to the Session Logger (e.g. a purchase from a merchant), stamped with the wall
   * clock and the current in-game time by the host. A no-op until the host wires it, so consumers
   * never need to guard on a provider being present - the sibling of `addChronicleEntry`, and like
   * it, it works whether or not a Session Logger widget is on the canvas.
   */
  logSessionEntry: (text: string) => void;
}

const DEFAULT: SessionLogContextValue = {
  logSessionEntry: () => {},
};

export const SessionLogContext = createContext<SessionLogContextValue>(DEFAULT);

export function useSessionLog(): SessionLogContextValue {
  return useContext(SessionLogContext);
}
