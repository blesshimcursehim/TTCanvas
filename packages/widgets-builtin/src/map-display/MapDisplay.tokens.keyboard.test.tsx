// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.
//
// Keyboard repositioning of an already-placed map token (roadmap-deferred item 62): selecting a
// token by click or Tab arms arrow-key nudge, +/- resize and Delete/Backspace, mirroring the
// existing selectedAnnId pattern already used for annotations.

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

// Mousedown+mouseup at the same point on a token is a click, not a drag - selects it without
// moving it or (for a linked pin) navigating away.
function clickToken(tokenEl: HTMLElement) {
  act(() => {
    fireEvent.mouseDown(tokenEl, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseUp(tokenEl, { clientX: 100, clientY: 100, button: 0 });
  });
}

afterEach(() => cleanup());

describe("MapDisplay - keyboard repositioning of an existing token", () => {
  it("clicking a token selects it, and arrow keys nudge its position", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    clickToken(tokenEl);
    expect(tokenEl).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    // 8px step / (800px image * scale 1) = 0.01 fraction -> x 0.5 -> 0.51 -> left 408px.
    expect(tokenEl.style.left).toBe("408px");
  });

  it("Shift+arrow takes the bigger step", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    clickToken(tokenEl);

    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    // 40px step / 800px = 0.05 fraction -> x 0.5 -> 0.55 -> left 440px.
    expect(parseFloat(tokenEl.style.left)).toBeCloseTo(440);
  });

  it("Tab-focusing a token selects it without a prior click", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    expect(tokenEl).toHaveAttribute("tabindex", "0");
    expect(tokenEl).toHaveAttribute("aria-pressed", "false");

    act(() => { tokenEl.focus(); });
    expect(tokenEl).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    // 8px step / 600px image height = fraction ~0.0133 -> y 0.5 -> 0.5133 -> top 308px.
    expect(parseFloat(tokenEl.style.top)).toBeCloseTo(308);
  });

  it("+/- resizes the selected token, clamped and rounded like the wheel handler", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    clickToken(tokenEl);

    fireEvent.keyDown(window, { key: "+" });
    expect(parseFloat(tokenEl.style.width)).toBeCloseTo(57.2); // TOKEN_BASE_PX 52 * size 1.1

    fireEvent.keyDown(window, { key: "-" });
    fireEvent.keyDown(window, { key: "-" });
    expect(parseFloat(tokenEl.style.width)).toBeCloseTo(46.8); // back down to size 0.9
  });

  it("Delete removes the selected token", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    clickToken(tokenEl);

    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.queryByText("Goblin")).not.toBeInTheDocument();
  });

  it("Escape deselects, so a later arrow key no longer moves it", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const tokenEl = screen.getByText("Goblin").closest("div")!;
    clickToken(tokenEl);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(tokenEl).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(tokenEl.style.left).toBe("400px"); // unchanged: 0.5 * 800
  });

  it("selecting a token deselects a previously-selected annotation", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Goblin", color: "red", x: 0.5, y: 0.5 }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    // Draw a ring - it auto-selects itself on completion, opening the Markup editor drawer.
    act(() => { fireEvent.click(screen.getByTitle(/^Ring/)); });
    const viewport = screen.getByTestId("map-wrapper").parentElement!;
    act(() => {
      fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseUp(viewport, { clientX: 160, clientY: 160, button: 0 });
    });
    await waitFor(() => expect(screen.getByText("Markup")).toBeInTheDocument());
    // Back to the pan tool - drawing doesn't do this itself, and the drawer would otherwise stay
    // on "Markup" via the ring tool still being active, independent of the annotation's selection.
    act(() => { fireEvent.click(screen.getByTitle(/^Ring/)); });

    // Selecting the token clears the annotation's own editor drawer instead of leaving it open.
    const tokenEl = screen.getByText("Goblin").closest("div")!;
    clickToken(tokenEl);
    expect(screen.queryByText("Markup")).not.toBeInTheDocument();
    expect(tokenEl).toHaveAttribute("aria-pressed", "true");
  });
});
