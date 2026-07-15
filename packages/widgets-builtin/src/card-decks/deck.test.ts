// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect } from "vitest";
import {
  cardCount,
  deckSize,
  expandDeck,
  cardIdOfKey,
  cardByKey,
  shuffle,
  freshDrawState,
  draw,
  reshuffleDiscards,
  reconcileDrawState,
} from "./deck";
import type { Deck, DeckDrawState } from "./types";

function deck(cards: { id: string; count?: number }[]): Deck {
  return {
    id: "d1",
    name: "Test",
    cards: cards.map((c) => ({ id: c.id, title: c.id, count: c.count ?? 1 })),
  };
}

// A deterministic rng cycling through fixed values in [0,1), so shuffles/draws are pinned.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("cardCount", () => {
  it("defaults a missing or bad count to 1", () => {
    expect(cardCount({ id: "a", title: "a", count: NaN })).toBe(1);
    expect(cardCount({ id: "a", title: "a", count: 0 })).toBe(1);
    expect(cardCount({ id: "a", title: "a", count: -3 })).toBe(1);
    expect(cardCount({ id: "a", title: "a", count: 4 })).toBe(4);
    expect(cardCount({ id: "a", title: "a", count: 2.9 })).toBe(2);
  });
});

describe("deckSize / expandDeck", () => {
  it("sums copies and expands each into a unique instance key", () => {
    const d = deck([{ id: "a", count: 2 }, { id: "b" }]);
    expect(deckSize(d)).toBe(3);
    expect(expandDeck(d)).toEqual(["a#0", "a#1", "b#0"]);
  });

  it("is empty for a deck with no cards", () => {
    expect(deckSize(deck([]))).toBe(0);
    expect(expandDeck(deck([]))).toEqual([]);
  });
});

describe("cardIdOfKey / cardByKey", () => {
  it("recovers the card id even when the id itself contains #", () => {
    expect(cardIdOfKey("a#b#0")).toBe("a#b");
  });

  it("resolves a key to its card, or undefined when the card was deleted", () => {
    const d = deck([{ id: "a" }]);
    expect(cardByKey(d, "a#0")?.id).toBe("a");
    expect(cardByKey(d, "gone#0")).toBeUndefined();
  });
});

describe("shuffle", () => {
  it("does not mutate the input and preserves the multiset", () => {
    const input = ["a", "b", "c", "d"];
    const out = shuffle(input, seqRng([0.99, 0.5, 0.1, 0.7]));
    expect(input).toEqual(["a", "b", "c", "d"]);
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("orders deterministically for a fixed rng", () => {
    // Fisher-Yates from the back: i=3 j=floor(0*4)=0 swap -> [d,b,c,a]; i=2 j=floor(0*3)=0 -> [c,b,d,a];
    // i=1 j=floor(0*2)=0 -> [b,c,d,a].
    expect(shuffle(["a", "b", "c", "d"], seqRng([0]))).toEqual(["b", "c", "d", "a"]);
  });
});

describe("freshDrawState", () => {
  it("puts every copy in the pile with an empty discard", () => {
    const d = deck([{ id: "a", count: 2 }, { id: "b" }]);
    const s = freshDrawState(d, seqRng([0]));
    expect([...s.drawPile].sort()).toEqual(["a#0", "a#1", "b#0"]);
    expect(s.discard).toEqual([]);
  });
});

describe("draw", () => {
  const base: DeckDrawState = { drawPile: ["a#0", "b#0", "c#0"], discard: [] };

  it("moves cards off the top into the discard", () => {
    const { state, drawn } = draw(base, 1, () => 100);
    expect(drawn).toEqual([{ key: "a#0", cardId: "a", at: 100 }]);
    expect(state.drawPile).toEqual(["b#0", "c#0"]);
    expect(state.discard).toEqual([{ key: "a#0", cardId: "a", at: 100 }]);
  });

  it("draws multiple, most-recent last in the discard, sharing one timestamp", () => {
    const { state, drawn } = draw(base, 2, () => 7);
    expect(drawn.map((d) => d.key)).toEqual(["a#0", "b#0"]);
    expect(state.drawPile).toEqual(["c#0"]);
    expect(state.discard.map((d) => d.key)).toEqual(["a#0", "b#0"]);
    expect(drawn.every((d) => d.at === 7)).toBe(true);
  });

  it("draws only what remains and never past empty", () => {
    const { state, drawn } = draw(base, 10);
    expect(drawn).toHaveLength(3);
    expect(state.drawPile).toEqual([]);
    const spent = draw(state, 1);
    expect(spent.drawn).toEqual([]);
    expect(spent.state).toBe(state); // unchanged reference when nothing to draw
  });
});

describe("reshuffleDiscards", () => {
  it("folds the discard back into the pile and clears it", () => {
    const s: DeckDrawState = {
      drawPile: ["c#0"],
      discard: [{ key: "a#0", cardId: "a", at: 1 }, { key: "b#0", cardId: "b", at: 2 }],
    };
    const out = reshuffleDiscards(s, seqRng([0]));
    expect([...out.drawPile].sort()).toEqual(["a#0", "b#0", "c#0"]);
    expect(out.discard).toEqual([]);
  });
});

describe("reconcileDrawState", () => {
  it("returns the same reference when the deck is unchanged", () => {
    const d = deck([{ id: "a" }, { id: "b" }]);
    const s: DeckDrawState = { drawPile: ["a#0"], discard: [{ key: "b#0", cardId: "b", at: 1 }] };
    expect(reconcileDrawState(d, s)).toBe(s);
  });

  it("drops keys whose card or copy was removed", () => {
    const d = deck([{ id: "a" }]); // b deleted, a's second copy gone
    const s: DeckDrawState = {
      drawPile: ["a#0", "a#1", "gone#0"],
      discard: [{ key: "b#0", cardId: "b", at: 1 }],
    };
    const out = reconcileDrawState(d, s);
    expect(out.drawPile).toEqual(["a#0"]);
    expect(out.discard).toEqual([]);
  });

  it("appends newly added copies to the draw pile so they become drawable", () => {
    const d = deck([{ id: "a", count: 2 }, { id: "b" }]); // a#1 and b#0 are new
    const s: DeckDrawState = { drawPile: ["a#0"], discard: [] };
    const out = reconcileDrawState(d, s);
    expect(out.drawPile.slice(0, 1)).toEqual(["a#0"]);
    expect([...out.drawPile].sort()).toEqual(["a#0", "a#1", "b#0"]);
    expect(out.discard).toEqual([]);
  });
});
