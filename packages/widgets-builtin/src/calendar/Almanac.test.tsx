// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarContext, ToastContext, VaultContext, DEFAULT_JUMPS } from "@ttcanvas/core";
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

function renderAlmanac(state: CalendarState, onChange: (s: CalendarState) => void = () => {}) {
  const def = state.def;
  const cal: CalendarContextValue = {
    def, events: [], setCalendarState: () => {},
    currentDate: def ? START : null, currentHour: 8, currentMinute: 0, currentSecond: 0,
    history: [], showOnPlayer: false, jumps: [...DEFAULT_JUMPS], setTimeState: () => {},
  };
  render(
    <VaultContext.Provider value={vault}>
      <CalendarContext.Provider value={cal}>
        <ToastContext.Provider value={{ showToast: vi.fn() }}>
          <Almanac state={state} onChange={onChange} />
        </ToastContext.Provider>
      </CalendarContext.Provider>
    </VaultContext.Provider>,
  );
}

// Both panes are always mounted (so a tab switch never loses in-progress state), so which tab is
// *active* is read from the toggle's aria-pressed, not from whether the other pane's content exists.
describe("Almanac tab composition", () => {
  it("opens a configured calendar on the everyday Clock tab", () => {
    renderAlmanac({ def: DEF, events: [] });
    expect(screen.getByRole("button", { name: "Clock", pressed: true })).toBeTruthy();
    expect(screen.getByText("+1d")).toBeTruthy(); // the clock pane is mounted
  });

  it("opens a fresh calendar on the Calendar tab so setup comes first", () => {
    renderAlmanac({ def: null, events: [] });
    expect(screen.getByRole("button", { name: "Calendar", pressed: true })).toBeTruthy();
    expect(screen.getByText("No calendar configured")).toBeTruthy();
  });

  it("switches the active tab between clock and calendar", () => {
    renderAlmanac({ def: DEF, events: [] });
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("button", { name: "Calendar", pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clock" }));
    expect(screen.getByRole("button", { name: "Clock", pressed: true })).toBeTruthy();
  });

  it("honours a one-shot open request: shows the Calendar tab and clears the request", () => {
    const onChange = vi.fn();
    // def is set, so the default tab would be Clock - the request must override it to Calendar.
    renderAlmanac({ def: DEF, events: [], openRequest: { date: START } }, onChange);
    expect(screen.getByRole("button", { name: "Calendar", pressed: true })).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith({ def: DEF, events: [] });
  });
});
