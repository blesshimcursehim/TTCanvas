// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure stock generation, unit-tested directly (like items/ledger.ts and encounter-builder/combat.ts).
// Nothing here touches React, the vault or the catalogue's own state.

import type { CatalogueItemRef } from "@ttcanvas/core";
import type { Rarity } from "../items/types";
import { RARITY_WEIGHTS } from "./types";
import type { MerchantStock } from "./types";

/**
 * An item with no `rarity` counts as common. The field is optional and most mundane gear leaves it
 * unset, so without this a catalogue of ordinary rope and torches would be invisible to generation.
 */
function rarityOf(item: CatalogueItemRef): Rarity {
  return (item.rarity as Rarity | undefined) ?? "common";
}

/**
 * Pick one key by weight. Weights are renormalised over exactly the keys passed in, which is what
 * lets the same fixed curve serve both "which rarities did the GM tick" and "which of those does the
 * catalogue actually have any of".
 */
function weightedPick<T extends string>(keys: readonly T[], weightOf: (k: T) => number, rng: () => number): T | null {
  const total = keys.reduce((sum, k) => sum + Math.max(0, weightOf(k)), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const k of keys) {
    roll -= Math.max(0, weightOf(k));
    if (roll < 0) return k;
  }
  return keys[keys.length - 1] ?? null;  // float drift only
}

/** A shop doesn't keep three of the same rare sword, but it does keep a crate of rope. */
function qtyForRarity(rarity: Rarity, rng: () => number): number {
  if (rarity === "common") return 1 + Math.floor(rng() * 5);
  if (rarity === "uncommon") return 1 + Math.floor(rng() * 3);
  return 1;
}

export interface GenerateOptions {
  /** Which rarities may be drawn. Empty means nothing can be generated. */
  rarities: readonly Rarity[];
  /** Which item kinds may be drawn. Empty means no kind filter at all. */
  kinds: readonly string[];
  /** How many lines to add, before pool exhaustion caps it. */
  count: number;
  /** Rows already on the shelf, so generation never duplicates an itemId. */
  existing: readonly MerchantStock[];
}

/**
 * Pick up to `count` new stock lines from `pool`.
 *
 * Degrades rather than failing, which matters because TTCanvas ships no item content and a GM's
 * catalogue may be tiny or entirely one rarity: the rarity weights are renormalised over the buckets
 * that actually have items left, so ticking every rarity against a catalogue of nothing but common
 * gear yields a shop of common gear instead of an empty shelf. Returns fewer than `count` lines when
 * the pool runs dry, and an empty array when nothing matches at all.
 *
 * rng consumption order is pinned so tests can script it: per line, the rarity bucket first, then the
 * item within that bucket, then that line's quantity.
 */
export function generateStock(
  pool: readonly CatalogueItemRef[],
  opts: GenerateOptions,
  rng: () => number = Math.random,
): MerchantStock[] {
  const allowed = new Set(opts.rarities);
  const kinds = new Set(opts.kinds);
  const taken = new Set(opts.existing.map((s) => s.itemId));

  // Bucket what's eligible, so a rarity with nothing left drops out of the weighting entirely
  // rather than burning a slot on an empty pick.
  const buckets = new Map<Rarity, CatalogueItemRef[]>();
  for (const item of pool) {
    const rarity = rarityOf(item);
    if (!allowed.has(rarity)) continue;
    if (kinds.size > 0 && !kinds.has(item.kind)) continue;
    if (taken.has(item.id)) continue;
    const bucket = buckets.get(rarity);
    if (bucket) bucket.push(item);
    else buckets.set(rarity, [item]);
  }

  const out: MerchantStock[] = [];
  const wanted = Math.max(0, Math.floor(opts.count));
  for (let i = 0; i < wanted; i++) {
    const live = [...buckets.keys()];
    if (live.length === 0) break;  // pool exhausted, return what we have
    const rarity = weightedPick(live, (r) => RARITY_WEIGHTS[r] ?? 0, rng);
    if (!rarity) break;
    const bucket = buckets.get(rarity)!;
    // splice, not index-and-filter: draws without replacement so one generate can't stock the same
    // item twice, matching the one-row-per-itemId invariant addStock already enforces by hand.
    const [item] = bucket.splice(Math.floor(rng() * bucket.length), 1);
    if (bucket.length === 0) buckets.delete(rarity);
    out.push({ itemId: item.id, qty: qtyForRarity(rarity, rng), name: item.name });
  }
  return out;
}

/** Fold case and collapse runs of whitespace, so "  Healing   Potion " keys as "healing potion". */
function nameKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface MatchResult {
  matched: MerchantStock[];
  /** Rolled text with no catalogue item of that name, for the GM to add to Items and re-run. */
  unmatched: string[];
}

/**
 * Reconcile free rolled text against the catalogue by name.
 *
 * Roll Tables produce prose written to be read aloud, not keys, so this is best-effort by design and
 * a miss is expected rather than exceptional. Unmatched text is reported rather than turned into an
 * item: `MerchantStock` holds a reference, and silently minting unpriced catalogue entries the GM
 * never asked for is worse than telling them which names to add.
 *
 * A repeated result folds into one line with a higher quantity instead of a second identical row,
 * matching how Items' own loot roll behaves.
 */
export function matchByName(
  outcomes: readonly { text: string }[],
  catalogue: readonly CatalogueItemRef[],
): MatchResult {
  const byName = new Map<string, CatalogueItemRef>();
  // First wins, so a duplicate catalogue name resolves consistently rather than by scan order.
  for (const item of catalogue) {
    const key = nameKey(item.name);
    if (!byName.has(key)) byName.set(key, item);
  }

  const matched: MerchantStock[] = [];
  const byId = new Map<string, MerchantStock>();
  const unmatched: string[] = [];
  for (const o of outcomes) {
    const text = o.text.trim();
    if (!text) continue;
    const item = byName.get(nameKey(text));
    if (!item) {
      if (!unmatched.includes(text)) unmatched.push(text);
      continue;
    }
    const already = byId.get(item.id);
    if (already) {
      already.qty = (already.qty ?? 0) + 1;
    } else {
      const row: MerchantStock = { itemId: item.id, qty: 1, name: item.name };
      byId.set(item.id, row);
      matched.push(row);
    }
  }
  return { matched, unmatched };
}

/**
 * Merge generated lines onto a shelf, topping up quantities rather than replacing the shelf, so a
 * merchant the party keeps revisiting keeps its identity (and any hand-set prices) between visits.
 * An unlimited line (`qty: null`) stays unlimited.
 */
export function mergeStock(existing: readonly MerchantStock[], incoming: readonly MerchantStock[]): MerchantStock[] {
  const out = existing.map((s) => ({ ...s }));
  const byId = new Map(out.map((s) => [s.itemId, s]));
  for (const row of incoming) {
    const already = byId.get(row.itemId);
    if (!already) {
      out.push({ ...row });
      byId.set(row.itemId, out[out.length - 1]);
    } else if (already.qty !== null) {
      already.qty += row.qty ?? 0;
    }
  }
  return out;
}
