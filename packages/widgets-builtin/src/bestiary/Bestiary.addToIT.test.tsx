// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { StrictMode } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { VaultContext, ITContext } from "@ttcanvas/core";
import type { VaultContextValue, ITContextValue } from "@ttcanvas/core";
import { Bestiary } from "./Bestiary";
import type { BestiaryEntry } from "./types";

const vault = { vaultPath: "/v", vaultVersion: 1, otherVaults: [] } as unknown as VaultContextValue;

const goblin: BestiaryEntry = {
  id: "g1", name: "Goblin", creatureType: "humanoid", tags: [], cr: "1/4", hp: 7, ac: 15,
  notes: "", folderId: null,
};

afterEach(cleanup);

describe("Bestiary Add to Initiative", () => {
  it("carries the entry's id as templateId, a non-exclusive link back to this template", async () => {
    const addCombatant = vi.fn();
    const itCtx = { addCombatant, startCombat: () => 0, combatantCount: 0, activeSourceIds: [] } as unknown as ITContextValue;

    render(
      <StrictMode>
        <VaultContext.Provider value={vault}>
          <ITContext.Provider value={itCtx}>
            <Bestiary state={{ entries: [goblin], folders: [], openRequestId: "g1" }} onChange={() => {}} />
          </ITContext.Provider>
        </VaultContext.Provider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByText("+ Add to Initiative Tracker")).toBeTruthy());
    fireEvent.click(screen.getByText("+ Add to Initiative Tracker"));

    expect(addCombatant).toHaveBeenCalledWith(expect.objectContaining({ name: "Goblin", templateId: "g1" }));
    // Not an individual identity - see the sourceId/templateId distinction on Combatant.
    expect(addCombatant.mock.calls[0][0].sourceId).toBeUndefined();
  });
});
