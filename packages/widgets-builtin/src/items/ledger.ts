// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure ledger maths, unit-tested directly (like xpMath.ts / roll-tables/engine.ts). Nothing here
// touches React or the vault.

import { CURRENCY_KEYS, COIN_IN_CP, type PCCurrency } from "@ttcanvas/core";
import type { CatalogueItem, Holding } from "./types";

/** The party total across every holder. */
export function totalQty(item: CatalogueItem): number {
  return item.holdings.reduce((sum, h) => sum + Math.max(0, h.qty), 0);
}

/** How many a given holder has; null means the party stash. */
export function qtyFor(item: CatalogueItem, holderId: string | null): number {
  return item.holdings.find((h) => h.holderId === holderId)?.qty ?? 0;
}

/**
 * Set one holder's quantity, adding or dropping the holding as needed. Returns a new array, and
 * drops holdings at zero so an item never accumulates a tail of empty holders.
 */
export function setQty(holdings: Holding[], holderId: string | null, qty: number): Holding[] {
  const next = Math.max(0, Math.floor(qty));
  const without = holdings.filter((h) => h.holderId !== holderId);
  return next === 0 ? without : [...without, { holderId, qty: next }];
}

/** Move `qty` of an item from one holder to another, capped at what the source actually has. */
export function moveHolding(holdings: Holding[], from: string | null, to: string | null, qty: number): Holding[] {
  if (from === to) return holdings;
  const have = holdings.find((h) => h.holderId === from)?.qty ?? 0;
  const moved = Math.min(Math.max(0, Math.floor(qty)), have);
  if (moved === 0) return holdings;
  const afterTake = setQty(holdings, from, have - moved);
  const target = afterTake.find((h) => h.holderId === to)?.qty ?? 0;
  return setQty(afterTake, to, target + moved);
}

/** Total pounds a holder is carrying across the whole ledger. */
export function weightCarried(items: CatalogueItem[], holderId: string | null): number {
  return items.reduce((sum, i) => sum + (i.weightLb ?? 0) * qtyFor(i, holderId), 0);
}

/** Ledger value in copper, counting every holding. */
export function totalValueCp(items: CatalogueItem[]): number {
  return items.reduce((sum, i) => sum + (i.valueCp ?? 0) * totalQty(i), 0);
}

/** A purse flattened to copper, for totals and comparisons. */
export function currencyToCp(currency: PCCurrency): number {
  return CURRENCY_KEYS.reduce((sum, k) => sum + (currency[k] ?? 0) * COIN_IN_CP[k], 0);
}

/**
 * Roll loose copper up into the largest coins that divide evenly, highest denomination first.
 * Electrum is skipped on the way up - it exists in the SRD but almost no table hands it out, so
 * rolling silver into it would surprise people. Existing electrum is still counted and preserved.
 */
export function normaliseCurrency(currency: PCCurrency): PCCurrency {
  const ep = Math.max(0, Math.floor(currency.ep ?? 0));
  let rest = currencyToCp(currency) - ep * COIN_IN_CP.ep;
  const out: PCCurrency = { cp: 0, sp: 0, ep, gp: 0, pp: 0 };
  for (const k of ["pp", "gp", "sp"] as const) {
    out[k] = Math.floor(rest / COIN_IN_CP[k]);
    rest -= out[k] * COIN_IN_CP[k];
  }
  out.cp = rest;
  return out;
}

/**
 * Rebuild a purse from a flat copper total, keeping as much of the existing electrum as still fits.
 * Shared by the two below so a spend and a credit can never disagree about how coins are rebuilt.
 */
function purseFromCp(currency: PCCurrency, totalCp: number): PCCurrency {
  const total = Math.max(0, Math.round(totalCp));
  const ep = Math.min(Math.max(0, Math.floor(currency.ep ?? 0)), Math.floor(total / COIN_IN_CP.ep));
  return normaliseCurrency({ cp: total - ep * COIN_IN_CP.ep, sp: 0, ep, gp: 0, pp: 0 });
}

/**
 * Spend `cp` from a purse, making change across denominations.
 *
 * `applyCurrencyDelta` (@ttcanvas/core) cannot do this, despite looking like it should: it floors
 * each denomination *independently*, so debiting 5gp from a purse holding 100sp takes nothing at all
 * and reports success. Buying has to flatten, subtract and rebuild, which is what this does.
 *
 * Clamps at zero rather than going negative: TTCanvas warns about an unaffordable purchase but never
 * blocks it, and a negative coin count isn't something the ledger can render.
 */
export function spendFromPurse(currency: PCCurrency, cp: number): PCCurrency {
  return purseFromCp(currency, currencyToCp(currency) - Math.max(0, Math.round(cp)));
}

/** The inverse: credit a sale into the purse, tidied into the largest coins that divide evenly. */
export function addToPurse(currency: PCCurrency, cp: number): PCCurrency {
  return purseFromCp(currency, currencyToCp(currency) + Math.max(0, Math.round(cp)));
}

/**
 * The inverse of `formatCoin`: the largest single denomination a copper amount divides into, as an
 * editable number plus its unit. Lets the value field read "5 gp" instead of "500" without storing
 * the unit, which would let two items disagree about what "5" means.
 */
export function coinParts(cp: number): { amount: number; unit: keyof PCCurrency } {
  if (!Number.isFinite(cp) || cp <= 0) return { amount: 0, unit: "gp" };
  for (const unit of ["pp", "gp", "ep", "sp"] as const) {
    if (cp >= COIN_IN_CP[unit] && cp % COIN_IN_CP[unit] === 0) return { amount: cp / COIN_IN_CP[unit], unit };
  }
  return { amount: cp, unit: "cp" };
}

export interface CoinSplit {
  /** Per-member deltas, in the order the ids were given. */
  shares: { memberId: string; delta: PCCurrency }[];
  /** What could not be divided evenly and stays in the party purse. */
  remainder: PCCurrency;
}

/**
 * Divide the whole purse evenly between members. Splits on the flattened copper total so 3 gp between
 * two characters becomes 1gp 5sp each rather than one of them getting the odd coin, then hands the
 * indivisible copper remainder back to the party rather than silently dropping it. Electrum counts
 * towards each share like any other coin - it is only excluded from what the shares are *paid in*,
 * via `normaliseCurrency`, so nobody is handed a denomination their table never uses.
 */
export function splitEvenly(currency: PCCurrency, memberIds: string[]): CoinSplit {
  const divisible = currencyToCp(currency);
  if (memberIds.length === 0 || divisible <= 0) {
    return { shares: [], remainder: currency };
  }
  const each = Math.floor(divisible / memberIds.length);
  const leftover = divisible - each * memberIds.length;
  const shareCoins = normaliseCurrency({ cp: each, sp: 0, ep: 0, gp: 0, pp: 0 });
  return {
    shares: memberIds.map((memberId) => ({ memberId, delta: shareCoins })),
    remainder: normaliseCurrency({ cp: leftover, sp: 0, ep: 0, gp: 0, pp: 0 }),
  };
}
