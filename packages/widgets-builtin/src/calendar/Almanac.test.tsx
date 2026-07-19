// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarContext, ToastContext, VaultContext } from "@ttcanvas/core";
import type { CalendarContextValue, CalDate, CalendarDef, CalendarState, VaultContextValue } from "@ttcanvas/core";
import { Almanac } from "./Almanac";

vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));

afterEach(cleanup);

const DEF: CalendarDef = {
  name: "Uniform",
  epochLabel: "AU",
  weekLength: 7,
  weekDayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  startWeekday: 0,
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month${i + 1}`, days: 30 })),
  intercalaryPeriods: [],
};
const START: CalDate = { year: 1, month: 0, day: 1 };

// A fresh Almanac opens on the Calendar tab, which mounts CalendarSetup - it reads useVault() for its
// import/export controls, so the provider must be present even though this test never exercises them.
const vault = { vaultPath: "/v", vaultVersion: 1 } as unknown as VaultContextValue;

function renderAlmanac(def: CalendarDef | null) {
  const state: CalendarState = { def, events: [] };
  const cal: CalendarContextValue = {
    def, events: [], setCalendarState: () => {},
    currentDate: def ? START : null, currentHour: 8, currentMinute: 0, currentSecond: 0,
    history: [], showOnPlayer: false, setTimeState: () => {},
  };
  render(
    <VaultContext.Provider value={vault}>
      <CalendarContext.Provider value={cal}>
        <ToastContext.Provider value={{ showToast: vi.fn() }}>
          <Almanac state={state} onChange={() => {}} />
        </ToastContext.Provider>
      </CalendarContext.Provider>
    </VaultContext.Provider>,
  );
}

// The "+1d" advance button is unique to the embedded TimeTracker (Clock tab); "No calendar configured"
// is unique to the embedded Calendar's empty state (Calendar tab). Each is a reliable proxy for which
// tab is mounted, without coupling to either child's internals.
describe("Almanac tab composition", () => {
  it("opens a configured calendar on the everyday Clock tab", () => {
    renderAlmanac(DEF);
    expect(screen.getByText("+1d")).toBeTruthy();
    expect(screen.queryByText("No calendar configured")).toBeNull();
  });

  it("opens a fresh calendar on the Calendar tab so setup comes first", () => {
    renderAlmanac(null);
    expect(screen.getByText("No calendar configured")).toBeTruthy();
    expect(screen.queryByText("+1d")).toBeNull();
  });

  it("switches the body between the clock and the calendar", () => {
    renderAlmanac(DEF);
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.queryByText("+1d")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clock" }));
    expect(screen.getByText("+1d")).toBeTruthy();
  });
});
