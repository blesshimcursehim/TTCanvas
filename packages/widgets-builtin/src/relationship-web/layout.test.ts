// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import { relaxLayout, seedPosition } from "./layout";
import type { LayoutNode, LayoutEdge } from "./layout";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = (ns: LayoutNode[]) => new Map(ns.map((n) => [n.id, n]));

describe("relaxLayout", () => {
  it("is pure - it does not mutate the input", () => {
    const nodes: LayoutNode[] = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }];
    const snapshot = structuredClone(nodes);
    relaxLayout(nodes, []);
    expect(nodes).toEqual(snapshot);
  });

  it("is deterministic - same input gives the same output", () => {
    const nodes: LayoutNode[] = [{ id: "a", x: 5, y: -3 }, { id: "b", x: 10, y: 2 }, { id: "c", x: -4, y: 8 }];
    const edges: LayoutEdge[] = [{ from: "a", to: "b" }, { from: "b", to: "c" }];
    expect(relaxLayout(nodes, edges)).toEqual(relaxLayout(nodes, edges));
  });

  it("separates two coincident nodes", () => {
    const out = byId(relaxLayout([{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }], []));
    expect(dist(out.get("a")!, out.get("b")!)).toBeGreaterThan(1);
  });

  it("settles a connected pair near the spring rest length", () => {
    const out = byId(relaxLayout([{ id: "a", x: 0, y: 0 }, { id: "b", x: 400, y: 0 }], [{ from: "a", to: "b" }], { springLength: 120 }));
    const d = dist(out.get("a")!, out.get("b")!);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(170);
  });

  it("keeps a connected pair closer than an unconnected pair pushed apart", () => {
    const nodes: LayoutNode[] = [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 0 }, // will be linked
      { id: "c", x: 0, y: 5 }, { id: "d", x: 20, y: 5 }, // no link
    ];
    const out = byId(relaxLayout(nodes, [{ from: "a", to: "b" }]));
    expect(dist(out.get("a")!, out.get("b")!)).toBeLessThan(dist(out.get("c")!, out.get("d")!));
  });

  it("ignores edges that reference unknown nodes", () => {
    const out = relaxLayout([{ id: "a", x: 0, y: 0 }], [{ from: "a", to: "ghost" }]);
    expect(out).toHaveLength(1);
    expect(Number.isFinite(out[0].x)).toBe(true);
  });
});

describe("seedPosition", () => {
  it("gives distinct positions for successive nodes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = seedPosition(i);
      seen.add(`${p.x},${p.y}`);
    }
    expect(seen.size).toBe(20);
  });
});
