// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarContext, ToastContext } from "@ttcanvas/core";
import type { CalendarContextValue, CalDate, CalEvent, CalendarDef, TimeTrackerState } from "@ttcanvas/core";
import { TimeTracker } from "./TimeTracker";

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

function renderTracker(events: CalEvent[], currentDate: CalDate) {
  const showToast = vi.fn();
  const state: TimeTrackerState = {
    currentDate, currentHour: 8, currentMinute: 0, currentSecond: 0, history: [], showOnPlayer: false,
  };
  const cal: CalendarContextValue = {
    def: DEF, events, setCalendarState: () => {},
    currentDate, currentHour: 8, currentMinute: 0, currentSecond: 0,
    history: [], showOnPlayer: false, setTimeState: () => {},
  };
  render(
    <CalendarContext.Provider value={cal}>
      <ToastContext.Provider value={{ showToast }}>
        <TimeTracker state={state} onChange={() => {}} />
      </ToastContext.Provider>
    </CalendarContext.Provider>,
  );
  return { showToast };
}

const day = (d: number): CalDate => ({ year: 1, month: 0, day: d });
const festival: CalEvent = { id: "f", title: "Festival", start: day(11) };

describe("TimeTracker calendar-event reminders", () => {
  it("toasts when a +1d advance lands on an event's start day", () => {
    const { showToast } = renderTracker([festival], day(10));
    fireEvent.click(screen.getByText("+1d"));
    expect(showToast).toHaveBeenCalledWith("Festival begins today", "info");
  });

  it("stays quiet when the advance does not reach a new day", () => {
    const { showToast } = renderTracker([festival], day(10));
    fireEvent.click(screen.getByText("+1h"));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("stays quiet when no event falls in the crossed span", () => {
    const { showToast } = renderTracker([festival], day(11));
    fireEvent.click(screen.getByText("+1d"));
    expect(showToast).not.toHaveBeenCalled();
  });
});
