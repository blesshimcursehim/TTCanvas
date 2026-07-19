// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { NpcRef, GazetteerLocationRef } from "@ttcanvas/core";
import type { RelationshipWebState, RelNode } from "./types";
import { suggestLinksFromNpcs, suggestLinksFromGazetteer, suggestMentionLinks, suggestLinks, applySuggestions } from "./suggest";
import type { SourceDoc } from "../shared/wikilinks";

function npc(filename: string, name: string, extra: Partial<NpcRef> = {}): NpcRef {
  return { filename, id: filename, name, ...extra };
}

function location(filename: string, name: string, extra: Partial<GazetteerLocationRef> = {}): GazetteerLocationRef {
  return { filename, id: filename, name, kind: "settlement", links: [], ...extra };
}

const EMPTY: RelationshipWebState = { nodes: [], edges: [], selectedId: null };

function node(id: string, kind: RelNode["kind"], label: string, ref: string | null): RelNode {
  return { id, kind, label, ref, x: 0, y: 0 };
}

describe("suggestLinksFromNpcs", () => {
  it("proposes a member edge for a faction and a located-in edge for a location", () => {
    const npcs = [npc("npcs/vex.json", "Vex", { faction: "Zhentarim", location: "Waterdeep" })];
    const s = suggestLinksFromNpcs(npcs, EMPTY);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ fromName: "Vex", target: "Zhentarim", edgeType: "member", targetKind: "faction" });
    expect(s[1]).toMatchObject({ fromName: "Vex", target: "Waterdeep", edgeType: "custom", targetKind: "place", edgeLabel: "located in" });
  });

  it("ignores NPCs with no faction or location, and blank/whitespace fields", () => {
    const npcs = [npc("a.json", "A"), npc("b.json", "B", { faction: "   " })];
    expect(suggestLinksFromNpcs(npcs, EMPTY)).toEqual([]);
  });

  it("skips a link the graph already records", () => {
    const state: RelationshipWebState = {
      nodes: [node("n1", "npc", "Vex", "npcs/vex.json"), node("f1", "faction", "Zhentarim", null)],
      edges: [{ id: "e1", from: "n1", to: "f1", type: "member" }],
      selectedId: null,
    };
    const s = suggestLinksFromNpcs([npc("npcs/vex.json", "Vex", { faction: "Zhentarim" })], state);
    expect(s).toEqual([]);
  });

  it("still suggests when the faction node exists but the edge does not", () => {
    const state: RelationshipWebState = {
      nodes: [node("n1", "npc", "Vex", "npcs/vex.json"), node("f1", "faction", "Zhentarim", null)],
      edges: [],
      selectedId: null,
    };
    expect(suggestLinksFromNpcs([npc("npcs/vex.json", "Vex", { faction: "Zhentarim" })], state)).toHaveLength(1);
  });

  it("still suggests a location link when only an unrelated custom edge connects the two", () => {
    const state: RelationshipWebState = {
      nodes: [node("n1", "npc", "Vex", "npcs/vex.json"), node("p1", "custom", "Waterdeep", null)],
      edges: [{ id: "e1", from: "n1", to: "p1", type: "custom", label: "rival in" }],
      selectedId: null,
    };
    const s = suggestLinksFromNpcs([npc("npcs/vex.json", "Vex", { location: "Waterdeep" })], state);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ target: "Waterdeep", edgeLabel: "located in" });
  });

  it("recognises a reverse located-in edge, since custom edges are undirected", () => {
    const state: RelationshipWebState = {
      nodes: [node("n1", "npc", "Vex", "npcs/vex.json"), node("p1", "custom", "Waterdeep", null)],
      edges: [{ id: "e1", from: "p1", to: "n1", type: "custom", label: "located in" }],
      selectedId: null,
    };
    expect(suggestLinksFromNpcs([npc("npcs/vex.json", "Vex", { location: "Waterdeep" })], state)).toEqual([]);
  });

  it("dedupes against a hand-typed edge label regardless of case or surrounding space", () => {
    const state: RelationshipWebState = {
      nodes: [node("n1", "npc", "Vex", "npcs/vex.json"), node("p1", "custom", "Waterdeep", null)],
      edges: [{ id: "e1", from: "n1", to: "p1", type: "custom", label: " Located In " }],
      selectedId: null,
    };
    expect(suggestLinksFromNpcs([npc("npcs/vex.json", "Vex", { location: "Waterdeep" })], state)).toEqual([]);
  });
});

describe("suggestLinksFromGazetteer", () => {
  it("proposes a located-in edge from a place's linked NPC", () => {
    const npcs = [npc("npcs/vex.json", "Vex")];
    const locations = [location("locations/waterdeep.json", "Waterdeep", { links: [{ kind: "npc", ref: "npcs/vex.json", label: "Vex" }] })];
    const s = suggestLinksFromGazetteer(locations, npcs, EMPTY);
    expect(s).toEqual([expect.objectContaining({ fromKind: "npc", fromRef: "npcs/vex.json", fromName: "Vex", target: "Waterdeep", targetKind: "place", edgeLabel: "located in" })]);
  });

  it("falls back to the link's cached label when the NPC isn't in the shared list", () => {
    const locations = [location("locations/waterdeep.json", "Waterdeep", { links: [{ kind: "npc", ref: "npcs/missing.json", label: "Ghost" }] })];
    const s = suggestLinksFromGazetteer(locations, [], EMPTY);
    expect(s[0]).toMatchObject({ fromName: "Ghost" });
  });

  it("ignores linked factions - no structured identity to reconcile against", () => {
    const locations = [location("locations/waterdeep.json", "Waterdeep", { links: [{ kind: "faction", ref: null, label: "Harpers" }] })];
    expect(suggestLinksFromGazetteer(locations, [], EMPTY)).toEqual([]);
  });

  it("collapses with the same pair already suggested from NPC metadata, via suggestLinks", () => {
    const npcs = [npc("npcs/vex.json", "Vex", { location: "Waterdeep" })];
    const locations = [location("locations/waterdeep.json", "Waterdeep", { links: [{ kind: "npc", ref: "npcs/vex.json", label: "Vex" }] })];
    const s = suggestLinks(npcs, locations, [], EMPTY);
    expect(s.filter((x) => x.target === "Waterdeep")).toHaveLength(1);
  });
});

