// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/**
 * Read-only projection of which Gazetteer places currently have a pin on a map, so a widget can tell
 * at a glance without reaching into Map Display's own widget state. Mirrors how PartyContext and
 * BestiaryContext project singleton state, rather than the vault scan NpcContext/GazetteerContext use.
 *
 * Keyed by the same vault-relative location `filename` that `MapToken.locationRef` stores, and
 * gathered across every scene - a pin on any scene counts as pinned.
 */
export interface MapPinsContextValue {
  pinnedLocationRefs: ReadonlySet<string>;
}

const DEFAULT: MapPinsContextValue = { pinnedLocationRefs: new Set() };

export const MapPinsContext = createContext<MapPinsContextValue>(DEFAULT);

export function useMapPins(): MapPinsContextValue {
  return useContext(MapPinsContext);
}
