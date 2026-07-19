// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Turns the faction/location the GM already recorded on NPC Library entries into proposed graph
// links, so the Relationship Web stops being a third place to re-type the same relationships. Pure
// and review-gated: suggestLinksFromNpcs only *proposes*, applySuggestions runs on the subset the
// GM confirmed. Locations have no first-class node kind, so they become "custom" nodes joined by a
// labelled "located in" edge; factions map straight onto the faction node kind and the member edge.

import type { NpcRef } from "@ttcanvas/core";
import type { RelNode, RelEdge, RelationshipWebState, EdgeType } from "./types";
import { seedPosition } from "./layout";

export interface LinkSuggestion {
  /** Stable identity for the review checkbox and self-dedupe: npc + edge type + target. */
  key: string;
  npcFile: string;
  npcName: string;
  /** The faction name or place name to link the NPC to. */
  target: string;
  targetKind: "faction" | "place";
  /** "member" (NPC -> faction) or "custom" (NPC -> place, carrying the edgeLabel). */
  edgeType: EdgeType;
  edgeLabel?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** A place is drawn as a generic "custom" node (the graph has no place kind); a faction as its own. */
const nodeKindFor = (t: LinkSuggestion["targetKind"]): "faction" | "custom" =>
  t === "faction" ? "faction" : "custom";

const findNpcNode = (nodes: RelNode[], file: string) =>
  nodes.find((n) => n.kind === "npc" && n.ref === file);

const findTargetNode = (nodes: RelNode[], kind: "faction" | "custom", label: string) =>
  nodes.find((n) => n.kind === kind && norm(n.label) === norm(label));

const edgeExists = (edges: RelEdge[], from: string, to: string, type: EdgeType) =>
  edges.some((e) => e.type === type && e.from === from && e.to === to);

/**
 * Proposed links from NPC metadata, minus any the graph already records. An NPC that is not yet a
 * node still yields suggestions - accepting one adds the node - so this can bootstrap an empty web.
 */
export function suggestLinksFromNpcs(npcs: NpcRef[], state: RelationshipWebState): LinkSuggestion[] {
  const out: LinkSuggestion[] = [];
  const seen = new Set<string>();
  for (const npc of npcs) {
    const fields: { value?: string; targetKind: LinkSuggestion["targetKind"]; edgeType: EdgeType; edgeLabel?: string }[] = [
      { value: npc.faction, targetKind: "faction", edgeType: "member" },
      { value: npc.location, targetKind: "place", edgeType: "custom", edgeLabel: "located in" },
    ];
    for (const f of fields) {
      const target = f.value?.trim();
      if (!target) continue;
      const key = `${npc.filename}|${f.edgeType}|${norm(target)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const npcNode = findNpcNode(state.nodes, npc.filename);
      const targetNode = findTargetNode(state.nodes, nodeKindFor(f.targetKind), target);
      if (npcNode && targetNode && edgeExists(state.edges, npcNode.id, targetNode.id, f.edgeType)) continue;
      out.push({ key, npcFile: npc.filename, npcName: npc.name, target, targetKind: f.targetKind, edgeType: f.edgeType, edgeLabel: f.edgeLabel });
    }
  }
  return out;
}

/**
 * Add the accepted suggestions to the graph, creating any missing NPC / target nodes and skipping
 * edges that already exist. Node matching is by ref (NPCs) or case-insensitive label (targets), so
 * accepting two NPCs in the same faction reuses one faction node.
 */
export function applySuggestions(state: RelationshipWebState, accepted: LinkSuggestion[]): RelationshipWebState {
  const nodes = [...state.nodes];
  const edges = [...state.edges];

  const ensureNpcNode = (file: string, name: string): string => {
    const found = findNpcNode(nodes, file);
    if (found) return found.id;
    const pos = seedPosition(nodes.length);
    const node: RelNode = { id: crypto.randomUUID(), kind: "npc", ref: file, label: name, x: pos.x, y: pos.y };
    nodes.push(node);
    return node.id;
  };
  const ensureTargetNode = (kind: "faction" | "custom", label: string): string => {
    const found = findTargetNode(nodes, kind, label);
    if (found) return found.id;
    const pos = seedPosition(nodes.length);
    const node: RelNode = { id: crypto.randomUUID(), kind, ref: null, label, x: pos.x, y: pos.y };
    nodes.push(node);
    return node.id;
  };

  for (const s of accepted) {
    const from = ensureNpcNode(s.npcFile, s.npcName);
    const to = ensureTargetNode(nodeKindFor(s.targetKind), s.target);
    if (!edgeExists(edges, from, to, s.edgeType)) {
      edges.push({ id: crypto.randomUUID(), from, to, type: s.edgeType, ...(s.edgeLabel ? { label: s.edgeLabel } : {}) });
    }
  }
  return { ...state, nodes, edges };
}
