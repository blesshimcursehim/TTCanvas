// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { StrictMode } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import { VaultContext, NpcContext } from "@ttcanvas/core";
import type { VaultContextValue, NpcContextValue } from "@ttcanvas/core";
import { Gazetteer } from "./Gazetteer";
import type { GazetteerState } from "./types";

// A tiny in-memory vault: Feywild > Citadel (which links NPC Vex + a free-standing faction).
const FILES: Record<string, string> = {
  "locations/feywild.json": JSON.stringify({ id: "feywild", name: "The Feywild", kind: "region", parentId: null, links: [] }),
  "locations/citadel.json": JSON.stringify({
    id: "citadel", name: "Citadel of Thorns", kind: "settlement", parentId: "feywild",
    links: [{ kind: "npc", ref: "npcs/vex.json", label: "Vex (stale)" }, { kind: "faction", ref: null, label: "The Ashen Veil" }],
  }),
};

const vault = {
  vaultPath: "/v",
  vaultVersion: 1,
  listFiles: async (ext: string) => (ext === "json" ? Object.keys(FILES) : []),
  readFile: async (p: string) => FILES[p],
  readFileBase64: async () => "BASE64",
} as unknown as VaultContextValue;

// Linked NPCs resolve through NpcContext (NpcProvider scans the vault for them in the app), so the
// live name the widget should prefer over the stale cached label lives here, not in the vault mock.
const npcCtx: NpcContextValue = {
  npcs: [{ filename: "npcs/vex.json", id: "vex-id", name: "Vex Duloran" }],
  loading: false,
};

afterEach(cleanup);

function renderWith(selectedFile: string | null) {
  const seeded: GazetteerState = { selectedFile };
  return render(
    <StrictMode>
      <VaultContext.Provider value={vault}>
        <NpcContext.Provider value={npcCtx}>
          <Gazetteer state={seeded} onChange={() => {}} />
        </NpcContext.Provider>
      </VaultContext.Provider>
    </StrictMode>,
  );
}

describe("Gazetteer", () => {
  it("renders the nested tree from flat parentId links under StrictMode", async () => {
    renderWith(null);
    await waitFor(() => expect(screen.getByText("The Feywild")).toBeTruthy());
    expect(screen.getByText("Citadel of Thorns")).toBeTruthy();
  });

  it("resolves a linked NPC to its live name (not the cached label) and shows a faction verbatim", async () => {
    renderWith("locations/citadel.json");
    // The cached "Vex (stale)" must be refreshed from npcs/vex.json.
    await waitFor(() => expect(screen.getByText("Vex Duloran")).toBeTruthy());
    expect(screen.queryByText("Vex (stale)")).toBeNull();
    expect(screen.getByText("The Ashen Veil")).toBeTruthy();
    // Breadcrumb shows the parent as a link back to the region.
    expect(screen.getByRole("button", { name: "The Feywild" })).toBeTruthy();
  });

  it("'Pin this place on a map' asks Map Display to locate or place this location's pin", async () => {
    renderWith("locations/citadel.json");
    await waitFor(() => expect(screen.getByRole("button", { name: "Pin this place on a map" })).toBeTruthy());

    const spy = vi.fn();
    window.addEventListener("ttcanvas:pin-location", spy);
    fireEvent.click(screen.getByRole("button", { name: "Pin this place on a map" }));
    window.removeEventListener("ttcanvas:pin-location", spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({
      filename: "locations/citadel.json",
      name: "Citadel of Thorns",
    });
  });
});
