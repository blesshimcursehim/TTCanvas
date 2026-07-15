// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { StrictMode } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { WikilinkResolver } from "./WikilinkResolver";

// In-memory vault: one NPC + one place as JSON, a notes folder and a rules folder of md files.
const FILES: Record<string, string> = {
  "npcs/vex.json": JSON.stringify({ name: "Vex" }),
  "locations/citadel.json": JSON.stringify({ name: "Citadel of Thorns" }),
};
const FOLDER_FILES: Record<string, string[]> = {
  notes: ["Session 12.md"],
  rules: ["Combat/Grappling.md", "Conditions/Prone.md"],
};

const vault = {
  vaultPath: "/v",
  vaultVersion: 1,
  listFiles: async (ext: string) => (ext === "json" ? Object.keys(FILES) : []),
  listFolderFiles: async (folder: string) => FOLDER_FILES[folder] ?? [],
  readFile: async (p: string) => FILES[p],
} as unknown as VaultContextValue;

afterEach(cleanup);

function setup() {
  const h = {
    onOpenNote: vi.fn(), onOpenNpc: vi.fn(), onOpenPlace: vi.fn(),
    onOpenRule: vi.fn(), onOpenCreature: vi.fn(), onOpenCard: vi.fn(),
  };
  render(
    <StrictMode>
      <VaultContext.Provider value={vault}>
        <WikilinkResolver
          notesFolder="notes"
          rulesFolder="rules"
          creatures={[{ ref: "goblin-1", name: "Goblin" }]}
          cards={[{ ref: "card-1", name: "Fireball" }]}
          {...h}
        />
      </VaultContext.Provider>
    </StrictMode>,
  );
  return h;
}

// Re-dispatch until the async index is built and the expected handler fires (idempotent for a spy).
async function fire(name: string, assert: () => void) {
  await waitFor(() => {
    window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name } }));
    assert();
  });
}

describe("WikilinkResolver", () => {
  it("routes a [[creature:...]] link to the Bestiary by its id", async () => {
    const h = setup();
    await fire("creature:Goblin", () => expect(h.onOpenCreature).toHaveBeenCalledWith("goblin-1"));
  });

  it("routes a [[card:...]] link to Rule Cards by its id", async () => {
    const h = setup();
    await fire("card:Fireball", () => expect(h.onOpenCard).toHaveBeenCalledWith("card-1"));
  });

  it("routes a [[rule:...]] link to the Rules Reference file path", async () => {
    const h = setup();
    await fire("rule:Grappling", () => expect(h.onOpenRule).toHaveBeenCalledWith("Combat/Grappling.md"));
  });

  it("routes NPC and place links to their JSON refs", async () => {
    const h = setup();
    await fire("npc:Vex", () => expect(h.onOpenNpc).toHaveBeenCalledWith("npcs/vex.json"));
    await fire("place:Citadel of Thorns", () => expect(h.onOpenPlace).toHaveBeenCalledWith("locations/citadel.json"));
  });

  it("resolves a bare name with no prefix by precedence (creature-only name)", async () => {
    const h = setup();
    await fire("Goblin", () => expect(h.onOpenCreature).toHaveBeenCalledWith("goblin-1"));
  });

  it("falls back to opening a note for an unresolved bare name, but leaves a prefixed miss alone", async () => {
    const h = setup();
    // Prove the index is ready via a known hit, then test the miss cases against that ready state.
    await fire("creature:Goblin", () => expect(h.onOpenCreature).toHaveBeenCalled());
    window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name: "Nowhere Land" } }));
    expect(h.onOpenNote).toHaveBeenCalledWith("Nowhere Land.md");
    window.dispatchEvent(new CustomEvent("ttcanvas:open-entity-link", { detail: { name: "creature:Missing" } }));
    expect(h.onOpenCreature).toHaveBeenCalledTimes(1); // only the Goblin hit, no note fallback for a prefixed miss
    expect(h.onOpenNote).toHaveBeenCalledTimes(1);
  });
});
