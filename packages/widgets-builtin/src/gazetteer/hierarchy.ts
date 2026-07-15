// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import type { GazetteerLocation } from "./types";

export interface LocationTreeNode {
  location: GazetteerLocation;
  children: LocationTreeNode[];
  /** Nesting depth from a root (0 = top level) - drives the tree row indent. */
  depth: number;
}

/** Walk up from `startParent` following parentId; true if the chain loops or ever reaches `selfId`.
 * Used so a broken vault (a place parented under its own descendant, or a mutual pair) can't wedge
 * the tree into an infinite recursion. */
function chainReaches(startParent: string, selfId: string, byId: Map<string, GazetteerLocation>): boolean {
  let cur: string | null = startParent;
  const seen = new Set<string>();
  while (cur) {
    if (cur === selfId || seen.has(cur)) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}

/** The parent id to actually place a location under: its `parentId` if that points at a different,
 * existing location without closing a cycle; otherwise null (treat as a root). */
export function effectiveParentId(loc: GazetteerLocation, byId: Map<string, GazetteerLocation>): string | null {
  const p = loc.parentId;
  if (!p || p === loc.id || !byId.has(p)) return null;
  if (chainReaches(p, loc.id, byId)) return null;
  return p;
}

const byName = (a: LocationTreeNode, b: LocationTreeNode) => a.location.name.localeCompare(b.location.name);

/** Build the nested, name-sorted tree from a flat list, tolerating dangling parents and cycles. */
export function buildLocationTree(locations: GazetteerLocation[]): LocationTreeNode[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const childrenByParent = new Map<string | null, GazetteerLocation[]>();
  for (const loc of locations) {
    const parent = effectiveParentId(loc, byId);
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(loc);
    else childrenByParent.set(parent, [loc]);
  }
  const build = (parent: string | null, depth: number): LocationTreeNode[] =>
    (childrenByParent.get(parent) ?? [])
      .map((location) => ({ location, depth, children: build(location.id, depth + 1) }))
      .sort(byName);
  return build(null, 0);
}

/** Ancestors from the root down to and including `id` (root first). Empty if the id is unknown. */
export function breadcrumbTrail(locations: GazetteerLocation[], id: string): GazetteerLocation[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const trail: GazetteerLocation[] = [];
  const seen = new Set<string>();
  let cur: string | null = id;
  while (cur && !seen.has(cur)) {
    const loc = byId.get(cur);
    if (!loc) break;
    seen.add(cur);
    trail.unshift(loc);
    cur = effectiveParentId(loc, byId);
  }
  return trail;
}

/** Direct children of `id`, name-sorted. */
export function childrenOf(locations: GazetteerLocation[], id: string): GazetteerLocation[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  return locations
    .filter((l) => effectiveParentId(l, byId) === id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every location beneath `id` (its whole subtree). Used to keep the parent picker from offering a
 * place its own descendant, which would orphan the subtree. */
export function descendantIds(locations: GazetteerLocation[], id: string): Set<string> {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const childrenByParent = new Map<string, GazetteerLocation[]>();
  for (const loc of locations) {
    const parent = effectiveParentId(loc, byId);
    if (parent === null) continue;
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(loc);
    else childrenByParent.set(parent, [loc]);
  }
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return out;
}
