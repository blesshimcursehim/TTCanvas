// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.
//
// Bidirectional map pin <-> Gazetteer location linking: a locateRequest from the Gazetteer either
// jumps to an existing pin or arms placement of a new one, and a linked pin's click (not a drag)
// navigates back to the Gazetteer.

import { useState } from "react";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { MapDisplay } from "./MapDisplay";
import type { MapDisplayState, MapScene } from "./types";
import { panToPoint } from "./utils";

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

function makeState(activeId: string, scenes: MapScene[], extra: Partial<MapDisplayState> = {}): MapDisplayState {
  return { mapsFolder: "/fake/maps", scenes, activeSceneId: activeId, autoPushMap: false, ...extra };
}

function makeMockVault(): VaultContextValue {
  return {
    vaultPath: "/fake/vault",
    vaultVersion: 1,
    readFileBase64: vi.fn().mockResolvedValue("ZmFrZQ=="),
    listFolderImages: vi.fn().mockResolvedValue(["map1.jpg", "map2.jpg"]),
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

// Like Wrapper, but exposes a button to inject a locateRequest after mount - needed to reproduce the
// race where the source scene's image is already loaded (a stale, non-null imgSize sitting in state)
// at the moment the jump switches to a differently-sized target scene.
function DelayedRequestWrapper({ initialState, vault, request }: {
  initialState: MapDisplayState; vault: VaultContextValue; request: NonNullable<MapDisplayState["locateRequest"]>;
}) {
  const [state, setState] = useState(initialState);
  return (
    <VaultContext.Provider value={vault}>
      <button data-testid="trigger-locate" onClick={() => setState((s) => ({ ...s, locateRequest: request }))}>trigger</button>
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

describe("MapDisplay - locate a Gazetteer pin", () => {
  it("jumps to an existing linked pin: switches scene, clears the request, brings it onto the board", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg", {
      tokens: [{ id: "t1", label: "Citadel", color: "red", x: 0.4, y: 0.6, locationRef: "locations/citadel.json", kind: "location", onBoard: false }],
    });
    const onChange = vi.fn();
    render(
      <VaultContext.Provider value={makeMockVault()}>
        <MapDisplay
          state={makeState("s1", [scene1, scene2], { locateRequest: { id: "r1", locationRef: "locations/citadel.json", label: "Citadel" } })}
          onChange={onChange}
        />
      </VaultContext.Provider>,
    );

    await waitFor(() => {
      const call = onChange.mock.calls.find(([s]) => (s as MapDisplayState).activeSceneId === "s2");
      expect(call).toBeTruthy();
    });
    const call = onChange.mock.calls.find(([s]) => (s as MapDisplayState).activeSceneId === "s2")!;
    const next = call[0] as MapDisplayState;
    expect(next.locateRequest).toBeUndefined();
    const token = next.scenes.find((sc) => sc.id === "s2")!.tokens.find((t) => t.id === "t1")!;
    expect(token.onBoard).toBe(true);
  });

  it("arms place-location when no pin exists yet, and a map click drops a linked pin", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    render(
      <Wrapper
        initialState={makeState("s1", [scene1], { locateRequest: { id: "r1", locationRef: "locations/citadel.json", label: "Citadel" } })}
        vault={makeMockVault()}
      />,
    );

    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.getByText(/Drop a pin for/)).toBeInTheDocument());

    const viewport = screen.getByTestId("map-wrapper").parentElement!;
    act(() => {
      fireEvent.mouseDown(viewport, { clientX: 0, clientY: 0, button: 0 });
      fireEvent.mouseUp(viewport, { clientX: 0, clientY: 0, button: 0 });
    });

    await waitFor(() => expect(screen.queryByText(/Drop a pin for/)).not.toBeInTheDocument());
    expect(screen.getByText("Citadel")).toBeInTheDocument();
    expect(document.querySelector('[title="Linked to a Gazetteer place"]')).toBeTruthy();
  });

  it("Escape cancels an armed placement without dropping a pin", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    render(
      <Wrapper
        initialState={makeState("s1", [scene1], { locateRequest: { id: "r1", locationRef: "locations/citadel.json", label: "Citadel" } })}
        vault={makeMockVault()}
      />,
    );

    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.getByText(/Drop a pin for/)).toBeInTheDocument());

    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

    await waitFor(() => expect(screen.queryByText(/Drop a pin for/)).not.toBeInTheDocument());
    expect(screen.queryByText("Citadel")).not.toBeInTheDocument();
  });

  it("does not pan using the previous scene's stale image size when jumping to a differently-sized map", async () => {
    // s1's map is already loaded (800x600) when the jump fires - a stale, non-null imgSize sitting in
    // state at the exact moment the scene switches to s2, whose map is a different size (400x300).
    // A version of the jump effect gated only on "imgSize truthy" pans using s1's dimensions before
    // s2's image has actually loaded; the fix must wait for loadedMap to actually match s2's map.
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg", {
      tokens: [{ id: "t1", label: "Citadel", color: "red", x: 0.75, y: 0.25, locationRef: "locations/citadel.json" }],
    });
    render(
      <DelayedRequestWrapper
        initialState={makeState("s1", [scene1, scene2])}
        vault={makeMockVault()}
        request={{ id: "r1", locationRef: "locations/citadel.json", label: "Citadel" }}
      />,
    );

    // Load s1's map first, so imgSize/loadedMap hold s1's (800x600) values.
    await waitForAndLoadImg(800, 600);

    // Now trigger the jump - the scene switch to s2 happens before s2's (differently-sized) map loads.
    act(() => { fireEvent.click(screen.getByTestId("trigger-locate")); });

    // s2's own map hasn't finished loading yet - its pan must still be untouched. The buggy version
    // (gated on imgSize alone) would already have patched it here, using s1's stale 800x600 dims.
    // (Tokens themselves stop rendering once imgSize clears for the switch - the wrapper's transform
    // doesn't depend on imgSize, so it stays a reliable probe through the transition.)
    expect(screen.getByTestId("map-wrapper").style.transform).toContain("translate(0px, 0px)");

    // s2's own map finishes loading at its real (different) size.
    await waitForAndLoadImg(400, 300);

    // Once panned, the value must be computed from s2's actual 400x300 image, not s1's 800x600.
    const expected = panToPoint({ w: 400, h: 300 }, { nx: 0.75, ny: 0.25 }, 1);
    const wrapper = await waitFor(() => {
      const el = screen.getByTestId("map-wrapper");
      const m = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
      if (!m || (Number(m[1]) === 0 && Number(m[2]) === 0)) throw new Error("pan not applied yet");
      return { panX: Number(m[1]), panY: Number(m[2]) };
    });
    expect(wrapper.panX).toBeCloseTo(expected.panX);
    expect(wrapper.panY).toBeCloseTo(expected.panY);
  });
});

