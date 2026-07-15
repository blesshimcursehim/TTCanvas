// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { buildLocationTree, breadcrumbTrail, childrenOf, descendantIds } from "./hierarchy";
import type { GazetteerLocation } from "./types";

function loc(id: string, name: string, parentId: string | null): GazetteerLocation {
  return { filename: `locations/${id}.json`, id, name, kind: "poi", parentId, links: [] };
}

// Feywild > Citadel > { Gilded Cage, Thornmarket }; plus a top-level Barrow.
const world: GazetteerLocation[] = [
  loc("thornmarket", "Thornmarket", "citadel"),
  loc("citadel", "Citadel of Thorns", "feywild"),
  loc("feywild", "The Feywild", null),
  loc("cage", "The Gilded Cage", "citadel"),
  loc("barrow", "Barrow of Kings", null),
];

describe("hierarchy", () => {
  it("nests and name-sorts the tree", () => {
    const tree = buildLocationTree(world);
    expect(tree.map((n) => n.location.name)).toEqual(["Barrow of Kings", "The Feywild"]);
    const feywild = tree[1];
    expect(feywild.depth).toBe(0);
    const citadel = feywild.children[0];
    expect(citadel.location.name).toBe("Citadel of Thorns");
    expect(citadel.depth).toBe(1);
    expect(citadel.children.map((n) => n.location.name)).toEqual(["The Gilded Cage", "Thornmarket"]);
    expect(citadel.children[0].depth).toBe(2);
  });

  it("treats a dangling parent as a root", () => {
    const orphan = [loc("a", "Orphan", "ghost")];
    const tree = buildLocationTree(orphan);
    expect(tree).toHaveLength(1);
    expect(tree[0].location.id).toBe("a");
  });

  it("does not loop on a cycle - the cyclic nodes surface as roots", () => {
    const cyclic = [loc("a", "A", "b"), loc("b", "B", "a")];
    const tree = buildLocationTree(cyclic);
    // Neither can be placed under the other without closing the loop, so both fall back to roots.
    expect(tree.map((n) => n.location.id).sort()).toEqual(["a", "b"]);
  });

  it("builds a root-first breadcrumb trail including the node", () => {
    expect(breadcrumbTrail(world, "cage").map((l) => l.name))
      .toEqual(["The Feywild", "Citadel of Thorns", "The Gilded Cage"]);
    expect(breadcrumbTrail(world, "feywild").map((l) => l.name)).toEqual(["The Feywild"]);
    expect(breadcrumbTrail(world, "ghost")).toEqual([]);
  });

  it("lists direct children only, name-sorted", () => {
    expect(childrenOf(world, "citadel").map((l) => l.name)).toEqual(["The Gilded Cage", "Thornmarket"]);
    expect(childrenOf(world, "cage")).toEqual([]);
  });

  it("collects the whole subtree for the parent picker guard", () => {
    expect(descendantIds(world, "feywild")).toEqual(new Set(["citadel", "cage", "thornmarket"]));
    expect(descendantIds(world, "barrow")).toEqual(new Set());
  });
});
