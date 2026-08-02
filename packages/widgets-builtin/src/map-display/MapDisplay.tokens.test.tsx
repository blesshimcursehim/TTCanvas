// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.
//
// Two linked bugs.md symptoms on token placement: a plain token had no way to be named or
// renamed, and placing one right after drawing a shape popped the shape's own editor open
// instead of anything about the new token (a stale selectedAnnId surviving the tool switch).

import { useState } from "react";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { MapDisplay } from "./MapDisplay";
import type { MapDisplayState, MapScene } from "./types";

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

function makeScene(id: string, name: string, selectedMap: string | null, overrides: Partial<MapScene> = {}): MapScene {
  return {
    id, name, selectedMap,
    fogEnabled: false, fogReveals: [], tokens: [],
    gridEnabled: false, gridSize: 40, panX: 0, panY: 0, scale: 1,
    ...overrides,
  };
}

function makeState(activeId: string, scenes: MapScene[]): MapDisplayState {
  return { mapsFolder: "/fake/maps", scenes, activeSceneId: activeId, autoPushMap: false };
}

function makeMockVault(): VaultContextValue {
  return {
    vaultPath: "/fake/vault",
    vaultVersion: 1,
    otherVaults: [],
    readForeignSingleton: vi.fn().mockResolvedValue(undefined),
    readFileBase64: vi.fn().mockResolvedValue("ZmFrZQ=="),
    listFolderImages: vi.fn().mockResolvedValue(["map1.jpg"]),
    openVault: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
    pickFolder: vi.fn().mockResolvedValue(null),
    listFolderFiles: vi.fn().mockResolvedValue([]),
    readFolderFile: vi.fn().mockResolvedValue(""),
    writeFolderFile: vi.fn().mockResolvedValue(undefined),
    readBinaryFile: vi.fn().mockResolvedValue(""),
    writeFileBase64: vi.fn().mockResolvedValue(undefined),
    saveTextFile: vi.fn().mockResolvedValue(false),
    saveImageToVaultMaps: vi.fn().mockResolvedValue(null),
    savePortraitToVault: vi.fn().mockResolvedValue(null),
    pickImageFile: vi.fn().mockResolvedValue(null),
    pickAudioFile: vi.fn().mockResolvedValue(null),
  };
}

function Wrapper({ initialState, vault }: { initialState: MapDisplayState; vault: VaultContextValue }) {
  const [state, setState] = useState(initialState);
  return (
    <VaultContext.Provider value={vault}>
      <MapDisplay state={state} onChange={setState} />
    </VaultContext.Provider>
  );
}

function simulateImgLoad(img: HTMLElement, w = 800, h = 600) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  act(() => { fireEvent.load(img); });
}

async function waitForAndLoadImg(w = 800, h = 600): Promise<HTMLElement> {
  const img = await waitFor(() => {
    const el = document.querySelector("img[alt]") as HTMLElement | null;
    if (!el) throw new Error("img[alt] not in DOM yet");
    return el;
  }, { timeout: 3000 });
  simulateImgLoad(img, w, h);
  return img;
}

afterEach(() => cleanup());

describe("MapDisplay - placing a plain token", () => {
  it("opens an inline rename input, pre-filled with the default label, right after placing", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    act(() => { fireEvent.click(screen.getByTitle(/Place token/)); });
    const viewport = screen.getByTestId("map-wrapper").parentElement!;
    act(() => { fireEvent.mouseDown(viewport, { clientX: 0, clientY: 0, button: 0 }); });

    const input = await screen.findByDisplayValue("Token 1");
    fireEvent.change(input, { target: { value: "Ambush point" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByDisplayValue("Ambush point")).not.toBeInTheDocument();
    expect(screen.getByText("Ambush point")).toBeInTheDocument();
  });

  it("does not pop open the editor of a shape selected before switching to the token tool", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    // Draw a ring - it auto-selects itself on completion, which is what opens its own Markup
    // editor drawer (by design, mirroring how a token now opens its own rename input).
    act(() => { fireEvent.click(screen.getByTitle(/^Ring/)); });
    const viewport = screen.getByTestId("map-wrapper").parentElement!;
    act(() => {
      fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseUp(viewport, { clientX: 160, clientY: 160, button: 0 });
    });
    await waitFor(() => expect(screen.getByText("Markup")).toBeInTheDocument());

    // Switch to the token tool and place an empty token elsewhere on the map.
    act(() => { fireEvent.click(screen.getByTitle(/Place token/)); });
    act(() => { fireEvent.mouseDown(viewport, { clientX: 0, clientY: 0, button: 0 }); });

    // The drawer must not still be showing the ring's editor - the regression this test pins.
    expect(screen.queryByText("Markup")).not.toBeInTheDocument();
    // The new token's own rename input took over instead.
    expect(await screen.findByDisplayValue("Token 1")).toBeInTheDocument();
  });
});

describe("MapDisplay - renaming an existing token", () => {
  it("double-click opens a rename input pre-filled with the current label; Enter commits", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    act(() => { fireEvent.doubleClick(tokenEl); });

    const input = screen.getByDisplayValue("Goblin");
    fireEvent.change(input, { target: { value: "Goblin (wounded)" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Goblin (wounded)")).toBeInTheDocument();
  });

  it("Escape cancels the rename, leaving the label untouched", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    act(() => { fireEvent.doubleClick(tokenEl); });

    const input = screen.getByDisplayValue("Goblin");
    fireEvent.change(input, { target: { value: "typo" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByDisplayValue("typo")).not.toBeInTheDocument();
    expect(screen.getByText("Goblin")).toBeInTheDocument();
  });
});
