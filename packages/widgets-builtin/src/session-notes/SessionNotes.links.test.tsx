// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.
//
// Vault-wide link sources: Rules Reference files (on disk) and the two entity types that live in
// singleton widget state (Bestiary creatures, Rule Cards) feed backlinks alongside notes, and
// clicking one routes to the right widget.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import { VaultContext, AIContext, LinkSourcesContext } from "@ttcanvas/core";
import type { VaultContextValue, AIContextValue, LinkSourcesContextValue } from "@ttcanvas/core";
import { SessionNotes } from "./SessionNotes";
import type { SessionNotesState } from "./types";

// ollamaCheck runs on mount; stub it so the widget doesn't reach for a real provider.
vi.mock("@ttcanvas/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ttcanvas/core")>();
  return { ...actual, ollamaCheck: vi.fn().mockResolvedValue(false), ollamaListModels: vi.fn().mockResolvedValue([]) };
});

afterEach(cleanup);

const NOTES: Record<string, string> = { "Citadel.md": "The citadel itself." };
const RULES: Record<string, string> = { "Grappling.md": "Used when storming [[Citadel]]." };

const vault = {
  vaultPath: "/v",
  vaultVersion: 1,
  listFolderFiles: async (folder: string, ext: string) => {
    if (ext !== "md") return [];
    return folder === "notes" ? Object.keys(NOTES) : folder === "rules" ? Object.keys(RULES) : [];
  },
  readFolderFile: async (folder: string, path: string) =>
    (folder === "notes" ? NOTES[path] : RULES[path]) ?? "",
  listFiles: async () => [],
  readFile: async () => "",
} as unknown as VaultContextValue;

const aiValue: AIContextValue = { config: { provider: "ollama", baseUrl: "", apiKey: "", model: "" } };

function renderNotes(linkSources: LinkSourcesContextValue) {
  const seeded: SessionNotesState = { notesFolder: "notes", selectedFile: "Citadel.md" };
  return render(
    <VaultContext.Provider value={vault}>
      <AIContext.Provider value={aiValue}>
        <LinkSourcesContext.Provider value={linkSources}>
          <SessionNotes state={seeded} onChange={() => {}} />
        </LinkSourcesContext.Provider>
      </AIContext.Provider>
    </VaultContext.Provider>,
  );
}

const CREATURE = { kind: "creature" as const, ref: "gob-1", label: "Goblin", text: "Camps outside [[Citadel]]." };
const CARD = { kind: "card" as const, ref: "card-1", label: "Grapple", text: "Cross-ref [[Citadel]]." };

describe("SessionNotes - vault-wide link sources", () => {
  it("counts a Rules Reference file, a creature and a card as backlink sources", async () => {
    renderNotes({ rulesFolder: "rules", entities: [CREATURE, CARD] });

    // All three link to Citadel.md, so all three show in its Linked mentions.
    await waitFor(() => expect(screen.getByText("Grappling")).toBeTruthy());
    expect(screen.getByText("Goblin")).toBeTruthy();
    expect(screen.getByText("Grapple")).toBeTruthy();
  });

  it("contributes nothing when there is no rules folder and no state-backed entities", async () => {
    renderNotes({ rulesFolder: null, entities: [] });

    // The note itself loads, but nothing links to it.
    await waitFor(() => expect(screen.getByText("The citadel itself.")).toBeTruthy());
    expect(screen.queryByText("Grappling")).toBeNull();
    expect(screen.queryByText("Goblin")).toBeNull();
  });

  it("routes a creature backlink to Bestiary by entry id, not a filename", async () => {
    renderNotes({ rulesFolder: "rules", entities: [CREATURE] });
    const row = await waitFor(() => screen.getByText("Goblin"));

    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-creature", spy);
    fireEvent.click(row);
    window.removeEventListener("ttcanvas:open-creature", spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ ref: "gob-1" });
  });

  it("routes a rules backlink to Rules Reference by path", async () => {
    renderNotes({ rulesFolder: "rules", entities: [] });
    const row = await waitFor(() => screen.getByText("Grappling"));

    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-rule", spy);
    fireEvent.click(row);
    window.removeEventListener("ttcanvas:open-rule", spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ ref: "Grappling.md" });
  });
});
