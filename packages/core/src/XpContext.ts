// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

export interface XpContextValue {
  /** How the XP Tracker splits awards - lets a caller phrase an honest preview before awarding. */
  mode: "party" | "perPc";
  /**
   * Award an encounter's reward: split `total` evenly across `recipientIds` (the XP Tracker's own
   * splitXp - remainder dropped), push an undo snapshot into its history, and reveal the tracker so
   * the GM sees it land. No-op when total <= 0 or recipientIds is empty. In "party" mode the shared
   * pool advances by the same per-head share, so recipientIds only sets the divisor.
   */
  awardEncounterXp: (total: number, recipientIds: string[], label: string) => void;
}

export const XpContext = createContext<XpContextValue>({ mode: "party", awardEncounterXp: () => {} });

export function useXp(): XpContextValue {
  return useContext(XpContext);
}
