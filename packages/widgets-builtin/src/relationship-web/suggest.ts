// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Turns relationships the GM already recorded elsewhere into proposed graph links, so the
// Relationship Web stops being a third (or fourth) place to re-type the same relationships. Pure and
// review-gated: each suggestLinksFrom* function only *proposes*, applySuggestions runs on the subset
// the GM confirmed. Three sources, all merged and de-duplicated by suggestLinks:
//  - NPC Library's own faction/location fields (suggestLinksFromNpcs)
//  - a Gazetteer place's linked NPCs (suggestLinksFromGazetteer) - the same "located in" relationship,
//    just recorded on the place's side instead
//  - `[[wikilinks]]` in an NPC's notes that resolve to another NPC or a place (suggestMentionLinks),
//    proposed as a generic "mentions" edge since the suggester can't know the relationship's nature
// Locations have no first-class node kind in the graph, so they become "custom" nodes joined by a
// labelled edge; factions map straight onto the faction node kind and the member edge.

import type { NpcRef, GazetteerLocationRef } from "@ttcanvas/core";
import type { RelNode, RelEdge, RelationshipWebState, EdgeType } from "./types";
import { EDGE_TYPES } from "./types";
import { seedPosition } from "./layout";
import { buildResolveIndex, resolveLink, extractWikilinkTargets, type SourceDoc } from "../shared/wikilinks";

/** A faction/place target resolves by case-insensitive label match, since neither has a first-class
 *  node kind of its own; an NPC target instead resolves by ref, like every other npc node. Modelled
 *  as a discriminated union (rather than an optional `targetRef` alongside a three-way `targetKind`)
 *  so a "npc" target without a ref simply isn't constructible, and `applySuggestions` can branch on
 *  `targetKind` without an assertion. */
type LinkSuggestionTarget =
  | { targetKind: "faction" | "place"; targetRef?: undefined }
  | { targetKind: "npc"; targetRef: string };

export type LinkSuggestion = {
  /** Stable identity for the review checkbox and self-dedupe: from + edge type + target. */
  key: string;
  /** Whether the "from" side is an NPC (the common case) or a Gazetteer place (a place's notes
   *  mentioning something, or a place recorded as the "from" side of its own linked-NPC entry). */
  fromKind: "npc" | "place";
  fromRef: string;
  fromName: string;
  /** The faction/place/NPC name to link the "from" side to. */
  target: string;
  /** "member" (NPC -> faction) or "custom" (NPC/place -> place/NPC, carrying the edgeLabel). */
  edgeType: EdgeType;
  edgeLabel?: string;
} & LinkSuggestionTarget;

const norm = (s: string) => s.trim().toLowerCase();

/** A place or an NPC target is drawn as a generic "custom"/"faction" node by label match; an NPC
 *  target instead resolves by ref (handled separately in applySuggestions/suggest functions). */
const nodeKindFor = (t: "faction" | "place"): "faction" | "custom" => (t === "faction" ? "faction" : "custom");

const findNpcNode = (nodes: RelNode[], file: string) =>
  nodes.find((n) => n.kind === "npc" && n.ref === file);

const findTargetNode = (nodes: RelNode[], kind: "faction" | "custom", label: string) =>
  nodes.find((n) => n.kind === kind && norm(n.label) === norm(label));

// A link the graph already records. Undirected types (a location's "located in", allies, ...) match
// the reverse orientation too, so the same relationship drawn either way is recognised. A labelled
// suggestion (the "located in"/"mentions" edge) only dedupes against the same label - compared case-
// and whitespace-insensitively, so a hand-typed "Located in" still matches - which keeps an unrelated
// custom edge between the two nodes from masking it; an unlabelled type (member) ignores labels.
const edgeExists = (edges: RelEdge[], from: string, to: string, type: EdgeType, label?: string) =>
  edges.some((e) => {
    if (e.type !== type) return false;
    const sameEnds = e.from === from && e.to === to;
    const reversed = !EDGE_TYPES[type].directed && e.from === to && e.to === from;
    if (!sameEnds && !reversed) return false;
    return label === undefined || norm(e.label ?? "") === norm(label);
  });

