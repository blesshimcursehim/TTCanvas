// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { StrictMode } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { CardDecks } from "./CardDecks";
import type { CardDecksState } from "./types";

const existingDeck = {
  id: "d1",
  name: "Existing Deck",
  cards: [{ id: "c1", title: "Old card", count: 1 }],
};

// A foreign deck that shares "d1" - an id conflict - and carries card art, so accepting it
// via Replace exercises the asset-copy path in applyImport.
const foreignDeck = {
  id: "d1",
  name: "Renamed Deck",
  cards: [{ id: "c1", title: "New card", count: 1, imagePath: "portraits/art.jpg" }],
};

afterEach(cleanup);

describe("CardDecks cross-vault pull - conflict-path failure surfacing", () => {
  it("shows the import-error banner when Replace triggers a failing asset write", async () => {
    const onChange = vi.fn();
    const vault = {
      vaultPath: "/current",
      vaultVersion: 1,
      otherVaults: [{ path: "/other", name: "Other" }],
      readForeignSingleton: vi.fn().mockResolvedValue({ decks: [foreignDeck] }),
      readFileBase64: vi.fn().mockResolvedValue("YmFzZTY0"),
      // The write side of the asset copy fails (permissions, full disk, ...) - this must
      // surface as an error, not vanish as an unhandled rejection off the Replace click.
      writeFileBase64: vi.fn().mockRejectedValue(new Error("disk full")),
    } as unknown as VaultContextValue;

    const state: CardDecksState = { decks: [existingDeck], selectedId: null, mode: "play", draw: {} };

    render(
      <StrictMode>
        <VaultContext.Provider value={vault}>
          <CardDecks state={state} onChange={onChange} />
        </VaultContext.Provider>
      </StrictMode>,
    );

    // The control lives inside the settings-cog's native <div popover> panel, which jsdom
    // (correctly) treats as accessibility-hidden while closed - so it's found by title/text,
    // not by role, even though the click itself works regardless of that hidden state.
    fireEvent.click(screen.getByTitle("Pull this widget's content from another vault"));

    // The shared id triggers the conflict dialog rather than a silent apply.
    const replaceBtn = await screen.findByRole("button", { name: "Replace" });
    fireEvent.click(replaceBtn);

    await waitFor(() => expect(screen.getByText(/Import failed.*disk full/)).toBeTruthy());
  });
});
