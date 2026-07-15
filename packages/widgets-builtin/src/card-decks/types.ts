// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

export interface DeckCard {
  id: string;
  /** Card face text / name. */
  title: string;
  /** Optional longer body: rules text, flavour, a prompt. */
  detail?: string;
  /** How many copies of this card sit in the deck. >= 1; default 1. */
  count: number;
  /** Optional card art, stored vault-relative under portraits/ (e.g. "portraits/uuid.png"). */
  imagePath?: string;
}

export interface Deck {
  id: string;
  name: string;
  /** Optional deck-level description / how-to-use blurb. */
  description?: string;
  cards: DeckCard[];
}

/** One drawn instance: a specific copy of a card, moved from the draw pile to the discard. */
export interface DrawnCard {
  /** Unique per drawn copy: `${cardId}#${copyIndex}`. Distinct copies of a card draw separately. */
  key: string;
  cardId: string;
  at: number;
}

/**
 * Live draw state for a deck, kept beside the deck definition (not inside it) so editing a
 * deck's cards never loses your place. `drawPile` holds the shuffled instance keys still to
 * come (index 0 = next to draw); `discard` holds what's been drawn, most-recent last.
 */
export interface DeckDrawState {
  drawPile: string[];
  discard: DrawnCard[];
}

export interface CardDecksState {
  decks: Deck[];
  selectedId: string | null;
  mode: "play" | "edit";
  /** Per-deck live draw state, keyed by deck id. Absent until a deck is first shuffled/drawn. */
  draw: Record<string, DeckDrawState>;
}