/**
 * Proposed links from NPC metadata, minus any the graph already records. An NPC that is not yet a
 * node still yields suggestions - accepting one adds the node - so this can bootstrap an empty web.
 * A location linked to a real Gazetteer place (`locationRef`) suggests the place's live name instead
 * of the possibly-stale cached `location` string, falling back to it if the ref is dangling.
 */
export function suggestLinksFromNpcs(
  npcs: NpcRef[], locations: GazetteerLocationRef[], state: RelationshipWebState,
): LinkSuggestion[] {
  const locByFile = new Map(locations.map((l) => [l.filename, l]));
  const out: LinkSuggestion[] = [];
  const seen = new Set<string>();
  for (const npc of npcs) {
    const liveLocation = npc.locationRef ? locByFile.get(npc.locationRef)?.name : undefined;
    const fields: { value?: string; targetKind: "faction" | "place"; edgeType: EdgeType; edgeLabel?: string }[] = [
      { value: npc.faction, targetKind: "faction", edgeType: "member" },
      { value: liveLocation ?? npc.location, targetKind: "place", edgeType: "custom", edgeLabel: "located in" },
    ];
    for (const f of fields) {
      const target = f.value?.trim();
      if (!target) continue;
      const key = `${npc.filename}|${f.edgeType}|${norm(target)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const npcNode = findNpcNode(state.nodes, npc.filename);
      const targetNode = findTargetNode(state.nodes, nodeKindFor(f.targetKind), target);
      if (npcNode && targetNode && edgeExists(state.edges, npcNode.id, targetNode.id, f.edgeType, f.edgeLabel)) continue;
      out.push({
        key, fromKind: "npc", fromRef: npc.filename, fromName: npc.name,
        target, targetKind: f.targetKind, edgeType: f.edgeType, edgeLabel: f.edgeLabel,
      });
    }
  }
  return out;
}

/**
 * Proposed "located in" links from a Gazetteer place's own linked NPCs - the same relationship
 * `suggestLinksFromNpcs` already covers from the NPC's side, just recorded on the place's side
 * instead (useful for an NPC with no location string of its own). Shares that function's key shape,
 * so the same pair suggested from both sources collapses into one via `suggestLinks`.
 */
export function suggestLinksFromGazetteer(
  locations: GazetteerLocationRef[], npcs: NpcRef[], state: RelationshipWebState,
): LinkSuggestion[] {
  const npcByFile = new Map(npcs.map((n) => [n.filename, n]));
  const out: LinkSuggestion[] = [];
  const seen = new Set<string>();
  for (const loc of locations) {
    for (const link of loc.links) {
      if (link.kind !== "npc" || !link.ref) continue;
      const target = loc.name.trim();
      if (!target) continue;
      const key = `${link.ref}|custom|${norm(target)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const npcNode = findNpcNode(state.nodes, link.ref);
      const targetNode = findTargetNode(state.nodes, "custom", target);
      if (npcNode && targetNode && edgeExists(state.edges, npcNode.id, targetNode.id, "custom", "located in")) continue;
      out.push({
        key, fromKind: "npc", fromRef: link.ref, fromName: npcByFile.get(link.ref)?.name ?? link.label,
        target, targetKind: "place", edgeType: "custom", edgeLabel: "located in",
      });
    }
  }
  return out;
}

/**
 * Proposed generic "mentions" links from `[[wikilinks]]` in an NPC's notes that resolve to another
 * NPC or a Gazetteer place. The suggester can't know the relationship's nature, so it always proposes
 * the same neutral custom edge - the GM can retype it into something specific (ally, enemy, debt...)
 * after accepting. Scoped to NPC notes as the source this pass; Gazetteer place bodies are a natural,
 * cheap follow-up (same shape) once this ships.
 */
export function suggestMentionLinks(
  npcNoteSources: SourceDoc[], npcs: NpcRef[], locations: GazetteerLocationRef[], state: RelationshipWebState,
): LinkSuggestion[] {
  const index = buildResolveIndex([
    ...npcs.map((n) => ({ kind: "npc" as const, ref: n.filename, name: n.name })),
    ...locations.map((l) => ({ kind: "place" as const, ref: l.filename, name: l.name })),
  ]);
  const npcByFile = new Map(npcs.map((n) => [n.filename, n]));
  const locByFile = new Map(locations.map((l) => [l.filename, l]));
  const out: LinkSuggestion[] = [];
  const seen = new Set<string>();
  for (const doc of npcNoteSources) {
    const fromName = npcByFile.get(doc.ref)?.name ?? doc.label;
    for (const target of extractWikilinkTargets(doc.text)) {
      const hit = resolveLink(index, target);
      if (!hit || hit.ref === doc.ref) continue; // unresolved, or the NPC linking to itself
      if (hit.kind !== "npc" && hit.kind !== "place") continue; // not graph-representable here
      const targetName = hit.kind === "npc" ? npcByFile.get(hit.ref)?.name : locByFile.get(hit.ref)?.name;
      if (!targetName) continue;
      const key = `${doc.ref}|mentions|${hit.kind}|${norm(targetName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fromNode = findNpcNode(state.nodes, doc.ref);
      const toNode = hit.kind === "npc" ? findNpcNode(state.nodes, hit.ref) : findTargetNode(state.nodes, "custom", targetName);
      if (fromNode && toNode && edgeExists(state.edges, fromNode.id, toNode.id, "custom", "mentions")) continue;
      out.push(
        hit.kind === "npc"
          ? { key, fromKind: "npc", fromRef: doc.ref, fromName, target: targetName, targetKind: "npc", targetRef: hit.ref, edgeType: "custom", edgeLabel: "mentions" }
          : { key, fromKind: "npc", fromRef: doc.ref, fromName, target: targetName, targetKind: "place", targetRef: undefined, edgeType: "custom", edgeLabel: "mentions" },
      );
    }
  }
  return out;
}

/** All three sources, merged and de-duplicated by key (the same pair suggested from more than one
 *  source - e.g. an NPC's own location string and a place's linked-NPC entry agreeing - collapses
 *  into a single suggestion). */
export function suggestLinks(
  npcs: NpcRef[], locations: GazetteerLocationRef[], npcNoteSources: SourceDoc[], state: RelationshipWebState,
): LinkSuggestion[] {
  const combined = [
    ...suggestLinksFromNpcs(npcs, locations, state),
    ...suggestLinksFromGazetteer(locations, npcs, state),
    ...suggestMentionLinks(npcNoteSources, npcs, locations, state),
  ];
  const seen = new Set<string>();
  const out: LinkSuggestion[] = [];
  for (const s of combined) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  return out;
}

/**
 * Add the accepted suggestions to the graph, creating any missing node(s) and skipping edges that
 * already exist. NPC-kind ends resolve by ref (de-duplicating with any existing linked node);
 * faction/place ends resolve by case-insensitive label, so accepting two suggestions for the same
 * faction or place reuses one node.
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
    const from = s.fromKind === "npc" ? ensureNpcNode(s.fromRef, s.fromName) : ensureTargetNode("custom", s.fromName);
    const to = s.targetKind === "npc"
      ? ensureNpcNode(s.targetRef, s.target)
      : ensureTargetNode(nodeKindFor(s.targetKind), s.target);
    if (!edgeExists(edges, from, to, s.edgeType, s.edgeLabel)) {
      edges.push({ id: crypto.randomUUID(), from, to, type: s.edgeType, ...(s.edgeLabel ? { label: s.edgeLabel } : {}) });
    }
  }
  return { ...state, nodes, edges };
}
