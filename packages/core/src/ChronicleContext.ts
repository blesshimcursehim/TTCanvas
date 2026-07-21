// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { CalDate } from "./calendarTypes";

/** A Chronicle entry without its id - the id is minted by the host when the entry is appended. Mirrors
 *  Campaign Timeline's own TimelineEntry (kept here so core carries no widget-specific import). */
export interface ChronicleDraft {
  title: string;
  body?: string;
  category: string;
  date: CalDate;
}

export interface ChronicleContextValue {
  /** Append one entry to the Campaign Timeline's Chronicle (e.g. a Session Logger summary sent to it).
   *  A no-op until the host wires it, so consumers never need to guard on a provider being present. */
  addChronicleEntry: (draft: ChronicleDraft) => void;
}

const DEFAULT: ChronicleContextValue = {
  addChronicleEntry: () => {},
};

export const ChronicleContext = createContext<ChronicleContextValue>(DEFAULT);

export function useChronicle(): ChronicleContextValue {
  return useContext(ChronicleContext);
}
