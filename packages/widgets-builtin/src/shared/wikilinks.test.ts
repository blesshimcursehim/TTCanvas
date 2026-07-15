// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { extractWikilinkTargets, linkKey, buildBacklinkIndex, linkGraph, basenameLabel, buildResolveIndex, resolveLink, parseLinkTarget, type SourceDoc } from "./wikilinks";

describe("extractWikilinkTargets", () => {
  it("pulls targets in order, honours pipe aliases, and trims", () => {
    expect(extractWikilinkTargets("see [[Vex]] and [[ The Gilded Cage | the Cage ]]"))
      .toEqual(["Vex", "The Gilded Cage"]);
  });
  it("returns nothing when there are no links", () => {
    expect(extractWikilinkTargets("plain text [not] a link")).toEqual([]);
  });
});

describe("linkKey / basenameLabel", () => {
  it("normalises name and target to the same key", () => {
    expect(linkKey("The Gilded Cage")).toBe(linkKey("notes/The Gilded Cage.md"));
    expect(linkKey("THE GILDED CAGE")).toBe("the gilded cage");
  });
  it("labels a path by its basename without .md", () => {
    expect(basenameLabel("arc/The Gilded Cage.md")).toBe("The Gilded Cage");
  });
});

const note = (path: string, text: string): SourceDoc => ({ kind: "note", ref: path, label: basenameLabel(path), text, targetKey: linkKey(path) });

// Notes + one NPC and one place that also mention the Gilded Cage note.
const docs: SourceDoc[] = [
  note("The Gilded Cage.md", "See also [[The Gilded Cage]] itself.\nUnder [[Citadel of Thorns]]."),
  note("Citadel of Thorns.md", "Home of the [[The Gilded Cage]]."),
  { kind: "npc", ref: "npcs/vex.json", label: "Vex Duloran", text: "Owns the [[the gilded cage]]." },
  { kind: "place", ref: "locations/citadel.json", label: "Citadel of Thorns", text: "The [[The Gilded Cage]] sits below the keep." },
];

describe("buildBacklinkIndex", () => {
  const index = buildBacklinkIndex(docs);

  it("collects note, npc and place sources for a target, case-insensitively", () => {
    const cage = index.get("the gilded cage")!;
    expect(cage.map((b) => `${b.kind}:${b.label}`).sort())
      .toEqual(["note:Citadel of Thorns", "npc:Vex Duloran", "place:Citadel of Thorns"]);
    const npc = cage.find((b) => b.kind === "npc")!;
    expect(npc.ref).toBe("npcs/vex.json");
    expect(npc.contexts).toEqual(["Owns the [[the gilded cage]]."]);
  });

  it("drops a note's self-link but keeps its other links", () => {
    // The Gilded Cage note links to itself (dropped) and to Citadel (kept).
    expect(index.get("the gilded cage")!.some((b) => b.ref === "The Gilded Cage.md")).toBe(false);
    expect(index.get("citadel of thorns")!.map((b) => b.ref)).toEqual(["The Gilded Cage.md"]);
  });
});

describe("linkGraph", () => {
  const { nodes, edges } = linkGraph(docs);

  it("includes only linked refs, carrying each node's kind", () => {
    expect(nodes.map((n) => `${n.kind}:${n.id}`).sort()).toEqual([
      "note:Citadel of Thorns.md",
      "note:The Gilded Cage.md",
      "npc:npcs/vex.json",
      "place:locations/citadel.json",
    ]);
  });

  it("emits an edge per resolved link from any source kind, de-duped, no self/dangling", () => {
    const key = (e: { from: string; to: string }) => `${e.from} -> ${e.to}`;
    expect(edges.map(key).sort()).toEqual([
      "Citadel of Thorns.md -> The Gilded Cage.md",
      "The Gilded Cage.md -> Citadel of Thorns.md",
      "locations/citadel.json -> The Gilded Cage.md",
      "npcs/vex.json -> The Gilded Cage.md",
    ]);
  });
});

describe("parseLinkTarget", () => {
  it("splits a kind: prefix, leaving subfolder slashes alone", () => {
    expect(parseLinkTarget("place:The Gilded Cage")).toEqual({ forceKind: "place", name: "The Gilded Cage" });
    expect(parseLinkTarget("NPC:Vex")).toEqual({ forceKind: "npc", name: "Vex" });
    expect(parseLinkTarget("arc/Session 12")).toEqual({ name: "arc/Session 12" });
  });

  it("recognises the reference-widget prefixes", () => {
    expect(parseLinkTarget("creature:Goblin")).toEqual({ forceKind: "creature", name: "Goblin" });
    expect(parseLinkTarget("card:Fireball")).toEqual({ forceKind: "card", name: "Fireball" });
    expect(parseLinkTarget("RULE:Grappled")).toEqual({ forceKind: "rule", name: "Grappled" });
  });
});

describe("buildResolveIndex + resolveLink", () => {
  // "Vex" exists as all three kinds; "Citadel of Thorns" only as a place.
  const index = buildResolveIndex([
    { kind: "npc", ref: "npcs/vex.json", name: "Vex" },
    { kind: "note", ref: "Vex.md", name: "Vex" },
    { kind: "place", ref: "locations/vex.json", name: "Vex" },
    { kind: "place", ref: "locations/citadel.json", name: "Citadel of Thorns" },
  ]);

  it("resolves a bare name by precedence note > place > npc", () => {
    expect(resolveLink(index, "Vex")).toEqual({ kind: "note", ref: "Vex.md" });
    expect(resolveLink(index, "citadel of thorns")).toEqual({ kind: "place", ref: "locations/citadel.json" });
  });

  it("lets a kind: prefix force past precedence", () => {
    expect(resolveLink(index, "place:Vex")).toEqual({ kind: "place", ref: "locations/vex.json" });
    expect(resolveLink(index, "npc:Vex")).toEqual({ kind: "npc", ref: "npcs/vex.json" });
  });

  it("returns null for an unknown name or a forced kind that has no match", () => {
    expect(resolveLink(index, "Nobody")).toBeNull();
    expect(resolveLink(index, "npc:Citadel of Thorns")).toBeNull();
  });

  it("resolves reference-widget targets by prefix and bare precedence", () => {
    const idx = buildResolveIndex([
      { kind: "creature", ref: "goblin-1", name: "Goblin" },
      { kind: "card", ref: "card-fireball", name: "Fireball" },
      { kind: "rule", ref: "combat/Grappling.md", name: "Grappling" },
      { kind: "note", ref: "Goblin.md", name: "Goblin" }, // shares a name with the creature
    ]);
    expect(resolveLink(idx, "creature:Goblin")).toEqual({ kind: "creature", ref: "goblin-1" });
    expect(resolveLink(idx, "card:Fireball")).toEqual({ kind: "card", ref: "card-fireball" });
    expect(resolveLink(idx, "rule:Grappling")).toEqual({ kind: "rule", ref: "combat/Grappling.md" });
    // Bare "Goblin" is both a note and a creature: the note wins (Obsidian-safe precedence).
    expect(resolveLink(idx, "Goblin")).toEqual({ kind: "note", ref: "Goblin.md" });
    // Bare "Fireball" only exists as a card, so it resolves there without a prefix.
    expect(resolveLink(idx, "Fireball")).toEqual({ kind: "card", ref: "card-fireball" });
  });
});
