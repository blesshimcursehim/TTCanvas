// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";
import type { LinkedEntity, LocationKind } from "./types";

/**
 * Read-only view of a single Gazetteer location, exposed to other widgets (Relationship Web, NPC
 * Library) so they can reference places without each re-scanning the vault. Deliberately a subset
 * of the full `GazetteerLocation` - identity, display, and its linked entities - mirroring `NpcRef`.
 *
 * Identity is the vault-relative `filename`, matching how the rest of the app refers to locations
 * (`[[place:...]]` links, App's handleOpenLocation, Map Display pins). `id` is carried for display
 * keys and a possible future migration, same as `NpcRef`.
 *
 * Like NPCs, locations are individual vault files rather than widget state, so this context is
 * populated by an async scan in `src/GazetteerProvider.tsx`, not derived from singletonStates.
 */
export interface GazetteerLocationRef {
  filename: string;
  id: string;
  name: string;
  kind: LocationKind;
  /** This place's linked NPCs and factions - lets Relationship Web suggest links from metadata the
   *  GM already recorded on the Gazetteer side, instead of re-typing them into the graph. */
  links: LinkedEntity[];
}

export interface GazetteerContextValue {
  locations: GazetteerLocationRef[];
  /** True until the first vault scan settles, so a picker can say "Loading" rather than "No places". */
  loading: boolean;
}

export const GazetteerContext = createContext<GazetteerContextValue>({ locations: [], loading: false });

export function useGazetteerLocations(): GazetteerContextValue {
  return useContext(GazetteerContext);
}
