// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// Pure draw-without-replacement deck logic, unit-tested with an injectable rng (like
// roll-tables/engine.ts). A deck is *stateful*: `expandDeck` turns each card's `count`
// into individual instance keys, `shuffle` orders them, and drawing moves keys from the
// draw pile to the discard. Deck edits can leave stale keys behind, so `cardByKey`
// tolerates a key whose card was deleted rather than throwing.

import type { Deck, DeckCard, DeckDrawState, DrawnCard } from "./types";

/** A card's copy count as a positive integer; a missing/garbage count means one copy. */
export function cardCount(card: DeckCard): number {
  const n = Math.floor(card.count);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Total cards in the deck, summing every card's copies. */
export function deckSize(deck: Deck): number {
  return deck.cards.reduce((sum, c) => sum + cardCount(c), 0);
}

/** Every card copy as a unique instance key `${cardId}#${copyIndex}`, in deck order. */
export function expandDeck(deck: Deck): string[] {
  return deck.cards.flatMap((card) => {
    const keys: string[] = [];
    for (let i = 0; i < cardCount(card); i++) keys.push(`${card.id}#${i}`);
    return keys;
  });
}

/** The card id embedded in an instance key (everything before the last `#`). */
export function cardIdOfKey(key: string): string {
  return key.slice(0, key.lastIndexOf("#"));
}

/** Resolves an instance key back to its card, or undefined if that card was since deleted. */
export function cardByKey(deck: Deck, key: string): DeckCard | undefined {
  const id = cardIdOfKey(key);
  return deck.cards.find((c) => c.id === id);
}

/**
 * Fisher-Yates shuffle into a new array (never mutates the input). `rng` returns a float in
 * [0,1) - injectable so tests can pin the order, matching the roll-tables engine convention.
 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A full, freshly shuffled draw state: every copy back in the pile, empty discard. */
export function freshDrawState(deck: Deck, rng: () => number = Math.random): DeckDrawState {
  return { drawPile: shuffle(expandDeck(deck), rng), discard: [] };
}

export interface DrawOutcome {
  state: DeckDrawState;
  /** The cards drawn this call, top-first. Empty when the pile was already exhausted. */
  drawn: DrawnCard[];
}

/**
 * Draws up to `n` cards off the top of the pile into the discard. Draws fewer (or none) when
 * the pile runs short rather than reshuffling automatically - an exhausted deck is a deliberate
 * signal ("the deck is spent"), and reshuffling is an explicit user action.
 */
export function draw(state: DeckDrawState, n = 1, now: () => number = Date.now): DrawOutcome {
  const take = Math.max(0, Math.min(n, state.drawPile.length));
  if (take === 0) return { state, drawn: [] };
  const at = now();
  const drawnKeys = state.drawPile.slice(0, take);
  const drawn: DrawnCard[] = drawnKeys.map((key) => ({ key, cardId: cardIdOfKey(key), at }));
  return {
    state: {
      drawPile: state.drawPile.slice(take),
      // Most-recent last, so the discard reads oldest -> newest.
      discard: [...state.discard, ...drawn],
    },
    drawn,
  };
}

/**
 * Folds the discard back into the remaining pile and reshuffles the combined set (a "cycle the
 * deck" action, as opposed to a full reset). Cards still undrawn keep their place in the shuffle.
 */
export function reshuffleDiscards(state: DeckDrawState, rng: () => number = Math.random): DeckDrawState {
  const combined = [...state.drawPile, ...state.discard.map((d) => d.key)];
  return { drawPile: shuffle(combined, rng), discard: [] };
}

/**
 * Reconciles a draw state against the current deck after edits: drops instance keys whose card
 * or copy was removed, and appends keys for newly added cards/copies to the draw pile so they
 * become drawable without forcing a reshuffle. Returns the same reference when nothing changed,
 * so callers can skip a state write.
 */
export function reconcileDrawState(deck: Deck, state: DeckDrawState): DeckDrawState {
  const valid = new Set(expandDeck(deck));
  const drawPile = state.drawPile.filter((k) => valid.has(k));
  const discard = state.discard.filter((d) => valid.has(d.key));
  // Keys present in the deck but in neither pile are freshly added copies - make them drawable.
  const seen = new Set<string>([...drawPile, ...discard.map((d) => d.key)]);
  const added = [...valid].filter((k) => !seen.has(k));
  if (drawPile.length === state.drawPile.length && discard.length === state.discard.length && added.length === 0) {
    return state;
  }
  return { drawPile: [...drawPile, ...added], discard };
}
