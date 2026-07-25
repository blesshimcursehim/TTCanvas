// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

// @vitest-environment jsdom

import { useState } from "react";
import { render, screen, fireEvent, within, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VaultContext } from "@ttcanvas/core";
import type { VaultContextValue } from "@ttcanvas/core";
import { SoundBoard } from "./SoundBoard";
import type { SoundBoardState } from "./types";

// Explicit cleanup ensures RTL unmounts components between tests.
afterEach(() => cleanup());

// jsdom doesn't implement media playback or blob URLs - stub the bits SoundBoard touches.
beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("confirm", vi.fn(() => true));
});

function makeMockVault(overrides: Partial<VaultContextValue> = {}): VaultContextValue {
  return {
    vaultPath: "/fake/vault",
    vaultVersion: 1,
    otherVaults: [],
    readForeignSingleton: vi.fn().mockResolvedValue(undefined),
    openVault: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
    pickFolder: vi.fn().mockResolvedValue(null),
    listFolderFiles: vi.fn().mockResolvedValue([]),
    readFolderFile: vi.fn().mockResolvedValue(""),
    writeFolderFile: vi.fn().mockResolvedValue(undefined),
    listFolderImages: vi.fn().mockResolvedValue([]),
    readFileBase64: vi.fn().mockResolvedValue(""),
    pickImageFile: vi.fn().mockResolvedValue(null),
    pickAudioFile: vi.fn().mockResolvedValue(null),
    readBinaryFile: vi.fn().mockResolvedValue("ZmFrZQ=="),
    writeFileBase64: vi.fn().mockResolvedValue(undefined),
    saveTextFile: vi.fn().mockResolvedValue(false),
    saveImageToVaultMaps: vi.fn().mockResolvedValue(null),
    savePortraitToVault: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// Wrapper provides real state management so onChange prop updates take effect.
function Wrapper({ initialState, vault }: { initialState: unknown; vault: VaultContextValue }) {
  const [state, setState] = useState(initialState);
  return (
    <VaultContext.Provider value={vault}>
      <SoundBoard state={state as SoundBoardState} onChange={setState} />
    </VaultContext.Provider>
  );
}

function renderBoard(initialState: unknown, vault = makeMockVault()) {
  return render(<Wrapper initialState={initialState} vault={vault} />);
}

describe("SoundBoard - legacy migration", () => {
  it("upgrades a flat pads[] state into a single scene on mount", () => {
    const legacy = {
      pads: [{ id: "pad-1", label: "Rain", audioPath: "audio/rain.mp3", loop: true, volume: 0.5 }],
    };
    renderBoard(legacy);

    expect(screen.getByTitle(/Scene 1/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rain")).toBeInTheDocument();
    // The migrated pad's single legacy file becomes a one-track playlist.
    expect(screen.getByText(/rain$/)).toBeInTheDocument();
  });
});

describe("SoundBoard - scene management", () => {
  it("adds, renames and deletes scenes", () => {
    const initial: SoundBoardState = { scenes: [{ id: "s1", name: "Scene 1", pads: [] }], activeSceneId: "s1" };
    renderBoard(initial);

    fireEvent.click(screen.getByTitle("New scene"));
    expect(screen.getByTitle(/Scene 2/)).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByTitle(/Scene 2/));
    const renameInput = screen.getByDisplayValue("Scene 2");
    fireEvent.change(renameInput, { target: { value: "Tavern" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });
    expect(screen.getByTitle(/Tavern/)).toBeInTheDocument();

    // Two scenes exist now, so a delete button is available.
    const tavernTab = screen.getByTitle(/Tavern/).closest("div")!;
    fireEvent.click(within(tavernTab).getByTitle("Delete scene"));
    expect(screen.queryByTitle(/Tavern/)).not.toBeInTheDocument();
    expect(screen.getByTitle(/Scene 1/)).toBeInTheDocument();
  });

  it("does not offer to delete the only remaining scene", () => {
    const initial: SoundBoardState = { scenes: [{ id: "s1", name: "Scene 1", pads: [] }], activeSceneId: "s1" };
    renderBoard(initial);
    expect(screen.queryByTitle("Delete scene")).not.toBeInTheDocument();
  });

  it("only shows pads belonging to the active scene", () => {
    const initial: SoundBoardState = {
      scenes: [
        { id: "s1", name: "Scene 1", pads: [{ id: "p1", label: "Rain", tracks: [], shuffle: false, loop: false, volume: 1, autoplay: false }] },
        { id: "s2", name: "Scene 2", pads: [{ id: "p2", label: "Battle", tracks: [], shuffle: false, loop: false, volume: 1, autoplay: false }] },
      ],
      activeSceneId: "s1",
    };
    renderBoard(initial);
    expect(screen.getByDisplayValue("Rain")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Battle")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle(/Scene 2/));
    expect(screen.getByDisplayValue("Battle")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Rain")).not.toBeInTheDocument();
  });
});

describe("SoundBoard - pad and playlist management", () => {
  it("adds a pad to the active scene", () => {
    const initial: SoundBoardState = { scenes: [{ id: "s1", name: "Scene 1", pads: [] }], activeSceneId: "s1" };
    renderBoard(initial);
    fireEvent.click(screen.getByTitle("Add a new sound pad"));
    expect(screen.getByDisplayValue("Pad 1")).toBeInTheDocument();
  });

  it("adds a track via the vault file picker and shows it in the playlist panel", async () => {
    const vault = makeMockVault({ pickAudioFile: vi.fn().mockResolvedValue("audio/thunder.mp3") });
    const initial: SoundBoardState = {
      scenes: [{ id: "s1", name: "Scene 1", pads: [{ id: "p1", label: "Storm", tracks: [], shuffle: false, loop: false, volume: 1, autoplay: false }] }],
      activeSceneId: "s1",
    };
    renderBoard(initial, vault);

    fireEvent.click(screen.getByTitle("Manage playlist"));
    await act(async () => {
      fireEvent.click(screen.getByText("+ Track"));
    });

    // Appears twice: the pad's play button (single-track playlist) and the track row itself.
    expect(screen.getAllByText("thunder").length).toBe(2);
  });

  it("removes a track and reorders remaining tracks", () => {
    const initial: SoundBoardState = {
      scenes: [{
        id: "s1", name: "Scene 1",
        pads: [{
          id: "p1", label: "Storm", shuffle: false, loop: true, volume: 1, autoplay: false,
          tracks: [
            { id: "t1", audioPath: "audio/rain-1.mp3" },
            { id: "t2", audioPath: "audio/rain-2.mp3" },
          ],
        }],
      }],
      activeSceneId: "s1",
    };
    renderBoard(initial);

    fireEvent.click(screen.getByTitle("Manage playlist"));
    expect(screen.getByText("rain-1")).toBeInTheDocument();
    expect(screen.getByText("rain-2")).toBeInTheDocument();

    // Move rain-2 up so it becomes first, then remove rain-1 (now the second row).
    let rows = screen.getAllByText(/rain-\d/).map((el) => el.closest("div")!);
    fireEvent.click(within(rows[1]).getByTitle("Move up"));

    rows = screen.getAllByText(/rain-\d/).map((el) => el.closest("div")!);
    const rain1Row = rows.find((row) => within(row).queryByText("rain-1"))!;
    fireEvent.click(within(rain1Row).getByTitle("Remove track"));

    // Appears twice now: the pad's play button (down to a single track) and the track row.
    expect(screen.getAllByText("rain-2").length).toBe(2);
    expect(screen.queryByText("rain-1")).not.toBeInTheDocument();
  });

  it("toggles shuffle and auto-play", () => {
    const initial: SoundBoardState = {
      scenes: [{
        id: "s1", name: "Scene 1",
        pads: [{ id: "p1", label: "Storm", tracks: [], shuffle: false, loop: false, volume: 1, autoplay: false }],
      }],
      activeSceneId: "s1",
    };
    renderBoard(initial);
    fireEvent.click(screen.getByTitle("Manage playlist"));

    const shuffle = screen.getByLabelText("Shuffle") as HTMLInputElement;
    const autoplay = screen.getByLabelText("Auto-play on scene") as HTMLInputElement;
    expect(shuffle.checked).toBe(false);
    expect(autoplay.checked).toBe(false);

    fireEvent.click(shuffle);
    fireEvent.click(autoplay);
    expect(shuffle.checked).toBe(true);
    expect(autoplay.checked).toBe(true);
  });
});

describe("SoundBoard - malformed state", () => {
  it("falls back to one empty scene instead of crashing on an empty scenes array", () => {
    expect(() => renderBoard({ scenes: [], activeSceneId: "" })).not.toThrow();
    expect(screen.getByTitle("Add a new sound pad")).toBeInTheDocument();
  });

  it("falls back to one empty scene instead of crashing on null state", () => {
    expect(() => renderBoard(null)).not.toThrow();
    expect(screen.getByTitle("Add a new sound pad")).toBeInTheDocument();
  });

  it("drops a scene entry missing its pads array rather than crashing", () => {
    expect(() => renderBoard({ scenes: [{ id: "s1", name: "Scene 1" }], activeSceneId: "s1" })).not.toThrow();
    expect(screen.getByTitle(/Scene 1/)).toBeInTheDocument();
  });
});

describe("SoundBoard - playback reconciliation", () => {
  it("stops playback when the currently playing track is removed", async () => {
    const initial: SoundBoardState = {
      scenes: [{
        id: "s1", name: "Scene 1",
        pads: [{ id: "p1", label: "Storm", tracks: [{ id: "t1", audioPath: "audio/thunder.mp3" }], shuffle: false, loop: true, volume: 1, autoplay: false }],
      }],
      activeSceneId: "s1",
    };
    renderBoard(initial);

    await act(async () => {
      fireEvent.click(screen.getByTitle("Play"));
    });
    expect(screen.getByTitle("Stop")).toBeInTheDocument();

    const pauseMock = HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>;
    const callsBefore = pauseMock.mock.calls.length;

    fireEvent.click(screen.getByTitle("Manage playlist"));
    fireEvent.click(screen.getByRole("button", { name: "Remove thunder" }));

    // The pad is stopped (not left silently running with a revoked blob URL, or stuck with no
    // way to reach Stop once its track count drops to zero).
    expect(pauseMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(screen.getByTitle("Add a track first")).toBeDisabled();
  });

  it("does not start audio for a pad whose file load resolves after switching away from its scene", async () => {
    let resolveRead!: (value: string) => void;
    const readPromise = new Promise<string>((resolve) => { resolveRead = resolve; });
    const vault = makeMockVault({ readBinaryFile: vi.fn().mockReturnValue(readPromise) });

    const initial: SoundBoardState = {
      scenes: [
        { id: "s1", name: "Scene 1", pads: [{ id: "p1", label: "Storm", tracks: [{ id: "t1", audioPath: "audio/thunder.mp3" }], shuffle: false, loop: false, volume: 1, autoplay: false }] },
        { id: "s2", name: "Scene 2", pads: [] },
      ],
      activeSceneId: "s1",
    };
    renderBoard(initial, vault);

    // Kick off a play - it awaits the (still-pending) vault read.
    fireEvent.click(screen.getByTitle("Play"));

    // Switch away before that read resolves.
    fireEvent.click(screen.getByTitle(/Scene 2/));

    await act(async () => {
      resolveRead("ZmFrZQ==");
      await readPromise;
      // Flush the remaining microtask hops in startTrack (loadTrackUrl -> el.play() -> epoch check).
      await new Promise((r) => setTimeout(r, 0));
    });

    const playMock = HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    expect(playMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle(/Scene 1/));
    expect(screen.getByTitle("Play")).toBeInTheDocument();
  });
});