describe("suggestMentionLinks", () => {
  const npcs = [npc("npcs/vex.json", "Vex"), npc("npcs/borin.json", "Borin")];
  const locations = [location("locations/waterdeep.json", "Waterdeep")];

  function noteSource(ref: string, label: string, text: string): SourceDoc {
    return { kind: "npc", ref, label, text };
  }

  it("proposes a mentions edge to another NPC resolved by wikilink", () => {
    const sources = [noteSource("npcs/vex.json", "Vex", "Owes a debt to [[Borin]].")];
    const s = suggestMentionLinks(sources, npcs, locations, EMPTY);
    expect(s).toEqual([expect.objectContaining({
      fromKind: "npc", fromRef: "npcs/vex.json", fromName: "Vex",
      target: "Borin", targetKind: "npc", targetRef: "npcs/borin.json",
      edgeType: "custom", edgeLabel: "mentions",
    })]);
  });

  it("proposes a mentions edge to a place resolved by wikilink", () => {
    const sources = [noteSource("npcs/vex.json", "Vex", "Grew up in [[Waterdeep]].")];
    const s = suggestMentionLinks(sources, npcs, locations, EMPTY);
    expect(s).toEqual([expect.objectContaining({ target: "Waterdeep", targetKind: "place", targetRef: undefined })]);
  });

  it("ignores an unresolved wikilink and a self-link", () => {
    const sources = [noteSource("npcs/vex.json", "Vex", "See [[Nowhere]] and [[Vex]].")];
    expect(suggestMentionLinks(sources, npcs, locations, EMPTY)).toEqual([]);
  });

  it("skips a mention the graph already records", () => {
    const state: RelationshipWebState = {
      nodes: [node("n1", "npc", "Vex", "npcs/vex.json"), node("n2", "npc", "Borin", "npcs/borin.json")],
      edges: [{ id: "e1", from: "n1", to: "n2", type: "custom", label: "mentions" }],
      selectedId: null,
    };
    const sources = [noteSource("npcs/vex.json", "Vex", "Owes a debt to [[Borin]].")];
    expect(suggestMentionLinks(sources, npcs, locations, state)).toEqual([]);
  });
});

describe("applySuggestions", () => {
  it("creates the NPC node, faction node and member edge from an empty graph", () => {
    const s = suggestLinksFromNpcs([npc("npcs/vex.json", "Vex", { faction: "Zhentarim" })], EMPTY);
    const next = applySuggestions(EMPTY, s);
    expect(next.nodes.map((n) => [n.kind, n.label])).toEqual([["npc", "Vex"], ["faction", "Zhentarim"]]);
    expect(next.edges).toHaveLength(1);
    const [npcNode, facNode] = next.nodes;
    expect(next.edges[0]).toMatchObject({ from: npcNode.id, to: facNode.id, type: "member" });
  });

  it("reuses one faction node for two NPCs sharing it, case-insensitively", () => {
    const npcs = [
      npc("a.json", "Aria", { faction: "Harpers" }),
      npc("b.json", "Borin", { faction: "harpers" }),
    ];
    const next = applySuggestions(EMPTY, suggestLinksFromNpcs(npcs, EMPTY));
    expect(next.nodes.filter((n) => n.kind === "faction")).toHaveLength(1);
    expect(next.nodes.filter((n) => n.kind === "npc")).toHaveLength(2);
    expect(next.edges).toHaveLength(2);
  });

  it("labels a location edge and represents the place as a custom node", () => {
    const next = applySuggestions(EMPTY, suggestLinksFromNpcs([npc("a.json", "Aria", { location: "Neverwinter" })], EMPTY));
    expect(next.nodes.find((n) => n.kind === "custom")?.label).toBe("Neverwinter");
    expect(next.edges[0]).toMatchObject({ type: "custom", label: "located in" });
  });

  it("does not duplicate an edge that already exists", () => {
    const first = applySuggestions(EMPTY, suggestLinksFromNpcs([npc("a.json", "Aria", { faction: "Harpers" })], EMPTY));
    // Re-running the suggestion against the now-populated graph yields nothing to add.
    const again = suggestLinksFromNpcs([npc("a.json", "Aria", { faction: "Harpers" })], first);
    expect(again).toEqual([]);
    const next = applySuggestions(first, again);
    expect(next.edges).toHaveLength(1);
  });

  it("resolves a mentions suggestion's npc target by ref, reusing the existing node", () => {
    const state: RelationshipWebState = { nodes: [node("n1", "npc", "Vex", "npcs/vex.json")], edges: [], selectedId: null };
    const suggestion = {
      key: "k", fromKind: "npc" as const, fromRef: "npcs/vex.json", fromName: "Vex",
      target: "Borin", targetKind: "npc" as const, targetRef: "npcs/borin.json",
      edgeType: "custom" as const, edgeLabel: "mentions",
    };
    const next = applySuggestions(state, [suggestion]);
    expect(next.nodes).toHaveLength(2);
    expect(next.nodes[1]).toMatchObject({ kind: "npc", ref: "npcs/borin.json", label: "Borin" });
    expect(next.edges[0]).toMatchObject({ from: "n1", to: next.nodes[1].id, type: "custom", label: "mentions" });
  });
});
