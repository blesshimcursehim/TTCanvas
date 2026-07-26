// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// A character's gold lives in two fields for historical reasons: the top-level `gp` quick stat on
// the card came first, and the full `currency` purse arrived later with the PC sheet. Nothing kept
// them in step, so the card and the sheet could show different gold - and once the Inventory widget
// started paying out coin, they always did. These two helpers make `currency` the single source of
// truth: read through `currencyOf`, write through `withCurrency`, never touch either field directly.

import { DEFAULT_CURRENCY, type PCCurrency } from "@ttcanvas/core";

/** A member with the two coin fields. Structural so App's minimal roster view fits too. */
export interface CoinBearing {
  gp?: number;
  currency?: PCCurrency;
}

/**
 * The member's purse. A member who has never had one is seeded from the legacy `gp` card stat, so
 * the gold a GM typed on the card before the sheet existed carries into the purse rather than
 * silently resetting to zero the first time anything reads it.
 */
export function currencyOf(member: CoinBearing): PCCurrency {
  return member.currency ?? { ...DEFAULT_CURRENCY, gp: Math.max(0, Math.floor(member.gp ?? 0)) };
}

/**
 * Write a purse back, mirroring gold onto the legacy `gp` field. The mirror is not a second source
 * of truth - nothing reads `gp` except `currencyOf`'s seed and the party importer - it just keeps an
 * exported roster coherent for anything that still reads the old shape.
 */
export function withCurrency<T extends CoinBearing>(member: T, currency: PCCurrency): T {
  return { ...member, currency, gp: currency.gp };
}
