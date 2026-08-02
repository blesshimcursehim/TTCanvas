// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import { AIContext, VaultContext, CalendarContext, ChronicleContext } from "@ttcanvas/core";
import type { AIContextValue, VaultContextValue, CalendarContextValue, ChronicleContextValue, CalendarDef, CalDate } from "@ttcanvas/core";
import { SessionRecorder } from "./SessionRecorder";
import type { SessionRecorderState } from "./types";

// ollamaGenerate/openaiGenerate ultimately go through Tauri's invoke/Channel - stub the
// generation call itself so the streaming callback fires synchronously with fake tokens,
// and stub emitTo so a Cast click can be asserted without a real player webview.
const { ollamaGenerateMock } = vi.hoisted(() => ({ ollamaGenerateMock: vi.fn() }));

vi.mock("@ttcanvas/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ttcanvas/core")>();
  return { ...actual, ollamaGenerate: ollamaGenerateMock };
});

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  ollamaGenerateMock.mockReset();
});

const aiValue: AIContextValue = {
  config: { provider: "ollama", baseUrl: "", apiKey: "", model: "llama3" },
};

const vault = {
  saveTextFile: vi.fn().mockResolvedValue(true),
} as unknown as VaultContextValue;

function renderWithEntry() {
  const seeded: SessionRecorderState = {
    entries: [{ id: "1", text: "The party breached the citadel gates.", wallTime: Date.now() }],
    exportFolder: null,
  };
  return render(
    <AIContext.Provider value={aiValue}>
      <VaultContext.Provider value={vault}>
        <SessionRecorder state={seeded} onChange={() => {}} />
      </VaultContext.Provider>
    </AIContext.Provider>,
  );
}

describe("SessionRecorder - Previously On… recap", () => {
  it("streams the recap into an editable textarea", async () => {
    ollamaGenerateMock.mockImplementation((_model: string, _prompt: string, onChunk: (c: { type: string; text?: string }) => void) => {
      onChunk({ type: "token", text: "The heroes " });
      onChunk({ type: "token", text: "fled the citadel." });
      onChunk({ type: "done" });
      return { promise: Promise.resolve(), cancel: vi.fn() };
    });

    renderWithEntry();
    fireEvent.click(screen.getByRole("button", { name: "Previously On…" }));

    const textarea = await waitFor(() =>
      screen.getByRole("textbox", { name: "Player-facing recap, editable before casting to the player window" }),
    );
    await waitFor(() => expect(textarea).toHaveValue("The heroes fled the citadel."));

    // The GM can redact/rewrite before anyone sees it.
    fireEvent.change(textarea, { target: { value: "The heroes barely escaped the citadel." } });
    expect(textarea).toHaveValue("The heroes barely escaped the citadel.");
  });

  it("casts the edited recap text to the player window, not the raw generation", async () => {
    ollamaGenerateMock.mockImplementation((_model: string, _prompt: string, onChunk: (c: { type: string; text?: string }) => void) => {
      onChunk({ type: "token", text: "Original draft." });
      onChunk({ type: "done" });
      return { promise: Promise.resolve(), cancel: vi.fn() };
    });

    renderWithEntry();
    fireEvent.click(screen.getByRole("button", { name: "Previously On…" }));

    const textarea = await waitFor(() =>
      screen.getByRole("textbox", { name: "Player-facing recap, editable before casting to the player window" }),
    );
    await waitFor(() => expect(textarea).toHaveValue("Original draft."));
    fireEvent.change(textarea, { target: { value: "Redacted recap." } });

    fireEvent.click(screen.getByRole("button", { name: "Cast to player window" }));

    const { emitTo } = await import("@tauri-apps/api/event");
    await waitFor(() =>
      expect(emitTo).toHaveBeenCalledWith("player", "player-update", {
        type: "text",
        text: { title: "Previously on…", body: "Redacted recap." },
      }),
    );
  });
});

describe("SessionRecorder - Add to Chronicle", () => {
  const DEF: CalendarDef = {
    name: "Test", epochLabel: "TE", weekLength: 7,
    weekDayNames: ["1", "2", "3", "4", "5", "6", "7"], startWeekday: 0,
    months: [{ name: "Frost", days: 30 }], intercalaryPeriods: [],
  };
  const NOW: CalDate = { year: 1, month: 0, day: 5 };

  function renderWithCalendar(addChronicleEntry: ChronicleContextValue["addChronicleEntry"], currentDate: CalDate | null = NOW) {
    const seeded: SessionRecorderState = {
      entries: [{ id: "1", text: "The party breached the citadel gates.", wallTime: Date.now() }],
      exportFolder: null,
    };
    const cal: CalendarContextValue = {
      def: DEF, events: [], setCalendarState: () => {}, addCalendarEvent: () => {},
      currentDate, currentHour: 8, currentMinute: 0, currentSecond: 0,
      history: [], showOnPlayer: false, jumps: [], setTimeState: () => {},
    };
    return render(
      <AIContext.Provider value={aiValue}>
        <VaultContext.Provider value={vault}>
          <CalendarContext.Provider value={cal}>
            <ChronicleContext.Provider value={{ addChronicleEntry }}>
              <SessionRecorder state={seeded} onChange={() => {}} />
            </ChronicleContext.Provider>
          </CalendarContext.Provider>
        </VaultContext.Provider>
      </AIContext.Provider>,
    );
  }

  const streamSummary = (text: string) =>
    ollamaGenerateMock.mockImplementation((_model: string, _prompt: string, onChunk: (c: { type: string; text?: string }) => void) => {
      onChunk({ type: "token", text });
      onChunk({ type: "done" });
      return { promise: Promise.resolve(), cancel: vi.fn() };
    });

  it("sends the summary to the Chronicle as a dated recap entry, then guards against a duplicate", async () => {
    streamSummary("The party breached the gates.");
    const addChronicleEntry = vi.fn();
    renderWithCalendar(addChronicleEntry);

    fireEvent.click(screen.getByRole("button", { name: "AI Summary" }));
    const addBtn = await waitFor(() => screen.getByRole("button", { name: "Add to Chronicle" }));
    fireEvent.click(addBtn);

    expect(addChronicleEntry).toHaveBeenCalledWith({
      title: "Session recap",
      body: "The party breached the gates.",
      category: "recap",
      date: NOW,
    });
    // Flips to a disabled "Added" state so a second click can't append a duplicate entry.
    expect(screen.getByRole("button", { name: "Added ✓" })).toBeDisabled();
  });

  it("disables Add to Chronicle when no in-game date is set", async () => {
    streamSummary("Something happened.");
    renderWithCalendar(vi.fn(), null);

    fireEvent.click(screen.getByRole("button", { name: "AI Summary" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to Chronicle" })).toBeDisabled());
  });
});
