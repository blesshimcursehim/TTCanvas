// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { NpcLibrary } from "./NpcLibrary";
import { createDefaultNpcGeneratorState } from "../npc-generator/tables";
import { serializeNpcJson } from "./npcFormat";
import type { NpcLibraryState, ParsedNpc } from "./types";

// ollamaCheck() (fired on NpcGenerator mount) goes through Tauri's invoke - stub it so it just
// rejects quietly, same as it would with no Ollama running locally.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockRejectedValue(new Error("no ollama")) }));

afterEach(cleanup);

const BRAM: ParsedNpc = { filename: "npcs/bram.json", id: "bram-id", name: "Bram", race: "Dwarf", occupation: "Smith" };
const VEX: ParsedNpc = { filename: "npcs/vex.json", id: "vex-id", name: "Vex", race: "Elf", occupation: "Spy" };
const FILES: Record<string, string> = {
  "npcs/bram.json": serializeNpcJson(BRAM),
  "npcs/vex.json": serializeNpcJson(VEX),
};

const vault = {
  vaultPath: "/v",
  vaultVersion: 1,
  otherVaults: [],
  listFiles: async (ext: string) => (ext === "json" ? Object.keys(FILES) : []),
  readFile: async (p: string) => FILES[p],
  writeFile: async () => {},
  deleteFile: async () => {},
  readFileBase64: async () => "",
} as unknown as VaultContextValue;

function makeState(overrides: Partial<NpcLibraryState> = {}): NpcLibraryState {
  return { selectedFile: null, generatorDraft: createDefaultNpcGeneratorState(), ...overrides };
}

function renderLibrary(state: NpcLibraryState, onChange: (s: NpcLibraryState) => void) {
  return render(
    <VaultContext.Provider value={vault}>
      <NpcLibrary state={state} onChange={onChange} />
    </VaultContext.Provider>,
  );
}

describe("NpcLibrary - embedded NPC Generator (merge)", () => {
  it("hitting + swaps the right pane to the embedded generator form", async () => {
    renderLibrary(makeState(), vi.fn());
    await screen.findByText("Bram");
    fireEvent.click(screen.getByTitle("Add NPC"));
    expect(screen.getByRole("button", { name: "Save to library" })).toBeInTheDocument();
  });

  it("editing the embedded generator preserves selectedFile and updates generatorDraft", async () => {
    const onChange = vi.fn();
    const state = makeState({ selectedFile: "npcs/vex.json" });
    renderLibrary(state, onChange);
    await screen.findByText("Vex");
    fireEvent.click(screen.getByTitle("Add NPC"));
    fireEvent.click(screen.getByTitle("Lock name"));

    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg.selectedFile).toBe("npcs/vex.json");
    expect(arg.generatorDraft.locked.name).toBe(true);
    expect(arg.generatorDraft.name).toBe(state.generatorDraft.name);
  });

  it("selecting an NPC from the list preserves generatorDraft unchanged", async () => {
    const onChange = vi.fn();
    const state = makeState();
    renderLibrary(state, onChange);
    await screen.findByText("Vex");
    fireEvent.click(screen.getByText("Vex"));

    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg.selectedFile).toBe("npcs/vex.json");
    expect(arg.generatorDraft).toEqual(state.generatorDraft);
  });

  it("an external selectedFile change exits add mode", async () => {
    const onChange = vi.fn();
    const { rerender } = renderLibrary(makeState(), onChange);
    await screen.findByText("Bram");

    fireEvent.click(screen.getByTitle("Add NPC"));
    expect(screen.getByRole("button", { name: "Save to library" })).toBeInTheDocument();

    rerender(
      <VaultContext.Provider value={vault}>
        <NpcLibrary state={makeState({ selectedFile: "npcs/vex.json" })} onChange={onChange} />
      </VaultContext.Provider>,
    );

    await waitFor(() => expect(screen.queryByRole("button", { name: "Save to library" })).not.toBeInTheDocument());
  });
});

describe("NpcLibrary - wikilinks in Last Seen and custom fields", () => {
  // Bugs.md: only the Notes field ran wikilinks through renderMarkdown - Last Seen and custom
  // fields printed the raw [[...]] text with no link at all. These pin the fix.
  const AGNES: ParsedNpc = {
    filename: "npcs/agnes.json", id: "agnes-id", name: "Agnes Holk", race: "Human", occupation: "Spy",
    lastSeen: "[[place:The Gilded Keel]]",
    customFields: [{ label: "Pet", value: "Keeps a [[creature:Goblin]] in the basement" }],
  };
  const agnesVault = {
    vaultPath: "/v",
    vaultVersion: 1,
    otherVaults: [],
    listFiles: async (ext: string) => (ext === "json" ? ["npcs/agnes.json"] : []),
    readFile: async () => serializeNpcJson(AGNES),
    writeFile: async () => {},
    deleteFile: async () => {},
    readFileBase64: async () => "",
  } as unknown as VaultContextValue;

  function renderAgnes() {
    return render(
      <VaultContext.Provider value={agnesVault}>
        <NpcLibrary state={makeState({ selectedFile: "npcs/agnes.json" })} onChange={vi.fn()} />
      </VaultContext.Provider>,
    );
  }

  it("renders a Last Seen wikilink as a clickable anchor, not raw bracket text", async () => {
    renderAgnes();
    await screen.findByText("Last seen");
    const link = document.querySelector('[data-wikilink="place:The Gilded Keel"]');
    expect(link).toBeTruthy();
    expect(screen.queryByText("[[place:The Gilded Keel]]")).not.toBeInTheDocument();
  });

  it("renders a custom field's wikilink the same way", async () => {
    renderAgnes();
    await screen.findByText("Last seen");
    expect(document.querySelector('[data-wikilink="creature:Goblin"]')).toBeTruthy();
  });

  it("clicking the Last Seen link dispatches ttcanvas:open-entity-link with the prefixed name", async () => {
    renderAgnes();
    await screen.findByText("Last seen");
    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-entity-link", spy);
    fireEvent.click(document.querySelector('[data-wikilink="place:The Gilded Keel"]')!);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ name: "place:The Gilded Keel" });
  });
});
