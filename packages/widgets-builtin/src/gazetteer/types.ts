// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/** The kind of place. Drives the tree glyph and the "in a Region / Settlement / ..." filter. */
export type LocationKind = "region" | "settlement" | "landmark" | "dungeon" | "wilderness" | "poi" | "custom";

/** A link from a place to an NPC or a faction. NPCs mirror an NPC Library file and cache the name so
 * the chip still reads if the file is missing (the Relationship Web convention); factions are
 * free-standing labels (ref null) as factions are not first-class entities in the vault. */
export interface LinkedEntity {
  kind: "npc" | "faction";
  /** NPC Library filename ("npcs/vex.json") for kind "npc"; null for a free-standing faction. */
  ref: string | null;
  /** Cached display name - kept fresh from the source for linked NPCs, owned outright for factions. */
  label: string;
}

/** A place. One JSON file per location under `locations/`, mirroring the NPC Library's file-per-entity
 * model. `filename` is transient (the vault path) and is stripped on serialize; `id` is the stable
 * identity that survives renames and re-parenting. */
export interface GazetteerLocation {
  filename: string;
  id: string;
  name: string;
  kind: LocationKind;
  /** The label when kind is "custom" (e.g. "Plane", "Ship"). */
  customKind?: string;
  /** Parent location id, or null for a top-level place. Hierarchy lives here, not in folders. */
  parentId: string | null;
  /** One-line description shown in the tree row. */
  summary?: string;
  /** GM notes, Markdown (rendered via the shared renderer, so `[[wikilinks]]` work). */
  body?: string;
  /** Player-safe line shown under the name on the cast card - never the GM notes. */
  playerBlurb?: string;
  /** Vault-relative establishing image, e.g. "portraits/{id}.jpg". */
  imagePath?: string;
  links: LinkedEntity[];
}

export interface GazetteerState {
  /** The open location's filename, or null. Like NpcLibraryState, the real data is in vault files. */
  selectedFile: string | null;
}

/** Presentation for each kind: a human label and a single-path glyph (stroked, 24x24 viewBox; the
 * `d` may hold several subpaths). Kept beside the model so the tree, badge and picker agree. */
export const KIND_META: Record<LocationKind, { label: string; d: string }> = {
  region:     { label: "Region",     d: "M12 3l8 4.5v9L12 21l-8-4.5v-9z" },
  settlement: { label: "Settlement", d: "M4 21V9l4-2 4 2 4-2 4 2v12M4 21h16M10 21v-5h4v5" },
  landmark:   { label: "Landmark",   d: "M8 21h8M9 21V8l3-5 3 5v13M9 12h6" },
  dungeon:    { label: "Dungeon",    d: "M4 21V10l8-6 8 6v11M10 21v-5a2 2 0 0 1 4 0v5" },
  wilderness: { label: "Wilderness", d: "M12 3l-5 7h3l-4 6h6v5h2v-5h6l-4-6h3z" },
  poi:        { label: "Point of interest", d: "M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  custom:     { label: "Other",      d: "M5 21V4M5 4h11l-2 4 2 4H5" },
};

/** Display order for the kind picker. */
export const KIND_ORDER: LocationKind[] = ["region", "settlement", "landmark", "dungeon", "wilderness", "poi", "custom"];

/** The human label for a location's kind, honouring a custom label. */
export function kindLabel(loc: Pick<GazetteerLocation, "kind" | "customKind">): string {
  if (loc.kind === "custom") return loc.customKind?.trim() || "Other";
  return KIND_META[loc.kind].label;
}