describe("MapDisplay - click a linked pin to navigate back", () => {
  it("a real click (no movement) on a linked pin dispatches ttcanvas:open-location", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Citadel", color: "red", x: 0.5, y: 0.5, locationRef: "locations/citadel.json", kind: "location" }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-location", spy);
    const tokenEl = screen.getByText("Citadel").closest("div")!;
    act(() => {
      fireEvent.mouseDown(tokenEl, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseUp(tokenEl, { clientX: 100, clientY: 100, button: 0 });
    });
    window.removeEventListener("ttcanvas:open-location", spy);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ filename: "locations/citadel.json" });
  });

  it("dragging a linked pin (movement past the click tolerance) does not navigate", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Citadel", color: "red", x: 0.5, y: 0.5, locationRef: "locations/citadel.json", kind: "location" }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-location", spy);
    const tokenEl = screen.getByText("Citadel").closest("div")!;
    act(() => {
      fireEvent.mouseDown(tokenEl, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseUp(tokenEl, { clientX: 140, clientY: 100, button: 0 });
    });
    window.removeEventListener("ttcanvas:open-location", spy);

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not navigate while another tool is active (e.g. mid measure)", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      tokens: [{ id: "t1", label: "Citadel", color: "red", x: 0.5, y: 0.5, locationRef: "locations/citadel.json", kind: "location" }],
    });
    render(<Wrapper initialState={makeState("s1", [scene1])} vault={makeMockVault()} />);
    await waitForAndLoadImg(800, 600);

    act(() => { fireEvent.click(screen.getByTitle(/Measure/i)); });

    const spy = vi.fn();
    window.addEventListener("ttcanvas:open-location", spy);
    const tokenEl = screen.getByText("Citadel").closest("div")!;
    act(() => {
      fireEvent.mouseDown(tokenEl, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.mouseUp(tokenEl, { clientX: 100, clientY: 100, button: 0 });
    });
    window.removeEventListener("ttcanvas:open-location", spy);

    expect(spy).not.toHaveBeenCalled();
  });
});
