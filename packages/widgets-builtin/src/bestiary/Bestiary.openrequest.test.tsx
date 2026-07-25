// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { StrictMode } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { Bestiary } from "./Bestiary";
import type { BestiaryEntry, BestiaryState } from "./types";

const vault = { vaultPath: "/v", vaultVersion: 1, otherVaults: [] } as unknown as VaultContextValue;

const goblin: BestiaryEntry = {
  id: "g1", name: "Goblin", creatureType: "humanoid", tags: [], cr: "1/4", hp: 7, ac: 15,
  notes: "", folderId: null,
};

afterEach(cleanup);

describe("Bestiary open-on-request", () => {
  it("opens a creature's sheet from openRequestId and clears the one-shot id exactly once", async () => {
    const onChange = vi.fn();
    render(
      <StrictMode>
        <VaultContext.Provider value={vault}>
          <Bestiary state={{ entries: [goblin], folders: [], openRequestId: "g1" }} onChange={onChange} />
        </VaultContext.Provider>
      </StrictMode>,
    );

    // The sheet modal opened (its "Overview" tab is not present in the list view).
    await waitFor(() => expect(screen.getByText("Overview")).toBeTruthy());

    // The one-shot id was cleared so it cannot reopen on reload or re-render.
    const clearing = onChange.mock.calls.find(([s]) => (s as BestiaryState).openRequestId === undefined);
    expect(clearing).toBeTruthy();
    expect((clearing?.[0] as BestiaryState).entries).toHaveLength(1);
  });
});
