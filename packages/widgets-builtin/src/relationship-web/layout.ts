// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// A small, dependency-free force-directed layout (the "Tidy" button). Every node repels every
// other, edges act as springs pulling their endpoints toward a rest length, and a weak gravity
// keeps the whole graph from drifting off-centre. Deterministic: fixed iterations, no randomness,
// so the same graph always tidies the same way and it is unit-testable.

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutOptions {
  iterations?: number;
  /** Rest length of an edge spring - the distance connected nodes settle toward. */
  springLength?: number;
  springStrength?: number;
  repulsion?: number;
  /** Pull toward the origin so disconnected clusters do not fly apart. */
  gravity?: number;
  /** Per-iteration step scale; also caps how far a node can move at once (stability). */
  step?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  iterations: 300,
  springLength: 120,
  springStrength: 0.05,
  repulsion: 60000,
  gravity: 0.02,
  step: 0.85,
};

/** Never divide by a zero distance; also the direction used when two nodes sit exactly on top. */
const EPSILON = 0.01;
const MAX_MOVE = 40;

/**
 * Returns new positions for `nodes` after relaxing the force system. Pure: the input array is not
 * mutated. Coincident nodes are nudged apart deterministically (by index) so repulsion has a
 * direction to work with. Ids in `edges` that are not in `nodes` are ignored.
 */
export function relaxLayout(nodes: LayoutNode[], edges: LayoutEdge[], options: LayoutOptions = {}): LayoutNode[] {
  const o = { ...DEFAULTS, ...options };
  // Working copy; seed a tiny deterministic offset so exactly-coincident nodes can separate.
  const pos = nodes.map((n, i) => ({ id: n.id, x: n.x + i * EPSILON, y: n.y + i * EPSILON }));
  const index = new Map(pos.map((p, i) => [p.id, i]));

  for (let iter = 0; iter < o.iterations; iter++) {
    const fx = new Array(pos.length).fill(0);
    const fy = new Array(pos.length).fill(0);

    // Repulsion between every pair (O(n^2) - fine for the handful of nodes a GM tracks).
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);
        if (dist < EPSILON) { dx = (i - j) * EPSILON; dy = EPSILON; dist = Math.hypot(dx, dy); }
        const force = o.repulsion / (dist * dist);
        const ux = dx / dist, uy = dy / dist;
        fx[i] += ux * force; fy[i] += uy * force;
        fx[j] -= ux * force; fy[j] -= uy * force;
      }
    }

    // Edge springs pull endpoints toward springLength.
    for (const e of edges) {
      const a = index.get(e.from), b = index.get(e.to);
      if (a === undefined || b === undefined || a === b) continue;
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const dist = Math.max(Math.hypot(dx, dy), EPSILON);
      const force = (dist - o.springLength) * o.springStrength;
      const ux = dx / dist, uy = dy / dist;
      fx[a] += ux * force; fy[a] += uy * force;
      fx[b] -= ux * force; fy[b] -= uy * force;
    }

    // Gravity toward the origin + apply, clamped so a big force can't fling a node across the map.
    for (let i = 0; i < pos.length; i++) {
      fx[i] -= pos[i].x * o.gravity;
      fy[i] -= pos[i].y * o.gravity;
      pos[i].x += clamp(fx[i] * o.step, -MAX_MOVE, MAX_MOVE);
      pos[i].y += clamp(fy[i] * o.step, -MAX_MOVE, MAX_MOVE);
    }
  }

  return pos.map((p) => ({ id: p.id, x: round(p.x), y: round(p.y) }));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Round to a whole pixel - keeps saved state tidy and layout output stable to compare in tests. */
function round(v: number): number {
  return Math.round(v);
}

/** A spiral seed position for the Nth node so freshly added nodes never stack exactly. */
export function seedPosition(n: number): { x: number; y: number } {
  const angle = n * 2.399963; // the golden angle spreads points evenly, like sunflower seeds
  const radius = 40 + n * 12;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}
