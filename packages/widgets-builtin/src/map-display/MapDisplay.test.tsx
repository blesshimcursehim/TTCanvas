// @vitest-environment jsdom
// Scene-switching tests for MapDisplay.
// These cover the visual glitch where the wrong map briefly appears
// (at the wrong transform / with the wrong fog) when switching between scenes.

import { useState } from "react";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { MapDisplay } from "./MapDisplay";
import type { MapDisplayState, MapScene } from "./types";

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

// ── Test helpers ────────────────────────────────────────────────────────────

function makeScene(
  id: string,
  name: string,
  selectedMap: string | null = null,
  overrides: Partial<MapScene> = {},
): MapScene {
  return {
    id,
    name,
    selectedMap,
    fogEnabled: false,
    fogReveals: [],
    tokens: [],
    gridEnabled: false,
    gridSize: 40,
    panX: 0,
    panY: 0,
    scale: 1,
    ...overrides,
  };
}

function makeState(activeId: string, scenes: MapScene[]): MapDisplayState {
  return {
    mapsFolder: "/fake/maps",
    scenes,
    activeSceneId: activeId,
    autoPushMap: false,
  };
}

function makeMockVault(
  readFileBase64: VaultContextValue["readFileBase64"] = vi.fn().mockResolvedValue("ZmFrZQ=="),
): VaultContextValue {
  return {
    vaultPath: "/fake/vault",
    vaultVersion: 1,
    otherVaults: [],
    readForeignSingleton: vi.fn().mockResolvedValue(undefined),
    readFileBase64,
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

// Wrapper provides real state management so onChange prop updates take effect.
function Wrapper({
  initialState,
  vault,
}: {
  initialState: MapDisplayState;
  vault: VaultContextValue;
}) {
  const [state, setState] = useState(initialState);
  return (
    <VaultContext.Provider value={vault}>
      <MapDisplay state={state} onChange={setState} />
    </VaultContext.Provider>
  );
}

// Set naturalWidth/Height on an img (jsdom always reports 0) then fire onLoad.
// Wrapped in act() so React flushes the resulting state updates.
function simulateImgLoad(img: HTMLElement, w = 800, h = 600) {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  act(() => { fireEvent.load(img); });
}

// Wait for the map's <img> element to appear (readFileBase64 resolves → React
// re-renders with the new src), then fire onLoad to complete the load cycle.
async function waitForAndLoadImg(w = 800, h = 600): Promise<HTMLElement> {
  const img = await waitFor(
    () => {
      const el = document.querySelector("img[alt]") as HTMLElement | null;
      if (!el) throw new Error("img[alt] not in DOM yet");
      return el;
    },
    { timeout: 3000 },
  );
  simulateImgLoad(img, w, h);
  return img;
}

// ── Tests ───────────────────────────────────────────────────────────────────

// Explicit cleanup ensures RTL unmounts components between tests.
// Without this, multiple test renders accumulate in the same jsdom document.
afterEach(() => cleanup());

describe("MapDisplay - scene switching", () => {
  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("transition shield appears immediately when switching to a scene with a different map", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg");
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);

    // Load map1 fully (promise resolves + onLoad fired)
    await waitForAndLoadImg(800, 600);
    // Shield absent = map is loaded and visible
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to Scene 2 - shield must appear in the same render as the switch
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });

    // showShield is derived synchronously so this is immediate
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();
  });

  it("transition shield disappears after the new scene's image loads", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg");
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);

    // Load map1
    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to Scene 2
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });

    // Shield during transition
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();

    // Load map2 - readFileBase64 resolves, new <img> renders, onLoad fires
    await waitForAndLoadImg(1024, 768);

    // Shield must be gone
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());
  });

  it("switching to a scene that shares the same map does NOT show the transition shield", async () => {
    // Both scenes point to the same map file - no reload, no flash.
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", "map1.jpg");
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);

    // Load map1 in Scene 1
    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to Scene 2 - same selectedMap, loadedMap still matches
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });

    // No shield - same map, no transition
    expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument();
  });

  it("scene with no selected map shows the placeholder and no shield", async () => {
    const scene1 = makeScene("s1", "Scene 1", null);
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1])} vault={vault} />);

    await waitFor(() =>
      expect(screen.getByText(/Load a map from a folder/i)).toBeInTheDocument(),
    );
    // No selectedMap → showShield = false
    expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument();
  });

  it("switching to a no-map scene removes the shield and shows the placeholder", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", null);
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);

    // Load map1
    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to the no-map scene - selectedMap is null, so showShield stays false
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });

    expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Load a map from a folder/i)).toBeInTheDocument(),
    );
  });

  it("the old map is covered by the shield at the new scene's transform before the new image loads", async () => {
    // If the shield is absent during transition, the old map image shows
    // scaled to the new scene's dimensions - the exact visual glitch reported.
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", { scale: 1 });
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg", { scale: 3 });
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);

    // Load map1
    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    const wrapper = screen.getByTestId("map-wrapper");
    const transformAtScene1 = (wrapper as HTMLElement).style.transform;

    // Switch to Scene 2 (scale=3). Transform updates immediately but the
    // shield covers it so the old map is never seen at scale=3.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });

    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();

    // Transform has already changed to scene2's values (scale=3) while shield covers it
    const transformAtScene2 = (wrapper as HTMLElement).style.transform;
    expect(transformAtScene2).not.toBe(transformAtScene1);
    expect(transformAtScene2).toContain("scale(3)");
  });

  it("shield is shown between imgSrc being set and onLoad firing", async () => {
    // showShield must be true between "imgSrc set" and "onLoad fires".
    // If the shield drops on imgSrc alone, the <img> would briefly show with
    // stale dimensions (naturalWidth/Height = 0 in jsdom) before size is known.
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg");
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg");
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);

    // Flush readFileBase64 promise → <img> appears, but do NOT fire onLoad yet
    const img = await waitFor(
      () => {
        const el = document.querySelector("img[alt]") as HTMLElement | null;
        if (!el) throw new Error("img not in DOM");
        return el;
      },
      { timeout: 3000 },
    );

    // imgSrc is set but loadedMap hasn't updated → shield still present
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();

    // Now fire onLoad → loadedMap becomes "map1.jpg" → shield gone
    simulateImgLoad(img, 800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to Scene 2 - shield appears immediately
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();

    // Flush readFileBase64 for map2 → new <img> src set, but onLoad not yet fired
    const img2 = await waitFor(
      () => {
        const el = document.querySelector("img[alt]") as HTMLElement | null;
        if (!el) throw new Error("img not in DOM");
        return el;
      },
      { timeout: 3000 },
    );
    // Still shielded - loadedMap is still "map1.jpg"
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();

    // Fire onLoad for map2 → loadedMap → "map2.jpg" → shield gone
    simulateImgLoad(img2, 1024, 768);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());
  });
});

