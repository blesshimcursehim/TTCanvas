// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { createContext, useContext } from "react";

/**
 * A link-bearing body belonging to an entity that lives in singleton widget state rather than its own
 * vault file - a Bestiary creature's notes or a Rule Card's body. NPCs and Gazetteer places are not
 * here: they are per-entry vault files, so Session Notes reads those straight off disk.
 *
 * `ref` is the entry id, matching what App's handleOpenCreature / handleOpenCard expect, so a backlink
 * or graph node can open the entry it came from. `text` is only the free-text field that can actually
 * contain `[[links]]` - a creature's stat block is deliberately left out, since stringifying it would
 * produce noisy backlinks from numbers and skill names.
 */
export interface EntityLinkSource {
  kind: "creature" | "card";
  ref: string;
  label: string;
  text: string;
}

export interface LinkSourcesContextValue {
  /** Rules Reference's folder, so Session Notes can scan it for `.md` link sources. Null when unset. */
  rulesFolder: string | null;
  entities: EntityLinkSource[];
}

const DEFAULT: LinkSourcesContextValue = { rulesFolder: null, entities: [] };

export const LinkSourcesContext = createContext<LinkSourcesContextValue>(DEFAULT);

export function useLinkSources(): LinkSourcesContextValue {
  return useContext(LinkSourcesContext);
}
