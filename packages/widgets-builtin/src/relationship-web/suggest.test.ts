// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import type { NpcRef } from "@ttcanvas/core";
import type { RelationshipWebState, RelNode } from "./types";
import { suggestLinksFromNpcs, applySuggestions } from "./suggest";

function npc(filename: string, name: string, extra: Partial<NpcRef> = {}): NpcRef {
  return { filename, id: filename, name, ...extra };
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
    expect(s[0]).toMatchObject({ npcName: "Vex", target: "Zhentarim", edgeType: "member", targetKind: "faction" });
    expect(s[1]).toMatchObject({ npcName: "Vex", target: "Waterdeep", edgeType: "custom", targetKind: "place", edgeLabel: "located in" });
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
});