describe("MapDisplay - fog of war during scene switching", () => {
  beforeEach(() => { vi.stubGlobal("confirm", vi.fn(() => true)); });

  it("transition shield covers fog during a scene transition", async () => {
    // The fog canvas sits inside mapWrapper but the shield overlays the entire
    // viewport - scene1's fog is never visible on top of scene2's map.
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      fogEnabled: true,
      fogReveals: [{ shape: "rect", x: 0, y: 0, w: 0.5, h: 0.5 }],
    });
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg", {
      fogEnabled: true,
      fogReveals: [],
    });
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);
    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to Scene 2
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });

    // Shield covers the viewport - scene1's fog canvas is not visible
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();
  });

  it("shield is gone after scene 2 image loads", async () => {
    const scene1 = makeScene("s1", "Scene 1", "map1.jpg", {
      fogEnabled: true,
      fogReveals: [{ shape: "rect", x: 0, y: 0, w: 1, h: 1 }],
    });
    const scene2 = makeScene("s2", "Scene 2", "map2.jpg", {
      fogEnabled: true,
      fogReveals: [],
    });
    const vault = makeMockVault();

    render(<Wrapper initialState={makeState("s1", [scene1, scene2])} vault={vault} />);
    await waitForAndLoadImg(800, 600);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());

    // Switch to Scene 2, then load its image
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Scene 2/i }));
    });
    expect(screen.queryByTestId("transition-shield")).toBeInTheDocument();

    await waitForAndLoadImg(1024, 768);
    await waitFor(() => expect(screen.queryByTestId("transition-shield")).not.toBeInTheDocument());
  });
});
