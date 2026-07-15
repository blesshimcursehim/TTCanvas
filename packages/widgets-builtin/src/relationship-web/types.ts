// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

/** What a node stands for. Linked kinds ("npc"/"pc") mirror an existing entity and cache its
 * name so the graph renders even before the source loads; free-standing kinds own their label. */
export type NodeKind = "npc" | "pc" | "faction" | "custom";

export interface RelNode {
  id: string;
  kind: NodeKind;
  /** Display name. For linked nodes it is refreshed from the source; the cache keeps the graph
   * readable if the NPC file or party member is missing. */
  label: string;
  /** Link target: an NPC Library filename (kind "npc") or a party member id (kind "pc"). Null for
   * free-standing faction/custom nodes. */
  ref: string | null;
  /** Saved position in graph coordinates (pre pan/zoom). Set by drag or the Tidy auto-layout. */
  x: number;
  y: number;
  /** Accent colour for faction/custom nodes; linked nodes derive theirs from the source. */
  color?: string;
}

/** The preset relationship kinds. `custom` carries its meaning in the edge label instead. */
export type EdgeType = "ally" | "enemy" | "family" | "member" | "debt" | "custom";

export interface RelEdge {
  id: string;
  /** Source and target node ids. For directed types the arrow points from -> to. */
  from: string;
  to: string;
  type: EdgeType;
  /** Free-text detail / the label for a custom edge (e.g. "owes 500gp"). */
  label?: string;
}

export interface RelationshipWebState {
  nodes: RelNode[];
  edges: RelEdge[];
  /** Currently selected node or edge id (drives the inspector). */
  selectedId: string | null;
}

/** Presentation for each edge type: a token-referencing colour, a human label, and whether it is
 * directional (draws an arrowhead). Kept beside the model so the widget and inspector agree. */
export const EDGE_TYPES: Record<EdgeType, { label: string; color: string; directed: boolean }> = {
  ally:   { label: "Ally",        color: "oklch(0.68 0.15 145)", directed: false }, // green
  enemy:  { label: "Enemy",       color: "oklch(0.62 0.20 25)",  directed: false }, // red
  family: { label: "Family",      color: "oklch(0.70 0.13 60)",  directed: false }, // amber-gold
  member: { label: "Member of",   color: "oklch(0.62 0.15 290)", directed: true  }, // violet
  debt:   { label: "Owes a debt", color: "oklch(0.74 0.10 200)", directed: true  }, // cyan
  custom: { label: "Custom",      color: "oklch(0.62 0.02 258)", directed: false }, // neutral
};
